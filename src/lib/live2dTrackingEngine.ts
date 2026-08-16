/**
 * Live2D Tracking & Multi-Joint Kinematics Engine (VTube Studio Style)
 * Handles smooth mouse target interpolation, head-body coupling, and spring-driven physics jiggle.
 */

export interface TrackingState {
  // Current smoothed positions (-1 to 1)
  currentX: number;
  currentY: number;
  // Velocities
  vx: number;
  vy: number;
  // Spring / Inertia accumulator
  springX: number;
  springY: number;
  springVx: number;
  springVy: number;
  // Dynamic window drag impulse
  dragImpulseX: number;
  dragImpulseY: number;
  // Internal time for physics wave oscillators
  timeAccum: number;
}

export function createInitialTrackingState(): TrackingState {
  return {
    currentX: 0,
    currentY: 0,
    vx: 0,
    vy: 0,
    springX: 0,
    springY: 0,
    springVx: 0,
    springVy: 0,
    dragImpulseX: 0,
    dragImpulseY: 0,
    timeAccum: 0,
  };
}

export interface ParameterUpdateOptions {
  targetX: number; // -1.0 to 1.0
  targetY: number; // -1.0 to 1.0
  deltaTime: number; // seconds (e.g. 0.016)
  physicsIntensity: number; // 0.0 to 2.5 (default 1.0)
  emotionMouthForm?: number;
  emotionCheek?: number;
  emotionEyeLOpen?: number;
  emotionEyeROpen?: number;
  emotionBrowLY?: number;
  emotionBrowRY?: number;
  emotionBrowAngle?: number;
  motionAngleX?: number;
  motionAngleY?: number;
  motionAngleZ?: number;
  motionBodyAngleZ?: number;
  motionMouthOpen?: number;
  mouthOpenRatio?: number;
  isSpeaking?: boolean;
  dragDx?: number;
  dragDy?: number;
}

/**
 * Updates tracking state with second-order spring physics and inertia.
 */
export function stepTrackingState(
  state: TrackingState,
  targetX: number,
  targetY: number,
  dt: number,
  physicsIntensity: number = 1.0,
  dragDx: number = 0,
  dragDy: number = 0
): TrackingState {
  const clampedDt = Math.min(0.05, Math.max(0.001, dt));

  // 1. Primary Smooth Follow for Head & Body angles
  const smoothFactor = 1.0 - Math.pow(0.0008, clampedDt);
  const prevX = state.currentX;
  const prevY = state.currentY;

  const nextX = state.currentX + (targetX - state.currentX) * smoothFactor;
  const nextY = state.currentY + (targetY - state.currentY) * smoothFactor;

  // Instantaneous velocity (units per second)
  const vx = (nextX - prevX) / clampedDt;
  const vy = (nextY - prevY) / clampedDt;

  // 2. Drag Impulse Decay
  const dragImpulseX = (state.dragImpulseX + dragDx * 0.15) * Math.pow(0.05, clampedDt);
  const dragImpulseY = (state.dragImpulseY + dragDy * 0.15) * Math.pow(0.05, clampedDt);

  // 3. Elastic Spring Physics for Jiggle / Inertia
  // physicsIntensity controls spring responsiveness, bounciness, and frequency
  const k = 120.0 + physicsIntensity * 60.0; // Spring stiffness
  const c = Math.max(2.5, 16.0 - physicsIntensity * 5.0); // Damping (lower = more bounciness)

  const springForceX = -k * (state.springX - nextX) - c * state.springVx + dragImpulseX * 80.0;
  const springForceY = -k * (state.springY - nextY) - c * state.springVy + dragImpulseY * 80.0;

  const nextSpringVx = state.springVx + springForceX * clampedDt;
  const nextSpringVy = state.springVy + springForceY * clampedDt;

  const nextSpringX = state.springX + nextSpringVx * clampedDt;
  const nextSpringY = state.springY + nextSpringVy * clampedDt;

  return {
    currentX: nextX,
    currentY: nextY,
    vx,
    vy,
    springX: nextSpringX,
    springY: nextSpringY,
    springVx: nextSpringVx,
    springVy: nextSpringVy,
    dragImpulseX,
    dragImpulseY,
    timeAccum: state.timeAccum + clampedDt,
  };
}

/**
 * Cache for inspected model parameter IDs to prevent searching arrays every frame.
 */
interface ModelParamCache {
  allIds: string[];
  hairIds: string[];
  bustIds: string[];
  clothesIds: string[];
  otherPhysicsIds: string[];
}

const modelParamCacheMap = new WeakMap<object, ModelParamCache>();

function getOrBuildParamCache(coreModel: any): ModelParamCache {
  if (modelParamCacheMap.has(coreModel)) {
    return modelParamCacheMap.get(coreModel)!;
  }

  const allIds: string[] = [];
  try {
    if (typeof coreModel.getParameterCount === "function" && typeof coreModel.getParameterId === "function") {
      const count = coreModel.getParameterCount();
      for (let i = 0; i < count; i++) {
        const id = coreModel.getParameterId(i);
        if (id) allIds.push(id);
      }
    } else if (coreModel._parameters && Array.isArray(coreModel._parameters.ids)) {
      allIds.push(...coreModel._parameters.ids);
    }
  } catch (e) {}

  const hairIds: string[] = [];
  const bustIds: string[] = [];
  const clothesIds: string[] = [];
  const otherPhysicsIds: string[] = [];

  for (const id of allIds) {
    const upper = id.toUpperCase();
    if (upper.includes("HAIR")) {
      hairIds.push(id);
    } else if (upper.includes("BUST") || upper.includes("BREAST") || upper.includes("CHEST")) {
      bustIds.push(id);
    } else if (
      upper.includes("RIBBON") ||
      upper.includes("SKIRT") ||
      upper.includes("CLOTH") ||
      upper.includes("ACC") ||
      upper.includes("EAR") ||
      upper.includes("TAIL") ||
      upper.includes("WING") ||
      upper.includes("STRING") ||
      upper.includes("SLEEVE")
    ) {
      clothesIds.push(id);
    } else if (upper.includes("PHYSIC") || upper.includes("SWAY") || upper.includes("SHAKE") || upper.includes("JIGGLE")) {
      otherPhysicsIds.push(id);
    }
  }

  const cache: ModelParamCache = {
    allIds,
    hairIds,
    bustIds,
    clothesIds,
    otherPhysicsIds,
  };

  modelParamCacheMap.set(coreModel, cache);
  return cache;
}

/**
 * Injects multi-joint angles, gaze direction, breathing, and secondary physics jiggle
 * into the Live2D CoreModel (compatible with Cubism 2, 3, 4, 5).
 */
export function applyLive2DMultiJointKinematics(
  coreModel: any,
  state: TrackingState,
  options: ParameterUpdateOptions,
  timeMs: number
) {
  if (!coreModel) return;

  const {
    physicsIntensity = 1.0,
    emotionMouthForm = 0,
    emotionCheek = 0,
    emotionEyeLOpen = 1.0,
    emotionEyeROpen = 1.0,
    emotionBrowLY = 0,
    emotionBrowRY = 0,
    emotionBrowAngle = 0,
    motionAngleX = 0,
    motionAngleY = 0,
    motionAngleZ = 0,
    motionBodyAngleZ = 0,
    motionMouthOpen = 0,
    mouthOpenRatio = 0,
    isSpeaking = false,
  } = options;

  // Normal look range coordinates (-1 to 1)
  const lookX = isSpeaking ? 0 : state.currentX;
  const lookY = isSpeaking ? 0 : state.currentY;

  // Kinematic Angles Distribution (VTube Studio standard scaling)
  // 1. Head Yaw (ParamAngleX): -30 to +30 degrees
  const angleX = lookX * 30.0 + motionAngleX;

  // 2. Head Pitch (ParamAngleY): -30 to +30 degrees (inverted Y: looking down is negative)
  const angleY = -lookY * 24.0 + motionAngleY;

  // 3. Head Roll / Tilt (ParamAngleZ): -15 to +15 degrees
  // Turning head tilts slightly into the movement + velocity flick
  const dynamicTilt = -lookX * 12.0 + state.vx * 0.06 * physicsIntensity;
  const angleZ = dynamicTilt + motionAngleZ;

  // 4. Body Yaw (ParamBodyAngleX): Upper torso turns with head
  const bodyAngleX = lookX * 10.0 + state.vx * 0.08 * physicsIntensity;

  // 5. Body Pitch / Lean (ParamBodyAngleY): Torso leans forward / backward
  const bodyAngleY = -lookY * 8.0;

  // 6. Body Roll / Tilt (ParamBodyAngleZ): Spine lateral sway
  const dynamicBodyTilt = -lookX * 8.0 + state.vx * 0.05 * physicsIntensity;
  const bodyAngleZ = dynamicBodyTilt + motionBodyAngleZ;

  // 7. Eye Gaze (ParamEyeBallX / ParamEyeBallY): -1 to +1
  const eyeBallX = lookX * 0.95;
  const eyeBallY = -lookY * 0.95;

  // 8. Natural Breathing Cycle (Sine wave at ~16 breaths/min)
  const breathCycle = (Math.sin((timeMs / 1000) * 2.2) + 1.0) * 0.5;

  // 9. Dynamic Physics Jiggle Displacement (Hair, Bust, Clothes inertia)
  const jiggleX = (state.springX - state.currentX) * physicsIntensity * 1.8;
  const jiggleY = (state.springY - state.currentY) * physicsIntensity * 1.8;
  const velocityImpulse = Math.sqrt(state.vx * state.vx + state.vy * state.vy) * physicsIntensity * 0.25;

  // Subtle idle micro-sway oscillator that scales with physics intensity
  const idleOscX = Math.sin(state.timeAccum * 3.5) * 0.15 * physicsIntensity;
  const idleOscY = Math.cos(state.timeAccum * 4.2) * 0.15 * physicsIntensity;

  // Helper to set parameter value across Cubism 2 (PARAM_*) & Cubism 3/4/5 (Param*)
  const setParam = (idC4: string, idC2: string, value: number, add: boolean = false) => {
    try {
      if (typeof coreModel.setParameterValueById === "function") {
        if (add && typeof coreModel.getParameterValueById === "function") {
          const cur = coreModel.getParameterValueById(idC4) || 0;
          coreModel.setParameterValueById(idC4, cur + value);
        } else {
          coreModel.setParameterValueById(idC4, value);
        }
      } else if (typeof coreModel.setParamFloat === "function") {
        if (add && typeof coreModel.getParamFloat === "function") {
          const cur = coreModel.getParamFloat(idC2 || idC4) || 0;
          coreModel.setParamFloat(idC2 || idC4, cur + value);
        } else {
          coreModel.setParamFloat(idC2 || idC4, value);
        }
      }
    } catch (e) {}
  };

  // Set Core Multi-Joint Parameters
  setParam("ParamAngleX", "PARAM_ANGLE_X", angleX);
  setParam("ParamAngleY", "PARAM_ANGLE_Y", angleY);
  setParam("ParamAngleZ", "PARAM_ANGLE_Z", angleZ);

  setParam("ParamBodyAngleX", "PARAM_BODY_ANGLE_X", bodyAngleX);
  setParam("ParamBodyAngleY", "PARAM_BODY_ANGLE_Y", bodyAngleY);
  setParam("ParamBodyAngleZ", "PARAM_BODY_ANGLE_Z", bodyAngleZ);

  setParam("ParamEyeBallX", "PARAM_EYE_BALL_X", eyeBallX);
  setParam("ParamEyeBallY", "PARAM_EYE_BALL_Y", eyeBallY);
  setParam("ParamBreath", "PARAM_BREATH", breathCycle);

  // Set Facial & Emotion Parameters
  const finalMouthOpen = Math.max(mouthOpenRatio, motionMouthOpen);
  setParam("ParamMouthOpenY", "PARAM_MOUTH_OPEN_Y", finalMouthOpen);
  setParam("ParamMouthForm", "PARAM_MOUTH_FORM", emotionMouthForm);
  setParam("ParamCheek", "PARAM_CHEEK", emotionCheek);
  setParam("ParamEyeLOpen", "PARAM_EYE_L_OPEN", emotionEyeLOpen);
  setParam("ParamEyeROpen", "PARAM_EYE_R_OPEN", emotionEyeROpen);
  setParam("ParamBrowLY", "PARAM_BROW_L_Y", emotionBrowLY);
  setParam("ParamBrowRY", "PARAM_BROW_R_Y", emotionBrowRY);
  setParam("ParamBrowLAngle", "PARAM_BROW_L_ANGLE", emotionBrowAngle);
  setParam("ParamBrowRAngle", "PARAM_BROW_R_ANGLE", emotionBrowAngle);

  // 10. Secondary Physics & Jiggle Injection (Hair, Bust, Clothes, Ribbons)
  if (physicsIntensity > 0) {
    // Hair physics
    const hairFrontVal = (jiggleX * 0.9 + idleOscX) * 20.0;
    const hairSideVal = (jiggleX * 1.1 + idleOscX * 1.2) * 22.0;
    const hairBackVal = (jiggleX * 0.7 + idleOscX * 0.8) * 16.0;
    const hairFluffyVal = velocityImpulse * 12.0;

    setParam("ParamHairFront", "PARAM_HAIR_FRONT", hairFrontVal, true);
    setParam("ParamHairSide", "PARAM_HAIR_SIDE", hairSideVal, true);
    setParam("ParamHairBack", "PARAM_HAIR_BACK", hairBackVal, true);
    setParam("ParamHairFluffy", "PARAM_HAIR_FLUFFY", hairFluffyVal, true);

    // Bust / Chest physics jiggle
    const bustXVal = (jiggleX * 0.85 + idleOscX * 0.5) * 18.0;
    const bustYVal = (jiggleY * 0.85 + velocityImpulse + idleOscY * 0.5) * 18.0;
    setParam("ParamBustX", "PARAM_BUST_X", bustXVal, true);
    setParam("ParamBustY", "PARAM_BUST_Y", bustYVal, true);
    setParam("ParamBust", "PARAM_BUST", bustYVal, true);

    // Clothing & Accessories physics
    const ribbonVal = (jiggleX * 0.95 + idleOscX) * 20.0;
    const skirtVal = (jiggleX * 0.85 + idleOscX * 0.8) * 18.0;
    const shoulderVal = Math.abs(angleY) * 0.15 + velocityImpulse * 0.4;

    setParam("ParamRibbon", "PARAM_RIBBON", ribbonVal, true);
    setParam("ParamSkirt", "PARAM_SKIRT", skirtVal, true);
    setParam("ParamShoulderY", "PARAM_SHOULDER_Y", shoulderVal, true);

    // Dynamic scan and injection for any other custom physics parameters on the loaded model
    const paramCache = getOrBuildParamCache(coreModel);
    if (paramCache.hairIds.length > 0) {
      for (const hid of paramCache.hairIds) {
        setParam(hid, hid, hairSideVal * 0.5, true);
      }
    }
    if (paramCache.bustIds.length > 0) {
      for (const bid of paramCache.bustIds) {
        const isY = bid.toUpperCase().includes("Y");
        setParam(bid, bid, isY ? bustYVal * 0.6 : bustXVal * 0.6, true);
      }
    }
    if (paramCache.clothesIds.length > 0) {
      for (const cid of paramCache.clothesIds) {
        setParam(cid, cid, ribbonVal * 0.5, true);
      }
    }
    if (paramCache.otherPhysicsIds.length > 0) {
      for (const oid of paramCache.otherPhysicsIds) {
        setParam(oid, oid, jiggleX * 12.0, true);
      }
    }
  }
}
