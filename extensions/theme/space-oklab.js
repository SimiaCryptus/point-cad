// OKLab as a Point-CAD Space: perceptually uniform, Cartesian [L, a, b]
// unknowns (L in [0, 1]), polar (L, C, h) measures on demand, sRGB
// conversions and CSS colour literals. This is the only theme file that
// does raw colour arithmetic.

const RAD2DEG = 180 / Math.PI;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const clamp01 = (v) => clamp(v, 0, 1);
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => Math.sqrt(dot(a, a));
const round = (v, d) => Math.round(v * 10 ** d) / 10 ** d;
const pct = (v, d = 3) => `${round(v * 100, d)}%`;

// ---- OKLab <-> linear sRGB (Björn Ottosson) ---------------------------
export function linearToOklab([r, g, b]) {
  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;
  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);
  return [
    0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
    1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
    0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_,
  ];
}

export function oklabToLinear([L, a, b]) {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b;
  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
  ];
}

// ---- sRGB transfer function (sign-preserving for out-of-gamut values) --
export function srgbEncode(v) {
  const s = Math.sign(v);
  const a = Math.abs(v);
  return s * (a <= 0.0031308 ? 12.92 * a : 1.055 * a ** (1 / 2.4) - 0.055);
}

export function srgbDecode(v) {
  const s = Math.sign(v);
  const a = Math.abs(v);
  return s * (a <= 0.04045 ? a / 12.92 : ((a + 0.055) / 1.055) ** 2.4);
}

export function hslToSrgb(h, s, l) {
  const hue = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = l - c / 2;
  let rgb;
  if (hue < 60) rgb = [c, x, 0];
  else if (hue < 120) rgb = [x, c, 0];
  else if (hue < 180) rgb = [0, c, x];
  else if (hue < 240) rgb = [0, x, c];
  else if (hue < 300) rgb = [x, 0, c];
  else rgb = [c, 0, x];
  return rgb.map((v) => v + m);
}

export function hexToSrgb(hex) {
  let h = String(hex).replace(/^#/, "");
  if (h.length === 3 || h.length === 4) h = h.split("").map((ch) => ch + ch).join("");
  if (!(h.length === 6 || h.length === 8) || !/^[0-9a-fA-F]+$/.test(h)) throw new Error(`Invalid hex colour '${hex}'`);
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
}

export function srgbToHex(rgb) {
  return "#" + rgb.map((v) => Math.round(clamp01(v) * 255).toString(16).padStart(2, "0")).join("");
}

export function toPolar([L, a, b]) {
  const C = Math.hypot(a, b);
  let h = Math.atan2(b, a) * RAD2DEG;
  if (h < 0) h += 360;
  return [L, C, h];
}

export function fromPolar([L, C, h]) {
  const r = h / RAD2DEG;
  return [L, C * Math.cos(r), C * Math.sin(r)];
}

/** Encoded (gamma) sRGB from OKLab; may fall outside [0, 1]. */
export function toSrgb(c) {
  return oklabToLinear(c).map(srgbEncode);
}

export function fromSrgb(rgb) {
  return linearToOklab(rgb.map(srgbDecode));
}

function needComponents(name, args, count) {
  const vals = args.filter((a) => a && typeof a.value === "number");
  if (vals.length < count) throw new Error(`${name}() needs ${count} components`);
  return vals;
}

export const oklab = {
  id: "oklab",
  name: "OKLab (perceptual colour)",
  dim: 3,
  axes: ["L", "a", "b"],
  polarAxes: ["L", "C", "h"],
  literalFunctions: ["oklch", "oklab", "rgb", "rgba", "hsl", "hsla"],
  preferredLiteral: "oklch",

  // ---- core Space interface ------------------------------------------
  /** ΔE_ok: OKLab is Euclidean in its Cartesian form. */
  distance(p, q) {
    return norm(sub(q, p));
  },
  angle(p, q, r) {
    const u = sub(p, q);
    const v = sub(r, q);
    return Math.atan2(norm(cross(u, v)), dot(u, v)) * RAD2DEG;
  },
  interpolate(p, q, t) {
    return [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t];
  },
  normalize(c) {
    return c;
  },
  /** Lab cube for the viewport: a, b horizontal, L up, scaled to ~400 units. */
  toDisplay(c) {
    return [(c[1] ?? 0) * 400, (c[2] ?? 0) * 400, (c[0] ?? 0) * 400];
  },
  fromDisplay(d) {
    return [d[2] / 400, d[0] / 400, d[1] / 400];
  },
  origin() {
    return [0.5, 0, 0];
  },
  /** Lightness is absolute: there is no rigid-body gauge freedom to fix. */
  rigidDof() {
    return 0;
  },

  // ---- colour capabilities (discovered by name via `requires`) --------
  toLinearSRGB(c) {
    return oklabToLinear(c);
  },
  fromLinearSRGB(rgb) {
    return linearToOklab(rgb);
  },
  toSRGB: toSrgb,
  fromSRGB: fromSrgb,
  toPolar,
  fromPolar,

  /** Parse `hex` / `rgb` / `hsl` / `oklch` / `oklab` literals into [L, a, b]. */
  parseLiteral(name, args) {
    switch (name) {
      case "hex":
        return fromSrgb(hexToSrgb(args[0]));
      case "rgb": case "rgba": {
        const v = needComponents(name, args, 3);
        return fromSrgb(v.slice(0, 3).map((a) => (a.percent ? a.value / 100 : a.value / 255)));
      }
      case "hsl": case "hsla": {
        const v = needComponents(name, args, 3);
        const p = (a) => (a.percent ? a.value / 100 : a.value);
        return fromSrgb(hslToSrgb(v[0].value, p(v[1]), p(v[2])));
      }
      case "oklch": {
        const v = needComponents(name, args, 3);
        const L = v[0].percent ? v[0].value / 100 : v[0].value;
        const C = v[1].percent ? (v[1].value * 0.4) / 100 : v[1].value;
        return fromPolar([L, C, v[2].value]);
      }
      case "oklab": {
        const v = needComponents(name, args, 3);
        const L = v[0].percent ? v[0].value / 100 : v[0].value;
        const ab = (a) => (a.percent ? (a.value * 0.4) / 100 : a.value);
        return [L, ab(v[1]), ab(v[2])];
      }
      default:
        throw new Error(`Unknown colour literal '${name}'`);
    }
  },

  /** CSS text for a colour: `oklch` (default, exact), `oklab`, `rgb` or `hex` (the latter two gamut-clipped). */
  formatLiteral(c, format = "oklch") {
    switch (format) {
      case "hex":
        return srgbToHex(toSrgb(c));
      case "rgb": {
        const [r, g, b] = toSrgb(c).map((v) => Math.round(clamp01(v) * 255));
        return `rgb(${r} ${g} ${b})`;
      }
      case "oklab":
        return `oklab(${pct(c[0])} ${round(c[1], 5)} ${round(c[2], 5)})`;
      case "tuple":
        return `(${c.map((v) => round(v, 6)).join(", ")})`;
      default: {
        const [L, C, h] = toPolar(c);
        return `oklch(${pct(L)} ${round(C, 5)} ${round(h, 2)})`;
      }
    }
  },

  /** Browser-safe colour for markers and swatches (clipped hex). */
  toCSS(c) {
    return srgbToHex(toSrgb(c));
  },
};