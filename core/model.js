// Sketch document: schemas, creation, lookup and editing helpers.
import { arityText } from './registry.js';

export const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
export const TARGET_KINDS = ['value', 'variable', 'minimize', 'maximize', 'atLeast', 'atMost'];

export function cloneDeep(v) {
  return typeof structuredClone === 'function' ? structuredClone(v) : JSON.parse(JSON.stringify(v));
}

export function defaultView() {
  return {
    camera: {
      position: [300, 250, 400],
      target: [50, 40, 20],
      up: [0, 0, 1],
      projection: 'perspective',
      fov: 45,
    },
    grid: 'xy',
    showSeeds: true,
    showLabels: true,
    showAxes: true,
  };
}

export function defaultSolverSettings() {
  return {
    method: 'gauss-newton',
    maxIterations: 200,
    tolerance: 1e-6,
    objectiveScale: 0.001,
    frame: 'auto',
  };
}

/** Build a normalized sketch document from a partial one. */
export function createSketch(partial = {}) {
  const src = cloneDeep(partial ?? {});
  const view = defaultView();
  const sketch = {
    version: 1,
    space: src.space ?? 'euclidean3',
    units: { length: 'mm', angle: 'deg', ...(src.units ?? {}) },
    variables: [],
    points: [],
    constraints: [],
    entities: Array.isArray(src.entities) ? src.entities : [],
    macros: Array.isArray(src.macros) ? src.macros : [],
    macroCalls: Array.isArray(src.macroCalls) ? src.macroCalls : [],
    scenarios: Array.isArray(src.scenarios)
      ? src.scenarios.map((s) => ({
          id: s.id,
          points: { ...(s.points ?? {}) },
          variables: { ...(s.variables ?? {}) },
        }))
      : [],
    extensions: src.extensions && typeof src.extensions === 'object' ? src.extensions : {}, // free-form settings bag for extensions
    solver: { ...defaultSolverSettings(), ...(src.solver ?? {}) },
    view: { ...view, ...(src.view ?? {}), camera: { ...view.camera, ...(src.view?.camera ?? {}) } },
  };
  for (const v of src.variables ?? []) addVariable(sketch, v);
  for (const p of src.points ?? []) addPoint(sketch, p);
  for (const c of src.constraints ?? []) addConstraint(sketch, c);
  return sketch;
}

export function cloneSketch(sketch) {
  return cloneDeep(sketch);
}

// ---- ids & lookup -----------------------------------------------------

function takenNames(sketch) {
  const taken = new Set();
  for (const v of sketch.variables) {
    taken.add(v.id);
    taken.add(v.name);
  }
  for (const p of sketch.points) {
    taken.add(p.id);
    taken.add(p.label);
  }
  for (const c of sketch.constraints) taken.add(c.id);
  for (const e of sketch.entities) taken.add(e.id);
  for (const m of sketch.macroCalls) taken.add(m.id);
  for (const s of sketch.scenarios ?? []) taken.add(s.id);
  return taken;
}

export function nextId(sketch, prefix) {
  const taken = takenNames(sketch);
  let n = 1;
  while (taken.has(prefix + n)) n++;
  return prefix + n;
}

export function uniqueName(sketch, base) {
  const taken = takenNames(sketch);
  if (!taken.has(base)) return base;
  let n = 1;
  while (taken.has(base + n)) n++;
  return base + n;
}

export function findPoint(sketch, ref) {
  return (
    sketch.points.find((p) => p.id === ref) ?? sketch.points.find((p) => p.label === ref) ?? null
  );
}

export function findVariable(sketch, ref) {
  return (
    sketch.variables.find((v) => v.id === ref) ??
    sketch.variables.find((v) => v.name === ref) ??
    null
  );
}

export function findConstraint(sketch, ref) {
  return sketch.constraints.find((c) => c.id === ref) ?? null;
}

export function findMacroCall(sketch, ref) {
  return sketch.macroCalls.find((m) => m.id === ref) ?? null;
}
export function findScenario(sketch, ref) {
  return (sketch.scenarios ?? []).find((s) => s.id === ref) ?? null;
}

export function pointPosition(point) {
  return point.solved ?? point.seed;
}

export function sameCoords(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) > 1e-12) return false;
  return true;
}

// ---- editing ----------------------------------------------------------

export function addVariable(sketch, spec = {}) {
  const id = spec.id ?? nextId(sketch, 'V');
  if (findVariable(sketch, id) && sketch.variables.some((v) => v.id === id))
    throw new Error(`Duplicate variable id '${id}'`);
  const v = {
    id,
    name: spec.name ?? id,
    value: Number.isFinite(spec.value) ? spec.value : 0,
    unit: spec.unit,
    locked: spec.locked ?? false,
  };
  if (spec.solved != null) v.solved = spec.solved;
  if (spec.macro) v.macro = spec.macro;
  if (spec.shared) v.shared = true; // one unknown across all scenarios
  sketch.variables.push(v);
  return v;
}

export function addPoint(sketch, spec = {}) {
  const id = spec.id ?? nextId(sketch, 'P');
  if (sketch.points.some((p) => p.id === id)) throw new Error(`Duplicate point id '${id}'`);
  const p = {
    id,
    label: spec.label ?? id,
    seed: Array.isArray(spec.seed) ? spec.seed.map(Number) : [0, 0, 0],
    fixed: spec.fixed ?? false,
  };
  if (Array.isArray(spec.solved)) p.solved = spec.solved.slice();
  if (spec.macro) p.macro = spec.macro;
  if (spec.role) p.role = spec.role; // registry point role (extension-defined preset)
  if (spec.export === false) p.export = false; // exported unless explicitly hidden
  sketch.points.push(p);
  return p;
}

export function addConstraint(sketch, spec = {}) {
  if (typeof spec.type !== 'string') throw new Error('Constraint needs a type');
  if (!Array.isArray(spec.points))
    throw new Error(`Constraint '${spec.type}' needs a points array`);
  const id = spec.id ?? nextId(sketch, 'C');
  if (sketch.constraints.some((c) => c.id === id))
    throw new Error(`Duplicate constraint id '${id}'`);
  const c = {
    id,
    type: spec.type,
    points: spec.points.slice(),
    target: spec.target ? { ...spec.target } : { kind: 'value', value: 0 },
    weight: Number.isFinite(spec.weight) ? spec.weight : 1,
    enabled: spec.enabled ?? true,
  };
  if (spec.note) c.note = spec.note;
  if (spec.macro) c.macro = spec.macro;
  if (spec.params && Object.keys(spec.params).length) c.params = { ...spec.params };
  sketch.constraints.push(c);
  return c;
}

/** Stable structural identity of a constraint (type + ordered points). */
export function constraintKey(c) {
  return `${c.type}|${c.points.join(',')}`;
}

/**
 * Remove a point, variable, constraint, macro instance or scenario by
 * id/label/name.
 * Removing a point cascades to its constraints; removing a variable freezes
 * dependent targets to its current value. Returns the removed record or null.
 */
export function removeEntity(sketch, ref) {
  const p = findPoint(sketch, ref);
  if (p) {
    sketch.points = sketch.points.filter((x) => x !== p);
    sketch.constraints = sketch.constraints.filter((c) => !c.points.includes(p.id));
    for (const s of sketch.scenarios ?? []) {
      delete s.points?.[p.id];
      delete s.points?.[p.label];
    }
    return { kind: 'point', item: p };
  }
  const v = findVariable(sketch, ref);
  if (v) {
    for (const c of sketch.constraints) {
      if (c.target?.ref !== v.id) continue;
      c.target = { kind: c.target.kind === 'variable' ? 'value' : c.target.kind, value: v.value };
    }
    sketch.variables = sketch.variables.filter((x) => x !== v);
    for (const s of sketch.scenarios ?? []) {
      delete s.variables?.[v.id];
      delete s.variables?.[v.name];
    }
    return { kind: 'variable', item: v };
  }
  const c = findConstraint(sketch, ref);
  if (c) {
    sketch.constraints = sketch.constraints.filter((x) => x !== c);
    return { kind: 'constraint', item: c };
  }
  const m = findMacroCall(sketch, ref);
  if (m) {
    sketch.macroCalls = sketch.macroCalls.filter((x) => x !== m);
    sketch.points = sketch.points.filter((x) => x.macro !== m.id);
    sketch.variables = sketch.variables.filter((x) => x.macro !== m.id);
    sketch.constraints = sketch.constraints.filter((x) => x.macro !== m.id);
    return { kind: 'macroCall', item: m };
  }
  const s = findScenario(sketch, ref);
  if (s) {
    sketch.scenarios = sketch.scenarios.filter((x) => x !== s);
    return { kind: 'scenario', item: s };
  }
  return null;
}
// ---- scenarios --------------------------------------------------------
/**
 * Define (or replace) a scenario: a named set of overrides on point
 * positions (`points[idOrLabel] = coords`) and variable values
 * (`variables[idOrName] = number`) that a stacked solve applies per block.
 */
export function defineScenario(sketch, spec = {}) {
  if (typeof spec.id !== 'string' || !spec.id) throw new Error('Scenario needs an id');
  const record = {
    id: spec.id,
    points: { ...(spec.points ?? {}) },
    variables: { ...(spec.variables ?? {}) },
  };
  if (!Array.isArray(sketch.scenarios)) sketch.scenarios = [];
  const i = sketch.scenarios.findIndex((s) => s.id === spec.id);
  if (i >= 0) sketch.scenarios[i] = record;
  else sketch.scenarios.push(record);
  return record;
}
/** Clone a sketch with a scenario's overrides written into seeds and values. */
export function applyScenario(sketch, scenario) {
  const out = cloneSketch(sketch);
  const s = typeof scenario === 'string' ? findScenario(out, scenario) : scenario;
  if (!s) throw new Error(`Unknown scenario '${scenario}'`);
  for (const [ref, coords] of Object.entries(s.points ?? {})) {
    const p = findPoint(out, ref);
    if (p) {
      p.seed = coords.map(Number);
      delete p.solved;
    }
  }
  for (const [ref, value] of Object.entries(s.variables ?? {})) {
    const v = findVariable(out, ref);
    if (v) {
      v.value = Number(value);
      delete v.solved;
    }
  }
  return out;
}

export function setVariable(sketch, ref, value) {
  const v = findVariable(sketch, ref);
  if (!v) throw new Error(`Unknown variable '${ref}'`);
  v.value = Number(value);
  delete v.solved;
  return v;
}

export function movePoint(sketch, ref, seed) {
  const p = findPoint(sketch, ref);
  if (!p) throw new Error(`Unknown point '${ref}'`);
  p.seed = seed.map(Number);
  delete p.solved;
  return p;
}

/** Discard the solution; points fall back to their seeds. */
export function resetSolution(sketch) {
  for (const p of sketch.points) delete p.solved;
  for (const v of sketch.variables) delete v.solved;
  return sketch;
}

/** Copy solved positions / values into seeds / values. */
export function adoptSolution(sketch) {
  for (const p of sketch.points) {
    if (p.solved) p.seed = p.solved.slice();
    delete p.solved;
  }
  for (const v of sketch.variables) {
    if (v.solved != null) v.value = v.solved;
    delete v.solved;
  }
  return sketch;
}

// ---- validation -------------------------------------------------------

export function validateSketch(sketch, registry) {
  const errors = [];
  const err = (path, message) => errors.push({ path, message });
  if (!registry.hasSpace(sketch.space)) err('space', `Unknown space '${sketch.space}'`);
  const dim = registry.hasSpace(sketch.space) ? registry.getSpace(sketch.space).dim : null;

  const ids = new Set();
  const dup = (id, path) => {
    if (ids.has(id)) err(path, `Duplicate id '${id}'`);
    ids.add(id);
  };
  sketch.variables.forEach((v, i) => {
    dup(v.id, `variables[${i}]`);
    if (!Number.isFinite(v.value)) err(`variables[${i}].value`, 'Value must be a finite number');
  });
  sketch.points.forEach((p, i) => {
    dup(p.id, `points[${i}]`);
    if (!Array.isArray(p.seed) || (dim && p.seed.length !== dim))
      err(`points[${i}].seed`, `Seed must have ${dim} coordinates`);
    else if (p.seed.some((x) => !Number.isFinite(x)))
      err(`points[${i}].seed`, 'Seed coordinates must be finite');
  });
  sketch.constraints.forEach((c, i) => {
    dup(c.id, `constraints[${i}]`);
    if (!registry.hasConstraintKind(c.type))
      return err(`constraints[${i}].type`, `Unknown constraint kind '${c.type}'`);
    const kind = registry.getConstraintKind(c.type);
    if (!registry.kindSupportsSpace(kind, sketch.space))
      err(`constraints[${i}].type`, `'${c.type}' is not available in space '${sketch.space}'`);
    if (!registry.kindAccepts(kind, c.points.length))
      err(`constraints[${i}].points`, `'${c.type}' needs ${arityText(kind)} points`);
    for (const id of c.points)
      if (!sketch.points.some((p) => p.id === id))
        err(`constraints[${i}].points`, `Unknown point '${id}'`);
    for (const prm of kind.params ?? []) {
      if (c.params?.[prm.name] === undefined)
        err(`constraints[${i}].params`, `'${c.type}' needs parameter '${prm.name}'`);
      else if (Array.isArray(prm.values) && !prm.values.includes(c.params[prm.name]))
        err(`constraints[${i}].params`, `'${prm.name}' must be one of ${prm.values.join(', ')}`);
    }
    const t = c.target ?? kind.defaultTarget ?? { kind: 'value', value: 0 };
    if (!TARGET_KINDS.includes(t.kind))
      err(`constraints[${i}].target`, `Unknown target kind '${t.kind}'`);
    if ((t.kind === 'variable' || t.ref != null) && !sketch.variables.some((v) => v.id === t.ref))
      err(`constraints[${i}].target`, `Unknown variable '${t.ref}'`);
  });
  (sketch.scenarios ?? []).forEach((s, i) => {
    if (typeof s.id !== 'string' || !IDENT_RE.test(s.id))
      err(`scenarios[${i}].id`, 'Scenario id must be an identifier');
    for (const [ref, coords] of Object.entries(s.points ?? {})) {
      if (!findPoint(sketch, ref)) err(`scenarios[${i}].points`, `Unknown point '${ref}'`);
      if (!Array.isArray(coords) || (dim && coords.length !== dim))
        err(`scenarios[${i}].points.${ref}`, `Override must have ${dim} coordinates`);
    }
    for (const [ref, value] of Object.entries(s.variables ?? {})) {
      if (!findVariable(sketch, ref)) err(`scenarios[${i}].variables`, `Unknown variable '${ref}'`);
      if (!Number.isFinite(Number(value)))
        err(`scenarios[${i}].variables.${ref}`, 'Value must be a finite number');
    }
  });
  return errors;
}

// ---- built-in entity kind ---------------------------------------------

export const pointEntityKind = {
  id: 'point',
  schema: { id: 'string', label: 'string', seed: 'number[dim]', fixed: 'boolean' },
  unknowns(entity, space) {
    return entity.fixed
      ? []
      : Array.from({ length: space.dim }, (_, k) => ({ entity: entity.id, index: k }));
  },
};
