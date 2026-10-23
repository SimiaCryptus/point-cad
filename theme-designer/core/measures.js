// Built-in constraint kinds. `measure(coords, space)` receives the
// coordinate arrays of the constrained points (in constraint order) and the
// active space; it never touches coordinates directly.

/**
 * Built-in distance constraint kind.
 * Measures geodesic distance between two points in the given space.
 */
export const distanceKind = {
    id: 'distance',
    arity: {points: 2},
    spaces: '*',
    unit: 'length',
    syntax: 'distance <A> <B>',
    description: 'Geodesic distance between two points',
    measure(coords, space) {
        if (!space || typeof space.distance !== 'function') {
            const err = new TypeError('Invalid space: active space must provide a distance(p1, p2) method.');
            console.error('[measures:distanceKind] Invalid space parameter:', space);
            throw err;
        }

        if (!Array.isArray(coords) || coords.length < 2 || coords[0] == null || coords[1] == null) {
            const err = new Error(
                `distanceKind requires coordinate arrays for 2 points, but received: ${coords ? coords.length : 'non-array'}`
            );
            console.error('[measures:distanceKind] Invalid coords array:', coords);
            throw err;
        }

        try {
            const d = space.distance(coords[0], coords[1]);
            if (typeof d !== 'number' || Number.isNaN(d) || !Number.isFinite(d)) {
                console.warn('[measures:distanceKind] Non-finite distance calculated:', {coords, space, result: d});
            }
            return d;
        } catch (e) {
            console.error('[measures:distanceKind] Exception while computing distance:', e);
            throw e;
        }
    },
};

/**
 * Built-in angle constraint kind.
 * Measures interior angle at middle point B of triplet A, B, C in the given space.
 */
export const angleKind = {
    id: 'angle',
    arity: {points: 3},
    spaces: '*',
    unit: 'angle',
    syntax: 'angle <A> <B> <C>',
    description: 'Interior angle at the middle point B of the triplet A B C',
    measure(coords, space) {
        if (!space || typeof space.angle !== 'function') {
            const err = new TypeError('Invalid space: active space must provide an angle(p1, p2, p3) method.');
            console.error('[measures:angleKind] Invalid space parameter:', space);
            throw err;
        }

        if (!Array.isArray(coords) || coords.length < 3 || coords[0] == null || coords[1] == null || coords[2] == null) {
            const err = new Error(
                `angleKind requires coordinate arrays for 3 points, but received: ${coords ? coords.length : 'non-array'}`
            );
            console.error('[measures:angleKind] Invalid coords array:', coords);
            throw err;
        }

        try {
            const theta = space.angle(coords[0], coords[1], coords[2]);
            if (typeof theta !== 'number' || Number.isNaN(theta) || !Number.isFinite(theta)) {
                console.warn('[measures:angleKind] Non-finite angle calculated:', {coords, space, result: theta});
            }
            return theta;
        } catch (e) {
            console.error('[measures:angleKind] Exception while computing angle:', e);
            throw e;
        }
    },
};

export const builtinConstraintKinds = [distanceKind, angleKind];

const constraintKindRegistry = new Map(
    builtinConstraintKinds.map((kind) => [kind.id, kind])
);

/**
 * Retrieves a constraint kind definition by identifier.
 * @param {string} id - The constraint kind id.
 * @returns {object|undefined} The constraint kind definition or undefined if not found.
 */
export function getConstraintKind(id) {
    if (typeof id !== 'string') {
        console.warn('[measures:getConstraintKind] Expected string id, received:', id);
        return undefined;
    }
    return constraintKindRegistry.get(id);
}

/**
 * Registers a new constraint kind definition or overrides an existing one.
 * @param {object} kind - Constraint kind definition.
 */
export function registerConstraintKind(kind) {
    if (!kind || typeof kind.id !== 'string' || typeof kind.measure !== 'function') {
        const err = new TypeError('Constraint kind must be an object with string "id" and "measure(coords, space)" method.');
        console.error('[measures:registerConstraintKind] Invalid kind definition:', kind);
        throw err;
    }
    if (constraintKindRegistry.has(kind.id)) {
        console.warn(`[measures:registerConstraintKind] Overriding existing constraint kind "${kind.id}".`);
    }
    constraintKindRegistry.set(kind.id, kind);
}