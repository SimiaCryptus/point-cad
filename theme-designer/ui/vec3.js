// ℝ³ helpers for the renderer (display space only).

/**
 * Adds two 3D vectors.
 * @param {Array<number>} a - First vector [x, y, z].
 * @param {Array<number>} b - Second vector [x, y, z].
 * @returns {Array<number>} Resulting vector [x + y + z].
 */
export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

/**
 * Subtracts vector b from vector a.
 * @param {Array<number>} a - First vector [x, y, z].
 * @param {Array<number>} b - Second vector [x, y, z].
 * @returns {Array<number>} Resulting vector a - b.
 */
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

/**
 * Multiplies a 3D vector by a scalar value.
 * @param {Array<number>} a - Vector [x, y, z].
 * @param {number} s - Scalar multiplier.
 * @returns {Array<number>} Scaled vector.
 */
export const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];

/**
 * Computes the dot product of two 3D vectors.
 * @param {Array<number>} a - First vector.
 * @param {Array<number>} b - Second vector.
 * @returns {number} Dot product.
 */
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/**
 * Computes the cross product of two 3D vectors (a × b).
 * @param {Array<number>} a - First vector.
 * @param {Array<number>} b - Second vector.
 * @returns {Array<number>} Cross product vector.
 */
export const cross = (a, b) => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
];

/**
 * Computes the Euclidean norm (length) of a 3D vector.
 * @param {Array<number>} a - Vector [x, y, z].
 * @returns {number} Length of vector.
 */
export const norm = (a) => Math.sqrt(dot(a, a));

/**
 * Normalizes a 3D vector to unit length.
 * Logs a warning if the vector is a zero vector or has a non-finite length.
 * @param {Array<number>} a - Vector to normalize.
 * @returns {Array<number>} Unit vector, or [0, 0, 0] if vector has zero length.
 */
export const normalize = (a) => {
    const n = norm(a);
    if (!Number.isFinite(n) || n === 0) {
        console.warn('vec3.normalize: Vector has zero or non-finite norm, returning zero vector.', a);
        return [0, 0, 0];
    }
    return scale(a, 1 / n);
};

/**
 * Performs linear interpolation between two 3D vectors.
 * @param {Array<number>} a - Start vector.
 * @param {Array<number>} b - End vector.
 * @param {number} t - Interpolation parameter (0 <= t <= 1).
 * @returns {Array<number>} Interpolated vector.
 */
export const lerp = (a, b, t) => add(a, scale(sub(b, a), t));

/**
 * Rodrigues rotation of vector v about axis by angle (radians).
 * Logs a warning if the axis vector has zero or non-finite length.
 * @param {Array<number>} v - Vector to rotate.
 * @param {Array<number>} axis - Axis vector of rotation.
 * @param {number} angle - Rotation angle in radians.
 * @returns {Array<number>} Rotated vector.
 */
export function rotate(v, axis, angle) {
    const axisNorm = norm(axis);
    if (!Number.isFinite(axisNorm) || axisNorm === 0) {
        console.warn('vec3.rotate: Axis vector has zero or non-finite length, rotation is undefined. Returning original vector copy.', axis);
        return [v[0], v[1], v[2]];
    }
    const k = scale(axis, 1 / axisNorm);
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    return add(add(scale(v, c), scale(cross(k, v), s)), scale(k, dot(k, v) * (1 - c)));
}

/**
 * Spherical interpolation between unit vectors.
 * Logs a warning if either vector has zero or non-finite norm and falls back to lerp.
 * @param {Array<number>} a - Start unit vector.
 * @param {Array<number>} b - End unit vector.
 * @param {number} t - Interpolation parameter (0 <= t <= 1).
 * @returns {Array<number>} Spherically interpolated vector.
 */
export function slerp(a, b, t) {
    const normA = norm(a);
    const normB = norm(b);
    if (normA === 0 || normB === 0 || !Number.isFinite(normA) || !Number.isFinite(normB)) {
        console.warn('vec3.slerp: Cannot spherically interpolate vectors with zero or non-finite length. Falling back to lerp.', {
            a,
            b,
            t
        });
        return lerp(a, b, t);
    }
    const d = Math.max(-1, Math.min(1, dot(a, b)));
    const ang = Math.acos(d);
    if (ang < 1e-6) return [a[0], a[1], a[2]];
    if (Math.PI - ang < 1e-6) {
        const helper = Math.abs(a[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
        return rotate(a, normalize(cross(a, helper)), t * ang);
    }
    const s = Math.sin(ang);
    return add(scale(a, Math.sin((1 - t) * ang) / s), scale(b, Math.sin(t * ang) / s));
}