// Turns a Sketch into a numerical problem: unknown vector, residual function
// and a way to write a solution back. Handles scalar or vector-valued
// measures, equality / inequality / objective targets and stacked
// multi-scenario problems with per-scenario or shared variables.
import { registry as defaultRegistry, arityRange, arityText } from "./registry.js";

const MAX_EPS = 1e-3;

export const TARGET_KINDS = ["value", "variable", "minimize", "maximize", "atLeast", "atMost"];
export const isObjectiveTarget = (kind) => kind === "minimize" || kind === "maximize";
export const isInequalityTarget = (kind) => kind === "atLeast" || kind === "atMost";

const components = (m) => (Array.isArray(m) ? m : [m]);

/** Residual of one measure component against its target. */
export function residualFor(targetKind, m, target) {
  switch (targetKind) {
    case "atLeast": return Math.max(0, target - m);
    case "atMost": return Math.max(0, m - target);
    case "minimize": return m;
    case "maximize": return 1 / (Math.abs(m) + MAX_EPS);
    default: return m - target;
  }
}

/** The sketch's constraints plus implicit ones contributed by extensions. */
export function effectiveConstraints(sketch, reg = defaultRegistry) {
  const implicit = typeof reg.implicitConstraintsFor === "function" ? reg.implicitConstraintsFor(sketch) : [];
  return implicit.length ? [...sketch.constraints, ...implicit] : sketch.constraints;
}

/**
 * Resolve a scenario selection. `spec` may be omitted (no scenarios: one
 * anonymous block), `true`/"all" (every scenario of the sketch), an id, a
 * scenario object, or an array of ids / objects. Always returns ≥ 1 entry.
 */
export function resolveScenarios(sketch, spec) {
  const all = sketch.scenarios ?? [];
  const byId = (id) => {
    const s = all.find((x) => x.id === id);
    if (!s) throw new Error(`Unknown scenario '${id}'`);
    return s;
  };
  let list;
  if (spec == null || spec === false) list = [];
  else if (spec === true || spec === "all" || spec === "scenarios") list = all;
  else if (typeof spec === "string") list = [byId(spec)];
  else if (Array.isArray(spec)) list = spec.map((s) => (typeof s === "string" ? byId(s) : s));
  else list = [spec];
  if (!list.length) return [{ id: null, points: {}, variables: {} }];
  return list.map((s) => ({ id: s.id ?? null, points: s.points ?? {}, variables: s.variables ?? {} }));
}

export function buildProblem(sketch, reg = defaultRegistry, options = {}) {
  const space = reg.getSpace(sketch.space);
  const dim = space.dim;
  const scenarios = resolveScenarios(sketch, options.scenarios);
  const S = scenarios.length;
  const primaryIndex = Math.max(0, scenarios.findIndex((s) => s.id === options.primary));

  const pointById = new Map(sketch.points.map((p) => [p.id, p]));
  const varById = new Map(sketch.variables.map((v) => [v.id, v]));
  const lookupPoint = (ref) => pointById.get(ref) ?? sketch.points.find((p) => p.label === ref) ?? null;
  const lookupVar = (ref) => varById.get(ref) ?? sketch.variables.find((v) => v.name === ref) ?? null;

  // ---- scenario overrides (fixed positions, seeds, variable values) ----
  const overrides = scenarios.map((s) => {
    const pts = new Map();
    const vars = new Map();
    for (const [ref, c] of Object.entries(s.points)) {
      const p = lookupPoint(ref);
      if (!p) throw new Error(`Scenario '${s.id}' overrides unknown point '${ref}'`);
      if (!Array.isArray(c) || c.length !== dim) throw new Error(`Scenario '${s.id}': override for '${ref}' needs ${dim} coordinates`);
      pts.set(p.id, c.map(Number));
    }
    for (const [ref, val] of Object.entries(s.variables)) {
      const v = lookupVar(ref);
      if (!v) throw new Error(`Scenario '${s.id}' overrides unknown variable '${ref}'`);
      vars.set(v.id, Number(val));
    }
    return { pts, vars };
  });
  const seedOf = (si, p) => overrides[si].pts.get(p.id) ?? p.seed;
  const valueOf = (si, v) => overrides[si].vars.get(v.id) ?? v.value ?? 0;

  // ---- layout ----------------------------------------------------------
  const key = (si, id) => `${si}:${id}`;
  const layout = [];
  let n = 0;
  const pointOffset = new Map();
  for (let si = 0; si < S; si++) {
    for (const p of sketch.points) {
      if (p.fixed) continue;
      pointOffset.set(key(si, p.id), n);
      layout.push({ kind: "point", id: p.id, scenario: scenarios[si].id, scenarioIndex: si, offset: n, size: dim });
      n += dim;
    }
  }
  const varOffset = new Map();
  for (const v of sketch.variables) {
    if (v.locked) continue;
    if (v.shared || S === 1) {
      varOffset.set(key("*", v.id), n);
      layout.push({ kind: "variable", id: v.id, scenario: null, scenarioIndex: null, shared: S > 1, offset: n, size: 1 });
      n += 1;
    } else {
      for (let si = 0; si < S; si++) {
        varOffset.set(key(si, v.id), n);
        layout.push({ kind: "variable", id: v.id, scenario: scenarios[si].id, scenarioIndex: si, shared: false, offset: n, size: 1 });
        n += 1;
      }
    }
  }
  const pointOff = (si, id) => pointOffset.get(key(si, id));
  const varOff = (si, id) => varOffset.get(key("*", id)) ?? varOffset.get(key(si, id));

  const x0 = new Float64Array(n);
  for (const item of layout) {
    if (item.kind === "point") {
      const seed = seedOf(item.scenarioIndex, pointById.get(item.id));
      for (let k = 0; k < dim; k++) x0[item.offset + k] = Number.isFinite(seed[k]) ? seed[k] : 0;
    } else {
      x0[item.offset] = valueOf(item.scenarioIndex ?? 0, varById.get(item.id));
    }
  }

  const objectiveScale = sketch.solver?.objectiveScale ?? 0.001;
  const frameMode = sketch.solver?.frame ?? "auto";
  const fixedPoints = sketch.points.filter((p) => p.fixed);

  // ---- terms -----------------------------------------------------------
  const terms = [];
  const constraints = effectiveConstraints(sketch, reg);
  for (let si = 0; si < S; si++) {
    for (const c of constraints) {
      if (c.enabled === false) continue;
      const kind = reg.getConstraintKind(c.type);
      if (!reg.kindSupportsSpace(kind, sketch.space)) {
        throw new Error(`Constraint '${c.id}': kind '${c.type}' is not available in space '${sketch.space}'`);
      }
      const range = arityRange(kind);
      if (c.points.length < range.min || c.points.length > range.max) {
        throw new Error(`Constraint '${c.id}': '${c.type}' needs ${arityText(kind)} points`);
      }
      for (const id of c.points) {
        if (!pointById.has(id)) throw new Error(`Constraint '${c.id}' references unknown point '${id}'`);
      }
      const w = Math.sqrt(Math.max(c.weight ?? 1, 0));
      const t = c.target ?? kind.defaultTarget ?? { kind: "value", value: 0 };
      const variableTarget = (ref) => {
        const v = varById.get(ref);
        if (!v) throw new Error(`Constraint '${c.id}' references unknown variable '${ref}'`);
        const o = varOff(si, v.id);
        return o === undefined ? () => valueOf(si, v) : (x) => x[o];
      };
      let targetFn = null;
      if (t.kind === "variable") targetFn = variableTarget(t.ref);
      else if (t.kind === "value" || isInequalityTarget(t.kind)) {
        if (t.ref != null) targetFn = variableTarget(t.ref);
        else {
          const val = Number(t.value ?? 0);
          targetFn = () => val;
        }
      } else if (!isObjectiveTarget(t.kind)) {
        throw new Error(`Constraint '${c.id}': unknown target kind '${t.kind}'`);
      }
      const isEquality = !isObjectiveTarget(t.kind);
      terms.push({
        constraint: c,
        kind,
        scenario: scenarios[si].id,
        scenarioIndex: si,
        pointIds: c.points.slice(),
        params: c.params ?? {},
        targetFn,
        targetKind: t.kind,
        isEquality,
        isInequality: isInequalityTarget(t.kind),
        w: isEquality ? w : w * Math.sqrt(objectiveScale),
        residualOf: (m, x) => residualFor(t.kind, m, targetFn ? targetFn(x) : 0),
        size: 1,
        row: 0,
      });
    }
  }

  function positions(x, si = primaryIndex) {
    const pos = new Map();
    for (const p of sketch.points) {
      const o = pointOff(si, p.id);
      pos.set(p.id, o === undefined ? seedOf(si, p) : Array.prototype.slice.call(x, o, o + dim));
    }
    return pos;
  }

  function measureTerm(t, pos) {
    let m = t.kind.measure(t.pointIds.map((id) => pos.get(id)), space, t.params, t.constraint);
    if (Array.isArray(m) && !t.isEquality) m = Math.hypot(...m); // objectives act on the norm
    return m;
  }

  function measures(x) {
    const cache = new Array(S);
    return terms.map((t) => {
      if (!cache[t.scenarioIndex]) cache[t.scenarioIndex] = positions(x, t.scenarioIndex);
      return measureTerm(t, cache[t.scenarioIndex]);
    });
  }

  // Measures may be vector-valued: one residual row per component.
  const rows = [];
  const ms0 = measures(x0);
  terms.forEach((t, i) => {
    t.size = components(ms0[i]).length;
    t.row = rows.length;
    for (let k = 0; k < t.size; k++) rows.push({ term: t, component: k });
  });
  const m = rows.length;

  function residuals(x) {
    const ms = measures(x);
    const r = new Float64Array(m);
    for (let i = 0; i < terms.length; i++) {
      const t = terms[i];
      const comps = components(ms[i]);
      for (let k = 0; k < t.size; k++) r[t.row + k] = t.w * t.residualOf(comps[k] ?? 0, x);
    }
    return r;
  }

  function normalize(x) {
    for (const item of layout) {
      if (item.kind !== "point") continue;
      const c = space.normalize(Array.prototype.slice.call(x, item.offset, item.offset + dim));
      for (let k = 0; k < dim; k++) x[item.offset + k] = c[k];
    }
    return x;
  }

  /**
   * Rigid-body gauge fix. A sketch with no anchors is only defined up to a
   * rigid motion (6 DOF in ℝ³; 3 with one fixed point). Instead of reporting
   * that freedom as slack we pin it: each scenario's solved cloud is
   * re-centred and aligned to its principal axes (a single fixed point stays
   * put and acts as the pivot). Spaces without `alignFrame` (e.g. colour
   * spaces, whose axes are absolute) opt out. Returns true when `x` changed.
   */
  function alignFrame(x) {
    if (frameMode === "none" || typeof space.alignFrame !== "function") return false;
    if (fixedPoints.length > 1 || pointOffset.size === 0) return false;
    for (let si = 0; si < S; si++) {
      const pos = positions(x, si);
      const coords = sketch.points.map((p) => pos.get(p.id));
      const pivot = fixedPoints.length ? pos.get(fixedPoints[0].id) : null;
      const aligned = space.alignFrame(coords, { pivot });
      sketch.points.forEach((p, i) => {
        const o = pointOff(si, p.id);
        if (o === undefined) return;
        for (let k = 0; k < dim; k++) x[o + k] = aligned[i][k];
      });
    }
    return true;
  }

  /** Solution of one scenario as plain maps (`points[id]`, `variables[id]`). */
  function solutionFor(x, si = primaryIndex) {
    const pos = positions(x, si);
    const points = {};
    const variables = {};
    for (const p of sketch.points) points[p.id] = Array.from(pos.get(p.id));
    for (const v of sketch.variables) {
      const o = varOff(si, v.id);
      variables[v.id] = o === undefined ? valueOf(si, v) : x[o];
    }
    return { id: scenarios[si].id, points, variables };
  }

  /** Write one scenario's solution (the primary one by default) into `target`. */
  function apply(x, target = sketch, si = primaryIndex) {
    const sol = solutionFor(x, si);
    for (const p of target.points) if (sol.points[p.id]) p.solved = sol.points[p.id].slice();
    for (const v of target.variables) if (!v.locked && v.id in sol.variables) v.solved = sol.variables[v.id];
    return target;
  }

  return {
    sketch,
    space,
    dim,
    n,
    m,
    layout,
    x0,
    terms,
    rows,
    scenarios: scenarios.map((s) => s.id),
    scenarioCount: S,
    primaryIndex,
    pointOffset,
    varOffset,
    fixedPointCount: fixedPoints.length,
    frameMode,
    positions,
    measures,
    residuals,
    normalize,
    alignFrame,
    solutionFor,
    apply,
  };
}

export function statusFor(residual, tol = 1e-3) {
  const a = Math.abs(residual);
  if (!Number.isFinite(a)) return "error";
  return a <= tol ? "ok" : a <= tol * 1000 ? "warn" : "bad";
}

/**
 * Evaluate every constraint at the current (solved, else seed) positions.
 * Used for diagnostics and glyph colouring even before a solve. With
 * `scenario` set, that scenario's overrides stand in for missing solutions.
 */
export function evaluateConstraints(sketch, reg = defaultRegistry, { useSolved = true, scenario = null } = {}) {
  const space = reg.hasSpace(sketch.space) ? reg.getSpace(sketch.space) : null;
  const scen = scenario ? (sketch.scenarios ?? []).find((s) => s.id === scenario) ?? null : null;
  const pointById = new Map(sketch.points.map((p) => [p.id, p]));
  const varById = new Map(sketch.variables.map((v) => [v.id, v]));
  return effectiveConstraints(sketch, reg).map((c) => {
    const out = { id: c.id, type: c.type, measure: null, target: null, targetKind: null, residual: null, status: "none", error: null, implicit: !!c.implicit };
    if (!space) return Object.assign(out, { status: "error", error: `Unknown space '${sketch.space}'` });
    if (!reg.hasConstraintKind(c.type)) return Object.assign(out, { status: "error", error: `Unknown kind '${c.type}'` });
    const kind = reg.getConstraintKind(c.type);
    if (!reg.kindSupportsSpace(kind, sketch.space)) return Object.assign(out, { status: "error", error: `'${c.type}' is not available in space '${sketch.space}'` });
    const coords = c.points.map((id) => {
      const p = pointById.get(id);
      return p ? (useSolved && p.solved) || scen?.points?.[p.id] || p.seed : null;
    });
    if (!reg.kindAccepts(kind, coords.length) || coords.some((x) => !x)) {
      return Object.assign(out, { status: "error", error: "Missing point" });
    }
    let comps;
    try {
      comps = components(kind.measure(coords, space, c.params ?? {}, c));
    } catch (e) {
      return Object.assign(out, { status: "error", error: e.message });
    }
    out.measure = comps.length === 1 ? comps[0] : comps;
    const t = c.target ?? kind.defaultTarget ?? { kind: "value", value: 0 };
    out.targetKind = t.kind;
    if (t.kind === "variable" || t.ref != null) {
      const v = varById.get(t.ref);
      if (!v) return Object.assign(out, { status: "error", error: `Unknown variable '${t.ref}'` });
      out.target = useSolved && !v.locked && v.solved != null ? v.solved : scen?.variables?.[v.id] ?? v.value;
    } else if (t.kind === "value" || isInequalityTarget(t.kind)) out.target = Number(t.value ?? 0);
    if (c.enabled === false) return Object.assign(out, { status: "disabled" });
    if (isObjectiveTarget(t.kind)) {
      return Object.assign(out, { status: "objective", measure: comps.length === 1 ? comps[0] : Math.hypot(...comps) });
    }
    const res = comps.map((mm) => residualFor(t.kind, mm, out.target));
    out.residual = res.length === 1 ? res[0] : Math.max(...res.map(Math.abs));
    out.status = statusFor(out.residual);
    return out;
  });
}

/**
 * Re-centre a sketch and align it to its principal axes; seeds and solved
 * positions move together under the same rigid transform. Skipped when two
 * or more points are fixed (the anchors define the frame), when there are no
 * points, or when the space has no `frameTransform`. A single fixed point
 * stays in place and acts as the pivot. Returns true when applied.
 */
export function alignSketchFrame(sketch, reg = defaultRegistry) {
  const space = reg.getSpace(sketch.space);
  if (typeof space.frameTransform !== "function" || sketch.points.length === 0) return false;
  const fixed = sketch.points.filter((p) => p.fixed);
  if (fixed.length > 1) return false;
  const current = sketch.points.map((p) => p.solved ?? p.seed);
  const pivot = fixed.length ? fixed[0].solved ?? fixed[0].seed : null;
  const T = space.frameTransform(current, { pivot });
  for (const p of sketch.points) {
    p.seed = T.apply(p.seed);
    if (p.solved) p.solved = T.apply(p.solved);
  }
  return true;
}