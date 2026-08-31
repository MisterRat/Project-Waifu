import React, { useEffect, useRef, useState } from "react";
import { EmotionType, MotionType, EMOTION_TYPES } from "../types";
import { loadLive2DFromZip, resolveLive2DModelUrl, zipModelRegistry, normalizePath } from "../lib/live2dZipLoader";
import {
  createInitialTrackingState,
  stepTrackingState,
  applyLive2DMultiJointKinematics,
  TrackingState,
} from "../lib/live2dTrackingEngine";
import { logLive2DDiagnostic } from "../lib/live2dDiagnosticLogger";
import { lipSyncEngine } from "../lib/lipSyncEngine";
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

const EMOTION_ALIAS_KEYWORDS: Record<EmotionType, string[]> = {
  neutral: ["neutral", "default", "normal", "base", "idle", "f00", "exp00", "exp_00", "通常", "デフォルト", "標準", "素顔"],
  happy: ["happy", "smile", "joy", "laugh", "smile1", "smile2", "f01", "exp01", "exp_01", "笑顔", "喜", "笑", "ニコニコ"],
  excited: ["excited", "sparkle", "joy", "surprise", "f02", "exp02", "exp_02", "興奮", "わくわく", "キラキラ"],
  flirty: ["flirty", "wink", "heart", "dere", "blush", "f03", "exp03", "ウィンク", "色気", "照れ", "ハート"],
  smirk: ["smirk", "grin", "evil", "sneer", "f04", "exp04", "ニヤ", "ドヤ", "悪巧み"],
  surprised: ["surprised", "surprise", "shock", "gasp", "f05", "exp05", "驚き", "驚", "びっくり", "ショック"],
  embarrassed: ["embarrassed", "embarrased", "blush", "shy", "dere", "cheek", "red", "f06", "exp06", "照れ", "赤面", "恥ずかしい", "デレ"],
  tipsy: ["tipsy", "drunk", "blush", "flush", "f07", "exp07", "酔い", "赤面", "ほろ酔い"],
  tired: ["tired", "sleepy", "exhausted", "yawn", "sigh", "f08", "exp08", "眠い", "疲れ", "ため息", "ねむ"],
  sad: ["sad", "sorrow", "grief", "depressed", "f09", "exp09", "悲しみ", "悲", "憂鬱", "落ち込み"],
  crying: ["crying", "cry", "tear", "tears", "weep", "sob", "f10", "exp10", "泣き", "号泣", "涙", "なみだ"],
  scared: ["scared", "fear", "panic", "shiver", "f11", "exp11", "恐れ", "怖", "怯え", "青ざめ", "ガタガタ"],
  angry: ["angry", "rage", "mad", "fury", "f12", "exp12", "怒り", "怒", "激怒", "おこ"],
  evil: ["evil", "villain", "dark", "wicked", "f13", "exp13", "悪", "黒", "企み"],
  thinking: ["thinking", "think", "wonder", "hmm", "f14", "exp14", "考え", "困り", "思案"],
  confused: ["confused", "troubled", "puzzled", "question", "f15", "exp15", "困惑", "困り", "はてな", "疑問"],
};

const MOTION_ALIAS_KEYWORDS: Record<string, string[]> = {
  nod: ["nod", "agree", "yes", "頷き", "うなずき", "tapbody", "tap_body", "idle"],
  shake: ["shake", "no", "headshake", "首振り", "いやいや"],
  wave: ["wave", "greeting", "hello", "手を振る", "挨拶"],
  bow: ["bow", "reverence", "お辞儀", "礼"],
  laugh: ["laugh", "chuckle", "giggle", "笑い", "爆笑"],
  wink: ["wink", "ウィンク"],
  check_nails: ["check_nails", "idle", "touch", "tap"],
  jiggle_dance: ["dance", "jiggle", "special", "tap_body"],
  sigh_tilt: ["sigh", "tilt", "troubled", "ため息"],
  curious_glance: ["curious", "glance", "look", "キョロキョロ"],
  stretch_wave: ["stretch", "wave", "伸び"],
};

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

const isMobileDevice = () => {
  if (typeof window === "undefined") return false;
  return (
    "ontouchstart" in window ||
    navigator.maxTouchPoints > 0 ||
    window.matchMedia("(pointer: coarse)").matches ||
    window.innerWidth < 768
  );
};

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

  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.innerWidth < 1024;
  });

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 1024);
    };
    window.addEventListener("resize", handleResize);
    window.addEventListener("orientationchange", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("orientationchange", handleResize);
    };
  }, []);

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
    if (isMobile) return;
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

  const [outfitColor, setOutfitColor] = useState<"pink" | "blue" | "purple" | "emerald">("pink");
  const [showCustomModelModal, setShowCustomModelModal] = useState(false);
  const [customModelUrl, setCustomModelUrl] = useState(modelUrl || "");
  const [isExtractingZip, setIsExtractingZip] = useState(false);
  const [zipSuccessMsg, setZipSuccessMsg] = useState<string | null>(null);
  const [zipErrorMsg, setZipErrorMsg] = useState<string | null>(null);
  const [live2dStatus, setLive2dStatus] = useState<"idle" | "loading" | "active" | "error" | "fallback">("idle");
  const [live2dError, setLive2dError] = useState<string | null>(null);
  const addDebugLog = (msg: string) => { if (onDebugLog) onDebugLog(msg); };

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
  const activeNativeExpressionRef = useRef<string | null>(null);

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
        const exprMgr = model.internalModel?.motionManager?.expressionManager;
        const core = model.internalModel?.coreModel;

        if (emotion === "neutral") {
          activeNativeExpressionRef.current = null;

          // 1. Fully stop and clear active expression in expression manager
          if (exprMgr) {
            try {
              exprMgr.currentExpression = null;
              exprMgr.reserveExpressionIndex = -1;
              if (typeof exprMgr.resetExpression === "function") {
                exprMgr.resetExpression();
              }
              if (typeof exprMgr.stopAllExpressions === "function") {
                exprMgr.stopAllExpressions();
              }
              if (typeof exprMgr.clear === "function") {
                exprMgr.clear();
              }
            } catch (e) {}
          }

          // 2. Clear expression on model
          try {
            if (typeof (model as any).expression === "function") {
              (model as any).expression(null);
            }
          } catch (e) {}

          // 3. Immediately zero out / reset facial expression parameters to neutral baseline
          if (core) {
            const resetParam = (idC4: string, idC2: string, val: number) => {
              try {
                if (typeof core.setParameterValueById === "function") {
                  core.setParameterValueById(idC4, val);
                }
                if (typeof core.setParamFloat === "function") {
                  core.setParamFloat(idC2, val);
                  core.setParamFloat(idC4, val);
                }
                if (core._model && typeof core._model.setParameterValueByIndex === "function") {
                  const pIds = core._parameterIds;
                  if (Array.isArray(pIds)) {
                    const idx = pIds.indexOf(idC4) !== -1 ? pIds.indexOf(idC4) : pIds.indexOf(idC2);
                    if (idx !== -1) core._model.setParameterValueByIndex(idx, val);
                  }
                }
              } catch (e) {}
            };

            resetParam("ParamMouthForm", "PARAM_MOUTH_FORM", 0);
            resetParam("ParamCheek", "PARAM_CHEEK", 0);
            resetParam("ParamCheekBlush", "PARAM_CHEEK_BLUSH", 0);
            resetParam("ParamBlush", "PARAM_BLUSH", 0);
            resetParam("ParamEyeLOpen", "PARAM_EYE_L_OPEN", 1.0);
            resetParam("ParamEyeROpen", "PARAM_EYE_R_OPEN", 1.0);
            resetParam("ParamBrowLY", "PARAM_BROW_L_Y", 0);
            resetParam("ParamBrowRY", "PARAM_BROW_R_Y", 0);
            resetParam("ParamBrowLAngle", "PARAM_BROW_L_ANGLE", 0);
            resetParam("ParamBrowRAngle", "PARAM_BROW_R_ANGLE", 0);
            resetParam("ParamBrowLForm", "PARAM_BROW_L_FORM", 0);
            resetParam("ParamBrowRForm", "PARAM_BROW_R_FORM", 0);
            resetParam("ParamEyeLSmile", "PARAM_EYE_L_SMILE", 0);
            resetParam("ParamEyeRSmile", "PARAM_EYE_R_SMILE", 0);
            resetParam("ParamEyeBallForm", "PARAM_EYE_BALL_FORM", 0);
            resetParam("ParamTear", "PARAM_TEAR", 0);
            resetParam("ParamQuestionMark", "PARAM_QUESTION_MARK", 0);
            resetParam("ParamQuestion", "PARAM_QUESTION", 0);
            resetParam("ParamHatena", "PARAM_HATENA", 0);
            resetParam("ParamSweat", "PARAM_SWEAT", 0);
            resetParam("ParamAse", "PARAM_ASE", 0);
            resetParam("ParamAnger", "PARAM_ANGER", 0);
            resetParam("ParamAngry", "PARAM_ANGRY", 0);
            resetParam("ParamIkari", "PARAM_IKARI", 0);
            resetParam("ParamVein", "PARAM_VEIN", 0);
            resetParam("ParamHeartEyes", "PARAM_HEART_EYES", 0);
            resetParam("ParamHeartEye", "PARAM_HEART_EYE", 0);
            resetParam("ParamStarEyes", "PARAM_STAR_EYES", 0);
            resetParam("ParamStarEye", "PARAM_STAR_EYE", 0);
            resetParam("ParamExclamation", "PARAM_EXCLAMATION", 0);
            resetParam("ParamBikkuri", "PARAM_BIKKURI", 0);
            resetParam("ParamDarkFace", "PARAM_DARK_FACE", 0);
            resetParam("ParamShadow", "PARAM_SHADOW", 0);

            const resetPart = (idC4: string, idC2: string, val: number) => {
              try {
                if (typeof core.setPartOpacityById === "function") {
                  core.setPartOpacityById(idC4, val);
                  core.setPartOpacityById(idC2, val);
                }
                if (typeof core.setPartsOpacity === "function") {
                  core.setPartsOpacity(idC2, val);
                  core.setPartsOpacity(idC4, val);
                }
              } catch (e) {}
            };

            resetPart("PartTear", "PART_TEAR", 0);
            resetPart("PartQuestionMark", "PART_QUESTION_MARK", 0);
            resetPart("PartQuestion", "PART_QUESTION", 0);
            resetPart("PartHatena", "PART_HATENA", 0);
            resetPart("PartSweat", "PART_SWEAT", 0);
            resetPart("PartAse", "PART_ASE", 0);
            resetPart("PartAnger", "PART_ANGER", 0);
            resetPart("PartIkari", "PART_IKARI", 0);
            resetPart("PartHeartEyes", "PART_HEART_EYES", 0);
            resetPart("PartStarEyes", "PART_STAR_EYES", 0);
            resetPart("PartExclamation", "PART_EXCLAMATION", 0);
            resetPart("PartDarkFace", "PART_DARK_FACE", 0);
          }

          logLive2DDiagnostic(
            "expression",
            `[Live2D Engine] Expression reset to NEUTRAL / DEFAULT. Cleared active expression curves.`
          );
        } else if (typeof (model as any).expression === "function") {
          const definitions = exprMgr?.definitions || exprMgr?.expressions || [];
          let matchedExpression: string | number | undefined = undefined;
          let matchedDefName: string = "";
          let matchedFile: string = "";
          let bestIdx = -1;
          let bestDef: any = null;

          if (Array.isArray(definitions) && definitions.length > 0) {
            const keywords = EMOTION_ALIAS_KEYWORDS[emotion] || [emotion.toLowerCase()];

            for (let i = 0; i < definitions.length; i++) {
              const def = definitions[i];
              const nameStr = String(def.name || def.Name || "").toLowerCase();
              const fileStr = String(def.file || def.File || "").toLowerCase();
              const filenameOnly = fileStr.split("/").pop()?.replace(/\.(exp3|exp)\.json$/i, "").toLowerCase() || "";

              const matchFound = keywords.some(
                (kw) =>
                  nameStr === kw.toLowerCase() ||
                  filenameOnly === kw.toLowerCase() ||
                  nameStr.includes(kw.toLowerCase()) ||
                  fileStr.includes(kw.toLowerCase())
              );

              if (matchFound) {
                bestIdx = i;
                bestDef = def;
                break;
              }
            }

            if (bestDef && bestIdx >= 0) {
              matchedExpression = bestIdx;
              matchedDefName = bestDef.name || bestDef.Name || `index_${bestIdx}`;
              matchedFile = bestDef.file || bestDef.File || `${matchedDefName}.exp3.json`;
            }
          }

          if (matchedExpression !== undefined) {
            activeNativeExpressionRef.current = String(matchedDefName || matchedExpression);
            const res = (model as any).expression(matchedExpression);
            logLive2DDiagnostic(
              "model-file",
              `[Model File] Executing native expression file for "${emotion}": "${matchedFile}" (Index: ${bestIdx}, Name: "${matchedDefName}")`,
              { emotion, matchedExpression, matchedFile, result: res }
            );
          } else {
            activeNativeExpressionRef.current = null;
            // Clear any active expression on the model so it returns to procedural base
            if (exprMgr) {
              try {
                exprMgr.currentExpression = null;
                exprMgr.reserveExpressionIndex = -1;
              } catch (e) {}
            }
            try {
              if (typeof (model as any).expression === "function") {
                (model as any).expression(null);
              }
            } catch (e) {}

            // Model has no matching .exp3.json definition -> fallback to procedural curve blending
            logLive2DDiagnostic(
              "procedural",
              `[Procedural Engine] No model file matched for "${emotion}". Applying procedural facial curve synthesis.`,
              {
                emotion,
                availableDefinitions: Array.isArray(definitions)
                  ? definitions.map((d: any) => d.file || d.name || d.Name)
                  : [],
              }
            );
          }
        }
      } catch (e: any) {
        logLive2DDiagnostic("expression", `Failed to trigger expression on Live2D model: ${e?.message}`, e);
      }
    } else {
      logLive2DDiagnostic(
        "procedural",
        `[Procedural Engine] Rendering procedural canvas emotion "${emotion}" (No Live2D model mounted)`
      );
    }
  }, [emotion, live2dStatus]);

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
      // Never use Look-At tracking on mobile / touch devices
      if (isMobileDevice() || !containerRef.current || !trackingEngineEnabledRef.current) {
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
    if (isMobile) return;
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
    if (isMobile) return;
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
          const motionMgr = model.internalModel?.motionManager;
          const availableGroups = motionMgr?.definitions ? Object.keys(motionMgr.definitions) : [];
          
          let targetGroup: string | null = null;
          if (availableGroups.length > 0) {
            const keywords = MOTION_ALIAS_KEYWORDS[motion] || [motion.toLowerCase()];
            const foundGroup = availableGroups.find((g) =>
              keywords.some((kw) => g.toLowerCase().includes(kw.toLowerCase()) || kw.toLowerCase().includes(g.toLowerCase()))
            );
            if (foundGroup) {
              targetGroup = foundGroup;
            }
          }

          if (targetGroup) {
            if (typeof model.motion === "function") {
              const res = model.motion(targetGroup);
              logLive2DDiagnostic(
                "model-file",
                `[Model File] Executing native motion group "${targetGroup}" for motion "${motion}"`,
                { motion, targetGroup, result: res }
              );
            } else if (motionMgr) {
              const res = motionMgr.startMotion(targetGroup, 0, 2);
              logLive2DDiagnostic(
                "model-file",
                `[Model File] Executing native motion group "${targetGroup}" for motion "${motion}"`,
                { motion, targetGroup, result: res }
              );
            }
          } else {
            logLive2DDiagnostic(
              "procedural",
              `[Procedural Engine] No model motion group matched for "${motion}". Executing synthetic kinematic gesture animation.`,
              { motion, availableGroups }
            );
          }
        } catch (e: any) {
          logLive2DDiagnostic("cubism", `Failed to trigger motion on Live2D model: ${e?.message}`, e);
        }
      } else {
        logLive2DDiagnostic(
          "procedural",
          `[Procedural Engine] Executing procedural canvas gesture animation for "${motion}"`
        );
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

  // High-Precision Lip-Sync Volume Bridge
  useEffect(() => {
    if (audioVolume > 0) {
      mouthOpenRatioRef.current = Math.min(1.0, audioVolume * 1.5);
    } else if (!isSpeaking) {
      mouthOpenRatioRef.current = 0;
    }
  }, [audioVolume, isSpeaking]);

  // Silent Extended Idle Animation Driver (disabled to prevent unrequested autonomous gestures)
  useEffect(() => {
    // Autonomous gesture dispatch is disabled so motions only fire when triggered by chat tags or manual test controls
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
    if (!isMobileDevice()) {
      const rect = containerRef.current.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const y = ((e.clientY - rect.top) / rect.height) * 2 - 1;
      setMousePos({ x: Math.max(-1, Math.min(1, x)), y: Math.max(-1, Math.min(1, y)) });
    }

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

  // Mobile Friendly Touch Interface:
  // - 1 finger: No intercept. User scrolls the page up/down naturally without being trapped.
  // - 2 fingers: Move (pan) and pinch-zoom the model simultaneously.
  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2) {
      isPanningRef.current = true;
      isZoomingRef.current = true;
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const midX = (t1.clientX + t2.clientX) / 2;
      const midY = (t1.clientY + t2.clientY) / 2;
      const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      touchStartRef.current = {
        x: midX,
        y: midY,
        distance: dist,
        modelX: live2dModelRef.current?.x || 0,
        modelY: live2dModelRef.current?.y || 0,
        scale: live2dModelRef.current?.scale.x || 1,
      };
    } else {
      // Single finger or >2 fingers: do not intercept panning/zooming
      isPanningRef.current = false;
      isZoomingRef.current = false;
    }
  };

  const handleTouchMoveCanvas = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2 && isZoomingRef.current && live2dModelRef.current) {
      if (e.cancelable) {
        e.preventDefault();
      }
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const midY = (t1.clientY + t2.clientY) / 2;
      const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);

      // Pinch zoom
      let newScale = live2dModelRef.current.scale.x;
      if (touchStartRef.current.distance > 0 && dist > 0) {
        const factor = dist / touchStartRef.current.distance;
        newScale = Math.max(0.05, Math.min(10.0, touchStartRef.current.scale * factor));
        live2dModelRef.current.scale.set(newScale);
        setZoomLevel(newScale);
      }

      // 2-finger Pan Y
      const dy = midY - touchStartRef.current.y;
      const containerW = displayAreaRef.current?.clientWidth || containerRef.current?.clientWidth || 480;
      live2dModelRef.current.x = containerW / 2;
      live2dModelRef.current.y = touchStartRef.current.modelY + dy;

      onTransformChange?.(newScale, live2dModelRef.current.x, live2dModelRef.current.y);
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
            resolution: Math.min(window.devicePixelRatio || 1, 1.75),
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

          // Hook resolveURL so all expression files (.exp3.json), motion files (.motion3.json), and textures route cleanly
          const origResolveURL = model.internalModel.settings.resolveURL?.bind(model.internalModel.settings);
          model.internalModel.settings.resolveURL = function (targetPath: string) {
            if (urlResolver) {
              const res = urlResolver(targetPath);
              if (res && res !== targetPath) {
                return res;
              }
            }
            if (origResolveURL) {
              try {
                const orig = origResolveURL(targetPath);
                if (urlResolver) {
                  const resOrig = urlResolver(orig);
                  if (resOrig) return resOrig;
                }
                return orig;
              } catch (e) {}
            }
            return targetPath;
          };
        }

        // Discover & synchronize expressions from registry into expressionManager
        const reg = zipModelRegistry.get(actualModelUrl) || (customModelUrl ? zipModelRegistry.get(customModelUrl) : undefined);
        if (reg && reg.pathMap && model.internalModel?.motionManager) {
          const motionMgr = model.internalModel.motionManager;
          const exprFiles = Object.keys(reg.pathMap).filter((k) => {
            const l = k.toLowerCase();
            return (l.endsWith(".exp3.json") || l.endsWith(".exp.json")) && !k.startsWith("blob:");
          });

          if (exprFiles.length > 0) {
            if (!motionMgr.expressionManager) {
              try {
                if (typeof (model.internalModel as any).createExpressionManager === "function") {
                  motionMgr.expressionManager = (model.internalModel as any).createExpressionManager();
                }
              } catch (e) {}
            }

            if (motionMgr.expressionManager) {
              const exprMgr = motionMgr.expressionManager;
              const curDefs: any[] = Array.isArray(exprMgr.definitions) ? exprMgr.definitions : [];

              for (const exprFile of exprFiles) {
                const norm = normalizePath(exprFile);
                const filename = norm.split("/").pop() || norm;
                const exprName = filename.replace(/\.(exp3|exp)\.json$/i, "");
                const exists = curDefs.some((d: any) => {
                  const dName = String(d.Name || d.name || "").toLowerCase();
                  const dFile = String(d.File || d.file || "").toLowerCase();
                  return (
                    dName === exprName.toLowerCase() ||
                    dFile === norm.toLowerCase() ||
                    dFile.endsWith(filename.toLowerCase())
                  );
                });

                if (!exists) {
                  curDefs.push({
                    Name: exprName,
                    name: exprName,
                    File: norm,
                    file: norm,
                  });
                }
              }
              exprMgr.definitions = curDefs;
            }
          }
        }

        // Instrument ExpressionManager with detailed fetch & error logging
        if (model.internalModel?.motionManager?.expressionManager) {
          const exprMgr = model.internalModel.motionManager.expressionManager;
          if (!exprMgr._isDiagnosticsHooked) {
            exprMgr._isDiagnosticsHooked = true;
            const originalLoadExpression = exprMgr.loadExpression?.bind(exprMgr);
            if (originalLoadExpression) {
              exprMgr.loadExpression = async function (index: number) {
                const def = this.definitions?.[index] || this.expressions?.[index];
                const targetFile = def?.file || def?.File || def?.name || def?.Name || index;
                logLive2DDiagnostic("expression", `[Cubism Core] Loading expression file [${index}]: "${targetFile}"`, { def });
                try {
                  const res = await originalLoadExpression(index);
                  logLive2DDiagnostic("expression", `[Cubism Core] Successfully loaded expression [${index}]: "${targetFile}"`);
                  return res;
                } catch (err: any) {
                  logLive2DDiagnostic("expression", `[Cubism Core] Error loading expression file [${index}] ("${targetFile}"): ${err?.message}`, err);
                  throw err;
                }
              };
            }
          }
        }

        // Instrument MotionManager with detailed execution logging
        if (model.internalModel?.motionManager) {
          const motionMgr = model.internalModel.motionManager;
          if (!motionMgr._isDiagnosticsHooked) {
            motionMgr._isDiagnosticsHooked = true;
            const originalStartMotion = motionMgr.startMotion?.bind(motionMgr);
            if (originalStartMotion) {
              motionMgr.startMotion = async function (group: string, index: number, priority: number) {
                logLive2DDiagnostic("cubism", `[Cubism Core] Starting motion group "${group}" [index: ${index}, priority: ${priority}]`);
                try {
                  const res = await originalStartMotion(group, index, priority);
                  logLive2DDiagnostic("cubism", `[Cubism Core] Motion group "${group}" dispatched successfully`, { result: res });
                  return res;
                } catch (err: any) {
                  logLive2DDiagnostic("cubism", `[Cubism Core] Motion group "${group}" error: ${err?.message}`, err);
                  throw err;
                }
              };
            }
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

        // Introspect and log model capabilities (all parameter IDs, expression definitions, motion definitions)
        try {
          const core = model.internalModel?.coreModel;
          const paramIds = core?._parameterIds || (core?.getParameterIds ? core.getParameterIds() : []);
          const exprMgr = model.internalModel?.motionManager?.expressionManager;
          const exprList = exprMgr?.definitions || exprMgr?.expressions || [];
          const motionMgr = model.internalModel?.motionManager;
          const motionGroups = motionMgr?.definitions ? Object.keys(motionMgr.definitions) : [];

          const expressionsList = Array.isArray(exprList) ? exprList.map((e: any) => e.file || e.File || e.name || e.Name) : [];

          logLive2DDiagnostic("cubism", `Live2D Model Loaded Successfully: "${characterName}"`, {
            parameterCount: Array.isArray(paramIds) ? paramIds.length : 0,
            parameterNamesSample: Array.isArray(paramIds) ? paramIds.slice(0, 35) : [],
            expressionsCount: expressionsList.length,
            expressionsAvailable: expressionsList,
            motionGroupsAvailable: motionGroups,
          });

          if (expressionsList.length > 0) {
            logLive2DDiagnostic(
              "model-file",
              `[Model File Discovery] Detected ${expressionsList.length} native .exp3.json expression file(s) in model: ${expressionsList.join(", ")}`
            );
          } else {
            logLive2DDiagnostic(
              "procedural",
              `[Procedural Engine] No native .exp3.json files discovered in model manifest. Synthetic procedural curves active.`
            );
          }
        } catch (e: any) {
          logLive2DDiagnostic("cubism", `Model introspection error: ${e?.message}`);
        }

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
          let cheekPuff = 0;
          let browLY = 0;
          let browRY = 0;
          let browLX = 0;
          let browRX = 0;
          let browLAngle = 0;
          let browRAngle = 0;
          let browLForm = 0;
          let browRForm = 0;
          let eyeLOpen = 1.0;
          let eyeROpen = 1.0;
          let eyeLSmile = 0;
          let eyeRSmile = 0;
          let eyeBallForm = 0;
          let eyeBallX = 0;
          let eyeBallY = 0;
          let emotionTear = 0;
          let emotionQuestionMark = 0;
          let emotionExclamation = 0;
          let emotionSweat = 0;
          let emotionAnger = 0;
          let emotionHeartEyes = 0;
          let emotionStarEyes = 0;
          let emotionDarkFace = 0;
          let emotionParam2 = 0; // Model-specific Sad mark
          let emotionParam3 = 0; // Model-specific Angry mark
          let emotionParam4 = 0; // Model-specific Happy mark
          let emotionEarRotation = 0;
          let emotionEarInOut = 0;
          let emotionEar1 = 0;
          let emotionEar2 = 0;
          let emotionEar3 = 0;
          let emotionTailWag = 1.0;
          let emotionMouthShrug = 0;
          let emotionMouthFunnel = 0;
          let emotionMouthPucker = 0;
          let emotionMouthX = 0;

          switch (emotionRef.current) {
            case "happy":
              mouthForm = 1.0;
              cheekBlush = 0.5;
              browLY = 0.4;
              browRY = 0.4;
              browLAngle = 0.15;
              browRAngle = 0.15;
              browLForm = 0.4;
              browRForm = 0.4;
              eyeLOpen = 0.0; // Eyes smiling closed, works with non-blend-shape
              eyeROpen = 0.0;
              eyeLSmile = 1.0;
              eyeRSmile = 1.0;
              eyeBallForm = 0.4;
              emotionParam4 = 1.0; // Tamamo Happy mark
              emotionEarRotation = -0.3;
              emotionEar1 = 0.4;
              emotionTailWag = 2.0;
              break;
            case "excited":
              mouthForm = 1.0;
              cheekBlush = 0.85;
              eyeLOpen = 1.3;
              eyeROpen = 1.3;
              eyeLSmile = 0.85;
              eyeRSmile = 0.85;
              eyeBallForm = 0.5;
              browLY = 0.7;
              browRY = 0.7;
              browLAngle = 0.2;
              browRAngle = 0.2;
              browLForm = 0.5;
              browRForm = 0.5;
              emotionStarEyes = 0.9;
              emotionParam4 = 1.0;
              emotionEarRotation = -0.5;
              emotionEar1 = 0.6;
              emotionTailWag = 2.5;
              break;
            case "flirty":
              mouthForm = 0.85;
              cheekBlush = 0.75;
              eyeLOpen = 0.0; // Winking eye
              eyeROpen = 1.0;
              eyeLSmile = 1.0;
              eyeRSmile = 0.85;
              eyeBallForm = 0.4;
              browLY = 0.35;
              browRY = 0.15;
              browLAngle = 0.25;
              browRAngle = 0.1;
              browLForm = 0.3;
              browRForm = 0.3;
              emotionHeartEyes = 1.0;
              emotionParam4 = 0.7;
              emotionEarRotation = 0.2;
              emotionTailWag = 1.5;
              break;
            case "smirk":
              mouthForm = 0.8;
              emotionMouthX = 0.3;
              cheekBlush = 0.2;
              eyeLOpen = 0.8;
              eyeROpen = 0.65;
              eyeLSmile = 0.6;
              eyeRSmile = 0.3;
              eyeBallForm = -0.2;
              browLY = 0.5;
              browRY = -0.3;
              browLAngle = 0.35;
              browRAngle = -0.2;
              browLForm = 0.2;
              browRForm = -0.2;
              emotionEarRotation = 0.3;
              emotionEarInOut = -0.2;
              emotionTailWag = 1.2;
              break;
            case "surprised":
              mouthForm = 0.0;
              emotionMouthFunnel = 0.6;
              cheekBlush = 0.1;
              eyeLOpen = 1.45;
              eyeROpen = 1.45;
              eyeLSmile = 0.0;
              eyeRSmile = 0.0;
              eyeBallForm = -0.4;
              browLY = 0.9;
              browRY = 0.9;
              browLAngle = 0.0;
              browRAngle = 0.0;
              emotionExclamation = 1.0;
              emotionEarRotation = -0.6;
              emotionEar1 = 0.7;
              emotionTailWag = 0.5;
              break;
            case "thinking":
              mouthForm = 0.1;
              emotionMouthPucker = 0.3;
              cheekBlush = 0.1;
              eyeLOpen = 0.85;
              eyeROpen = 0.85;
              eyeLSmile = 0.0;
              eyeRSmile = 0.0;
              eyeBallForm = 0.0;
              eyeBallX = 0.4;
              eyeBallY = 0.45;
              browLY = 0.65;
              browRY = -0.35;
              browLAngle = 0.3;
              browRAngle = -0.2;
              browLForm = 0.1;
              browRForm = -0.2;
              emotionQuestionMark = 0.7;
              emotionEarRotation = 0.4;
              emotionEarInOut = -0.3;
              emotionTailWag = 0.8;
              break;
            case "confused":
              mouthForm = -0.25;
              emotionMouthShrug = 0.6;
              cheekBlush = 0.15;
              eyeLOpen = 1.15;
              eyeROpen = 0.75;
              eyeLSmile = 0.0;
              eyeRSmile = 0.0;
              eyeBallForm = -0.2;
              browLY = 0.6;
              browRY = -0.5;
              browLAngle = -0.3;
              browRAngle = 0.4;
              browLForm = -0.2;
              browRForm = 0.2;
              emotionQuestionMark = 1.0; // Confused Question Mark Emote!
              emotionSweat = 0.35;
              emotionEarRotation = 0.45;
              emotionEarInOut = -0.4;
              emotionTailWag = 0.7;
              break;
            case "embarrassed":
              mouthForm = -0.3;
              cheekBlush = 1.0;
              cheekPuff = 0.5;
              eyeLOpen = 0.65;
              eyeROpen = 0.65;
              eyeLSmile = 0.6;
              eyeRSmile = 0.6;
              eyeBallForm = 0.2;
              eyeBallY = -0.35;
              browLY = -0.4;
              browRY = -0.4;
              browLAngle = -0.5;
              browRAngle = -0.5;
              browLForm = -0.4;
              browRForm = -0.4;
              emotionSweat = 0.6;
              emotionParam4 = 0.5;
              emotionEarRotation = 0.5;
              emotionEarInOut = 0.3;
              emotionTailWag = 1.6;
              break;
            case "tipsy":
              mouthForm = 0.6;
              cheekBlush = 0.95;
              cheekPuff = 0.3;
              eyeLOpen = 0.6;
              eyeROpen = 0.65;
              eyeLSmile = 0.7;
              eyeRSmile = 0.7;
              eyeBallForm = 0.3;
              browLY = -0.2;
              browRY = 0.1;
              browLAngle = -0.3;
              browRAngle = -0.3;
              browLForm = -0.3;
              browRForm = -0.3;
              emotionParam4 = 0.6;
              emotionEarRotation = 0.3;
              emotionTailWag = 1.4;
              break;
            case "tired":
              mouthForm = -0.4;
              cheekBlush = 0.0;
              eyeLOpen = 0.35;
              eyeROpen = 0.35;
              eyeLSmile = 0.0;
              eyeRSmile = 0.0;
              eyeBallForm = -0.3;
              browLY = -0.45;
              browRY = -0.45;
              browLAngle = -0.4;
              browRAngle = -0.4;
              browLForm = -0.3;
              browRForm = -0.3;
              emotionSweat = 0.2;
              emotionEarRotation = 0.5;
              emotionEarInOut = 0.4;
              emotionTailWag = 0.3;
              break;
            case "sad":
              mouthForm = -1.0;
              cheekBlush = 0.0;
              eyeLOpen = 0.75;
              eyeROpen = 0.75;
              eyeLSmile = 0.0;
              eyeRSmile = 0.0;
              eyeBallForm = -0.4;
              browLY = -0.7;
              browRY = -0.7;
              browLAngle = -0.6;
              browRAngle = -0.6;
              browLForm = -0.6;
              browRForm = -0.6;
              emotionTear = 1.0;
              emotionParam2 = 1.0; // Tamamo Sad Tear mark
              emotionEarRotation = 0.55;
              emotionEarInOut = 0.35;
              emotionTailWag = 0.4;
              break;
            case "crying":
              mouthForm = -0.95;
              cheekBlush = 0.6;
              eyeLOpen = 0.35;
              eyeROpen = 0.35;
              eyeLSmile = 0.0;
              eyeRSmile = 0.0;
              eyeBallForm = -0.6;
              browLY = -0.85;
              browRY = -0.85;
              browLAngle = -0.8;
              browRAngle = -0.8;
              browLForm = -0.7;
              browRForm = -0.7;
              emotionTear = 1.0;
              emotionParam2 = 1.0; // Tamamo Sad Tear mark
              emotionEarRotation = 0.6;
              emotionEarInOut = 0.4;
              emotionTailWag = 0.3;
              break;
            case "scared":
              mouthForm = -0.6;
              cheekBlush = 0.0;
              eyeLOpen = 1.45;
              eyeROpen = 1.45;
              eyeLSmile = 0.0;
              eyeRSmile = 0.0;
              eyeBallForm = -0.7;
              browLY = 0.85;
              browRY = 0.85;
              browLAngle = -0.65;
              browRAngle = -0.65;
              browLForm = -0.5;
              browRForm = -0.5;
              emotionSweat = 0.85;
              emotionTear = 0.3;
              emotionEarRotation = 0.6;
              emotionEarInOut = 0.5;
              emotionTailWag = 0.2;
              break;
            case "angry":
              mouthForm = -0.85;
              cheekBlush = 0.0;
              eyeLOpen = 0.85;
              eyeROpen = 0.85;
              eyeLSmile = 0.0;
              eyeRSmile = 0.0;
              eyeBallForm = -0.5;
              browLY = -0.85;
              browRY = -0.85;
              browLAngle = 0.8;
              browRAngle = 0.8;
              browLForm = -0.6;
              browRForm = -0.6;
              emotionAnger = 1.0;
              emotionParam3 = 1.0; // Tamamo Angry mark
              emotionEarRotation = 0.65;
              emotionEarInOut = -0.4;
              emotionTailWag = 1.8;
              break;
            case "evil":
              mouthForm = 0.75;
              cheekBlush = 0.0;
              eyeLOpen = 0.7;
              eyeROpen = 0.7;
              eyeLSmile = 0.3;
              eyeRSmile = 0.3;
              eyeBallForm = -0.4;
              browLY = -0.7;
              browRY = -0.7;
              browLAngle = 0.85;
              browRAngle = 0.85;
              browLForm = -0.5;
              browRForm = -0.5;
              emotionAnger = 0.4;
              emotionDarkFace = 0.8;
              emotionParam3 = 0.7;
              emotionEarRotation = 0.5;
              emotionTailWag = 1.3;
              break;
            default:
              mouthForm = 0.0;
              cheekBlush = 0.0;
              eyeLOpen = 1.0;
              eyeROpen = 1.0;
              eyeLSmile = 0.0;
              eyeRSmile = 0.0;
              eyeBallForm = 0.0;
              browLY = 0.0;
              browRY = 0.0;
              browLAngle = 0.0;
              browRAngle = 0.0;
              browLForm = 0.0;
              browRForm = 0.0;
              emotionTear = 0.0;
              emotionTailWag = 1.0;
              break;
          }

          if (motionEyeLOpenOverride !== null) {
            eyeLOpen = motionEyeLOpenOverride;
          }

          // 4. Inject multi-joint angle coupling and physics jiggle
          const hasNativeExprs = Boolean(activeNativeExpressionRef.current);
          const lipSync = lipSyncEngine.update(dt);
          const activeSpeaking = isSpeakingRef.current || lipSync.isSpeaking;
          const currentMouthOpen = activeSpeaking
            ? Math.max(lipSync.mouthOpenY, mouthOpenRatioRef.current)
            : 0;

          applyLive2DMultiJointKinematics(
            core,
            trackingStateRef.current,
            {
              targetX: mouseTargetRef.current.x,
              targetY: mouseTargetRef.current.y,
              deltaTime: dt,
              physicsIntensity: physicsIntensityRef.current,
              trackingEngineEnabled: trackingEngineEnabledRef.current,
              hasNativeExpressions: hasNativeExprs,
              emotionMouthForm: mouthForm,
              emotionCheek: cheekBlush,
              emotionCheekPuff: cheekPuff,
              emotionEyeLOpen: eyeLOpen,
              emotionEyeROpen: eyeROpen,
              emotionEyeLSmile: eyeLSmile,
              emotionEyeRSmile: eyeRSmile,
              emotionEyeBallForm: eyeBallForm,
              emotionEyeBallX: eyeBallX,
              emotionEyeBallY: eyeBallY,
              emotionBrowLY: browLY,
              emotionBrowRY: browRY,
              emotionBrowLX: browLX,
              emotionBrowRX: browRX,
              emotionBrowLAngle: browLAngle,
              emotionBrowRAngle: browRAngle,
              emotionBrowLForm: browLForm,
              emotionBrowRForm: browRForm,
              emotionTear: emotionTear,
              emotionQuestionMark,
              emotionExclamation,
              emotionSweat,
              emotionAnger,
              emotionHeartEyes,
              emotionStarEyes,
              emotionDarkFace,
              emotionParam2,
              emotionParam3,
              emotionParam4,
              emotionEarRotation,
              emotionEarInOut,
              emotionEar1,
              emotionEar2,
              emotionEar3,
              emotionTailWag,
              emotionMouthShrug,
              emotionMouthFunnel,
              emotionMouthPucker,
              emotionMouthX,
              motionAngleX,
              motionAngleY,
              motionAngleZ,
              motionBodyAngleZ,
              motionMouthOpen,
              mouthOpenRatio: currentMouthOpen,
              mouthFormRatio: lipSync.mouthForm,
              isSpeaking: activeSpeaking,
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

      const effectiveX = isSpeakingRef.current ? 0 : trackingStateRef.current.currentX;
      const effectiveY = isSpeakingRef.current ? 0 : trackingStateRef.current.currentY;

      // Calculate kinematic motion offsets for procedural anime avatar
      let motionProcAngleX = 0;
      let motionProcAngleY = 0;
      let motionProcAngleZ = 0;
      let motionProcEyeLOverride: number | null = null;
      let motionProcMouthOpen = 0;

      if (activeMotionRef.current !== "none" && motionStartTimeRef.current) {
        const elapsed = (Date.now() - motionStartTimeRef.current) / 1000;
        const duration = 3.5;
        if (elapsed < duration) {
          const progress = elapsed / duration;
          const pRad = progress * Math.PI;

          switch (activeMotionRef.current) {
            case "nod":
              motionProcAngleY = Math.sin(progress * Math.PI * 2) * 18;
              break;
            case "shake":
              motionProcAngleX = Math.sin(progress * Math.PI * 3) * 22;
              break;
            case "wave":
              motionProcAngleZ = Math.sin(progress * Math.PI * 2) * 16;
              break;
            case "bow":
              motionProcAngleY = -Math.sin(pRad) * 25;
              break;
            case "laugh":
              motionProcAngleY = Math.abs(Math.sin(progress * Math.PI * 6)) * 12;
              motionProcMouthOpen = 0.4;
              break;
            case "wink":
              if (progress < 0.75) {
                motionProcEyeLOverride = 0;
              }
              break;
            case "check_nails":
              motionProcAngleX = Math.sin(pRad) * 20;
              motionProcAngleY = -Math.sin(pRad) * 16;
              motionProcAngleZ = -Math.sin(pRad) * 12;
              break;
            case "jiggle_dance":
              motionProcAngleZ = Math.sin(progress * Math.PI * 6) * 16;
              motionProcAngleY = Math.abs(Math.sin(progress * Math.PI * 6)) * 8;
              break;
            case "sigh_tilt":
              motionProcAngleZ = Math.sin(pRad) * 18;
              motionProcAngleY = Math.sin(pRad) * 14;
              motionProcMouthOpen = Math.sin(pRad) * 0.25;
              break;
            case "curious_glance":
              motionProcAngleX = Math.sin(progress * Math.PI * 2) * 22;
              motionProcAngleZ = Math.sin(progress * Math.PI) * 12;
              break;
            case "stretch_wave":
              motionProcAngleY = Math.sin(pRad) * 18;
              break;
          }
        }
      }

      const angleX = effectiveX * 22 + motionProcAngleX;
      const angleY = effectiveY * 16 + motionProcAngleY;
      const angleZ = -effectiveX * 12 + motionProcAngleZ;

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

        if (
          (isLeft && motionProcEyeLOverride === 0) ||
          emotion === "happy" ||
          emotion === "excited" ||
          (emotion === "flirty" && isLeft)
        ) {
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

      const mOpen = Math.max(mouthOpenRatio, motionProcMouthOpen);
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
      onMouseUp={isMobile ? undefined : handleResizeSave}
      style={{
        transform: isMobile ? undefined : `translate(${pos.x}px, ${pos.y}px)`,
        position: "relative",
        zIndex: isDraggingWindow ? 30 : 10,
        width: isMobile ? "100%" : (size.width || undefined),
        height: isMobile ? undefined : (size.height || undefined),
        maxWidth: "100%",
      }}
      className={`w-full max-w-full mx-auto bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden flex flex-col shadow-2xl min-w-0 min-h-[380px] ${
        isMobile ? "resize-none" : "lg:resize lg:min-w-[300px] lg:min-h-[400px]"
      }`}
    >
      {/* Top Header Bar */}
      <div
        onMouseDown={isMobile ? undefined : handleHeaderMouseDown}
        onTouchStart={isMobile ? undefined : handleHeaderTouchStart}
        className={`bg-slate-950/95 border-b border-slate-800 px-3 sm:px-4 py-2.5 sm:py-3 flex items-center justify-between backdrop-blur z-10 select-none ${
          isMobile ? "cursor-default" : "cursor-move"
        }`}
        title={isMobile ? undefined : "Drag to move window"}
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
        style={{ touchAction: "pan-y" }}
        className="relative w-full h-[420px] bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center cursor-grab active:cursor-grabbing overflow-hidden group flex-1 touch-pan-y"
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

        {/* Floating Emotion Emote Overlay (e.g. Question mark for Confused, Anger mark, Hearts, Sweat, Sparkles) */}
        {emotion && emotion !== "neutral" && (
          <div
            id="avatar-emotion-emote-badge"
            className="absolute top-6 right-8 sm:right-12 z-20 pointer-events-none transition-all duration-300 animate-bounce flex items-center justify-center"
          >
            <div className="text-3xl sm:text-4xl filter drop-shadow-[0_4px_12px_rgba(0,0,0,0.7)] select-none transform hover:scale-110 transition-transform">
              {emotion === "confused"
                ? "❓"
                : emotion === "thinking"
                ? "💭"
                : emotion === "angry"
                ? "💢"
                : emotion === "evil"
                ? "😈"
                : emotion === "happy"
                ? "🌸"
                : emotion === "excited"
                ? "✨"
                : emotion === "flirty"
                ? "💖"
                : emotion === "smirk"
                ? "😏"
                : emotion === "surprised"
                ? "❗"
                : emotion === "scared"
                ? "😱"
                : emotion === "sad"
                ? "💧"
                : emotion === "crying"
                ? "😭"
                : emotion === "embarrassed"
                ? "😳"
                : emotion === "tipsy"
                ? "🍶"
                : emotion === "tired"
                ? "💤"
                : ""}
            </div>
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

      </div>

      {/* Model Selection Modal */}
      {showCustomModelModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl p-5 sm:p-6 max-w-md w-full mx-auto shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
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
