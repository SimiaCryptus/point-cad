// Public core API. Importing this module registers the built-in space,
// entity kind, constraint kinds and solver into the shared registry.
import {registry} from './registry.js';
import {euclidean3} from './space-euclid3.js';
import {builtinConstraintKinds} from './measures.js';
import {pointEntityKind} from './model.js';
import {gaussNewtonSolver} from './solver-gn.js';

/**
 * Registers built-in spaces, entity kinds, constraint kinds, and solvers into
 * the given registry instance. Defaults to the singleton registry.
 *
 * @param {import('./registry.js').Registry} [reg=registry]
 */
export function registerBuiltins(reg = registry) {
    if (!reg) {
        console.error('[core] Cannot register built-ins: registry is null or undefined.');
        return;
    }

    try {
        const hasSpace = typeof reg.hasSpace === 'function'
            ? reg.hasSpace(euclidean3.id)
            : Boolean(reg.spaces && reg.spaces.has(euclidean3.id));
        if (!hasSpace) {
            reg.registerSpace(euclidean3);
        }
    } catch (err) {
        console.error(`[core] Failed to register space "${euclidean3?.id}":`, err);
    }

    try {
        const hasKind = typeof reg.hasEntityKind === 'function'
            ? reg.hasEntityKind(pointEntityKind.id)
            : Boolean(reg.entityKinds && reg.entityKinds.has(pointEntityKind.id));
        if (!hasKind) {
            reg.registerEntityKind(pointEntityKind);
        }
    } catch (err) {
        console.error(`[core] Failed to register entity kind "${pointEntityKind?.id}":`, err);
    }

    if (Array.isArray(builtinConstraintKinds)) {
        for (const k of builtinConstraintKinds) {
            try {
                const hasConstraint = typeof reg.hasConstraintKind === 'function'
                    ? reg.hasConstraintKind(k.id)
                    : Boolean(reg.constraintKinds && reg.constraintKinds.has(k.id));
                if (!hasConstraint) {
                    reg.registerConstraintKind(k);
                }
            } catch (err) {
                console.error(`[core] Failed to register constraint kind "${k?.id}":`, err);
            }
        }
    } else {
        console.error('[core] Built-in constraint kinds list is not iterable:', builtinConstraintKinds);
    }

    try {
        const hasSolver = typeof reg.hasSolver === 'function'
            ? reg.hasSolver(gaussNewtonSolver.id)
            : Boolean(reg.solvers && reg.solvers.has(gaussNewtonSolver.id));
        if (!hasSolver) {
            reg.registerSolver(gaussNewtonSolver);
        }
    } catch (err) {
        console.error(`[core] Failed to register solver "${gaussNewtonSolver?.id}":`, err);
    }
}

// Automatically register built-ins on initial module evaluation.
try {
    registerBuiltins(registry);
} catch (err) {
    console.error('[core] Uncaught error during built-in registration:', err);
}

export const solvers = {gaussNewton: gaussNewtonSolver};

export {registry, Registry, arityRange, arityText} from './registry.js';
export {Emitter} from './events.js';
export {euclidean3} from './space-euclid3.js';
export {distanceKind, angleKind, builtinConstraintKinds} from './measures.js';
export {gaussNewtonSolver, solveLinear, matrixRank} from './solver-gn.js';
export {
    buildProblem,
    evaluateConstraints,
    statusFor,
    alignSketchFrame,
    resolveScenarios,
    effectiveConstraints,
    residualFor,
    isObjectiveTarget,
    isInequalityTarget,
} from './problem.js';
export {
    toJSON,
    toJSONString,
    fromJSON,
    migrate,
    sniffFormat,
    CURRENT_VERSION,
} from './serialize.js';
export * from './model.js';