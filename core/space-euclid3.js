// Default Space: Euclidean ℝ³. This is the only core file that does raw
// arithmetic on coordinates.

const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
];
const norm = (a) => Math.sqrt(dot(a, a));
const RAD2DEG = 180 / Math.PI;
const WORLD = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
];

/** Unit vector of `v` with its component along unit `n` removed (null if degenerate). */
const orthTo = (v, n) => {
    const w = sub(v, scale(n, dot(v, n)));
    const l = norm(w);
    return l > 1e-9 ? scale(w, 1 / l) : null;
};

/**
 * Eigen-decomposition of a symmetric 3×3 matrix (row-major, 9 entries) by
 * cyclic Jacobi rotations. Returns `[{ value, vector }]` sorted descending.
 */
function eigenSym3(A) {
    if (!A || A.length !== 9) {
        console.error('eigenSym3: invalid matrix size; expected 9-element array', A);
        throw new TypeError('eigenSym3 requires a 9-element array representing a 3x3 symmetric matrix');
    }
    const a = A.slice();
    const v = [1, 0, 0, 0, 1, 0, 0, 0, 1];
    let converged = false;
    for (let sweep = 0; sweep < 60; sweep++) {
        if (a[1] * a[1] + a[2] * a[2] + a[5] * a[5] < 1e-24) {
            converged = true;
            break;
        }
        for (const [p, q] of [
            [0, 1],
            [0, 2],
            [1, 2],
        ]) {
            const apq = a[p * 3 + q];
            if (Math.abs(apq) < 1e-300) continue;
            const theta = (a[q * 3 + q] - a[p * 3 + p]) / (2 * apq);
            const t = (theta >= 0 ? 1 : -1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
            const c = 1 / Math.sqrt(t * t + 1);
            const s = t * c;
            for (let k = 0; k < 3; k++) {
                const kp = a[k * 3 + p];
                const kq = a[k * 3 + q];
                a[k * 3 + p] = c * kp - s * kq;
                a[k * 3 + q] = s * kp + c * kq;
            }
            for (let k = 0; k < 3; k++) {
                const pk = a[p * 3 + k];
                const qk = a[q * 3 + k];
                a[p * 3 + k] = c * pk - s * qk;
                a[q * 3 + k] = s * pk + c * qk;
            }
            for (let k = 0; k < 3; k++) {
                const kp = v[k * 3 + p];
                const kq = v[k * 3 + q];
                v[k * 3 + p] = c * kp - s * kq;
                v[k * 3 + q] = s * kp + c * kq;
            }
        }
    }
    if (!converged) {
        console.warn('eigenSym3: Jacobi iteration reached sweep limit (60) without full convergence');
    }
    return [0, 1, 2]
        .map((i) => ({value: a[i * 3 + i], vector: [v[i], v[3 + i], v[6 + i]]}))
        .sort((x, y) => y.value - x.value);
}

/**
 * Principal axes of a point cloud as an orthonormal right-handed frame
 * `[x, y, z]`: x along the largest spread, z along the smallest (the "flat"
 * side faces up). Degenerate spectra fall back to the world axes, and signs
 * lean toward the world axes so aligning an already aligned cloud is a no-op.
 */
function principalAxes(coords, centroid) {
    if (!Array.isArray(coords)) {
        console.error('principalAxes: coords must be an array', coords);
        throw new TypeError('coords must be an array');
    }
    if (coords.length < 2) return WORLD;
    const C = new Array(9).fill(0);
    for (const c of coords) {
        const d = sub(c, centroid);
        for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) C[i * 3 + j] += d[i] * d[j];
    }
    if (C[0] + C[4] + C[8] < 1e-18) return WORLD;
    const eig = eigenSym3(C);
    const [l0, l1, l2] = eig.map((e) => e.value);
    const tol = 1e-4 * Math.max(l0, 1e-300);
    let x;
    let z;
    if (l0 - l1 > tol && l1 - l2 > tol) {
        x = eig[0].vector;
        z = eig[2].vector;
    } else if (l1 - l2 > tol) {
        // flattest axis is well defined, spin around it is not
        z = eig[2].vector;
        x = orthTo(WORLD[0], z) ?? orthTo(WORLD[1], z);
    } else if (l0 - l1 > tol) {
        // longest axis is well defined, roll around it is not
        x = eig[0].vector;
        z = orthTo(WORLD[2], x) ?? orthTo(WORLD[1], x);
    } else {
        return WORLD; // isotropic cloud: nothing to align
    }
    if (dot(x, WORLD[0]) < 0) x = scale(x, -1);
    if (dot(z, WORLD[2]) < 0) z = scale(z, -1);
    return [x, cross(z, x), z];
}

export const euclidean3 = {
    id: 'euclidean3',
    name: 'Euclidean ℝ³',
    dim: 3,

    /** Geodesic (straight-line) distance. */
    distance(p, q) {
        if (!p || !q || p.length < 3 || q.length < 3) {
            console.error('euclidean3.distance: invalid coordinates', {p, q});
            throw new TypeError('distance requires two 3D coordinates');
        }
        return norm(sub(q, p));
    },

    /** Interior angle at q between q→p and q→r, in degrees, within [0, 180]. */
    angle(p, q, r) {
        if (!p || !q || !r || p.length < 3 || q.length < 3 || r.length < 3) {
            console.error('euclidean3.angle: invalid coordinates', {p, q, r});
            throw new TypeError('angle requires three 3D coordinates');
        }
        const u = sub(p, q);
        const v = sub(r, q);
        const normU = norm(u);
        const normV = norm(v);
        if (normU < 1e-12 || normV < 1e-12) {
            console.warn('euclidean3.angle: degenerate angle with coincident points', {p, q, r});
            return 0;
        }
        return Math.atan2(norm(cross(u, v)), dot(u, v)) * RAD2DEG;
    },

    /** Point along the geodesic from p to q. */
    interpolate(p, q, t) {
        if (!p || !q || p.length < 3 || q.length < 3 || typeof t !== 'number' || Number.isNaN(t)) {
            console.error('euclidean3.interpolate: invalid arguments', {p, q, t});
            throw new TypeError('interpolate requires two 3D coordinates and numeric parameter t');
        }
        return [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t];
    },

    /** No per-point gauge redundancy in ℝ³. */
    normalize(c) {
        if (!c) {
            console.warn('euclidean3.normalize: received falsy coordinate', c);
            return [0, 0, 0];
        }
        return c;
    },

    /**
     * Rigid-body gauge fix for unanchored sketches. Returns a transform that
     * moves the centroid to the origin (or keeps `pivot` in place) and rotates
     * the cloud onto its principal axes so it is centered and "mostly flat".
     * `apply(c)` maps a coordinate into the new frame.
     */
    frameTransform(coords, {pivot = null} = {}) {
        if (!Array.isArray(coords)) {
            console.error('euclidean3.frameTransform: coords must be an array', coords);
            throw new TypeError('coords must be an array');
        }
        if (pivot !== null && (!pivot || pivot.length < 3)) {
            console.error('euclidean3.frameTransform: invalid pivot', pivot);
            throw new TypeError('pivot must be a 3D coordinate');
        }
        let centroid = [0, 0, 0];
        for (const c of coords) centroid = add(centroid, c);
        if (coords.length) centroid = scale(centroid, 1 / coords.length);
        const [x, y, z] = principalAxes(coords, centroid);
        const origin = pivot ?? centroid;
        const keep = pivot ?? [0, 0, 0];
        const apply = (c) => {
            if (!c || c.length < 3) {
                console.error('euclidean3.frameTransform: apply received invalid coordinate', c);
                throw new TypeError('apply requires a 3D coordinate');
            }
            const d = sub(c, origin);
            return [dot(d, x) + keep[0], dot(d, y) + keep[1], dot(d, z) + keep[2]];
        };
        return {axes: [x, y, z], origin, apply};
    },

    /** Convenience: `frameTransform` applied to every coordinate. */
    alignFrame(coords, opts) {
        if (!Array.isArray(coords)) {
            console.error('euclidean3.alignFrame: coords must be an array', coords);
            throw new TypeError('coords must be an array');
        }
        const transform = this.frameTransform(coords, opts);
        return coords.map(transform.apply);
    },

    toDisplay(c) {
        if (!c) {
            console.warn('euclidean3.toDisplay: received falsy coordinate, defaulting to [0, 0, 0]', c);
            return [0, 0, 0];
        }
        return [c[0] ?? 0, c[1] ?? 0, c[2] ?? 0];
    },

    fromDisplay(d) {
        if (!d || d.length < 3) {
            console.error('euclidean3.fromDisplay: expected 3-element display coordinate', d);
            throw new TypeError('fromDisplay requires a 3D coordinate');
        }
        return [d[0], d[1], d[2]];
    },

    origin() {
        return [0, 0, 0];
    },
};