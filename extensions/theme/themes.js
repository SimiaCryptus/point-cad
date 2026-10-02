// `theme` / `gamut` statements, point roles, auto-gamut constraints and
// helpers for solving a palette over its themes.
import {registry as defaultRegistry} from '../../core/registry.js';
import {buildProblem} from '../../core/problem.js';
import {findScenario} from '../../core/model.js';

/** Roles a colour point can take (§3.1). `fixed` feeds the solver, `export` the emitters. */
export const POINT_ROLES = [
    {
        id: 'anchor',
        fixed: true,
        export: true,
        description: 'Theme input that is also a token (brand colour, canvas)',
    },
    {
        id: 'orientation',
        fixed: true,
        export: false,
        description: 'Theme input that steers derived colours but is not a token',
    },
    {id: 'derived', fixed: false, export: true, description: 'Solver output, exported as a token'},
    {id: 'helper', fixed: false, export: false, description: 'Solver scaffolding, never exported'},
];

/** `theme NAME { … }` is sugar for the core `scenario` statement. */
export const themeStatement = {
    id: 'theme',
    scenarioKeyword: true,
    description: 'theme NAME { [point] P at colour …  var V = number … }',
    parse(parser) {
        return parser.parseScenario();
    },
};

export const GAMUT_MODES = ['srgb', 'off'];

export function gamutMode(sketch) {
    return sketch?.extensions?.theme?.gamut ?? 'off';
}

/**
 * `gamut srgb|off` switches automatic gamut constraints for exported
 * points; `gamut P <= 0` is the ordinary constraint statement.
 */
export const gamutStatement = {
    id: 'gamut',
    description: 'gamut srgb|off — auto-add `gamut P <= 0` for every exported point',
    parse(parser) {
        const next = parser.peek(1);
        if (next && next.type === 'ident' && GAMUT_MODES.includes(next.value)) {
            parser.next();
            parser.next();
            const sk = parser.ctx.sketch;
            if (!sk.extensions || typeof sk.extensions !== 'object') sk.extensions = {};
            sk.extensions.theme = {...(sk.extensions.theme ?? {}), gamut: next.value};
            parser.ctx.ops.push({op: 'gamut', id: next.value});
            return;
        }
        return parser.parseConstraint();
    },
    emit(sketch) {
        const mode = sketch.extensions?.theme?.gamut;
        return mode ? [`gamut ${mode}`] : [];
    },
};

export const isExported = (p) => p && p.export !== false;
export const exportedPoints = (sketch) => (sketch?.points ? sketch.points.filter(isExported) : []);

/** Implicit `gamut P <= 0` for every exported point without an explicit one. */
export function implicitGamutConstraints(sketch, reg) {
    if (!sketch) {
        console.error('implicitGamutConstraints: Missing sketch object');
        return [];
    }
    if (!reg) {
        console.error('implicitGamutConstraints: Missing registry object');
        return [];
    }
    if (gamutMode(sketch) !== 'srgb') return [];
    if (!reg.hasConstraintKind('gamut')) {
        console.warn('implicitGamutConstraints: Gamut constraint kind "gamut" is not registered');
        return [];
    }
    const gamutKind = reg.getConstraintKind('gamut');
    if (!reg.kindSupportsSpace(gamutKind, sketch.space)) {
        console.warn(`implicitGamutConstraints: Gamut constraint does not support color space "${sketch.space}"`);
        return [];
    }
    const covered = new Set(
        (sketch.constraints ?? []).filter((c) => c.type === 'gamut').flatMap((c) => c.points ?? [])
    );
    return exportedPoints(sketch)
        .filter((p) => !covered.has(p.id))
        .map((p) => ({
            id: `gamut:${p.id}`,
            type: 'gamut',
            points: [p.id],
            params: {},
            target: {kind: 'atMost', value: 0},
            weight: 1,
            enabled: true,
            implicit: true,
        }));
}

/** Solve a palette over all (or the given) themes; returns the SolveResult with `perScenario`. */
export function solveThemes(
    sketch,
    {registry: reg = defaultRegistry, scenarios = true, primary = null, ...solverOptions} = {}
) {
    if (!sketch) {
        console.error('solveThemes: Missing sketch argument');
        throw new Error('solveThemes requires a valid sketch');
    }
    if (!reg) {
        console.error('solveThemes: Missing registry');
        throw new Error('solveThemes requires a valid registry');
    }
    const solverMethod = sketch.solver?.method;
    let solver = null;
    if (solverMethod && reg.solvers?.has(solverMethod)) {
        solver = reg.getSolver(solverMethod);
    } else if (reg.solvers?.size > 0) {
        solver = [...reg.solvers.values()][0];
    }
    if (!solver) {
        console.error(`solveThemes: No solver registered in registry (requested: "${solverMethod ?? 'default'}")`);
        throw new Error('No solver registered');
    }
    try {
        const problem = buildProblem(sketch, reg, {
            scenarios: sketch.scenarios?.length ? scenarios : undefined,
            primary,
        });
        return solver.solve(problem, {
            maxIterations: sketch.solver?.maxIterations,
            tolerance: sketch.solver?.tolerance,
            ...solverOptions,
        });
    } catch (err) {
        console.error(`solveThemes: Solving palette failed: ${err?.message ?? err}`);
        throw err;
    }
}

/**
 * Colour of every point in one theme: the solved block when available,
 * else the theme's override, else the sketch's solved / seed position.
 */
export function scenarioColors(sketch, result = null, scenarioId = null) {
    if (!sketch?.points) {
        console.error('scenarioColors: Invalid or missing sketch points');
        return new Map();
    }
    const sol = scenarioId != null ? result?.perScenario?.[scenarioId] : null;
    const scen = scenarioId != null ? findScenario(sketch, scenarioId) : null;
    if (scenarioId != null && !scen) {
        console.warn(`scenarioColors: Scenario "${scenarioId}" not found in sketch`);
    }
    const out = new Map();
    for (const p of sketch.points) {
        const c =
            sol?.points?.[p.id] ?? scen?.points?.[p.id] ?? scen?.points?.[p.label] ?? p.solved ?? p.seed;
        if (!c) {
            console.warn(`scenarioColors: Point "${p.id}" (${p.label}) has no valid coordinates; fallback to [0, 0, 0]`);
            out.set(p.id, [0, 0, 0]);
        } else {
            out.set(p.id, c.slice());
        }
    }
    return out;
}

/** `{ id, colors }` for each theme, or a single anonymous entry when the sketch has none. */
export function themeList(sketch, result = null) {
    if (!sketch) {
        console.error('themeList: Missing sketch argument');
        return [];
    }
    const scen = sketch.scenarios ?? [];
    if (!scen.length) return [{id: null, colors: scenarioColors(sketch, result, null)}];
    return scen.map((s) => ({id: s.id, colors: scenarioColors(sketch, result, s.id)}));
}

export function kebab(label) {
    if (label == null) return '';
    return String(label)
        .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
        .replace(/([A-Za-z])(\d)/g, '$1-$2')
        .replace(/[^A-Za-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .toLowerCase();
}