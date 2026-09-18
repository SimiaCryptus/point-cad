// Colour measures written against the space's colour capabilities
// (`toPolar`, `toLinearSRGB`). Nothing here touches Lab arithmetic beyond
// reading the lightness coordinate.

const RAD2DEG = 180 / Math.PI;
const clamp01 = (v) => Math.min(1, Math.max(0, v));

export const polar = (space, c) => {
  if (typeof space.toPolar === 'function') return space.toPolar(c);
  let h = Math.atan2(c[2], c[1]) * RAD2DEG;
  if (h < 0) h += 360;
  return [c[0], Math.hypot(c[1], c[2]), h];
};
export const lightness = (space, c) => c[0];
export const chroma = (space, c) => polar(space, c)[1];
export const hue = (space, c) => polar(space, c)[2];

/** Shortest signed hue arc from `from` to `to`, in (-180, 180]. */
export function hueArc(from, to) {
  let d = (((to - from) % 360) + 360) % 360;
  if (d > 180) d -= 360;
  return d;
}

export function axisValue(space, axis, c) {
  switch (axis) {
    case 'L':
      return lightness(space, c);
    case 'C':
      return chroma(space, c);
    case 'H':
      return hue(space, c);
    default:
      throw new Error(`Unknown colour axis '${axis}'`);
  }
}

/** Axis difference B − A (hue as the shortest arc). */
export function axisDelta(space, axis, a, b) {
  if (axis === 'H') return hueArc(hue(space, a), hue(space, b));
  return axisValue(space, axis, b) - axisValue(space, axis, a);
}

/** WCAG relative luminance from linear sRGB (clamped at 0 for out-of-gamut colours). */
export function relativeLuminance(space, c) {
  const [r, g, b] = space.toLinearSRGB(c);
  return Math.max(0, 0.2126 * r + 0.7152 * g + 0.0722 * b);
}

/** WCAG 2.x contrast ratio, symmetric, ≥ 1. */
export function wcagContrast(space, a, b) {
  const ya = relativeLuminance(space, a);
  const yb = relativeLuminance(space, b);
  return (Math.max(ya, yb) + 0.05) / (Math.min(ya, yb) + 0.05);
}

// APCA-W3 0.1.9 (0.98G-4g) constants.
const APCA = {
  normBG: 0.56,
  normTXT: 0.57,
  revTXT: 0.62,
  revBG: 0.65,
  blkThrs: 0.022,
  blkClmp: 1.414,
  scale: 1.14,
  loOffset: 0.027,
  loClip: 0.1,
  deltaYmin: 0.0005,
};

function apcaY(space, c) {
  const rgb = space.toLinearSRGB(c).map((v) => clamp01(typeof space.toSRGB === 'function' ? 0 : v));
  // APCA defines Y on gamma-encoded sRGB with a plain 2.4 exponent.
  const enc =
    typeof space.toSRGB === 'function'
      ? space.toSRGB(c).map(clamp01)
      : rgb.map((v) => v ** (1 / 2.4));
  return 0.2126729 * enc[0] ** 2.4 + 0.7151522 * enc[1] ** 2.4 + 0.072175 * enc[2] ** 2.4;
}

/** APCA lightness contrast Lc of text on background; negative for light-on-dark. */
export function apcaContrast(space, text, bg) {
  let txtY = apcaY(space, text);
  let bgY = apcaY(space, bg);
  const soft = (y) => (y > APCA.blkThrs ? y : y + (APCA.blkThrs - y) ** APCA.blkClmp);
  txtY = soft(txtY);
  bgY = soft(bgY);
  if (Math.abs(bgY - txtY) < APCA.deltaYmin) return 0;
  let out;
  if (bgY > txtY) {
    const sapc = (bgY ** APCA.normBG - txtY ** APCA.normTXT) * APCA.scale;
    out = sapc < APCA.loClip ? 0 : sapc - APCA.loOffset;
  } else {
    const sapc = (bgY ** APCA.revBG - txtY ** APCA.revTXT) * APCA.scale;
    out = sapc > -APCA.loClip ? 0 : sapc + APCA.loOffset;
  }
  return out * 100;
}

/** 0 inside the linear-sRGB gamut, otherwise the largest excess beyond [0, 1]. */
export function gamutExcess(space, c) {
  let e = 0;
  for (const v of space.toLinearSRGB(c)) e = Math.max(e, v - 1, -v);
  return e;
}
