// Procedural dance curves. Pure functions of time, so the same curve can drive
// the avatar live or be sampled into a .motion3.json file for other apps.

const smoothstep = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

export interface DancePose {
  bodyX: number; // ParamBodyAngleX (turn), degrees
  bodyY: number; // ParamBodyAngleY (lean / hop)
  bodyZ: number; // ParamBodyAngleZ (tilt)
  angleX: number; // ParamAngleX (head turn)
  angleY: number; // ParamAngleY (head nod)
  angleZ: number; // ParamAngleZ (head tilt)
}

/**
 * Jiggle dance: bouncy side-to-side hops meant to show off the model's chest
 * physics. Live2D rigs (Tamamo's "Boba X/Y" and "Body" groups) drive that
 * physics from the BODY angles, and it reacts to sudden changes of direction,
 * so the hop has a sharp turnaround at the bottom of every bounce. Eases in and
 * out so it starts and ends cleanly; physics keeps settling for a moment after.
 */
export function jiggleDancePose(t: number, duration = 5): DancePose {
  const env = smoothstep(t / 0.4) * smoothstep((duration - t) / 0.7);
  const bouncesPerSecond = 2.2;
  const phase = Math.PI * bouncesPerSecond * t;
  const side = Math.sin(phase); // -1..1, switches side every bounce
  const hop = Math.abs(side) * 2 - 1; // -1 (sharp bottom) .. 1 (top)
  return {
    bodyX: side * 8 * env,
    bodyY: hop * 9 * env,
    bodyZ: side * 6 * env,
    angleX: side * 10 * env,
    angleY: hop * 6 * env,
    angleZ: -side * 9 * env,
  };
}
