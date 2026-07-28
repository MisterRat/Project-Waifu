import React, { useEffect, useRef, useState } from "react";
import { EmotionType } from "../types";
import { loadLive2DFromZip, resolveLive2DModelUrl } from "../lib/live2dZipLoader";
import {
  Sparkles,
  Heart,
  Smile,
  Frown,
  Zap,
  HelpCircle,
  Volume2,
  Settings2,
  FileArchive,
  Check,
  Loader2,
  Upload,
  Bot,
  AlertCircle,
} from "lucide-react";

interface Live2DAvatarProps {
  emotion: EmotionType;
  isSpeaking: boolean;
  characterName: string;
  modelUrl?: string;
  onModelUrlChange?: (newUrl: string) => void;
  onEmotionChange?: (emotion: EmotionType) => void;
  audioVolume?: number;
}

export const Live2DAvatar: React.FC<Live2DAvatarProps> = ({
  emotion,
  isSpeaking,
  characterName,
  modelUrl,
  onModelUrlChange,
  onEmotionChange,
  audioVolume = 0,
}) => {
  const pixiCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const proceduralCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const pixiAppRef = useRef<any>(null);
  const live2dModelRef = useRef<any>(null);

  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [mouthOpenRatio, setMouthOpenRatio] = useState(0);
  const [outfitColor, setOutfitColor] = useState<"pink" | "blue" | "purple" | "emerald">("pink");
  const [showCustomModelModal, setShowCustomModelModal] = useState(false);
  const [customModelUrl, setCustomModelUrl] = useState(modelUrl || "");

  const [isExtractingZip, setIsExtractingZip] = useState(false);
  const [zipSuccessMsg, setZipSuccessMsg] = useState<string | null>(null);
  const [zipErrorMsg, setZipErrorMsg] = useState<string | null>(null);

  const [live2dStatus, setLive2dStatus] = useState<"idle" | "loading" | "active" | "error">("idle");
  const [live2dError, setLive2dError] = useState<string | null>(null);

  useEffect(() => {
    if (modelUrl) {
      setCustomModelUrl(modelUrl);
    }
  }, [modelUrl]);

  // Upload handler for ZIP model file
  const handleZipUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsExtractingZip(true);
    setZipErrorMsg(null);
    setZipSuccessMsg(null);

    try {
      const result = await loadLive2DFromZip(file, characterName.toLowerCase().replace(/\s+/g, "_"));
      setCustomModelUrl(result.modelUrl);
      if (onModelUrlChange) {
        onModelUrlChange(result.modelUrl);
      }
      setZipSuccessMsg(`Unpacked "${file.name}" (${result.fileCount} model assets ready)`);
    } catch (err: any) {
      console.error("ZIP load error in canvas:", err);
      setZipErrorMsg(err.message || "Failed to unpack model ZIP file.");
    } finally {
      setIsExtractingZip(false);
      e.target.value = "";
    }
  };

  // Lip-Sync Animation Driver
  useEffect(() => {
    let animId: number;
    if (isSpeaking) {
      let phase = 0;
      const animateLipSync = () => {
        phase += 0.25;
        const dynamicMouth =
          audioVolume > 0.05
            ? Math.min(1.0, audioVolume * 2.5)
            : Math.abs(Math.sin(phase) * 0.75 + Math.cos(phase * 1.7) * 0.25);

        setMouthOpenRatio(dynamicMouth);
        animId = requestAnimationFrame(animateLipSync);
      };
      animId = requestAnimationFrame(animateLipSync);
    } else {
      setMouthOpenRatio(0);
    }
    return () => cancelAnimationFrame(animId);
  }, [isSpeaking, audioVolume]);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const y = ((e.clientY - rect.top) / rect.height) * 2 - 1;
    setMousePos({ x: Math.max(-1, Math.min(1, x)), y: Math.max(-1, Math.min(1, y)) });
  };

  // Live2D PixiJS WebGL Model Mount Engine
  useEffect(() => {
    if (!customModelUrl || typeof window === "undefined") {
      setLive2dStatus("idle");
      return;
    }

    let isSubscribed = true;
    let app: any = null;
    let model: any = null;

    const loadPixiModel = async () => {
      setLive2dStatus("loading");
      setLive2dError(null);

      // Wait up to 5 seconds for PIXI & pixi-live2d-display to be ready on window
      let attempts = 0;
      while (
        attempts < 25 &&
        (!window.hasOwnProperty("PIXI") || !(window as any).PIXI?.live2d?.Live2DModel)
      ) {
        await new Promise((r) => setTimeout(r, 200));
        attempts++;
      }

      const PIXI = (window as any).PIXI;
      if (!PIXI || !PIXI.live2d?.Live2DModel) {
        if (isSubscribed) {
          setLive2dStatus("idle");
          setLive2dError(null);
        }
        return;
      }

      // Safeguard against checkMaxIfStatementsInShader returning 0 in headless/virtual GPU environments
      if (PIXI.settings) {
        PIXI.settings.FAIL_IF_MAJOR_PERFORMANCE_CAVEAT = false;
      }
      if (PIXI.utils) {
        const origCheck = PIXI.utils.checkMaxIfStatementsInShader;
        PIXI.utils.checkMaxIfStatementsInShader = function (maxIfs: number, gl: any) {
          if (!maxIfs || maxIfs <= 0) {
            return 10;
          }
          if (typeof origCheck === "function") {
            try {
              const res = origCheck.call(this, maxIfs, gl);
              return !res || res <= 0 ? 10 : res;
            } catch (err) {
              return 10;
            }
          }
          return maxIfs;
        };
      }

      // Register Ticker with Live2DModel so animations and WebGL updates run
      try {
        if (PIXI.live2d?.Live2DModel?.registerTicker) {
          PIXI.live2d.Live2DModel.registerTicker(PIXI.Ticker);
        }
      } catch (e) {
        // Already registered
      }

      try {
        if (!containerRef.current || !pixiCanvasRef.current) return;

        const width = containerRef.current.clientWidth || 480;
        const height = containerRef.current.clientHeight || 520;

        // Fix for WebGL bindFramebuffer Argument 2 is not an object
        const patchBindFramebuffer = (Context: any) => {
          if (Context && Context.prototype && Context.prototype.bindFramebuffer) {
            const origBindFramebuffer = Context.prototype.bindFramebuffer;
            Context.prototype.bindFramebuffer = function(target: number, framebuffer: any) {
              if (framebuffer === undefined) framebuffer = null;
              return origBindFramebuffer.call(this, target, framebuffer);
            };
            Context.prototype.bindFramebuffer.__patched = true;
          }
        };
        
        if (!(WebGLRenderingContext.prototype.bindFramebuffer as any).__patched) {
          patchBindFramebuffer(WebGLRenderingContext);
          if (typeof WebGL2RenderingContext !== 'undefined') {
            patchBindFramebuffer(WebGL2RenderingContext);
          }
        }

        if (PIXI.settings && PIXI.ENV && PIXI.ENV.WEBGL_LEGACY) {
          PIXI.settings.PREFER_ENV = PIXI.ENV.WEBGL_LEGACY;
        }

        app = new PIXI.Application({
          view: pixiCanvasRef.current,
          autoStart: true,
          backgroundAlpha: 0,
          width,
          height,
          resolution: window.devicePixelRatio || 1,
          autoDensity: true,
          powerPreference: "default",
          contextOptions: {
            failIfMajorPerformanceCaveat: false,
            preserveDrawingBuffer: true,
          },
        });


        const { actualModelUrl, urlResolver } = await resolveLive2DModelUrl(customModelUrl);

        // Instantiate model from URL or Blob URL
        model = await PIXI.live2d.Live2DModel.from(actualModelUrl, {
          autoInteract: true,
        });

        if (model && model.internalModel && model.internalModel.settings) {
          model.internalModel.settings.urlResolver = urlResolver;
          if (typeof model.internalModel.settings.replaceFiles === "function") {
            model.internalModel.settings.replaceFiles(urlResolver);
          }
        }

        if (!isSubscribed) {
          model.destroy();
          app.destroy();
          return;
        }

        app.stage.addChild(model);

        // Calculate responsive scale safely and center model
        const mWidth = (model.width && !isNaN(model.width) && model.width > 0) ? model.width : 400;
        const mHeight = (model.height && !isNaN(model.height) && model.height > 0) ? model.height : 600;
        let fitScale = Math.min((width * 0.85) / mWidth, (height * 0.9) / mHeight);
        if (isNaN(fitScale) || fitScale <= 0 || fitScale === Infinity) {
          fitScale = 0.25;
        }

        model.scale.set(fitScale);
        model.x = width / 2;
        model.y = height / 2 + 15;
        if (model.anchor && typeof model.anchor.set === "function") {
          model.anchor.set(0.5, 0.5);
        }

        live2dModelRef.current = model;
        pixiAppRef.current = app;

        if (isSubscribed) {
          setLive2dStatus("active");
        }
      } catch (err: any) {
        console.error("Live2D WebGL model load failed:", err);
        if (isSubscribed) {
          setLive2dStatus("error");
          setLive2dError(err?.message || err?.toString() || "Unknown WebGL/Model Error");
        }
      }
    };

    loadPixiModel();

    return () => {
      isSubscribed = false;
      if (model) {
        try {
          model.destroy();
        } catch (e) {}
      }
      if (app) {
        try {
          app.destroy();
        } catch (e) {}
      }
      live2dModelRef.current = null;
      pixiAppRef.current = null;
    };
  }, [customModelUrl]);

  // Update Live2D Parameters in Realtime (mouth open, head angle, eye tracking)
  useEffect(() => {
    if (live2dStatus === "active" && live2dModelRef.current) {
      const model = live2dModelRef.current;
      const core = model.internalModel?.coreModel;

      if (core) {
        try {
          // Lip sync mouth opening
          if (typeof core.setParameterValueById === "function") {
            core.setParameterValueById("ParamMouthOpenY", mouthOpenRatio);
            core.setParameterValueById("ParamAngleX", mousePos.x * 25);
            core.setParameterValueById("ParamAngleY", -mousePos.y * 20);
            core.setParameterValueById("ParamEyeBallX", mousePos.x);
            core.setParameterValueById("ParamEyeBallY", -mousePos.y);

            if (emotion === "sad") {
              core.setParameterValueById("ParamBrowLY", -0.5);
              core.setParameterValueById("ParamBrowRY", -0.5);
            } else if (emotion === "excited" || emotion === "surprised") {
              core.setParameterValueById("ParamEyeLOpen", 1.2);
              core.setParameterValueById("ParamEyeROpen", 1.2);
            }
          }
        } catch (e) {
          // Ignore parameter errors if model uses different Cubism ID names
        }
      }
    }
  }, [mouthOpenRatio, mousePos, emotion, live2dStatus]);

  // Procedural 2D Anime Avatar Canvas fallback driver
  useEffect(() => {
    if (live2dStatus === "active") return;

    const canvas = proceduralCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animFrameId: number;
    let breathTime = 0;

    const render = () => {
      breathTime += 0.03;
      const breathOffset = Math.sin(breathTime) * 4;

      const width = canvas.parentElement?.clientWidth || 480;
      const height = canvas.parentElement?.clientHeight || 520;
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }

      ctx.clearRect(0, 0, width, height);

      const centerX = width / 2;
      const centerY = height / 2 + 30;

      const angleX = mousePos.x * 18;
      const angleY = mousePos.y * 12;

      ctx.save();
      ctx.translate(centerX, centerY + breathOffset);
      ctx.rotate((angleX * Math.PI) / 180 / 3);

      const auraGrad = ctx.createRadialGradient(0, -60, 20, 0, -60, 180);
      auraGrad.addColorStop(
        0,
        outfitColor === "pink" ? "rgba(244, 114, 182, 0.25)" : "rgba(96, 165, 250, 0.25)"
      );
      auraGrad.addColorStop(1, "rgba(15, 23, 42, 0)");
      ctx.fillStyle = auraGrad;
      ctx.beginPath();
      ctx.arc(0, -60, 200, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle =
        outfitColor === "pink"
          ? "#f472b6"
          : outfitColor === "blue"
          ? "#60a5fa"
          : outfitColor === "purple"
          ? "#c084fc"
          : "#34d399";
      ctx.beginPath();
      ctx.ellipse(0, -50 + angleY * 0.3, 110, 120, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.beginPath();
      ctx.ellipse(-85 + angleX * 0.4, 40, 28, 120, -0.2, 0, Math.PI * 2);
      ctx.ellipse(85 + angleX * 0.4, 40, 28, 120, 0.2, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#1e293b";
      ctx.beginPath();
      ctx.moveTo(-75, 120);
      ctx.lineTo(-40, 60);
      ctx.lineTo(40, 60);
      ctx.lineTo(75, 120);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.moveTo(-35, 60);
      ctx.lineTo(0, 100);
      ctx.lineTo(35, 60);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = outfitColor === "pink" ? "#f43f5e" : "#3b82f6";
      ctx.beginPath();
      ctx.arc(0, 80, 8, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#fee2e2";
      ctx.fillRect(-16, 35, 32, 30);

      ctx.beginPath();
      ctx.moveTo(-65 + angleX * 0.2, -80 + angleY * 0.2);
      ctx.bezierCurveTo(-65, 10, -35, 45, 0, 45 + angleY * 0.3);
      ctx.bezierCurveTo(35, 45, 65, 10, 65 + angleX * 0.2, -80 + angleY * 0.2);
      ctx.bezierCurveTo(55, -130, -55, -130, -65 + angleX * 0.2, -80 + angleY * 0.2);
      ctx.fill();

      if (emotion === "blush" || emotion === "excited") {
        ctx.fillStyle = "rgba(244, 63, 94, 0.45)";
        ctx.beginPath();
        ctx.ellipse(-38 + angleX * 0.5, 2 + angleY * 0.3, 16, 9, 0, 0, Math.PI * 2);
        ctx.ellipse(38 + angleX * 0.5, 2 + angleY * 0.3, 16, 9, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      const eyeXOffset = mousePos.x * 6;
      const eyeYOffset = mousePos.y * 4;

      ctx.strokeStyle = "#475569";
      ctx.lineWidth = 3.5;
      ctx.lineCap = "round";

      ctx.beginPath();
      if (emotion === "sad") {
        ctx.moveTo(-48, -42 + angleY * 0.2);
        ctx.lineTo(-22, -36 + angleY * 0.2);
        ctx.moveTo(22, -36 + angleY * 0.2);
        ctx.lineTo(48, -42 + angleY * 0.2);
      } else if (emotion === "excited" || emotion === "happy") {
        ctx.moveTo(-48, -40 + angleY * 0.2);
        ctx.quadraticCurveTo(-35, -48, -22, -40 + angleY * 0.2);
        ctx.moveTo(22, -40 + angleY * 0.2);
        ctx.quadraticCurveTo(35, -48, 48, -40 + angleY * 0.2);
      } else {
        ctx.moveTo(-48, -42 + angleY * 0.2);
        ctx.lineTo(-22, -42 + angleY * 0.2);
        ctx.moveTo(22, -42 + angleY * 0.2);
        ctx.lineTo(48, -42 + angleY * 0.2);
      }
      ctx.stroke();

      const renderEye = (centerXPos: number) => {
        ctx.save();
        ctx.translate(centerXPos + angleX * 0.3, -20 + angleY * 0.3);

        if (emotion === "happy" || emotion === "excited") {
          ctx.strokeStyle = "#0f172a";
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.arc(0, 0, 14, Math.PI * 1.15, Math.PI * 1.85);
          ctx.stroke();
        } else {
          ctx.fillStyle = "#ffffff";
          ctx.beginPath();
          ctx.ellipse(0, 0, 17, 22, 0, 0, Math.PI * 2);
          ctx.fill();

          ctx.strokeStyle = "#0f172a";
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(0, -3, 17, Math.PI * 1.1, Math.PI * 1.9);
          ctx.stroke();

          const irisGrad = ctx.createLinearGradient(0, -15, 0, 15);
          irisGrad.addColorStop(0, "#ec4899");
          irisGrad.addColorStop(1, "#831843");

          ctx.fillStyle = irisGrad;
          ctx.beginPath();
          ctx.ellipse(eyeXOffset, eyeYOffset, 10, 14, 0, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = "#000000";
          ctx.beginPath();
          ctx.ellipse(eyeXOffset, eyeYOffset, 4, 6, 0, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = "#ffffff";
          ctx.beginPath();
          ctx.arc(eyeXOffset - 4, eyeYOffset - 5, 4, 0, Math.PI * 2);
          ctx.arc(eyeXOffset + 3, eyeYOffset + 4, 2, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      };

      renderEye(-35);
      renderEye(35);

      ctx.save();
      ctx.translate(angleX * 0.2, 22 + angleY * 0.2);

      const mOpen = mouthOpenRatio;
      if (mOpen > 0.08) {
        ctx.fillStyle = "#9f1239";
        ctx.beginPath();
        ctx.ellipse(0, 0, 12, Math.max(3, mOpen * 14), 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "#fb7185";
        ctx.beginPath();
        ctx.arc(0, mOpen * 5, 8, 0, Math.PI);
        ctx.fill();
      } else {
        ctx.strokeStyle = "#be123c";
        ctx.lineWidth = 3;
        ctx.lineCap = "round";

        ctx.beginPath();
        if (emotion === "happy" || emotion === "excited") {
          ctx.arc(0, -4, 12, Math.PI * 0.25, Math.PI * 0.75);
        } else if (emotion === "sad") {
          ctx.arc(0, 8, 12, Math.PI * 1.25, Math.PI * 1.75);
        } else {
          ctx.arc(-5, -2, 6, Math.PI * 0.2, Math.PI * 0.8);
          ctx.moveTo(0, 2);
          ctx.arc(5, -2, 6, Math.PI * 0.2, Math.PI * 0.8);
        }
        ctx.stroke();
      }
      ctx.restore();

      ctx.fillStyle =
        outfitColor === "pink"
          ? "#f472b6"
          : outfitColor === "blue"
          ? "#60a5fa"
          : outfitColor === "purple"
          ? "#c084fc"
          : "#34d399";

      ctx.beginPath();
      ctx.moveTo(-10 + angleX * 0.1, -125);
      ctx.quadraticCurveTo(-15 + angleX * 0.2, -60, 0 + angleX * 0.3, -40);
      ctx.quadraticCurveTo(15 + angleX * 0.2, -60, 10 + angleX * 0.1, -125);
      ctx.fill();

      ctx.restore();

      animFrameId = requestAnimationFrame(render);
    };

    render();

    return () => cancelAnimationFrame(animFrameId);
  }, [mousePos, mouthOpenRatio, emotion, outfitColor, live2dStatus]);

  const emotionList: { id: EmotionType; label: string; icon: React.ReactNode; color: string }[] = [
    {
      id: "happy",
      label: "Happy",
      icon: <Smile className="w-4 h-4" />,
      color: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
    },
    {
      id: "blush",
      label: "Blush",
      icon: <Heart className="w-4 h-4" />,
      color: "bg-pink-500/20 text-pink-300 border-pink-500/40",
    },
    {
      id: "excited",
      label: "Excited",
      icon: <Sparkles className="w-4 h-4" />,
      color: "bg-amber-500/20 text-amber-300 border-amber-500/40",
    },
    {
      id: "surprised",
      label: "Surprised",
      icon: <Zap className="w-4 h-4" />,
      color: "bg-purple-500/20 text-purple-300 border-purple-500/40",
    },
    {
      id: "thinking",
      label: "Thinking",
      icon: <HelpCircle className="w-4 h-4" />,
      color: "bg-blue-500/20 text-blue-300 border-blue-500/40",
    },
    {
      id: "sad",
      label: "Sad",
      icon: <Frown className="w-4 h-4" />,
      color: "bg-indigo-500/20 text-indigo-300 border-indigo-500/40",
    },
  ];

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden flex flex-col relative shadow-2xl">
      {/* Top Header Bar */}
      <div className="bg-slate-950/80 border-b border-slate-800 px-4 py-3 flex items-center justify-between backdrop-blur z-10">
        <div className="flex items-center gap-2">
          <span
            className={`w-2.5 h-2.5 rounded-full ${
              live2dStatus === "active" ? "bg-emerald-400 animate-pulse" : "bg-violet-500"
            }`}
          ></span>
          <span className="font-bold text-sm text-slate-100 font-serif italic">{characterName}</span>
          <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-slate-900 text-slate-300 border border-slate-800 font-mono flex items-center gap-1">
            {live2dStatus === "active" ? (
              <span className="text-emerald-400 font-bold">✓ Live2D Cubism WebGL</span>
            ) : live2dStatus === "loading" ? (
              <span className="text-amber-300 flex items-center gap-1">
                <Loader2 className="w-3 h-3 animate-spin" />
                Unpacking Model...
              </span>
            ) : (
              <span>Procedural Canvas Avatar</span>
            )}
          </span>
        </div>
      </div>

      {/* Interactive Display Area */}
      <div
        ref={containerRef}
        onMouseMove={handleMouseMove}
        className="relative w-full h-[420px] bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center cursor-crosshair overflow-hidden group"
      >
        {/* Canvas for WebGL Live2D Model */}
        <canvas
          ref={pixiCanvasRef}
          className={`w-full h-full object-contain absolute inset-0 ${
            live2dStatus === "active" ? "block z-10" : "hidden z-0"
          }`}
        />

        {/* Canvas for Procedural 2D Anime Avatar Fallback */}
        <canvas
          ref={proceduralCanvasRef}
          className={`w-full h-full object-contain ${
            live2dStatus === "active" ? "hidden" : "block"
          }`}
        />

        {/* Background Radial Glow */}
        <div className="absolute inset-0 pointer-events-none opacity-20 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-violet-500 via-transparent to-transparent"></div>

        {/* Live2D Active Status Ribbon */}
        {live2dStatus === "active" && (
          <div className="absolute top-3 left-3 text-[10px] text-emerald-300 bg-emerald-950/80 backdrop-blur px-2.5 py-1 rounded-lg border border-emerald-800/80 pointer-events-none opacity-90 font-mono flex items-center gap-1.5 z-20">
            <Check className="w-3 h-3 text-emerald-400" />
            <span>Live2D WebGL Model Active ({characterName})</span>
          </div>
        )}

        {/* Live2D Error / Fallback Badge */}
        {live2dStatus === "error" && (
          <div className="absolute top-3 left-3 right-28 text-[10px] text-amber-300 bg-amber-950/90 backdrop-blur p-2 rounded-lg border border-amber-800/80 z-20 font-sans shadow-lg flex items-start gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <span className="font-bold block">Live2D WebGL Fallback Active</span>
              <span className="text-[9.5px] text-amber-200/80 block leading-tight mt-0.5 max-h-24 overflow-y-auto">
                {live2dError || "Showing 2D procedural avatar fallback."}
              </span>
            </div>
          </div>
        )}

        {/* Loading Spinner Indicator */}
        {live2dStatus === "loading" && (
          <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm flex flex-col items-center justify-center gap-2 z-20">
            <Loader2 className="w-8 h-8 animate-spin text-violet-400" />
            <span className="text-xs font-semibold text-slate-200">
              Loading Live2D Cubism model for {characterName}...
            </span>
          </div>
        )}

        {/* Emotion Status Badge */}
        <div className="absolute top-3 right-3 flex items-center gap-2 z-20">
          <span className="text-xs font-medium px-3 py-1 rounded-full bg-slate-900/90 border border-violet-500/40 text-violet-300 capitalize flex items-center gap-1.5 shadow-lg backdrop-blur">
            <Sparkles className="w-3.5 h-3.5 text-violet-400" />
            <span>{emotion}</span>
          </span>
        </div>

        {/* Lip-Sync Waveform Indicator */}
        {isSpeaking && (
          <div className="absolute bottom-4 left-4 flex items-center gap-2 bg-violet-950/80 border border-violet-500/40 text-violet-200 px-3 py-1.5 rounded-full text-xs font-medium shadow-lg backdrop-blur animate-pulse z-20">
            <Volume2 className="w-4 h-4 text-violet-400 animate-bounce" />
            <span>Speaking (Lip Sync: {Math.round(mouthOpenRatio * 100)}%)</span>
          </div>
        )}
      </div>

      {/* Emotion & Swatch Bar */}
      <div className="p-3 bg-slate-950/90 border-t border-slate-800 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {emotionList.map((item) => (
            <button
              key={item.id}
              onClick={() => onEmotionChange && onEmotionChange(item.id)}
              className={`text-xs px-2.5 py-1.5 rounded-lg border flex items-center gap-1.5 transition ${
                emotion === item.id
                  ? item.color + " ring-1 ring-pink-500/50 shadow"
                  : "bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200 hover:bg-slate-800"
              }`}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </div>

        {/* Color Swatches */}
        <div className="flex items-center gap-1 pl-2 border-l border-slate-800">
          {(["pink", "blue", "purple", "emerald"] as const).map((color) => (
            <button
              key={color}
              onClick={() => setOutfitColor(color)}
              className={`w-4 h-4 rounded-full border transition ${
                outfitColor === color
                  ? "scale-125 border-white ring-1 ring-pink-400"
                  : "border-transparent opacity-60 hover:opacity-100"
              } ${
                color === "pink"
                  ? "bg-pink-400"
                  : color === "blue"
                  ? "bg-blue-400"
                  : color === "purple"
                  ? "bg-purple-400"
                  : "bg-emerald-400"
              }`}
              title={`Change color theme to ${color}`}
            />
          ))}
        </div>
      </div>

      {/* Model Selection Modal */}
      {showCustomModelModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                <Settings2 className="w-5 h-5 text-violet-400" />
                <span>Live2D Model for {characterName}</span>
              </h3>
              <button
                onClick={() => setShowCustomModelModal(false)}
                className="text-slate-400 hover:text-slate-200 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              Upload a local Live2D model <code className="text-violet-300">.zip</code> archive or enter a direct public <code className="text-violet-300">.model3.json</code> URL.
            </p>

            {/* Local ZIP Upload Dropzone */}
            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 text-center space-y-2">
              <div className="flex justify-center">
                <div className="w-10 h-10 rounded-2xl bg-violet-600/20 border border-violet-500/30 flex items-center justify-center text-violet-300">
                  {isExtractingZip ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <FileArchive className="w-5 h-5" />
                  )}
                </div>
              </div>

              <div className="text-xs font-semibold text-slate-200">
                {isExtractingZip ? "Extracting ZIP Archive..." : "Upload Model .zip Archive"}
              </div>

              <label className="inline-flex items-center gap-1.5 bg-violet-600 hover:bg-violet-500 text-white px-4 py-2 rounded-xl text-xs font-medium cursor-pointer transition shadow-lg shadow-violet-500/20">
                <Upload className="w-3.5 h-3.5" />
                <span>Select .ZIP File</span>
                <input
                  type="file"
                  accept=".zip"
                  onChange={handleZipUpload}
                  className="hidden"
                  disabled={isExtractingZip}
                />
              </label>

              {zipSuccessMsg && (
                <div className="text-[11px] text-emerald-400 bg-emerald-950/40 border border-emerald-800/40 px-2.5 py-1.5 rounded-xl flex items-center justify-center gap-1.5 font-mono mt-2">
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span>{zipSuccessMsg}</span>
                </div>
              )}

              {zipErrorMsg && (
                <div className="text-[11px] text-rose-400 bg-rose-950/40 border border-rose-800/40 px-2.5 py-1.5 rounded-xl font-mono mt-2">
                  ⚠️ {zipErrorMsg}
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Direct .model3.json or Blob URL
              </label>
              <input
                type="text"
                value={customModelUrl}
                onChange={(e) => setCustomModelUrl(e.target.value)}
                placeholder="https://cdn.example.com/models/shizuku/shizuku.model3.json"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-violet-500 font-mono"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowCustomModelModal(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded-xl transition"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (customModelUrl && onModelUrlChange) {
                    onModelUrlChange(customModelUrl);
                  }
                  setShowCustomModelModal(false);
                }}
                className="px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white text-xs rounded-xl font-medium transition shadow-lg shadow-violet-500/20"
              >
                Apply Model to {characterName}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
