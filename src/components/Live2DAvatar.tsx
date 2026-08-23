import React, { useEffect, useRef, useState } from "react";
import { EmotionType, MotionType, EMOTION_TYPES } from "../types";
import { loadLive2DFromZip, resolveLive2DModelUrl } from "../lib/live2dZipLoader";
import {
  createInitialTrackingState,
  stepTrackingState,
  applyLive2DMultiJointKinematics,
  TrackingState,
} from "../lib/live2dTrackingEngine";
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
  Flame,
  MinusCircle,
  Eye,
  Activity,
  Hand,
  RotateCw,
} from "lucide-react";

interface Live2DAvatarProps {
  emotion: EmotionType;
  motion?: MotionType;
  isSpeaking: boolean;
  characterName: string;
  modelUrl?: string;
  physicsIntensity?: number;
  trackingEngineEnabled?: boolean;
  onPhysicsIntensityChange?: (intensity: number) => void;
  onModelUrlChange?: (newUrl: string) => void;
  onEmotionChange?: (emotion: EmotionType) => void;
  onMotionTrigger?: (motion: MotionType) => void;
  audioVolume?: number;
  onDebugLog?: (msg: string) => void;
  initialScale?: number;
  initialX?: number;
  initialY?: number;
  onTransformChange?: (scale: number, x: number, y: number) => void;
}

export const Live2DAvatar: React.FC<Live2DAvatarProps> = ({
  emotion,
  motion = "none",
  isSpeaking,
  characterName,
  modelUrl,
  physicsIntensity = 1.0,
  trackingEngineEnabled = true,
  onPhysicsIntensityChange,
  onModelUrlChange,
  onEmotionChange,
  onMotionTrigger,
  audioVolume = 0,
  onDebugLog,
  initialScale,
  initialX,
  initialY,
  onTransformChange,
}) => {
  const pixiCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const proceduralCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const displayAreaRef = useRef<HTMLDivElement | null>(null);

  const pixiAppRef = useRef<any>(null);
  const live2dModelRef = useRef<any>(null);

  const isPanningRef = useRef(false);
  const isZoomingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0, modelX: 0, modelY: 0 });
  const zoomStartRef = useRef({ y: 0, scale: 1 });
  const [zoomLevel, setZoomLevel] = useState<number>(1);

  const [pos, setPos] = useState(() => {
    try {
      const saved = localStorage.getItem("waifu_avatar_pos");
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return { x: 0, y: 0 };
  });

  const [size, setSize] = useState<{ width: string; height: string }>(() => {
    try {
      const saved = localStorage.getItem("waifu_avatar_size");
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return { width: "", height: "" };
  });

  useEffect(() => {
    try {
      localStorage.setItem("waifu_avatar_pos", JSON.stringify(pos));
    } catch (e) {}
  }, [pos]);

  const handleResizeSave = () => {
    const el = containerRef.current;
    if (el) {
      const newSize = { width: `${el.offsetWidth}px`, height: `${el.offsetHeight}px` };
      setSize(newSize);
      try {
        localStorage.setItem("waifu_avatar_size", JSON.stringify(newSize));
      } catch (e) {}
    }
    if (live2dModelRef.current && displayAreaRef.current) {
      const containerW = displayAreaRef.current.clientWidth;
      if (containerW > 0) {
        live2dModelRef.current.x = containerW / 2;
      }
    }
  };

  const [isDraggingWindow, setIsDraggingWindow] = useState(false);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [mouthOpenRatio, setMouthOpenRatio] = useState(0);
  const [activeMotion, setActiveMotion] = useState<MotionType>(motion || "none");
  const motionStartTimeRef = useRef<number | null>(null);

  const trackingStateRef = useRef<TrackingState>(createInitialTrackingState());
  const mouseTargetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const physicsIntensityRef = useRef<number>(physicsIntensity ?? 1.0);
  const trackingEngineEnabledRef = useRef<boolean>(trackingEngineEnabled ?? true);
  const emotionRef = useRef<EmotionType>(emotion);
  const activeMotionRef = useRef<MotionType>(activeMotion);
  const isSpeakingRef = useRef<boolean>(isSpeaking);
  const mouthOpenRatioRef = useRef<number>(0);

  useEffect(() => {
    physicsIntensityRef.current = physicsIntensity ?? 1.0;
  }, [physicsIntensity]);

  useEffect(() => {
    trackingEngineEnabledRef.current = trackingEngineEnabled ?? true;
    if (!trackingEngineEnabled) {
      mouseTargetRef.current = { x: 0, y: 0 };
    }
  }, [trackingEngineEnabled]);

  useEffect(() => {
    emotionRef.current = emotion;
    if (live2dModelRef.current) {
      try {
        const model = live2dModelRef.current;
        if (typeof (model as any).expression === "function") {
          const exprMgr = model.internalModel?.motionManager?.expressionManager;
          const definitions = exprMgr?.definitions || exprMgr?.expressions || [];
          let matchedExpression: string | number | undefined = undefined;
          if (Array.isArray(definitions)) {
            const found = definitions.find((d: any) => {
              const name = (d.name || d.Name || d.file || d.File || "").toLowerCase();
              return name.includes(emotion.toLowerCase());
            });
            if (found) {
              matchedExpression = found.name || found.Name;
            }
          }
          if (matchedExpression !== undefined) {
            (model as any).expression(matchedExpression);
          } else {
            (model as any).expression(emotion);
          }
        }
      } catch (e) {
        // Ignore if model does not have expression file
      }
    }
  }, [emotion]);

  useEffect(() => {
    activeMotionRef.current = activeMotion;
  }, [activeMotion]);

  useEffect(() => {
    isSpeakingRef.current = isSpeaking;
  }, [isSpeaking]);

  useEffect(() => {
    mouthOpenRatioRef.current = mouthOpenRatio;
  }, [mouthOpenRatio]);

  // Global mouse tracking across viewport for natural VTuber eye contact and physics response
  useEffect(() => {
    const handleGlobalPointerMove = (e: MouseEvent) => {
      if (!containerRef.current || !trackingEngineEnabledRef.current) {
        mouseTargetRef.current = { x: 0, y: 0 };
        return;
      }
      const rect = containerRef.current.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const relX = (e.clientX - centerX) / (rect.width / 2);
      const relY = (e.clientY - centerY) / (rect.height / 2);
      const clampedX = Math.max(-1.5, Math.min(1.5, relX));
      const clampedY = Math.max(-1.5, Math.min(1.5, relY));
      mouseTargetRef.current = { x: clampedX, y: clampedY };
      setMousePos({ x: Math.max(-1, Math.min(1, clampedX)), y: Math.max(-1, Math.min(1, clampedY)) });
    };

    window.addEventListener("mousemove", handleGlobalPointerMove, { passive: true });
    return () => window.removeEventListener("mousemove", handleGlobalPointerMove);
  }, []);

  const dragRef = useRef({ startX: 0, startY: 0, initialX: 0, initialY: 0 });

  const handleHeaderMouseDown = (e: React.MouseEvent) => {
    setIsDraggingWindow(true);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initialX: pos.x,
      initialY: pos.y,
    };
    e.stopPropagation();
  };

  const handleHeaderTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      setIsDraggingWindow(true);
      dragRef.current = {
        startX: touch.clientX,
        startY: touch.clientY,
        initialX: pos.x,
        initialY: pos.y,
      };
      e.stopPropagation();
    }
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingWindow) return;
      const dx = e.clientX - dragRef.current.startX;
      const dy = e.clientY - dragRef.current.startY;
      setPos({
        x: dragRef.current.initialX + dx,
        y: dragRef.current.initialY + dy,
      });
      if (live2dModelRef.current && displayAreaRef.current) {
        const containerW = displayAreaRef.current.clientWidth;
        if (containerW > 0) {
          live2dModelRef.current.x = containerW / 2;
        }
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isDraggingWindow || e.touches.length === 0) return;
      const touch = e.touches[0];
      const dx = touch.clientX - dragRef.current.startX;
      const dy = touch.clientY - dragRef.current.startY;
      setPos({
        x: dragRef.current.initialX + dx,
        y: dragRef.current.initialY + dy,
      });
      if (live2dModelRef.current && displayAreaRef.current) {
        const containerW = displayAreaRef.current.clientWidth;
        if (containerW > 0) {
          live2dModelRef.current.x = containerW / 2;
        }
      }
    };

    const handleMouseUp = () => {
      setIsDraggingWindow(false);
    };

    const handleTouchEnd = () => {
      setIsDraggingWindow(false);
    };

    if (isDraggingWindow) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
      window.addEventListener("touchmove", handleTouchMove, { passive: true });
      window.addEventListener("touchend", handleTouchEnd);
    }
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleTouchEnd);
    };
  }, [isDraggingWindow]);

  useEffect(() => {
    if (motion && motion !== "none") {
      setActiveMotion(motion);
      motionStartTimeRef.current = Date.now();

      if (live2dModelRef.current) {
        try {
          const model = live2dModelRef.current;
          if (typeof model.motion === "function") {
            model.motion(motion);
          } else if (model.internalModel?.motionManager) {
            model.internalModel.motionManager.startMotion(motion, 0, 2);
          }
        } catch (e) {}
      }
    } else if (motion === "none") {
      setActiveMotion("none");
      motionStartTimeRef.current = null;
    }
  }, [motion]);

  // 5-second auto-expiration timer for active motions
  useEffect(() => {
    if (activeMotion && activeMotion !== "none") {
      motionStartTimeRef.current = Date.now();
      const resetTimer = setTimeout(() => {
        setActiveMotion("none");
        motionStartTimeRef.current = null;
        if (onMotionTrigger) {
          onMotionTrigger("none");
        }
      }, 5000);
      return () => clearTimeout(resetTimer);
    }
  }, [activeMotion]);

  const triggerMotion = (m: MotionType) => {
    setActiveMotion(m);
    motionStartTimeRef.current = Date.now();
    if (onMotionTrigger) {
      onMotionTrigger(m);
    }
    if (live2dModelRef.current) {
      try {
        const model = live2dModelRef.current;
        if (typeof model.motion === "function") {
          model.motion(m);
        } else if (model.internalModel?.motionManager) {
          model.internalModel.motionManager.startMotion(m, 0, 2);
        }
      } catch (e) {}
    }
  };
  const [outfitColor, setOutfitColor] = useState<"pink" | "blue" | "purple" | "emerald">("pink");
  const [showCustomModelModal, setShowCustomModelModal] = useState(false);
  const [customModelUrl, setCustomModelUrl] = useState(modelUrl || "");

  const [isExtractingZip, setIsExtractingZip] = useState(false);
  const [zipSuccessMsg, setZipSuccessMsg] = useState<string | null>(null);
  const [zipErrorMsg, setZipErrorMsg] = useState<string | null>(null);

  const [live2dStatus, setLive2dStatus] = useState<"idle" | "loading" | "active" | "error" | "fallback">("idle");
  const [live2dError, setLive2dError] = useState<string | null>(null);
  const addDebugLog = (msg: string) => { if (onDebugLog) onDebugLog(msg); };

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
      // 1. Try uploading to server disk storage first (/models/...) for fast native static file serving
      try {
        const reader = new FileReader();
        const base64Data = await new Promise<string>((resolve, reject) => {
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });

        const res = await fetch("/api/live2d/upload-zip", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filename: file.name, zipBase64: base64Data }),
        });

        if (res.ok) {
          const data = await res.json();
          if (data.success && data.modelUrl) {
            setCustomModelUrl(data.modelUrl);
            if (onModelUrlChange) {
              onModelUrlChange(data.modelUrl);
            }
            setZipSuccessMsg(`Unpacked to server storage! (${data.fileCount} files ready)`);
            return;
          }
        }
      } catch (serverErr) {
        console.warn("Server zip upload fallback to local indexed unpacked storage:", serverErr);
      }

      // 2. Fallback to client-side persistent unpacked storage
      const result = await loadLive2DFromZip(file, characterName.toLowerCase().replace(/\s+/g, "_"));
      setCustomModelUrl(result.modelUrl);
      if (onModelUrlChange) {
        onModelUrlChange(result.modelUrl);
      }
      setZipSuccessMsg(`Unpacked & cached in local storage (${result.fileCount} model assets ready)`);
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

  // Silent Extended Idle Animation Driver (fires a random gesture every 25s if idle)
  useEffect(() => {
    const IDLE_PERIOD_MS = 25000;

    const idleTimer = setInterval(() => {
      // Skip if character is currently speaking
      if (isSpeaking) return;

      const ALL_IDLE_MOTIONS: MotionType[] = [
        "check_nails",
        "jiggle_dance",
        "sigh_tilt",
        "curious_glance",
        "stretch_wave",
        "nod",
        "wave",
        "shake",
        "bow",
        "laugh",
        "wink",
      ];

      const randomMotion = ALL_IDLE_MOTIONS[Math.floor(Math.random() * ALL_IDLE_MOTIONS.length)];
      let methodBTriggered = false;

      // Method B: Attempt native Live2D motion3 file / motionManager group execution
      if (live2dStatus === "active" && live2dModelRef.current) {
        try {
          const model = live2dModelRef.current;
          const motionMgr = model.internalModel?.motionManager;

          if (motionMgr) {
            const definitions = motionMgr.definitions || motionMgr.motionGroups || {};
            const groupKeys = Object.keys(definitions);

            if (groupKeys.length > 0) {
              const targetGroup =
                groupKeys.find((k) => k.toLowerCase().includes("idle")) ||
                groupKeys[Math.floor(Math.random() * groupKeys.length)];

              if (targetGroup) {
                motionMgr.startMotion(targetGroup, 0, 2);
                methodBTriggered = true;
                triggerMotion(randomMotion);
                addDebugLog(`[Extended Idle] Executed Method B motion3 from group "${targetGroup}"`);
              }
            }
          }
        } catch (e) {
          methodBTriggered = false;
        }
      }

      // Method A: Fallback to synthetic procedural motion curves if Method B is unavailable
      if (!methodBTriggered) {
        triggerMotion(randomMotion);
        addDebugLog(`[Extended Idle] Executed Method A synthetic idle gesture: [${randomMotion}]`);
      }
    }, IDLE_PERIOD_MS);

    return () => clearInterval(idleTimer);
  }, [isSpeaking, live2dStatus]);

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button === 0) {
      isPanningRef.current = true;
      dragStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        modelX: live2dModelRef.current?.x || 0,
        modelY: live2dModelRef.current?.y || 0,
      };
    } else if (e.button === 1) {
      e.preventDefault();
      isZoomingRef.current = true;
      zoomStartRef.current = {
        y: e.clientY,
        scale: live2dModelRef.current?.scale.x || 1,
      };
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const y = ((e.clientY - rect.top) / rect.height) * 2 - 1;
    setMousePos({ x: Math.max(-1, Math.min(1, x)), y: Math.max(-1, Math.min(1, y)) });

    if (isPanningRef.current && live2dModelRef.current) {
      const dy = e.clientY - dragStartRef.current.y;
      const containerW = displayAreaRef.current?.clientWidth || containerRef.current?.clientWidth || 480;
      live2dModelRef.current.x = containerW / 2;
      live2dModelRef.current.y = dragStartRef.current.modelY + dy;
      onTransformChange?.(live2dModelRef.current.scale.x, live2dModelRef.current.x, live2dModelRef.current.y);
    } else if (isZoomingRef.current && live2dModelRef.current) {
      const dy = zoomStartRef.current.y - e.clientY;
      const scaleFactor = Math.pow(1.01, dy);
      const newScale = Math.max(0.05, Math.min(10.0, zoomStartRef.current.scale * scaleFactor));
      const containerW = displayAreaRef.current?.clientWidth || containerRef.current?.clientWidth || 480;
      live2dModelRef.current.x = containerW / 2;
      live2dModelRef.current.scale.set(newScale);
      setZoomLevel(newScale);
      onTransformChange?.(newScale, live2dModelRef.current.x, live2dModelRef.current.y);
    }
  };

  const handleMouseUp = () => {
    isPanningRef.current = false;
    isZoomingRef.current = false;
  };

  const touchStartRef = useRef<{ x: number; y: number; distance: number; modelX: number; modelY: number; scale: number }>({
    x: 0,
    y: 0,
    distance: 0,
    modelX: 0,
    modelY: 0,
    scale: 1,
  });

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 1) {
      isPanningRef.current = true;
      const touch = e.touches[0];
      dragStartRef.current = {
        x: touch.clientX,
        y: touch.clientY,
        modelX: live2dModelRef.current?.x || 0,
        modelY: live2dModelRef.current?.y || 0,
      };
    } else if (e.touches.length === 2) {
      isZoomingRef.current = true;
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      touchStartRef.current = {
        x: (t1.clientX + t2.clientX) / 2,
        y: (t1.clientY + t2.clientY) / 2,
        distance: dist,
        modelX: 0,
        modelY: 0,
        scale: live2dModelRef.current?.scale.x || 1,
      };
    }
  };

  const handleTouchMoveCanvas = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 1 && isPanningRef.current && live2dModelRef.current) {
      const touch = e.touches[0];
      const dy = touch.clientY - dragStartRef.current.y;
      const containerW = displayAreaRef.current?.clientWidth || containerRef.current?.clientWidth || 480;
      live2dModelRef.current.x = containerW / 2;
      live2dModelRef.current.y = dragStartRef.current.modelY + dy;
      onTransformChange?.(live2dModelRef.current.scale.x, live2dModelRef.current.x, live2dModelRef.current.y);
    } else if (e.touches.length === 2 && isZoomingRef.current && live2dModelRef.current) {
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      if (touchStartRef.current.distance > 0) {
        const factor = dist / touchStartRef.current.distance;
        const newScale = Math.max(0.05, Math.min(10.0, touchStartRef.current.scale * factor));
        const containerW = displayAreaRef.current?.clientWidth || containerRef.current?.clientWidth || 480;
        live2dModelRef.current.x = containerW / 2;
        live2dModelRef.current.scale.set(newScale);
        setZoomLevel(newScale);
        onTransformChange?.(newScale, live2dModelRef.current.x, live2dModelRef.current.y);
      }
    }
  };

  const handleTouchEndCanvas = () => {
    isPanningRef.current = false;
    isZoomingRef.current = false;
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!live2dModelRef.current) return;
    const currentScale = live2dModelRef.current.scale.x;
    const scaleFactor = e.deltaY < 0 ? 1.1 : 0.9;
    const newScale = Math.max(0.05, Math.min(10.0, currentScale * scaleFactor));
    const containerW = displayAreaRef.current?.clientWidth || containerRef.current?.clientWidth || 480;
    live2dModelRef.current.x = containerW / 2;
    live2dModelRef.current.scale.set(newScale);
    setZoomLevel(newScale);
    onTransformChange?.(newScale, live2dModelRef.current.x, live2dModelRef.current.y);
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
    let resizeObserver: ResizeObserver | null = null;

    const loadPixiModel = async () => {
      setLive2dStatus("loading");
      setLive2dError(null);
      addDebugLog("Loading Live2D model...");

      // Fast check for PIXI & pixi-live2d-display (check immediately, then micro-poll if needed)
      let attempts = 0;
      while (
        attempts < 20 &&
        (!window.hasOwnProperty("PIXI") || !(window as any).PIXI?.live2d?.Live2DModel)
      ) {
        await new Promise((r) => setTimeout(r, 50));
        attempts++;
      }

      const PIXI = (window as any).PIXI;
      if (!PIXI || !PIXI.live2d?.Live2DModel) {
        if (isSubscribed) {
          addDebugLog("Live2D SDK or PixiJS not available on window");
          setLive2dStatus("error");
          setLive2dError("Failed to load PIXI.js or Live2D Model dependencies.");
        }
        return;
      }

      // Safeguard against checkMaxIfStatementsInShader returning 0 in headless/virtual GPU environments
      if (PIXI.settings) {
        PIXI.settings.FAIL_IF_MAJOR_PERFORMANCE_CAVEAT = false;
      }
      if (PIXI.utils && !(PIXI.utils as any).__isPatchedForMaxIfs) {
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
        (PIXI.utils as any).__isPatchedForMaxIfs = true;
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

        if (PIXI.settings && PIXI.ENV && PIXI.ENV.WEBGL_LEGACY) {
          PIXI.settings.PREFER_ENV = PIXI.ENV.WEBGL_LEGACY;
        }

        // Reuse existing PIXI application if already created for seamless instantaneous model swaps
        if (!pixiAppRef.current) {
          app = new PIXI.Application({
            view: pixiCanvasRef.current,
            autoStart: true,
            backgroundAlpha: 0,
            width,
            height,
            resolution: window.devicePixelRatio || 1,
            autoDensity: true,
            powerPreference: "high-performance",
            contextOptions: {
              failIfMajorPerformanceCaveat: false,
              preserveDrawingBuffer: true,
            },
          });
          pixiAppRef.current = app;
        } else {
          app = pixiAppRef.current;
          // Clear any previous model from stage
          if (live2dModelRef.current) {
            try {
              app.stage.removeChild(live2dModelRef.current);
              live2dModelRef.current.destroy();
            } catch (e) {}
            live2dModelRef.current = null;
          }
        }

        const { actualModelUrl, urlResolver } = await resolveLive2DModelUrl(customModelUrl);

        // Instantiate model from URL or cached Blob URL with full multi-joint tracking control
        model = await PIXI.live2d.Live2DModel.from(actualModelUrl, {
          autoInteract: false,
        });

        if (model && model.internalModel && model.internalModel.settings) {
          model.internalModel.settings.urlResolver = urlResolver;
          if (typeof model.internalModel.settings.replaceFiles === "function") {
            model.internalModel.settings.replaceFiles(urlResolver);
          }
        }

        // Robust physics interceptor supporting both Cubism 4 (evaluate) and Cubism 2 (update)
        const hookCubismPhysics = (physics: any) => {
          if (!physics || physics._isHooked) return;
          physics._isHooked = true;

          // Cubism 4 Core SDK evaluator: evaluate(coreModel, dt)
          if (typeof physics.evaluate === "function") {
            const originalEvaluate = physics.evaluate.bind(physics);
            physics.evaluate = function (coreModelArg: any, dt: number) {
              const intensity = physicsIntensityRef.current ?? 1.0;
              if (intensity <= 0) {
                // Off: Completely disable physics simulation
                return;
              }
              if (Math.abs(intensity - 1.0) < 0.001) {
                return originalEvaluate(coreModelArg, dt);
              }

              // Snapshot raw parameter array to scale displacement deltas
              const targetCore = coreModelArg || physics.coreModel || live2dModelRef.current?.internalModel?.coreModel;
              let snapshot: Float32Array | null = null;
              try {
                const rawParams = targetCore?.getModel?.()?.parameters?.values;
                if (rawParams && rawParams.length) {
                  snapshot = new Float32Array(rawParams);
                }
              } catch (e) {}

              const res = originalEvaluate(coreModelArg, dt);

              try {
                const rawParams = targetCore?.getModel?.()?.parameters?.values;
                if (rawParams && snapshot && rawParams.length === snapshot.length) {
                  for (let i = 0; i < rawParams.length; i++) {
                    const before = snapshot[i];
                    const after = rawParams[i];
                    if (before !== after) {
                      rawParams[i] = before + (after - before) * intensity;
                    }
                  }
                }
              } catch (e) {}

              return res;
            };
          }

          // Cubism 2 Core SDK updater: update(coreModel, dt) or update(dt)
          if (typeof physics.update === "function") {
            const originalUpdate = physics.update.bind(physics);
            physics.update = function (...args: any[]) {
              const intensity = physicsIntensityRef.current ?? 1.0;
              if (intensity <= 0) {
                return;
              }
              return originalUpdate(...args);
            };
          }
        };

        if (model.internalModel?.physics) {
          hookCubismPhysics(model.internalModel.physics);
        }
        if (typeof (model as any).on === "function") {
          (model as any).on("physicsLoaded", (p: any) => {
            hookCubismPhysics(p || model.internalModel?.physics);
          });
        }
        if (model.internalModel && typeof (model.internalModel as any).on === "function") {
          (model.internalModel as any).on("physicsLoaded", (p: any) => {
            hookCubismPhysics(p || model.internalModel?.physics);
          });
        }

        if (!isSubscribed) {
          try {
            model.destroy();
          } catch (e) {}
          return;
        }

        app.stage.addChild(model);

        // Continuous 60 FPS Multi-Joint Kinematics & Inertia Jiggle Physics Driver
        const updateModelFrame = () => {
          if (!live2dModelRef.current) return;
          const currentModel = live2dModelRef.current;
          const core = currentModel.internalModel?.coreModel;
          if (!core) return;

          if (currentModel.internalModel?.physics && !currentModel.internalModel.physics._isHooked) {
            hookCubismPhysics(currentModel.internalModel.physics);
          }

          const dt = Math.min(0.05, Math.max(0.001, (app.ticker.deltaMS || 16.6) / 1000));

          // 1. Step damped spring tracking state
          trackingStateRef.current = stepTrackingState(
            trackingStateRef.current,
            mouseTargetRef.current.x,
            mouseTargetRef.current.y,
            dt,
            physicsIntensityRef.current
          );

          // 2. Active motion curve calculation
          let motionAngleX = 0;
          let motionAngleY = 0;
          let motionAngleZ = 0;
          let motionBodyAngleZ = 0;
          let motionMouthOpen = 0;
          let motionEyeLOpenOverride: number | null = null;
          let motionEyeBallXOverride: number | null = null;
          let motionEyeBallYOverride: number | null = null;

          if (activeMotionRef.current !== "none" && motionStartTimeRef.current) {
            const elapsed = (Date.now() - motionStartTimeRef.current) / 1000;
            const duration = 5.0;

            if (elapsed >= duration) {
              setActiveMotion("none");
              motionStartTimeRef.current = null;
              if (onMotionTrigger) {
                onMotionTrigger("none");
              }
            } else {
              const progress = elapsed / duration;
              const pRad = progress * Math.PI;

              switch (activeMotionRef.current) {
                case "nod":
                  motionAngleY = Math.sin(progress * Math.PI * 2) * 18;
                  break;
                case "shake":
                  motionAngleX = Math.sin(progress * Math.PI * 3) * 22;
                  break;
                case "wave":
                  motionAngleZ = Math.sin(progress * Math.PI * 2) * 16;
                  motionBodyAngleZ = Math.sin(progress * Math.PI * 2) * 8;
                  break;
                case "bow":
                  motionAngleY = -Math.sin(pRad) * 25;
                  break;
                case "laugh":
                  motionAngleY = Math.abs(Math.sin(progress * Math.PI * 6)) * 12;
                  motionMouthOpen = 0.4;
                  break;
                case "wink":
                  if (progress < 0.75) {
                    motionEyeLOpenOverride = 0;
                  }
                  break;
                case "check_nails":
                  motionAngleX = Math.sin(pRad) * 20;
                  motionAngleY = -Math.sin(pRad) * 16;
                  motionAngleZ = -Math.sin(pRad) * 12;
                  motionEyeBallXOverride = Math.sin(pRad) * 0.8;
                  motionEyeBallYOverride = -Math.sin(pRad) * 0.8;
                  break;
                case "jiggle_dance":
                  motionAngleZ = Math.sin(progress * Math.PI * 6) * 16;
                  motionBodyAngleZ = Math.sin(progress * Math.PI * 6) * 12;
                  motionAngleY = Math.abs(Math.sin(progress * Math.PI * 6)) * 8;
                  break;
                case "sigh_tilt":
                  motionAngleZ = Math.sin(pRad) * 18;
                  motionAngleY = Math.sin(pRad) * 14;
                  motionMouthOpen = Math.sin(pRad) * 0.25;
                  break;
                case "curious_glance":
                  motionAngleX = Math.sin(progress * Math.PI * 2) * 22;
                  motionAngleZ = Math.sin(progress * Math.PI) * 12;
                  motionEyeBallXOverride = Math.sin(progress * Math.PI * 2) * 0.85;
                  break;
                case "stretch_wave":
                  motionAngleY = Math.sin(pRad) * 18;
                  motionBodyAngleZ = Math.sin(pRad) * 10;
                  break;
              }
            }
          }

          // 3. Evaluate emotion parameters
          let mouthForm = 0;
          let cheekBlush = 0;
          let browLY = 0;
          let browRY = 0;
          let browAngle = 0;
          let eyeLOpen = 1.0;
          let eyeROpen = 1.0;

          switch (emotionRef.current) {
            case "happy":
              mouthForm = 1.0;
              cheekBlush = 0.35;
              browLY = 0.25;
              browRY = 0.25;
              browAngle = 0.0;
              eyeLOpen = 1.05;
              eyeROpen = 1.05;
              break;
            case "excited":
              mouthForm = 1.0;
              cheekBlush = 0.8;
              eyeLOpen = 1.35;
              eyeROpen = 1.35;
              browLY = 0.7;
              browRY = 0.7;
              browAngle = 0.1;
              break;
            case "flirty":
              mouthForm = 0.85;
              cheekBlush = 0.7;
              eyeLOpen = 0.05;
              eyeROpen = 1.05;
              browLY = 0.35;
              browRY = 0.15;
              browAngle = 0.2;
              break;
            case "smirk":
              mouthForm = 0.75;
              cheekBlush = 0.2;
              eyeLOpen = 0.9;
              eyeROpen = 0.8;
              browLY = 0.5;
              browRY = -0.2;
              browAngle = 0.3;
              break;
            case "surprised":
              mouthForm = 0.0;
              cheekBlush = 0.2;
              eyeLOpen = 1.4;
              eyeROpen = 1.4;
              browLY = 0.9;
              browRY = 0.9;
              browAngle = 0.0;
              break;
            case "thinking":
              mouthForm = 0.1;
              cheekBlush = 0.1;
              eyeLOpen = 0.85;
              eyeROpen = 0.85;
              browLY = 0.65;
              browRY = -0.35;
              browAngle = 0.2;
              break;
            case "confused":
              mouthForm = -0.2;
              cheekBlush = 0.1;
              eyeLOpen = 1.1;
              eyeROpen = 0.85;
              browLY = 0.6;
              browRY = -0.5;
              browAngle = -0.2;
              break;
            case "embarrassed":
              mouthForm = -0.3;
              cheekBlush = 1.0;
              eyeLOpen = 0.8;
              eyeROpen = 0.8;
              browLY = -0.3;
              browRY = -0.3;
              browAngle = -0.5;
              break;
            case "tipsy":
              mouthForm = 0.6;
              cheekBlush = 0.95;
              eyeLOpen = 0.65;
              eyeROpen = 0.7;
              browLY = -0.2;
              browRY = 0.1;
              browAngle = -0.3;
              break;
            case "tired":
              mouthForm = -0.4;
              cheekBlush = 0.0;
              eyeLOpen = 0.45;
              eyeROpen = 0.45;
              browLY = -0.4;
              browRY = -0.4;
              browAngle = -0.4;
              break;
            case "sad":
              mouthForm = -1.0;
              cheekBlush = 0.0;
              browLY = -0.7;
              browRY = -0.7;
              browAngle = -0.6;
              eyeLOpen = 0.85;
              eyeROpen = 0.85;
              break;
            case "crying":
              mouthForm = -0.95;
              cheekBlush = 0.6;
              eyeLOpen = 0.75;
              eyeROpen = 0.75;
              browLY = -0.7;
              browRY = -0.7;
              browAngle = -0.8;
              break;
            case "scared":
              mouthForm = -0.6;
              cheekBlush = 0.0;
              eyeLOpen = 1.45;
              eyeROpen = 1.45;
              browLY = 0.85;
              browRY = 0.85;
              browAngle = -0.6;
              break;
            case "angry":
              mouthForm = -0.85;
              cheekBlush = 0.0;
              browLY = -0.8;
              browRY = -0.8;
              browAngle = 0.7;
              eyeLOpen = 0.9;
              eyeROpen = 0.9;
              break;
            case "evil":
              mouthForm = 0.7;
              cheekBlush = 0.0;
              eyeLOpen = 0.75;
              eyeROpen = 0.75;
              browLY = -0.6;
              browRY = -0.6;
              browAngle = 0.85;
              break;
            default:
              mouthForm = 0.0;
              cheekBlush = 0.0;
              browLY = 0.0;
              browRY = 0.0;
              browAngle = 0.0;
              break;
          }

          if (motionEyeLOpenOverride !== null) {
            eyeLOpen = motionEyeLOpenOverride;
          }

          // 4. Inject multi-joint angle coupling and physics jiggle
          applyLive2DMultiJointKinematics(
            core,
            trackingStateRef.current,
            {
              targetX: mouseTargetRef.current.x,
              targetY: mouseTargetRef.current.y,
              deltaTime: dt,
              physicsIntensity: physicsIntensityRef.current,
              trackingEngineEnabled: trackingEngineEnabledRef.current,
              emotionMouthForm: mouthForm,
              emotionCheek: cheekBlush,
              emotionEyeLOpen: eyeLOpen,
              emotionEyeROpen: eyeROpen,
              emotionBrowLY: browLY,
              emotionBrowRY: browRY,
              emotionBrowAngle: browAngle,
              motionAngleX,
              motionAngleY,
              motionAngleZ,
              motionBodyAngleZ,
              motionMouthOpen,
              mouthOpenRatio: mouthOpenRatioRef.current,
              isSpeaking: isSpeakingRef.current,
            },
            performance.now()
          );
        };

        app.ticker.add(updateModelFrame);

        // Calculate responsive scale safely and center model
        const mWidth = (model.width && !isNaN(model.width) && model.width > 0) ? model.width : 400;
        const mHeight = (model.height && !isNaN(model.height) && model.height > 0) ? model.height : 600;
        let fitScale = Math.min((width * 0.85) / mWidth, (height * 0.9) / mHeight);
        if (isNaN(fitScale) || fitScale <= 0 || fitScale === Infinity) {
          fitScale = 0.25;
        }

        if (model.anchor && typeof model.anchor.set === "function") {
          model.anchor.set(0.5, 0.5);
        }

        const finalScale = (initialScale !== undefined && !isNaN(initialScale) && initialScale > 0) ? initialScale : fitScale;
        const containerW = displayAreaRef.current?.clientWidth || width;
        const finalX = containerW / 2;
        const finalY = (initialY !== undefined && !isNaN(initialY)) ? initialY : (height / 2 + 15);

        model.scale.set(finalScale);
        model.x = finalX;
        model.y = finalY;
        setZoomLevel(finalScale);

        // Add ResizeObserver for horizontal centering in container
        resizeObserver = new ResizeObserver((entries) => {
          if (model && app && entries[0].contentRect.width > 0) {
            const containerWidth = entries[0].contentRect.width;
            const containerHeight = entries[0].contentRect.height;
            app.renderer.resize(containerWidth, containerHeight);
            model.x = containerWidth / 2;
          }
        });
        if (displayAreaRef.current) {
          resizeObserver.observe(displayAreaRef.current);
        }

        live2dModelRef.current = model;
        pixiAppRef.current = app;

        if (isSubscribed) {
          setLive2dStatus("active");
        }
      } catch (err: any) {
        console.warn("Live2D WebGL model load fallback to procedural canvas:", err);
        addDebugLog("WebGL/Network Fallback: " + String(err?.message || err));
        if (isSubscribed) {
          setLive2dStatus("fallback");
          setLive2dError(null);
        }
      }
    };

    loadPixiModel();

    return () => {
      isSubscribed = false;
      if (resizeObserver) resizeObserver.disconnect();
      if (app && app.ticker) {
        try {
          app.ticker.stop();
        } catch (e) {}
      }
      if (model) {
        try {
          if (app && app.stage) {
            app.stage.removeChild(model);
          }
          model.destroy();
        } catch (e) {}
      }
      live2dModelRef.current = null;
    };
  }, [customModelUrl]);

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

      const dt = 0.016;
      trackingStateRef.current = stepTrackingState(
        trackingStateRef.current,
        mouseTargetRef.current.x,
        mouseTargetRef.current.y,
        dt,
        physicsIntensityRef.current
      );

      const effectiveX = isSpeakingRef.current ? 0 : trackingStateRef.current.smoothedX;
      const effectiveY = isSpeakingRef.current ? 0 : trackingStateRef.current.smoothedY;

      const angleX = effectiveX * 22;
      const angleY = effectiveY * 16;
      const angleZ = trackingStateRef.current.headAngleZ + trackingStateRef.current.jiggleSway;

      ctx.save();
      ctx.translate(centerX, centerY + breathOffset);
      ctx.rotate((angleZ * Math.PI) / 180);

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

      const hasBlush =
        emotion === "embarrassed" ||
        emotion === "tipsy" ||
        emotion === "flirty" ||
        emotion === "excited" ||
        emotion === "crying";
      if (hasBlush) {
        ctx.fillStyle =
          emotion === "tipsy" || emotion === "embarrassed"
            ? "rgba(244, 63, 94, 0.65)"
            : "rgba(244, 63, 94, 0.4)";
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
      if (emotion === "sad" || emotion === "crying" || emotion === "scared") {
        ctx.moveTo(-48, -42 + angleY * 0.2);
        ctx.lineTo(-22, -36 + angleY * 0.2);
        ctx.moveTo(22, -36 + angleY * 0.2);
        ctx.lineTo(48, -42 + angleY * 0.2);
      } else if (emotion === "angry" || emotion === "evil") {
        ctx.moveTo(-48, -36 + angleY * 0.2);
        ctx.lineTo(-22, -43 + angleY * 0.2);
        ctx.moveTo(22, -43 + angleY * 0.2);
        ctx.lineTo(48, -36 + angleY * 0.2);
      } else if (emotion === "thinking" || emotion === "confused" || emotion === "smirk") {
        ctx.moveTo(-48, -45 + angleY * 0.2);
        ctx.lineTo(-22, -42 + angleY * 0.2);
        ctx.moveTo(22, -38 + angleY * 0.2);
        ctx.lineTo(48, -42 + angleY * 0.2);
      } else if (emotion === "excited" || emotion === "happy" || emotion === "flirty") {
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

      const renderEye = (centerXPos: number, isLeft: boolean) => {
        ctx.save();
        ctx.translate(centerXPos + angleX * 0.3, -20 + angleY * 0.3);

        if (emotion === "happy" || emotion === "excited" || (emotion === "flirty" && isLeft)) {
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

      renderEye(-35, true);
      renderEye(35, false);

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
        if (
          emotion === "happy" ||
          emotion === "excited" ||
          emotion === "flirty" ||
          emotion === "tipsy"
        ) {
          ctx.arc(0, -4, 12, Math.PI * 0.25, Math.PI * 0.75);
        } else if (emotion === "smirk" || emotion === "evil") {
          ctx.arc(4, -3, 10, Math.PI * 0.2, Math.PI * 0.7);
        } else if (emotion === "sad" || emotion === "crying" || emotion === "angry") {
          ctx.arc(0, 8, 12, Math.PI * 1.25, Math.PI * 1.75);
        } else if (emotion === "scared" || emotion === "surprised") {
          ctx.ellipse(0, 0, 6, 8, 0, 0, Math.PI * 2);
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
  }, [mousePos, mouthOpenRatio, emotion, outfitColor, live2dStatus, isSpeaking]);

  return (
    <div
      ref={containerRef}
      onMouseUp={handleResizeSave}
      style={{
        transform: `translate(${pos.x}px, ${pos.y}px)`,
        position: "relative",
        zIndex: isDraggingWindow ? 30 : 10,
        width: size.width || undefined,
        height: size.height || undefined,
      }}
      className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden flex flex-col shadow-2xl resize overflow-auto min-w-[300px] min-h-[400px]"
    >
      {/* Top Header Bar */}
      <div
        onMouseDown={handleHeaderMouseDown}
        onTouchStart={handleHeaderTouchStart}
        className="bg-slate-950/95 border-b border-slate-800 px-4 py-3 flex items-center justify-between backdrop-blur z-10 cursor-move select-none"
        title="Drag to move window"
      >
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
                Loading Model...
              </span>
            ) : (
              <span>Procedural Canvas Avatar</span>
            )}
          </span>
        </div>
      </div>

      {/* Interactive Display Area */}
      <div
        ref={displayAreaRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMoveCanvas}
        onTouchEnd={handleTouchEndCanvas}
        onWheel={handleWheel}
        className="relative w-full h-[420px] bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center cursor-grab active:cursor-grabbing overflow-hidden group flex-1"
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
                placeholder="https://domain.com/models/custom.model3.json"
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
