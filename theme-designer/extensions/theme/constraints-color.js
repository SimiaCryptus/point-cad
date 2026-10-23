// Colour constraint kinds (§5 of theme-designer/idea.md). They register
// like any other kind; `requires` names the space capabilities they need,
// so they are simply unavailable in Euclidean sketches.
import {apcaContrast, axisDelta, axisValue, gamutExcess, wcagContrast} from './measures-color.js';

const AXES = ['L', 'C', 'H'];

const delta = (axis, unit, description) => ({
    id: `d${axis}`,
    arity: {points: 2},
    requires: [axis === 'L' ? 'axes' : 'toPolar'],
    unit,
    syntax: `d${axis} <A> <B>`,
    description,
    measure(coords, space) {
        if (!coords || !Array.isArray(coords) || coords.length < 2 || coords[0] === undefined || coords[1] === undefined) {
            console.error(`[d${axis}] Expected at least 2 coordinate points, received:`, coords);
            throw new Error(`[d${axis}] Constraint requires at least 2 coordinate points`);
        }
        if (!space) {
            console.error(`[d${axis}] Color space instance is required`);
            throw new Error(`[d${axis}] Color space instance is required`);
        }
        try {
            return axisDelta(space, axis, coords[0], coords[1]);
        } catch (err) {
            console.error(`[d${axis}] Error measuring delta on axis "${axis}":`, err, {coords});
            throw err;
        }
    },
});

const absolute = (axis, unit, description) => ({
    id: axis,
    arity: {points: 1},
    requires: [axis === 'L' ? 'axes' : 'toPolar'],
    unit,
    syntax: `${axis} <A>`,
    description,
    measure(coords, space) {
        if (!coords || !Array.isArray(coords) || coords.length < 1 || coords[0] === undefined) {
            console.error(`[${axis}] Expected at least 1 coordinate point, received:`, coords);
            throw new Error(`[${axis}] Constraint requires at least 1 coordinate point`);
        }
        if (!space) {
            console.error(`[${axis}] Color space instance is required`);
            throw new Error(`[${axis}] Color space instance is required`);
        }
        try {
            return axisValue(space, axis, coords[0]);
        } catch (err) {
            console.error(`[${axis}] Error measuring absolute value on axis "${axis}":`, err, {coords});
            throw err;
        }
    },
});

export const dLKind = delta('L', 'lightness', 'Lightness difference L(B) − L(A)');
export const dCKind = delta('C', 'chroma', 'Chroma difference C(B) − C(A)');
export const dHKind = delta('H', 'angle', 'Shortest signed hue arc from A to B, degrees');
export const LKind = absolute('L', 'lightness', 'Lightness of a colour');
export const CKind = absolute('C', 'chroma', 'Chroma of a colour');
export const HKind = absolute('H', 'angle', 'Hue of a colour, degrees');

export const contrastKind = {
    id: 'contrast',
    arity: {points: 2},
    requires: ['toLinearSRGB'],
    unit: 'ratio',
    syntax: 'contrast <text> <background>',
    description: 'WCAG 2.x contrast ratio (symmetric, ≥ 1)',
    measure(coords, space) {
        if (!coords || !Array.isArray(coords) || coords.length < 2 || coords[0] === undefined || coords[1] === undefined) {
            console.error('[contrast] Expected 2 coordinate points (text, background), received:', coords);
            throw new Error('[contrast] Constraint requires 2 coordinate points (text, background)');
        }
        if (!space) {
            console.error('[contrast] Color space instance is required');
            throw new Error('[contrast] Color space instance is required');
        }
        try {
            return wcagContrast(space, coords[0], coords[1]);
        } catch (err) {
            console.error('[contrast] Error calculating WCAG contrast ratio:', err, {coords});
            throw err;
        }
    },
};

export const apcaKind = {
    id: 'apca',
    arity: {points: 2},
    requires: ['toLinearSRGB'],
    unit: 'Lc',
    syntax: 'apca <text> <background>',
    description: 'APCA lightness contrast Lc of text on background (negative for light-on-dark)',
    measure(coords, space) {
        if (!coords || !Array.isArray(coords) || coords.length < 2 || coords[0] === undefined || coords[1] === undefined) {
            console.error('[apca] Expected 2 coordinate points (text, background), received:', coords);
            throw new Error('[apca] Constraint requires 2 coordinate points (text, background)');
        }
        if (!space) {
            console.error('[apca] Color space instance is required');
            throw new Error('[apca] Color space instance is required');
        }
        try {
            return apcaContrast(space, coords[0], coords[1]);
        } catch (err) {
            console.error('[apca] Error calculating APCA contrast:', err, {coords});
            throw err;
        }
    },
};

export const gamutKind = {
    id: 'gamut',
    arity: {points: 1},
    requires: ['toLinearSRGB'],
    unit: 'linear',
    syntax: 'gamut <A> <= 0',
    description: 'Excess beyond the sRGB gamut (0 inside)',
    defaultTarget: {kind: 'atMost', value: 0},
    measure(coords, space) {
        if (!coords || !Array.isArray(coords) || coords.length < 1 || coords[0] === undefined) {
            console.error('[gamut] Expected at least 1 coordinate point, received:', coords);
            throw new Error('[gamut] Constraint requires at least 1 coordinate point');
        }
        if (!space) {
            console.error('[gamut] Color space instance is required');
            throw new Error('[gamut] Color space instance is required');
        }
        try {
            return gamutExcess(space, coords[0]);
        } catch (err) {
            console.error('[gamut] Error calculating gamut excess:', err, {coords});
            throw err;
        }
    },
};

/**
 * Variadic isometric lock: every point shares the first point's L, C or H.
 * Returns one residual per additional point.
 */
export const lockKind = {
    id: 'lock',
    arity: {points: '2+'},
    requires: ['toPolar'],
    unit: 'mixed',
    params: [{name: 'axis', type: 'ident', values: AXES}],
    syntax: 'lock <L|C|H> <A> <B> …',
    description: 'All points share one axis (lightness, chroma or hue) with the first',
    defaultTarget: {kind: 'value', value: 0},
    measure(coords, space, params = {}) {
        if (!coords || !Array.isArray(coords) || coords.length < 2) {
            console.error('[lock] Expected at least 2 coordinate points, received:', coords);
            throw new Error('[lock] Constraint requires at least 2 coordinate points');
        }
        if (!space) {
            console.error('[lock] Color space instance is required');
            throw new Error('[lock] Color space instance is required');
        }
        let axis = params?.axis;
        if (!AXES.includes(axis)) {
            if (axis !== undefined && axis !== null) {
                console.warn(`[lock] Unrecognized axis "${axis}". Defaulting to "L". Valid axes are: ${AXES.join(', ')}`);
            }
            axis = 'L';
        }
        const out = [];
        for (let i = 1; i < coords.length; i++) {
            try {
                out.push(axisDelta(space, axis, coords[0], coords[i]));
            } catch (err) {
                console.error(`[lock] Error calculating delta for axis "${axis}" between point 0 and point ${i}:`, err, {
                    p0: coords[0],
                    pi: coords[i],
                });
                throw err;
            }
        }
        return out;
    },
    glyph({g, coords, viewport, frame, svgEl, cls}) {
        if (!g || !coords || !Array.isArray(coords) || !viewport || typeof svgEl !== 'function') {
            console.warn('[lock:glyph] Missing or invalid rendering arguments', {
                hasG: Boolean(g),
                hasCoords: Boolean(coords),
                hasViewport: Boolean(viewport),
                hasSvgEl: typeof svgEl === 'function',
            });
            return;
        }
        if (coords.length < 2) {
            return;
        }
        for (let i = 1; i < coords.length; i++) {
            try {
                const seg = viewport.segment(coords[0], coords[i], frame);
                if (seg && seg.length >= 2) {
                    g.append(
                        svgEl('line', {
                            x1: seg[0].x,
                            y1: seg[0].y,
                            x2: seg[1].x,
                            y2: seg[1].y,
                            class: `pc-glyph pc-lock ${cls || ''}`.trim(),
                        })
                    );
                }
            } catch (err) {
                console.error(`[lock:glyph] Error rendering segment from point 0 to point ${i}:`, err);
            }
        }
    },
};

export const colorConstraintKinds = [
    dLKind,
    dCKind,
    dHKind,
    LKind,
    CKind,
    HKind,
    contrastKind,
    apcaKind,
    gamutKind,
    lockKind,
];
export default colorConstraintKinds;