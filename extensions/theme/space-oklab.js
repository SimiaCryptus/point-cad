// OKLab as a Point-CAD Space: perceptually uniform, Cartesian [L, a, b]
// unknowns (L in [0, 1]), polar (L, C, h) measures on demand, sRGB
// conversions and CSS colour literals. This is the only theme file that
// does raw colour arithmetic.

const RAD2DEG = 180 / Math.PI;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const clamp01 = (v) => clamp(v, 0, 1);
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
];
const norm = (a) => Math.sqrt(dot(a, a));
const round = (v, d) => Math.round(v * 10 ** d) / 10 ** d;
const pct = (v, d = 3) => `${round(v * 100, d)}%`;

// ---- OKLab <-> linear sRGB (Björn Ottosson) ---------------------------
export function linearToOklab(rgb) {
    if (!Array.isArray(rgb) || rgb.length < 3 || rgb.some((v) => typeof v !== 'number' || Number.isNaN(v))) {
        console.error('linearToOklab: invalid linear sRGB colour components', rgb);
        throw new Error(`Invalid linear sRGB colour components: ${JSON.stringify(rgb)}`);
    }
    const [r, g, b] = rgb;
    const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
    const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
    const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;
    const l_ = Math.cbrt(l);
    const m_ = Math.cbrt(m);
    const s_ = Math.cbrt(s);
    return [
        0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
        1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
        0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_,
    ];
}

export function oklabToLinear(lab) {
    if (!Array.isArray(lab) || lab.length < 3 || lab.some((v) => typeof v !== 'number' || Number.isNaN(v))) {
        console.error('oklabToLinear: invalid OKLab colour components', lab);
        throw new Error(`Invalid OKLab colour components: ${JSON.stringify(lab)}`);
    }
    const [L, a, b] = lab;
    const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
    const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
    const s_ = L - 0.0894841775 * a - 1.291485548 * b;
    const l = l_ * l_ * l_;
    const m = m_ * m_ * m_;
    const s = s_ * s_ * s_;
    return [
        4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
        -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
        -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
    ];
}

// ---- sRGB transfer function (sign-preserving for out-of-gamut values) --
export function srgbEncode(v) {
    if (typeof v !== 'number' || Number.isNaN(v)) {
        console.error('srgbEncode: expected number input, received:', v);
        throw new Error(`srgbEncode expects a number, received ${v}`);
    }
    const s = Math.sign(v);
    const a = Math.abs(v);
    return s * (a <= 0.0031308 ? 12.92 * a : 1.055 * a ** (1 / 2.4) - 0.055);
}

export function srgbDecode(v) {
    if (typeof v !== 'number' || Number.isNaN(v)) {
        console.error('srgbDecode: expected number input, received:', v);
        throw new Error(`srgbDecode expects a number, received ${v}`);
    }
    const s = Math.sign(v);
    const a = Math.abs(v);
    return s * (a <= 0.04045 ? a / 12.92 : ((a + 0.055) / 1.055) ** 2.4);
}

export function hslToSrgb(h, s, l) {
    if (
        typeof h !== 'number' ||
        typeof s !== 'number' ||
        typeof l !== 'number' ||
        Number.isNaN(h) ||
        Number.isNaN(s) ||
        Number.isNaN(l)
    ) {
        console.error('hslToSrgb: invalid HSL components', {h, s, l});
        throw new Error(`Invalid HSL components: h=${h}, s=${s}, l=${l}`);
    }
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
    if (hex == null || (typeof hex !== 'string' && typeof hex !== 'number')) {
        console.error('hexToSrgb: missing or non-string hex colour input:', hex);
        throw new Error(`Invalid hex colour '${hex}'`);
    }
    let h = String(hex).replace(/^#/, '');
    if (h.length === 3 || h.length === 4)
        h = h
            .split('')
            .map((ch) => ch + ch)
            .join('');
    if (!(h.length === 6 || h.length === 8) || !/^[0-9a-fA-F]+$/.test(h)) {
        console.error(`hexToSrgb: malformed hex colour string '${hex}'`);
        throw new Error(`Invalid hex colour '${hex}'`);
    }
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
}

export function srgbToHex(rgb) {
    if (!Array.isArray(rgb) || rgb.length < 3) {
        console.error('srgbToHex: expected 3-element RGB array, received:', rgb);
        throw new Error('srgbToHex requires an [r, g, b] colour array');
    }
    return (
        '#' +
        rgb
            .map((v) =>
                Math.round(clamp01(v) * 255)
                    .toString(16)
                    .padStart(2, '0')
            )
            .join('')
    );
}

export function toPolar(lab) {
    if (!Array.isArray(lab) || lab.length < 3 || lab.some((v) => typeof v !== 'number' || Number.isNaN(v))) {
        console.error('toPolar: invalid OKLab coordinates', lab);
        throw new Error(`Invalid OKLab components for polar conversion: ${JSON.stringify(lab)}`);
    }
    const [L, a, b] = lab;
    const C = Math.hypot(a, b);
    let h = Math.atan2(b, a) * RAD2DEG;
    if (h < 0) h += 360;
    return [L, C, h];
}

export function fromPolar(polar) {
    if (!Array.isArray(polar) || polar.length < 3 || polar.some((v) => typeof v !== 'number' || Number.isNaN(v))) {
        console.error('fromPolar: invalid polar coordinates', polar);
        throw new Error(`Invalid polar components for OKLab conversion: ${JSON.stringify(polar)}`);
    }
    const [L, C, h] = polar;
    const r = h / RAD2DEG;
    return [L, C * Math.cos(r), C * Math.sin(r)];
}

/** Encoded (gamma) sRGB from OKLab; may fall outside [0, 1]. */
export function toSrgb(c) {
    if (!Array.isArray(c) || c.length < 3) {
        console.error('toSrgb: invalid OKLab coordinate array', c);
        throw new Error('toSrgb requires an [L, a, b] colour array');
    }
    return oklabToLinear(c).map(srgbEncode);
}

export function fromSrgb(rgb) {
    if (!Array.isArray(rgb) || rgb.length < 3) {
        console.error('fromSrgb: invalid sRGB coordinate array', rgb);
        throw new Error('fromSrgb requires an [r, g, b] colour array');
    }
    return linearToOklab(rgb.map(srgbDecode));
}

function needComponents(name, args, count) {
    if (!Array.isArray(args)) {
        console.error(`needComponents: expected args to be an Array for '${name}', received:`, args);
        throw new Error(`${name}() expects an array of arguments`);
    }
    const vals = args.filter((a) => a && typeof a.value === 'number' && !Number.isNaN(a.value));
    if (vals.length < count) {
        console.error(`needComponents: '${name}' requires ${count} numeric components, received ${vals.length}:`, args);
        throw new Error(`${name}() needs ${count} components`);
    }
    return vals;
}

export const oklab = {
    id: 'oklab',
    name: 'OKLab (perceptual colour)',
    dim: 3,
    axes: ['L', 'a', 'b'],
    polarAxes: ['L', 'C', 'h'],
    literalFunctions: ['oklch', 'oklab', 'rgb', 'rgba', 'hsl', 'hsla'],
    preferredLiteral: 'oklch',

    // ---- core Space interface ------------------------------------------
    /** ΔE_ok: OKLab is Euclidean in its Cartesian form. */
    distance(p, q) {
        if (!p || !q || p.length < 3 || q.length < 3) {
            console.error('oklab.distance: invalid point arguments', {p, q});
            throw new Error('distance requires two 3D points');
        }
        return norm(sub(q, p));
    },
    angle(p, q, r) {
        if (!p || !q || !r || p.length < 3 || q.length < 3 || r.length < 3) {
            console.error('oklab.angle: invalid point arguments', {p, q, r});
            throw new Error('angle requires three 3D points');
        }
        const u = sub(p, q);
        const v = sub(r, q);
        const uNorm = norm(u);
        const vNorm = norm(v);
        if (uNorm === 0 || vNorm === 0) {
            console.warn('oklab.angle: degenerate angle with zero-length leg', {p, q, r});
            return 0;
        }
        return Math.atan2(norm(cross(u, v)), dot(u, v)) * RAD2DEG;
    },
    interpolate(p, q, t) {
        if (!p || !q || p.length < 3 || q.length < 3 || typeof t !== 'number' || Number.isNaN(t)) {
            console.error('oklab.interpolate: invalid arguments', {p, q, t});
            throw new Error('interpolate requires two 3D points and numeric parameter t');
        }
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
        if (typeof name !== 'string') {
            console.error('oklab.parseLiteral: invalid literal function name', name);
            throw new Error(`Invalid literal name '${name}'`);
        }
        switch (name) {
            case 'hex':
                return fromSrgb(
                    hexToSrgb(
                        args && typeof args[0] === 'object' && args[0] !== null && 'value' in args[0]
                            ? args[0].value
                            : Array.isArray(args)
                                ? args[0]
                                : args
                    )
                );
            case 'rgb':
            case 'rgba': {
                const v = needComponents(name, args, 3);
                return fromSrgb(v.slice(0, 3).map((a) => (a.percent ? a.value / 100 : a.value / 255)));
            }
            case 'hsl':
            case 'hsla': {
                const v = needComponents(name, args, 3);
                const p = (a) => (a.percent ? a.value / 100 : a.value);
                return fromSrgb(hslToSrgb(v[0].value, p(v[1]), p(v[2])));
            }
            case 'oklch': {
                const v = needComponents(name, args, 3);
                const L = v[0].percent ? v[0].value / 100 : v[0].value;
                const C = v[1].percent ? (v[1].value * 0.4) / 100 : v[1].value;
                return fromPolar([L, C, v[2].value]);
            }
            case 'oklab': {
                const v = needComponents(name, args, 3);
                const L = v[0].percent ? v[0].value / 100 : v[0].value;
                const ab = (a) => (a.percent ? (a.value * 0.4) / 100 : a.value);
                return [L, ab(v[1]), ab(v[2])];
            }
            default:
                console.error(`oklab.parseLiteral: unknown colour literal '${name}' with args:`, args);
                throw new Error(`Unknown colour literal '${name}'`);
        }
    },

    /** CSS text for a colour: `oklch` (default, exact), `oklab`, `rgb` or `hex` (the latter two gamut-clipped). */
    formatLiteral(c, format = 'oklch') {
        if (!Array.isArray(c) || c.length < 3) {
            console.error('oklab.formatLiteral: invalid OKLab coordinate array', c);
            throw new Error('formatLiteral expects an [L, a, b] colour array');
        }
        switch (format) {
            case 'hex':
                return srgbToHex(toSrgb(c));
            case 'rgb': {
                const [r, g, b] = toSrgb(c).map((v) => Math.round(clamp01(v) * 255));
                return `rgb(${r} ${g} ${b})`;
            }
            case 'oklab':
                return `oklab(${pct(c[0])} ${round(c[1], 5)} ${round(c[2], 5)})`;
            case 'tuple':
                return `(${c.map((v) => round(v, 6)).join(', ')})`;
            case 'oklch': {
                const [L, C, h] = toPolar(c);
                return `oklch(${pct(L)} ${round(C, 5)} ${round(h, 2)})`;
            }
            default: {
                console.warn(`oklab.formatLiteral: unknown format '${format}', defaulting to 'oklch'`);
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
export default oklab;