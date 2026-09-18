// Sketch -> PCS script with stable ordering and a source map (id -> line).
import { IDENT_RE, findPoint, findVariable } from '../core/model.js';
import { RESERVED } from './parser.js';

export function fmtNum(n) {
  if (!Number.isFinite(n)) return '0';
  const a = Math.abs(n);
  if (a !== 0 && a < 1e-4) return String(Number(n.toPrecision(6)));
  return String(Math.round(n * 1e6) / 1e6);
}

const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
const tuple = (v) => `(${v.map(fmtNum).join(', ')})`;
const sameTarget = (a, b) =>
  JSON.stringify([a?.kind, a?.value ?? null, a?.ref ?? null]) ===
  JSON.stringify([b?.kind, b?.value ?? null, b?.ref ?? null]);

function identMap(items, field, reservedExtra) {
  const counts = new Map();
  for (const it of items) counts.set(it[field], (counts.get(it[field]) ?? 0) + 1);
  const ids = new Set(items.map((i) => i.id));
  const map = new Map();
  for (const it of items) {
    const name = it[field];
    const ok =
      typeof name === 'string' &&
      IDENT_RE.test(name) &&
      counts.get(name) === 1 &&
      !RESERVED.has(name) &&
      !reservedExtra.has(name) &&
      (!ids.has(name) || name === it.id);
    map.set(it.id, ok ? name : it.id);
  }
  return map;
}

function targetText(c, kind, varIdent) {
  const t = c.target ?? kind?.defaultTarget ?? { kind: 'value', value: 0 };
  if (kind?.defaultTarget && sameTarget(t, kind.defaultTarget)) return '';
  const rhs = t.ref != null ? (varIdent.get(t.ref) ?? t.ref) : fmtNum(t.value ?? 0);
  switch (t.kind) {
    case 'value':
    case 'variable':
      return `= ${rhs}`;
    case 'atLeast':
      return `>= ${rhs}`;
    case 'atMost':
      return `<= ${rhs}`;
    case 'minimize':
      return '-> min';
    case 'maximize':
      return '-> max';
    default:
      return '= 0';
  }
}

/**
 * Emit a sketch as PCS. Returns `{ text, map }` where `map` associates entity
 * ids (and "solver", "view", "scenario:<id>") with 1-based line numbers.
 * Coordinates are written with the space's preferred literal when the space
 * provides `formatLiteral` (colour spaces write `oklch(...)`).
 */
export function emitWithMap(
  sketch,
  { adoptSolution = false, header = true, registry = null } = {}
) {
  const lines = [];
  const map = new Map();
  const add = (text, id) => {
    if (id) map.set(id, lines.length + 1);
    lines.push(text);
  };
  const space =
    registry && registry.hasSpace(sketch.space) ? registry.getSpace(sketch.space) : null;
  const vec = (v) =>
    space && typeof space.formatLiteral === 'function' ? space.formatLiteral(v) : tuple(v);
  const kindNames = new Set(
    registry
      ? registry.constraintKindsFor(sketch.space).map((k) => k.id)
      : sketch.constraints.map((c) => c.type)
  );
  const extraReserved = new Set([
    ...kindNames,
    ...(registry ? [...registry.statements.keys(), ...registry.pointRoles.keys()] : []),
  ]);
  const pointIdent = identMap(sketch.points, 'label', extraReserved);
  const varIdent = identMap(sketch.variables, 'name', extraReserved);
  const kindOf = (type) =>
    registry && registry.hasConstraintKind(type) ? registry.getConstraintKind(type) : null;
  const helpers = { pointIdent, varIdent, vec, tuple, fmtNum, space, kindOf };

  if (header) add(`# Point-CAD sketch (PCS v${sketch.version ?? 1})`);
  add(`space ${sketch.space}`);
  add(`units ${sketch.units.length} ${sketch.units.angle}`);

  // statements registered by extensions (e.g. `gamut srgb`)
  const extLines = [];
  if (registry)
    for (const st of registry.statements.values())
      if (typeof st.emit === 'function') extLines.push(...(st.emit(sketch, helpers) ?? []));
  for (const l of extLines) add(l);

  const vars = sketch.variables.filter((v) => !v.macro);
  if (vars.length) add('');
  for (const v of vars) {
    const value = adoptSolution && v.solved != null ? v.solved : v.value;
    add(
      `var ${varIdent.get(v.id)} = ${fmtNum(value)}${v.locked ? ' locked' : ''}${v.shared ? ' shared' : ''}`,
      v.id
    );
  }

  const points = sketch.points.filter((p) => !p.macro);
  if (points.length) add('');
  for (const p of points) {
    const ident = pointIdent.get(p.id);
    const pos = adoptSolution && p.solved ? p.solved : p.seed;
    const roleDef = p.role && registry ? registry.pointRoles.get(p.role) : null;
    let line = `point ${ident} at ${vec(pos)}`;
    if (p.role) line += ` ${p.role}`;
    if (roleDef ? !!p.fixed !== !!roleDef.fixed : p.fixed) line += p.fixed ? ' fixed' : ' free';
    if (ident !== p.label) line += ` label "${esc(p.label)}"`;
    add(line, p.id);
  }

  const constraints = sketch.constraints.filter((c) => !c.macro);
  if (constraints.length) add('');
  const keyCount = new Map();
  const keyOf = (c) => `${c.type}|${JSON.stringify(c.params ?? {})}|${c.points.join(',')}`;
  for (const c of constraints) keyCount.set(keyOf(c), (keyCount.get(keyOf(c)) ?? 0) + 1);
  for (const c of constraints) {
    const kind = kindOf(c.type);
    const paramNames = kind?.params?.map((p) => p.name) ?? Object.keys(c.params ?? {});
    const parts = [
      c.type,
      ...paramNames.map((k) => String(c.params?.[k] ?? '')).filter(Boolean),
      ...c.points.map((id) => pointIdent.get(id) ?? id),
    ];
    const tt = targetText(c, kind, varIdent);
    if (tt) parts.push(tt);
    let line = parts.join(' ');
    if (c.weight !== undefined && c.weight !== 1) line += ` weight ${fmtNum(c.weight)}`;
    if (c.enabled === false) line += ' disabled';
    if (c.note) line += ` note "${esc(c.note)}"`;
    if (keyCount.get(keyOf(c)) > 1) line += ` id ${c.id}`;
    add(line, c.id);
  }

  for (const def of sketch.macros) {
    add('');
    add(`def ${def.name}(${def.params.join(', ')}) {`, `def:${def.name}`);
    for (const l of String(def.body)
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean))
      add(`  ${l}`);
    add('}');
  }
  if (sketch.macroCalls.length) add('');
  for (const call of sketch.macroCalls) {
    const args = call.args.map((a) => {
      const p = findPoint(sketch, a);
      return p ? pointIdent.get(p.id) : a;
    });
    add(`${call.name} ${args.join(' ')}`, call.id);
  }

  const scenarioWord =
    (registry && [...registry.statements.values()].find((s) => s.scenarioKeyword)?.id) ??
    'scenario';
  for (const s of sketch.scenarios ?? []) {
    add('');
    add(`${scenarioWord} ${s.id} {`, `scenario:${s.id}`);
    for (const [ref, coords] of Object.entries(s.points ?? {})) {
      const p = findPoint(sketch, ref);
      add(`  point ${p ? pointIdent.get(p.id) : ref} at ${vec(coords)}`);
    }
    for (const [ref, value] of Object.entries(s.variables ?? {})) {
      const v = findVariable(sketch, ref);
      add(`  var ${v ? varIdent.get(v.id) : ref} = ${fmtNum(value)}`);
    }
    add('}');
  }

  add('');
  const s = sketch.solver;
  add(
    `solver ${s.method} iterations ${s.maxIterations} tolerance ${s.tolerance} objective ${fmtNum(s.objectiveScale ?? 0.001)} frame ${s.frame ?? 'auto'}`,
    'solver'
  );
  const cam = sketch.view.camera;
  add(
    `view camera ${tuple(cam.position)} target ${tuple(cam.target)} up ${tuple(cam.up)} ${cam.projection} fov ${fmtNum(cam.fov)}`,
    'view'
  );
  const shown = ['seeds', 'labels', 'axes'].filter(
    (f, i) => sketch.view[['showSeeds', 'showLabels', 'showAxes'][i]]
  );
  const hidden = ['seeds', 'labels', 'axes'].filter((f) => !shown.includes(f));
  add(
    `view grid ${sketch.view.grid}${shown.length ? ` show ${shown.join(' ')}` : ''}${hidden.length ? ` hide ${hidden.join(' ')}` : ''}`
  );

  return { text: lines.join('\n') + '\n', map };
}

export function emit(sketch, options) {
  return emitWithMap(sketch, options).text;
}
