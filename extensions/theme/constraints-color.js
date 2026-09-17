// Colour constraint kinds (§5 of theme-designer/idea.md). They register
// like any other kind; `requires` names the space capabilities they need,
// so they are simply unavailable in Euclidean sketches.
import { axisValue, axisDelta, wcagContrast, apcaContrast, gamutExcess } from "./measures-color.js";

const AXES = ["L", "C", "H"];

const delta = (axis, unit, description) => ({
  id: `d${axis}`,
  arity: { points: 2 },
  requires: [axis === "L" ? "axes" : "toPolar"],
  unit,
  syntax: `d${axis} <A> <B>`,
  description,
  measure(coords, space) {
    return axisDelta(space, axis, coords[0], coords[1]);
  },
});

const absolute = (axis, unit, description) => ({
  id: axis,
  arity: { points: 1 },
  requires: [axis === "L" ? "axes" : "toPolar"],
  unit,
  syntax: `${axis} <A>`,
  description,
  measure(coords, space) {
    return axisValue(space, axis, coords[0]);
  },
});

export const dLKind = delta("L", "lightness", "Lightness difference L(B) − L(A)");
export const dCKind = delta("C", "chroma", "Chroma difference C(B) − C(A)");
export const dHKind = delta("H", "angle", "Shortest signed hue arc from A to B, degrees");
export const LKind = absolute("L", "lightness", "Lightness of a colour");
export const CKind = absolute("C", "chroma", "Chroma of a colour");
export const HKind = absolute("H", "angle", "Hue of a colour, degrees");

export const contrastKind = {
  id: "contrast",
  arity: { points: 2 },
  requires: ["toLinearSRGB"],
  unit: "ratio",
  syntax: "contrast <text> <background>",
  description: "WCAG 2.x contrast ratio (symmetric, ≥ 1)",
  measure(coords, space) {
    return wcagContrast(space, coords[0], coords[1]);
  },
};

export const apcaKind = {
  id: "apca",
  arity: { points: 2 },
  requires: ["toLinearSRGB"],
  unit: "Lc",
  syntax: "apca <text> <background>",
  description: "APCA lightness contrast Lc of text on background (negative for light-on-dark)",
  measure(coords, space) {
    return apcaContrast(space, coords[0], coords[1]);
  },
};

export const gamutKind = {
  id: "gamut",
  arity: { points: 1 },
  requires: ["toLinearSRGB"],
  unit: "linear",
  syntax: "gamut <A> <= 0",
  description: "Excess beyond the sRGB gamut (0 inside)",
  defaultTarget: { kind: "atMost", value: 0 },
  measure(coords, space) {
    return gamutExcess(space, coords[0]);
  },
};

/**
 * Variadic isometric lock: every point shares the first point's L, C or H.
 * Returns one residual per additional point.
 */
export const lockKind = {
  id: "lock",
  arity: { points: "2+" },
  requires: ["toPolar"],
  unit: "mixed",
  params: [{ name: "axis", type: "ident", values: AXES }],
  syntax: "lock <L|C|H> <A> <B> …",
  description: "All points share one axis (lightness, chroma or hue) with the first",
  defaultTarget: { kind: "value", value: 0 },
  measure(coords, space, params = {}) {
    const axis = AXES.includes(params.axis) ? params.axis : "L";
    const out = [];
    for (let i = 1; i < coords.length; i++) out.push(axisDelta(space, axis, coords[0], coords[i]));
    return out;
  },
  glyph({ g, coords, viewport, frame, svgEl, cls }) {
    for (let i = 1; i < coords.length; i++) {
      const seg = viewport.segment(coords[0], coords[i], frame);
      if (seg) g.append(svgEl("line", { x1: seg[0].x, y1: seg[0].y, x2: seg[1].x, y2: seg[1].y, class: `pc-glyph pc-lock ${cls}` }));
    }
  },
};

export const colorConstraintKinds = [dLKind, dCKind, dHKind, LKind, CKind, HKind, contrastKind, apcaKind, gamutKind, lockKind];