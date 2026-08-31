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
  hasNativeExpressions?: boolean; // when true, preserves native .exp3.json parameters
  emotionMouthForm?: number;
  emotionCheek?: number;
  emotionCheekPuff?: number;
  emotionEyeLOpen?: number;
  emotionEyeROpen?: number;
  emotionEyeLSmile?: number;
  emotionEyeRSmile?: number;
  emotionEyeBallForm?: number;
  emotionEyeBallX?: number;
  emotionEyeBallY?: number;
  emotionBrowLY?: number;
  emotionBrowRY?: number;
  emotionBrowLX?: number;
  emotionBrowRX?: number;
  emotionBrowAngle?: number;
  emotionBrowLAngle?: number;
  emotionBrowRAngle?: number;
  emotionBrowLForm?: number;
  emotionBrowRForm?: number;
  emotionTear?: number;
  emotionQuestionMark?: number;
  emotionExclamation?: number;
  emotionSweat?: number;
  emotionAnger?: number;
  emotionHeartEyes?: number;
  emotionStarEyes?: number;
  emotionDarkFace?: number;
  emotionParam2?: number; // Model specific Sad mark
  emotionParam3?: number; // Model specific Angry mark
  emotionParam4?: number; // Model specific Happy mark
  emotionEarRotation?: number;
  emotionEarInOut?: number;
  emotionEar1?: number;
  emotionEar2?: number;
  emotionEar3?: number;
  emotionTailWag?: number;
  emotionMouthShrug?: number;
  emotionMouthFunnel?: number;
  emotionMouthPucker?: number;
  emotionMouthX?: number;
  motionAngleX?: number;
  motionAngleY?: number;
  motionAngleZ?: number;
  motionBodyAngleZ?: number;
  motionMouthOpen?: number;
  mouthOpenRatio?: number;
  mouthFormRatio?: number;
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
  const emotionEyeBallOffsetX = options.emotionEyeBallX ?? 0;
  const emotionEyeBallOffsetY = options.emotionEyeBallY ?? 0;
  const eyeBallX = Math.max(-1.0, Math.min(1.0, lookX * 0.95 + emotionEyeBallOffsetX));
  const eyeBallY = Math.max(-1.0, Math.min(1.0, -lookY * 0.95 + emotionEyeBallOffsetY));

  // 8. Natural Breathing Cycle (Sine wave at ~16 breaths/min)
  const breathCycle = (Math.sin((timeMs / 1000) * 2.2) + 1.0) * 0.5;

  // 9. Dynamic Physics Jiggle Offset (Hair, Bust, Clothes inertia)
  // Calculated from spring displacement and angular acceleration
  const jiggleDisplacementX = !trackingEngineEnabled ? 0 : (state.springX - state.currentX) * physicsIntensity * 15.0;
  const jiggleDisplacementY = !trackingEngineEnabled ? 0 : (state.springY - state.currentY) * physicsIntensity * 15.0;
  const velocityImpulse = !trackingEngineEnabled ? 0 : Math.sqrt(effectiveVx * effectiveVx + effectiveVy * effectiveVy) * physicsIntensity * 0.2;

  // Robust parameter setter that inspects all Cubism 4, 3, and 2 parameter resolution interfaces
  const setParam = (idC4: string, idC2: string, value: number, add: boolean = false) => {
    try {
      // 1. Cubism 4 / 3 (Live2DModel / InternalModel / CoreModel)
      if (typeof coreModel.setParameterValueById === "function") {
        if (add && typeof coreModel.getParameterValueById === "function") {
          const cur = coreModel.getParameterValueById(idC4) || 0;
          coreModel.setParameterValueById(idC4, cur + value);
        } else {
          coreModel.setParameterValueById(idC4, value);
        }
      }
      // 2. Cubism 2 setParamFloat
      if (typeof coreModel.setParamFloat === "function") {
        if (add && typeof coreModel.getParamFloat === "function") {
          const cur = coreModel.getParamFloat(idC2) || coreModel.getParamFloat(idC4) || 0;
          coreModel.setParamFloat(idC2, cur + value);
        } else {
          coreModel.setParamFloat(idC2, value);
          coreModel.setParamFloat(idC4, value);
        }
      }
      // 3. Fallback for raw parameters array indexing if available
      if (coreModel._model && typeof coreModel._model.getParameterValueByIndex === "function") {
        const paramIds = coreModel._parameterIds;
        if (Array.isArray(paramIds)) {
          const idx = paramIds.indexOf(idC4) !== -1 ? paramIds.indexOf(idC4) : paramIds.indexOf(idC2);
          if (idx !== -1 && typeof coreModel._model.setParameterValueByIndex === "function") {
            if (add) {
              const cur = coreModel._model.getParameterValueByIndex(idx) || 0;
              coreModel._model.setParameterValueByIndex(idx, cur + value);
            } else {
              coreModel._model.setParameterValueByIndex(idx, value);
            }
          }
        }
      }
    } catch (e) {
      // Ignore if specific parameter ID is absent on this model
    }
  };

  // Robust part opacity setter for part-based expressions and emote overlays
  const setPart = (idC4: string, idC2: string, value: number) => {
    try {
      if (typeof coreModel.setPartOpacityById === "function") {
        coreModel.setPartOpacityById(idC4, value);
        coreModel.setPartOpacityById(idC2, value);
      }
      if (typeof coreModel.setPartsOpacity === "function") {
        coreModel.setPartsOpacity(idC2, value);
        coreModel.setPartsOpacity(idC4, value);
      }
      if (coreModel._model && typeof coreModel._model.setPartOpacityByIndex === "function") {
        const partIds = coreModel._partIds;
        if (Array.isArray(partIds)) {
          const idx = partIds.indexOf(idC4) !== -1 ? partIds.indexOf(idC4) : partIds.indexOf(idC2);
          if (idx !== -1) {
            coreModel._model.setPartOpacityByIndex(idx, value);
          }
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

  // Set Facial & Emotion Parameters (both C4 Param* and C2 PARAM_* standards)
  const finalMouthOpen = Math.max(mouthOpenRatio, motionMouthOpen);
  setParam("ParamMouthOpenY", "PARAM_MOUTH_OPEN_Y", finalMouthOpen);

  // Dynamic Formant & Vowel Shape Modulation (for realistic speech articulation)
  const mouthFormRatio = options.mouthFormRatio ?? 0;
  if (isSpeaking || finalMouthOpen > 0.05) {
    // When speaking, blend the baseline emotion mouth form with the real-time audio formant width/roundness
    const blendedMouthForm = Math.max(-1.0, Math.min(1.0, emotionMouthForm * 0.4 + mouthFormRatio * 0.85));
    setParam("ParamMouthForm", "PARAM_MOUTH_FORM", blendedMouthForm);

    // Map formant energies to individual vowel parameters if the model defines them
    if (mouthFormRatio > 0.3) {
      // Wide vowels: 'I' / 'E'
      setParam("ParamMouthI", "PARAM_MOUTH_I", finalMouthOpen * 0.8);
      setParam("ParamMouthE", "PARAM_MOUTH_E", finalMouthOpen * 0.7);
      setParam("ParamMouthA", "PARAM_MOUTH_A", finalMouthOpen * 0.3);
      setParam("ParamMouthO", "PARAM_MOUTH_O", 0);
      setParam("ParamMouthU", "PARAM_MOUTH_U", 0);
    } else if (mouthFormRatio < -0.3) {
      // Rounded vowels: 'U' / 'O'
      setParam("ParamMouthO", "PARAM_MOUTH_O", finalMouthOpen * 0.85);
      setParam("ParamMouthU", "PARAM_MOUTH_U", finalMouthOpen * 0.75);
      setParam("ParamMouthA", "PARAM_MOUTH_A", 0);
      setParam("ParamMouthI", "PARAM_MOUTH_I", 0);
      setParam("ParamMouthE", "PARAM_MOUTH_E", 0);
    } else {
      // Open neutral vowel: 'A'
      setParam("ParamMouthA", "PARAM_MOUTH_A", finalMouthOpen * 0.9);
      setParam("ParamMouthI", "PARAM_MOUTH_I", 0);
      setParam("ParamMouthU", "PARAM_MOUTH_U", 0);
      setParam("ParamMouthE", "PARAM_MOUTH_E", 0);
      setParam("ParamMouthO", "PARAM_MOUTH_O", 0);
    }
  } else {
    setParam("ParamMouthForm", "PARAM_MOUTH_FORM", emotionMouthForm);
    setParam("ParamMouthA", "PARAM_MOUTH_A", 0);
    setParam("ParamMouthI", "PARAM_MOUTH_I", 0);
    setParam("ParamMouthU", "PARAM_MOUTH_U", 0);
    setParam("ParamMouthE", "PARAM_MOUTH_E", 0);
    setParam("ParamMouthO", "PARAM_MOUTH_O", 0);
  }

  // Set Expressive Mouth Morphs (MouthShrug, MouthFunnel, MouthPucker, MouthX)
  if (options.emotionMouthShrug !== undefined) {
    setParam("MouthShrug", "MOUTH_SHRUG", options.emotionMouthShrug);
  }
  if (options.emotionMouthFunnel !== undefined) {
    setParam("MouthFunnel", "MOUTH_FUNNEL", options.emotionMouthFunnel);
  }
  if (options.emotionMouthPucker !== undefined) {
    setParam("MouthPucker", "MOUTH_PUCKER", options.emotionMouthPucker);
  }
  if (options.emotionMouthX !== undefined) {
    setParam("MouthX", "MOUTH_X", options.emotionMouthX);
  }

  // Cheek & Blush
  setParam("ParamCheek", "PARAM_CHEEK", emotionCheek);
  setParam("ParamCheekBlush", "PARAM_CHEEK_BLUSH", emotionCheek);
  setParam("ParamBlush", "PARAM_BLUSH", emotionCheek);
  if (options.emotionCheekPuff !== undefined) {
    setParam("CheekPuff", "CHEEK_PUFF", options.emotionCheekPuff);
  }

  // Eyes (clamped safely to handle both blend shape Add and direct non-blend shape parameter values)
  if (options.emotionEyeLOpen !== undefined) {
    const clampedEyeL = Math.max(0.0, Math.min(1.5, options.emotionEyeLOpen));
    setParam("ParamEyeLOpen", "PARAM_EYE_L_OPEN", clampedEyeL);
  }
  if (options.emotionEyeROpen !== undefined) {
    const clampedEyeR = Math.max(0.0, Math.min(1.5, options.emotionEyeROpen));
    setParam("ParamEyeROpen", "PARAM_EYE_R_OPEN", clampedEyeR);
  }
  setParam("ParamEyeLSmile", "PARAM_EYE_L_SMILE", options.emotionEyeLSmile ?? 0);
  setParam("ParamEyeRSmile", "PARAM_EYE_R_SMILE", options.emotionEyeRSmile ?? 0);
  setParam("ParamEyeBallForm", "PARAM_EYE_BALL_FORM", options.emotionEyeBallForm ?? 0);

  // Eyebrows
  setParam("ParamBrowLY", "PARAM_BROW_L_Y", emotionBrowLY);
  setParam("ParamBrowRY", "PARAM_BROW_R_Y", emotionBrowRY);
  setParam("ParamBrowLX", "PARAM_BROW_L_X", options.emotionBrowLX ?? 0);
  setParam("ParamBrowRX", "PARAM_BROW_R_X", options.emotionBrowRX ?? 0);
  setParam("ParamBrowLAngle", "PARAM_BROW_L_ANGLE", options.emotionBrowLAngle ?? options.emotionBrowAngle ?? 0);
  setParam("ParamBrowRAngle", "PARAM_BROW_R_ANGLE", options.emotionBrowRAngle ?? options.emotionBrowAngle ?? 0);
  setParam("ParamBrowLForm", "PARAM_BROW_L_FORM", options.emotionBrowLForm ?? 0);
  setParam("ParamBrowRForm", "PARAM_BROW_R_FORM", options.emotionBrowRForm ?? 0);

  // Model-specific Direct Emote Marks (Tamamo Param2: Sad, Param3: Angry, Param4: Happy)
  if (options.emotionParam2 !== undefined) {
    setParam("Param2", "PARAM_2", options.emotionParam2);
  }
  if (options.emotionParam3 !== undefined) {
    setParam("Param3", "PARAM_3", options.emotionParam3);
  }
  if (options.emotionParam4 !== undefined) {
    setParam("Param4", "PARAM_4", options.emotionParam4);
  }

  // Tears & Overlays
  setParam("ParamTear", "PARAM_TEAR", options.emotionTear ?? 0);
  setPart("PartTear", "PART_TEAR", options.emotionTear ?? 0);

  // Emote marks / overlays (Question mark, Sweat, Anger, Hearts, Stars, Shock, Shadow)
  const questionVal逃 = options.emotionQuestionMark ?? 0;
  setParam("ParamQuestionMark", "PARAM_QUESTION_MARK", questionVal逃);
  setParam("ParamQuestion", "PARAM_QUESTION", questionVal逃);
  setParam("ParamHatena", "PARAM_HATENA", questionVal逃);
  setPart("PartQuestionMark", "PART_QUESTION_MARK", questionVal逃);
  setPart("PartQuestion", "PART_QUESTION", questionVal逃);
  setPart("PartHatena", "PART_HATENA", questionVal逃);

  const sweatVal = options.emotionSweat ?? 0;
  setParam("ParamSweat", "PARAM_SWEAT", sweatVal);
  setParam("ParamAse", "PARAM_ASE", sweatVal);
  setPart("PartSweat", "PART_SWEAT", sweatVal);
  setPart("PartAse", "PART_ASE", sweatVal);

  const angerVal = options.emotionAnger ?? 0;
  setParam("ParamAnger", "PARAM_ANGER", angerVal);
  setParam("ParamAngry", "PARAM_ANGRY", angerVal);
  setParam("ParamIkari", "PARAM_IKARI", angerVal);
  setParam("ParamVein", "PARAM_VEIN", angerVal);
  setPart("PartAnger", "PART_ANGER", angerVal);
  setPart("PartIkari", "PART_IKARI", angerVal);

  const heartVal = options.emotionHeartEyes ?? 0;
  setParam("ParamHeartEyes", "PARAM_HEART_EYES", heartVal);
  setParam("ParamHeartEye", "PARAM_HEART_EYE", heartVal);
  setParam("ParamHeart", "PARAM_HEART", heartVal);
  setPart("PartHeartEyes", "PART_HEART_EYES", heartVal);

  const starVal生气 = options.emotionStarEyes ?? 0;
  setParam("ParamStarEyes", "PARAM_STAR_EYES", starVal生气);
  setParam("ParamStarEye", "PARAM_STAR_EYE", starVal生气);
  setParam("ParamKira", "PARAM_KIRA", starVal生气);
  setPart("PartStarEyes", "PART_STAR_EYES", starVal生气);

  const exclVal = options.emotionExclamation ?? 0;
  setParam("ParamExclamation", "PARAM_EXCLAMATION", exclVal);
  setParam("ParamBikkuri", "PARAM_BIKKURI", exclVal);
  setParam("ParamShock", "PARAM_SHOCK", exclVal);
  setPart("PartExclamation", "PART_EXCLAMATION", exclVal);

  const darkVal = options.emotionDarkFace ?? 0;
  setParam("ParamDarkFace", "PARAM_DARK_FACE", darkVal);
  setParam("ParamShadow", "PARAM_SHADOW", darkVal);
  setPart("PartDarkFace", "PART_DARK_FACE", darkVal);

  // Fox Ears Kinematics (Param34: Rotation, Param35: In/Out, Param36..38: Ear 1..3)
  const earTwitch = Math.sin((timeMs / 1000) * 3.5) * 0.1;
  const earRot = (options.emotionEarRotation ?? 0) + earTwitch * 0.5;
  const earInOut = options.emotionEarInOut ?? 0;
  const ear1 = (options.emotionEar1 ?? 0) + earTwitch;
  const ear2 = options.emotionEar2 ?? 0;
  const ear3 = options.emotionEar3 ?? 0;

  setParam("Param34", "PARAM_34", earRot);
  setParam("Param35", "PARAM_35", earInOut);
  setParam("Param36", "PARAM_36", ear1);
  setParam("Param37", "PARAM_37", ear2);
  setParam("Param38", "PARAM_38", ear3);

  // Fox Tail Wagging Kinematics (Param_Angle_Rotation_1_TAIL2 .. 9)
  const tailSpeed = (options.emotionTailWag ?? 1.0) * 3.0;
  const tailBaseAmp = Math.sin((timeMs / 1000) * tailSpeed);
  for (let t = 1; t <= 9; t++) {
    const tailParamId = `Param_Angle_Rotation_${t}_TAIL2`;
    const lagPhase = t * 0.35;
    const tailVal = Math.sin((timeMs / 1000) * tailSpeed - lagPhase) * 15.0;
    setParam(tailParamId, tailParamId, tailVal);
  }

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
