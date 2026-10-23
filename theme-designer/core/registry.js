import {Emitter} from './events.js';

function assert(cond, msg) {
    if (!cond) {
        console.error(`registry assertion failed: ${msg}`);
        throw new Error(`registry: ${msg}`);
    }
}

/**
 * Normalise a constraint kind's point arity to `{ min, max }`. Kinds may
 * declare `arity: { points: 2 }`, `{ points: "2+" }` (variadic) or
 * `{ points: { min, max } }`. Returns null for an invalid declaration.
 */
export function arityRange(kind) {
    const a = kind?.arity?.points;
    if (Number.isInteger(a) && a >= 0) return {min: a, max: a};
    if (typeof a === 'string') {
        const m = /^(\d+)\+$/.exec(a.trim());
        return m ? {min: Number(m[1]), max: Infinity} : null;
    }
    if (a && typeof a === 'object') {
        const min = a.min ?? 0;
        const max = a.max ?? Infinity;
        const ok =
            Number.isInteger(min) &&
            min >= 0 &&
            (max === Infinity || Number.isInteger(max)) &&
            max >= min;
        return ok ? {min, max} : null;
    }
    return null;
}

/** Human-readable arity: "2", "2–4" or "2 or more". */
export function arityText(kind) {
    const r = arityRange(kind);
    if (!r) return '?';
    if (r.min === r.max) return String(r.min);
    return Number.isFinite(r.max) ? `${r.min}–${r.max}` : `${r.min} or more`;
}

/**
 * Extensibility contract: spaces, entity kinds, constraint kinds, solvers,
 * extra PCS statements, point roles and implicit-constraint providers are
 * all registered here. The core never hard-codes any of them.
 */
export class Registry {
    constructor() {
        this.spaces = new Map();
        this.entityKinds = new Map();
        this.constraintKinds = new Map();
        this.solvers = new Map();
        this.statements = new Map();
        this.pointRoles = new Map();
        this.implicitConstraints = [];
        this.events = new Emitter();
    }

    // ---- spaces ---------------------------------------------------------
    registerSpace(space) {
        assert(space && typeof space.id === 'string', 'space needs a string id');
        assert(
            Number.isInteger(space.dim) && space.dim > 0,
            `space '${space.id}' needs an integer dim`
        );
        for (const fn of [
            'distance',
            'angle',
            'interpolate',
            'normalize',
            'toDisplay',
            'fromDisplay',
        ]) {
            assert(typeof space[fn] === 'function', `space '${space.id}' is missing ${fn}()`);
        }
        if (this.spaces.has(space.id)) {
            console.warn(`Overwriting already registered space '${space.id}'`);
        }
        this.spaces.set(space.id, space);
        this.events.emit('space', space);
        return space;
    }

    hasSpace(id) {
        return this.spaces.has(id);
    }

    getSpace(id) {
        const s = this.spaces.get(id);
        if (!s) {
            console.error(`Unknown space '${id}'`);
            throw new Error(`Unknown space '${id}'`);
        }
        return s;
    }

    // ---- entity kinds ---------------------------------------------------
    registerEntityKind(kind) {
        assert(kind && typeof kind.id === 'string', 'entity kind needs a string id');
        assert(typeof kind.unknowns === 'function', `entity kind '${kind.id}' needs unknowns()`);
        if (this.entityKinds.has(kind.id)) {
            console.warn(`Overwriting already registered entity kind '${kind.id}'`);
        }
        this.entityKinds.set(kind.id, kind);
        this.events.emit('entityKind', kind);
        return kind;
    }

    hasEntityKind(id) {
        return this.entityKinds.has(id);
    }


    getEntityKind(id) {
        const k = this.entityKinds.get(id);
        if (!k) {
            console.error(`Unknown entity kind '${id}'`);
            throw new Error(`Unknown entity kind '${id}'`);
        }
        return k;
    }

    // ---- constraint kinds -----------------------------------------------
    /**
     * A kind provides `measure(coords, space, params, constraint)` returning a
     * number or an array of numbers (one residual per component). Optional:
     * `params` (non-point arguments written between the kind and the points),
     * `defaultTarget` (lets the statement omit its target), `requires`
     * (space capabilities) and `spaces` (explicit allow list).
     */
    registerConstraintKind(kind) {
        assert(kind && typeof kind.id === 'string', 'constraint kind needs a string id');
        const range = arityRange(kind);
        assert(range, `constraint kind '${kind.id}' needs arity.points (n, "n+" or { min, max })`);
        assert(typeof kind.measure === 'function', `constraint kind '${kind.id}' needs measure()`);
        const params = Array.isArray(kind.params) ? kind.params : [];
        for (const p of params)
            assert(
                p && typeof p.name === 'string',
                `constraint kind '${kind.id}' has a parameter without a name`
            );
        const paramText = params.map((p) => `<${p.name}>`).join(' ');
        const placeholders =
            Array.from({length: range.min}, (_, i) => `<P${i + 1}>`).join(' ') +
            (range.max > range.min ? ' …' : '');
        const full = {
            spaces: '*',
            requires: [],
            unit: 'length',
            params,
            syntax: [kind.id, paramText, placeholders].filter(Boolean).join(' '),
            ...kind,
        };
        if (this.constraintKinds.has(full.id)) {
            console.warn(`Overwriting already registered constraint kind '${full.id}'`);
        }
        this.constraintKinds.set(full.id, full);
        this.events.emit('constraintKind', full);
        return full;
    }

    hasConstraintKind(id) {
        return this.constraintKinds.has(id);
    }

    getConstraintKind(id) {
        const k = this.constraintKinds.get(id);
        if (!k) {
            console.error(`Unknown constraint kind '${id}'`);
            throw new Error(`Unknown constraint kind '${id}'`);
        }
        return k;
    }

    /** True when the kind's allow list admits the space and the space has every required capability. */
    kindSupportsSpace(kind, spaceId) {
        const listed =
            kind.spaces === '*' || (Array.isArray(kind.spaces) && kind.spaces.includes(spaceId));
        if (!listed) return false;
        const req = Array.isArray(kind.requires) ? kind.requires : [];
        if (!req.length) return true;
        const space = this.spaces.get(spaceId);
        return !!space && req.every((cap) => space[cap] != null);
    }

    /** True when `n` points is an acceptable count for the kind. */
    kindAccepts(kind, n) {
        const r = arityRange(kind);
        return !!r && n >= r.min && n <= r.max;
    }

    constraintKindsFor(spaceId) {
        return [...this.constraintKinds.values()].filter((k) => this.kindSupportsSpace(k, spaceId));
    }

    // ---- solvers --------------------------------------------------------
    registerSolver(solver) {
        assert(solver && typeof solver.id === 'string', 'solver needs a string id');
        assert(typeof solver.solve === 'function', `solver '${solver.id}' needs solve()`);
        if (this.solvers.has(solver.id)) {
            console.warn(`Overwriting already registered solver '${solver.id}'`);
        }
        this.solvers.set(solver.id, solver);
        this.events.emit('solver', solver);
        return solver;
    }

    hasSolver(id) {
        return this.solvers.has(id);
    }


    getSolver(id) {
        const s = this.solvers.get(id);
        if (!s) {
            console.error(`Unknown solver '${id}'`);
            throw new Error(`Unknown solver '${id}'`);
        }
        return s;
    }

    // ---- PCS statements -------------------------------------------------
    /**
     * Extra statements: `{ id, parse(parser, ctx), emit?(sketch, helpers) }`.
     * `parse` is called with the keyword still un-consumed. `emit` returns
     * the lines the emitter writes near the top of a script. A statement
     * with `scenarioKeyword: true` is an alias of `scenario` and becomes the
     * keyword the emitter uses for scenario blocks.
     */
    registerStatement(stmt) {
        assert(stmt && typeof stmt.id === 'string', 'statement needs a string id');
        assert(typeof stmt.parse === 'function', `statement '${stmt.id}' needs parse()`);
        if (this.statements.has(stmt.id)) {
            console.warn(`Overwriting already registered statement '${stmt.id}'`);
        }
        this.statements.set(stmt.id, stmt);
        this.events.emit('statement', stmt);
        return stmt;
    }

    hasStatement(id) {
        return this.statements.has(id);
    }

    getStatement(id) {
        const s = this.statements.get(id);
        if (!s) {
            console.error(`Unknown statement '${id}'`);
            throw new Error(`Unknown statement '${id}'`);
        }
        return s;
    }

    // ---- point roles ----------------------------------------------------
    /** A role is a named preset for a point: `{ id, fixed, export, description }`. */
    registerPointRole(role) {
        assert(role && typeof role.id === 'string', 'point role needs a string id');
        const full = {fixed: false, export: true, ...role};
        if (this.pointRoles.has(full.id)) {
            console.warn(`Overwriting already registered point role '${full.id}'`);
        }
        this.pointRoles.set(full.id, full);
        this.events.emit('pointRole', full);
        return full;
    }

    hasPointRole(id) {
        return this.pointRoles.has(id);
    }

    getPointRole(id) {
        const r = this.pointRoles.get(id);
        if (!r) {
            console.error(`Unknown point role '${id}'`);
            throw new Error(`Unknown point role '${id}'`);
        }
        return r;
    }


    // ---- implicit constraints -------------------------------------------
    /**
     * Register `fn(sketch, registry) => constraint[]` contributing constraints
     * that are not stored in the document (e.g. "every exported colour lies
     * inside the gamut"). Returns an unregister function.
     */
    registerImplicitConstraints(fn) {
        assert(typeof fn === 'function', 'implicit constraint provider must be a function');
        this.implicitConstraints.push(fn);
        return () => {
            this.implicitConstraints = this.implicitConstraints.filter((f) => f !== fn);
        };
    }

    implicitConstraintsFor(sketch) {
        const out = [];
        for (const fn of this.implicitConstraints) {
            try {
                const constraints = fn(sketch, this);
                if (constraints) out.push(...constraints);
            } catch (err) {
                console.error('Failed to evaluate implicit constraint provider:', err);
                throw err;
            }
        }
        return out;
    }
}

/** Shared default registry used by the element and the language. */
export const registry = new Registry();