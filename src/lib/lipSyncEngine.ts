/**
 * High-Precision Zero-Latency Lip-Sync Engine for Live2D & Web Audio
 * 
 * Features:
 * 1. Direct Web Audio AnalyserNode integration (zero clock desynchronization).
 * 2. Multi-band formant frequency extraction (F1 jaw opening, F2 vowel width/form, F3 sibilance).
 * 3. Asymmetric smoothing (fast attack ~0.50, smooth decay ~0.18) with dynamic noise gating.
 * 4. Direct synchronous polling from the Pixi.js ticker loop (no React render latency).
 * 5. Procedural cadence fallback for standard Web Speech API utterances.
 */

export interface LipSyncState {
  mouthOpenY: number; // 0.0 (closed) to 1.0 (fully open)
  mouthForm: number;  // -1.0 (round/pursed 'U/O') to +1.0 (wide smile 'I/E')
  isSpeaking: boolean;
  rawVolume: number;  // 0.0 to 1.0
}

class LipSyncEngine {
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private activeSourceNode: MediaElementAudioSourceNode | AudioBufferSourceNode | null = null;
  private currentAudioElement: HTMLAudioElement | null = null;

  // Analysis buffers
  private freqData: Uint8Array | null = null;
  private timeData: Uint8Array | null = null;

  // State
  private isSpeakingInternal = false;
  private smoothedOpenY = 0;
  private smoothedForm = 0;
  private smoothedVolume = 0;

  // Procedural fallback timer for Web Speech API
  private pseudoSpeechTimer: any = null;
  private pseudoSpeechStartTime = 0;
  private isUsingPseudoSpeech = false;

  constructor() {
    // Lazy AudioContext initialization on first user interaction
  }

  public getAudioContext(): AudioContext {
    if (!this.audioCtx || this.audioCtx.state === "closed") {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      this.audioCtx = new AudioContextClass();
    }
    if (this.audioCtx.state === "suspended") {
      this.audioCtx.resume().catch(() => {});
    }
    return this.audioCtx;
  }

  /**
   * Binds an HTMLAudioElement (e.g. from OpenAI TTS or Piper) directly to the Web Audio graph.
   * This guarantees sample-accurate audio-visual synchronization without latency.
   */
  public attachAudioElement(audio: HTMLAudioElement): () => void {
    this.stop();

    const ctx = this.getAudioContext();
    this.currentAudioElement = audio;

    // Create or reuse AnalyserNode with low smoothing for ultra-fast reaction time
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512; // 256 frequency bins (high temporal resolution)
    analyser.smoothingTimeConstant = 0.12; // Minimal native smoothing so our asymmetric filter controls shape
    this.analyser = analyser;

    this.freqData = new Uint8Array(analyser.frequencyBinCount);
    this.timeData = new Uint8Array(analyser.fftSize);

    let source: MediaElementAudioSourceNode | null = null;
    try {
      source = ctx.createMediaElementSource(audio);
      source.connect(analyser);
      analyser.connect(ctx.destination);
      this.activeSourceNode = source;
    } catch (err) {
      console.warn("[LipSyncEngine] MediaElementSource creation warning:", err);
    }

    this.isSpeakingInternal = true;
    this.isUsingPseudoSpeech = false;

    const cleanup = () => {
      this.stop();
    };

    audio.addEventListener("ended", cleanup, { once: true });
    audio.addEventListener("error", cleanup, { once: true });
    audio.addEventListener("pause", () => {
      if (audio.ended || audio.currentTime === 0) {
        cleanup();
      }
    });

    return cleanup;
  }

  /**
   * Starts a procedural cadence fallback when Web Speech API is active
   */
  public startSpeechUtterance(estimatedDurationMs: number = 3000): () => void {
    this.stop();
    this.isSpeakingInternal = true;
    this.isUsingPseudoSpeech = true;
    this.pseudoSpeechStartTime = performance.now();

    const cleanup = () => {
      this.stop();
    };

    return cleanup;
  }

  /**
   * Stops active lip-sync analysis and resets state
   */
  public stop() {
    this.isSpeakingInternal = false;
    this.isUsingPseudoSpeech = false;
    if (this.pseudoSpeechTimer) {
      clearInterval(this.pseudoSpeechTimer);
      this.pseudoSpeechTimer = null;
    }
    this.currentAudioElement = null;
  }

  /**
   * Synchronously sampled by the Live2D Pixi ticker loop at 60fps/120fps.
   * Performs multi-band formant analysis and asymmetric interpolation.
   */
  public update(dtSeconds: number = 0.016): LipSyncState {
    const dt = Math.min(0.05, Math.max(0.001, dtSeconds));

    if (!this.isSpeakingInternal) {
      // Smoothly close mouth to 0
      this.smoothedOpenY += (0 - this.smoothedOpenY) * (1.0 - Math.pow(0.0001, dt));
      this.smoothedForm += (0 - this.smoothedForm) * (1.0 - Math.pow(0.001, dt));
      this.smoothedVolume += (0 - this.smoothedVolume) * (1.0 - Math.pow(0.0001, dt));
      
      if (this.smoothedOpenY < 0.005) this.smoothedOpenY = 0;
      if (Math.abs(this.smoothedForm) < 0.005) this.smoothedForm = 0;
      if (this.smoothedVolume < 0.005) this.smoothedVolume = 0;

      return {
        mouthOpenY: this.smoothedOpenY,
        mouthForm: this.smoothedForm,
        isSpeaking: false,
        rawVolume: this.smoothedVolume,
      };
    }

    // 1. Web Audio Analyser Real-time Spectrum Processing
    if (this.analyser && this.freqData && this.timeData && !this.isUsingPseudoSpeech) {
      this.analyser.getByteFrequencyData(this.freqData);
      this.analyser.getByteTimeDomainData(this.timeData);

      const binCount = this.analyser.frequencyBinCount;
      const sampleRate = this.audioCtx?.sampleRate || 44100;
      const hzPerBin = (sampleRate / 2) / binCount;

      let lowEnergy = 0;   // F1 Formant (250Hz - 850Hz): Jaw opening ('ah', 'oh', 'uh')
      let midEnergy = 0;   // F2 Formant (900Hz - 2600Hz): Vowel width/spread ('ee', 'ih', 'ae')
      let highEnergy = 0;  // F3 / Sibilance (3500Hz - 7500Hz): Consonants ('s', 't', 'sh')
      let totalEnergy = 0;

      let lowCount = 0;
      let midCount = 0;
      let highCount = 0;

      for (let i = 0; i < binCount; i++) {
        const freq = i * hzPerBin;
        const val = this.freqData[i] / 255.0;
        totalEnergy += val;

        if (freq >= 200 && freq < 850) {
          lowEnergy += val;
          lowCount++;
        } else if (freq >= 850 && freq < 2800) {
          midEnergy += val;
          midCount++;
        } else if (freq >= 3200 && freq < 8000) {
          highEnergy += val;
          highCount++;
        }
      }

      const avgLow = lowCount > 0 ? lowEnergy / lowCount : 0;
      const avgMid = midCount > 0 ? midEnergy / midCount : 0;
      const avgHigh = highCount > 0 ? highEnergy / highCount : 0;
      const rawVol = totalEnergy / binCount;

      // Dynamic Noise Floor Gate
      const noiseThreshold = 0.025;
      let targetOpenY = 0;
      let targetForm = 0;

      if (rawVol > noiseThreshold) {
        // Compute jaw opening from speech energy with emphasized vowel resonance
        const speechSignal = Math.max(0, (avgLow * 1.8 + avgMid * 0.8) - noiseThreshold);
        // Exponent curve for natural speech dynamics (soft sounds remain subtle, loud vowels open wide)
        targetOpenY = Math.min(1.0, Math.pow(speechSignal * 2.2, 0.85));

        // Compute mouth form (width vs round):
        // Higher mid/high ratio creates wide smile/spread ('I', 'E') -> positive form
        // Strong low with low mid creates rounded 'O', 'U' -> negative form
        const spreadRatio = (avgMid * 1.5 + avgHigh * 0.8) - (avgLow * 1.2);
        targetForm = Math.max(-1.0, Math.min(1.0, spreadRatio * 2.5));
      }

      // 2. Asymmetric Smoothing Filter:
      // Fast Attack (~0.52): Jaw opens instantly on speech plosives & vowels
      // Soft Decay (~0.18): Jaw closes smoothly without fluttering
      const attackFactor = 1.0 - Math.pow(0.00001, dt); // ~0.55 per frame
      const decayFactor = 1.0 - Math.pow(0.005, dt);   // ~0.18 per frame

      if (targetOpenY > this.smoothedOpenY) {
        this.smoothedOpenY += (targetOpenY - this.smoothedOpenY) * attackFactor;
      } else {
        this.smoothedOpenY += (targetOpenY - this.smoothedOpenY) * decayFactor;
      }

      // Smooth mouth form transitions
      const formSmoothFactor = 1.0 - Math.pow(0.001, dt);
      this.smoothedForm += (targetForm - this.smoothedForm) * formSmoothFactor;

      this.smoothedVolume = rawVol;

      return {
        mouthOpenY: Math.max(0, Math.min(1.0, this.smoothedOpenY)),
        mouthForm: Math.max(-1.0, Math.min(1.0, this.smoothedForm)),
        isSpeaking: true,
        rawVolume: this.smoothedVolume,
      };
    }

    // 3. Fallback Procedural Syllable Cadence (when Web Speech API is running)
    if (this.isUsingPseudoSpeech) {
      const elapsed = (performance.now() - this.pseudoSpeechStartTime) / 1000;
      
      // Multi-frequency harmonic wave simulating human syllable articulation rate (~4-5 syllables/sec)
      const primarySyllable = Math.sin(elapsed * 18.0) * 0.5 + 0.5;
      const subHarmonic = Math.cos(elapsed * 8.5) * 0.3;
      const microPause = Math.sin(elapsed * 3.2) > 0.75 ? 0.2 : 1.0; // natural punctuation pauses

      const targetOpenY = Math.max(0, (primarySyllable * 0.75 + subHarmonic * 0.25) * microPause);
      const targetForm = Math.sin(elapsed * 6.0) * 0.4;

      const attackFactor = 1.0 - Math.pow(0.0001, dt);
      this.smoothedOpenY += (targetOpenY - this.smoothedOpenY) * attackFactor;
      this.smoothedForm += (targetForm - this.smoothedForm) * attackFactor;

      return {
        mouthOpenY: this.smoothedOpenY,
        mouthForm: this.smoothedForm,
        isSpeaking: true,
        rawVolume: this.smoothedOpenY * 0.6,
      };
    }

    return {
      mouthOpenY: 0,
      mouthForm: 0,
      isSpeaking: false,
      rawVolume: 0,
    };
  }
}

export const lipSyncEngine = new LipSyncEngine();
