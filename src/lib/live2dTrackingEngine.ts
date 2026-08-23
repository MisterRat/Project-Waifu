/**
 * Live2D Tracking & Multi-Joint Kinematics Engine (VTube Studio Style)
 * Handles smooth mouse target interpolation, head-body coupling, and physics jiggle.
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
  };
}

export interface ParameterUpdateOptions {
  targetX: number; // -1.0 to 1.0
  targetY: number; // -1.0 to 1.0
  deltaTime: number; // seconds (e.g. 0.016)
  physicsIntensity: number; // 0.0 to 2.5 (default 1.0)
  trackingEngineEnabled?: boolean; // simple on/off switch for tracking kinematics
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
}

/**
 * Updates the tracking state with a second-order spring-damper for natural acceleration,
 * smooth following, and overshoot inertia.
 */
export function stepTrackingState(
  state: TrackingState,
  targetX: number,
  targetY: number,
  dt: number,
  physicsIntensity: number = 1.0
): TrackingState {
  const clampedDt = Math.min(0.05, Math.max(0.001, dt));

  // 1. Primary Smooth Follow (Exponential Lerp for Head & Body angles)
  // Responsiveness scales naturally with cursor distance
  const smoothFactor = 1.0 - Math.pow(0.001, clampedDt);
  const prevX = state.currentX;
  const prevY = state.currentY;

  const nextX = state.currentX + (targetX - state.currentX) * smoothFactor;
  const nextY = state.currentY + (targetY - state.currentY) * smoothFactor;

  // Instantaneous velocity (units per second)
  const vx = (nextX - prevX) / clampedDt;
  const vy = (nextY - prevY) / clampedDt;

  // 2. Secondary Elastic Spring Physics for Jiggle / Sway (Pendulum simulation)
  // Higher physicsIntensity increases spring frequency and reduces damping for more jiggle
  const k = 140.0; // Spring stiffness
  const c = Math.max(6.0, 18.0 - physicsIntensity * 4.0); // Damping coefficient

  const springForceX = -k * (state.springX - nextX) - c * state.springVx;
  const springForceY = -k * (state.springY - nextY) - c * state.springVy;

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
  };
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
    trackingEngineEnabled = true,
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

  // Normal look range coordinates (-1 to 1) - disable tracking if turned off
  const lookX = !trackingEngineEnabled || isSpeaking ? 0 : state.currentX;
  const lookY = !trackingEngineEnabled || isSpeaking ? 0 : state.currentY;
  const effectiveVx = !trackingEngineEnabled ? 0 : state.vx;
  const effectiveVy = !trackingEngineEnabled ? 0 : state.vy;

  // Kinematic Angles Distribution (VTube Studio standard scaling)
  // 1. Head Yaw (ParamAngleX): -30 to +30 degrees
  const angleX = lookX * 30.0 + motionAngleX;

  // 2. Head Pitch (ParamAngleY): -30 to +30 degrees (inverted Y: looking down is negative)
  const angleY = -lookY * 24.0 + motionAngleY;

  // 3. Head Roll / Tilt (ParamAngleZ): -15 to +15 degrees
  // Turning head tilts slightly into the movement + velocity flick
  const dynamicTilt = -lookX * 12.0 + (effectiveVx * 0.05 * physicsIntensity);
  const angleZ = dynamicTilt + motionAngleZ;

  // 4. Body Yaw (ParamBodyAngleX): Upper torso turns with head (approx 35% of head angle)
  const bodyAngleX = lookX * 10.0 + (effectiveVx * 0.08 * physicsIntensity);

  // 5. Body Pitch / Lean (ParamBodyAngleY): Torso leans forward / backward
  const bodyAngleY = -lookY * 8.0;

  // 6. Body Roll / Tilt (ParamBodyAngleZ): Spine lateral sway
  const dynamicBodyTilt = -lookX * 8.0 + (effectiveVx * 0.04 * physicsIntensity);
  const bodyAngleZ = dynamicBodyTilt + motionBodyAngleZ;

  // 7. Eye Gaze (ParamEyeBallX / ParamEyeBallY): -1 to +1
  const eyeBallX = lookX * 0.95;
  const eyeBallY = -lookY * 0.95;

  // 8. Natural Breathing Cycle (Sine wave at ~16 breaths/min)
  const breathCycle = (Math.sin((timeMs / 1000) * 2.2) + 1.0) * 0.5;

  // 9. Dynamic Physics Jiggle Offset (Hair, Bust, Clothes inertia)
  // Calculated from spring displacement and angular acceleration
  const jiggleDisplacementX = !trackingEngineEnabled ? 0 : (state.springX - state.currentX) * physicsIntensity * 15.0;
  const jiggleDisplacementY = !trackingEngineEnabled ? 0 : (state.springY - state.currentY) * physicsIntensity * 15.0;
  const velocityImpulse = !trackingEngineEnabled ? 0 : Math.sqrt(effectiveVx * effectiveVx + effectiveVy * effectiveVy) * physicsIntensity * 0.2;

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
    } catch (e) {
      // Ignore if specific parameter ID is absent on this model
    }
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

  // Secondary Physics & Jiggle Injection (Hair, Bust, Clothes, Ribbons)
  if (physicsIntensity > 0) {
    // Hair physics swaying
    setParam("ParamHairFront", "PARAM_HAIR_FRONT", jiggleDisplacementX * 0.8, true);
    setParam("ParamHairSide", "PARAM_HAIR_SIDE", jiggleDisplacementX * 0.9, true);
    setParam("ParamHairBack", "PARAM_HAIR_BACK", jiggleDisplacementX * 0.7, true);
    setParam("ParamHairFluffy", "PARAM_HAIR_FLUFFY", velocityImpulse * 0.5, true);

    // Bust / Chest physics jiggle
    const bustJiggleX = jiggleDisplacementX * 0.75;
    const bustJiggleY = (jiggleDisplacementY + velocityImpulse) * 0.6;
    setParam("ParamBustX", "PARAM_BUST_X", bustJiggleX, true);
    setParam("ParamBustY", "PARAM_BUST_Y", bustJiggleY, true);
    setParam("ParamBust", "PARAM_BUST", bustJiggleY, true);

    // Clothing & Accessories physics
    setParam("ParamRibbon", "PARAM_RIBBON", jiggleDisplacementX * 0.85, true);
    setParam("ParamSkirt", "PARAM_SKIRT", jiggleDisplacementX * 0.8, true);
    setParam("ParamShoulderY", "PARAM_SHOULDER_Y", Math.abs(angleY) * 0.1 + velocityImpulse * 0.3, true);
  } else {
    // Static mode (Off / 0x): Ensure all secondary physics parameters are at resting 0
    setParam("ParamHairFront", "PARAM_HAIR_FRONT", 0);
    setParam("ParamHairSide", "PARAM_HAIR_SIDE", 0);
    setParam("ParamHairBack", "PARAM_HAIR_BACK", 0);
    setParam("ParamHairFluffy", "PARAM_HAIR_FLUFFY", 0);
    setParam("ParamBustX", "PARAM_BUST_X", 0);
    setParam("ParamBustY", "PARAM_BUST_Y", 0);
    setParam("ParamBust", "PARAM_BUST", 0);
    setParam("ParamRibbon", "PARAM_RIBBON", 0);
    setParam("ParamSkirt", "PARAM_SKIRT", 0);
    setParam("ParamShoulderY", "PARAM_SHOULDER_Y", 0);
  }
}
