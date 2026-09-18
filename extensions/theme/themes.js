// `theme` / `gamut` statements, point roles, auto-gamut constraints and
// helpers for solving a palette over its themes.
import { registry as defaultRegistry } from '../../core/registry.js';
import { buildProblem } from '../../core/problem.js';
import { findScenario } from '../../core/model.js';

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
  { id: 'derived', fixed: false, export: true, description: 'Solver output, exported as a token' },
  { id: 'helper', fixed: false, export: false, description: 'Solver scaffolding, never exported' },
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
  return sketch.extensions?.theme?.gamut ?? 'off';
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
    if (next.type === 'ident' && GAMUT_MODES.includes(next.value)) {
      parser.next();
      parser.next();
      const sk = parser.ctx.sketch;
      if (!sk.extensions || typeof sk.extensions !== 'object') sk.extensions = {};
      sk.extensions.theme = { ...(sk.extensions.theme ?? {}), gamut: next.value };
      parser.ctx.ops.push({ op: 'gamut', id: next.value });
      return;
    }
    return parser.parseConstraint();
  },
  emit(sketch) {
    const mode = sketch.extensions?.theme?.gamut;
    return mode ? [`gamut ${mode}`] : [];
  },
};

export const isExported = (p) => p.export !== false;
export const exportedPoints = (sketch) => sketch.points.filter(isExported);

/** Implicit `gamut P <= 0` for every exported point without an explicit one. */
export function implicitGamutConstraints(sketch, reg) {
  if (gamutMode(sketch) !== 'srgb' || !reg.hasConstraintKind('gamut')) return [];
  if (!reg.kindSupportsSpace(reg.getConstraintKind('gamut'), sketch.space)) return [];
  const covered = new Set(
    sketch.constraints.filter((c) => c.type === 'gamut').flatMap((c) => c.points)
  );
  return exportedPoints(sketch)
    .filter((p) => !covered.has(p.id))
    .map((p) => ({
      id: `gamut:${p.id}`,
      type: 'gamut',
      points: [p.id],
      params: {},
      target: { kind: 'atMost', value: 0 },
      weight: 1,
      enabled: true,
      implicit: true,
    }));
}

/** Solve a palette over all (or the given) themes; returns the SolveResult with `perScenario`. */
export function solveThemes(
  sketch,
  { registry: reg = defaultRegistry, scenarios = true, primary = null, ...solverOptions } = {}
) {
  const solver = reg.solvers.has(sketch.solver.method)
    ? reg.getSolver(sketch.solver.method)
    : [...reg.solvers.values()][0];
  if (!solver) throw new Error('No solver registered');
  const problem = buildProblem(sketch, reg, {
    scenarios: sketch.scenarios?.length ? scenarios : undefined,
    primary,
  });
  return solver.solve(problem, {
    maxIterations: sketch.solver.maxIterations,
    tolerance: sketch.solver.tolerance,
    ...solverOptions,
  });
}

/**
 * Colour of every point in one theme: the solved block when available,
 * else the theme's override, else the sketch's solved / seed position.
 */
export function scenarioColors(sketch, result = null, scenarioId = null) {
  const sol = scenarioId != null ? result?.perScenario?.[scenarioId] : null;
  const scen = scenarioId != null ? findScenario(sketch, scenarioId) : null;
  const out = new Map();
  for (const p of sketch.points) {
    const c =
      sol?.points?.[p.id] ?? scen?.points?.[p.id] ?? scen?.points?.[p.label] ?? p.solved ?? p.seed;
    out.set(p.id, c.slice());
  }
  return out;
}

/** `{ id, colors }` for each theme, or a single anonymous entry when the sketch has none. */
export function themeList(sketch, result = null) {
  const scen = sketch.scenarios ?? [];
  if (!scen.length) return [{ id: null, colors: scenarioColors(sketch, result, null) }];
  return scen.map((s) => ({ id: s.id, colors: scenarioColors(sketch, result, s.id) }));
}

export function kebab(label) {
  return String(label)
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Za-z])(\d)/g, '$1-$2')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}
