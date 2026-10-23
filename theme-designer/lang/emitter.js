// Sketch -> PCS script with stable ordering and a source map (id -> line).
import {findPoint, findVariable, IDENT_RE} from '../core/model.js';
import {RESERVED} from './parser.js';

export function fmtNum(n) {
    if (typeof n !== 'number' || !Number.isFinite(n)) {
        if (n !== undefined && n !== null) {
            console.warn('fmtNum: non-finite or non-numeric value received:', n);
        }
        return '0';
    }
    const a = Math.abs(n);
    if (a !== 0 && a < 1e-4) return String(Number(n.toPrecision(6)));
    return String(Math.round(n * 1e6) / 1e6);
}

const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
const tuple = (v) => {
    if (!Array.isArray(v)) {
        console.warn('tuple: expected an array of numbers, received:', v);
        return '()';
    }
    return `(${v.map(fmtNum).join(', ')})`;
};
const sameTarget = (a, b) =>
    JSON.stringify([a?.kind, a?.value ?? null, a?.ref ?? null]) ===
    JSON.stringify([b?.kind, b?.value ?? null, b?.ref ?? null]);

function identMap(items, field, reservedExtra) {
    if (!Array.isArray(items)) {
        console.warn('identMap: items is not an array:', items);
        return new Map();
    }
    const counts = new Map();
    for (const it of items) {
        if (it && it[field] !== undefined) counts.set(it[field], (counts.get(it[field]) ?? 0) + 1);
    }
    const ids = new Set(items.map((i) => i?.id).filter(Boolean));
    const map = new Map();
    for (const it of items) {
        if (!it || !it.id) continue;
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
    const t = c.target ?? kind?.defaultTarget ?? {kind: 'value', value: 0};
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
            console.warn(`targetText: unknown target kind '${t.kind}', falling back to '= 0'`);
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
    {adoptSolution = false, header = true, registry = null} = {}
) {
    if (!sketch || typeof sketch !== 'object') {
        console.error('emitWithMap: invalid sketch object provided:', sketch);
        throw new TypeError('Invalid sketch: expected an object');
    }
    const lines = [];
    const map = new Map();
    const add = (text, id) => {
        if (id) map.set(id, lines.length + 1);
        lines.push(text);
    };
    const spaceName = sketch.space ?? '2d';
    const space =
        registry && registry.hasSpace(spaceName) ? registry.getSpace(spaceName) : null;
    const vec = (v) => {
        if (!v) {
            console.warn('emitWithMap: invalid coordinate vector encountered:', v);
            return tuple([0, 0]);
        }
        if (space && typeof space.formatLiteral === 'function') {
            try {
                return space.formatLiteral(v);
            } catch (err) {
                console.error('emitWithMap: space.formatLiteral failed:', err);
                return tuple(v);
            }
        }
        return tuple(v);
    };
    let kindNamesList = [];
    if (registry && typeof registry.constraintKindsFor === 'function') {
        try {
            kindNamesList = registry.constraintKindsFor(spaceName).map((k) => k.id);
        } catch (err) {
            console.error(`emitWithMap: error retrieving constraint kinds for space '${spaceName}':`, err);
        }
    } else {
        kindNamesList = (sketch.constraints ?? []).map((c) => c.type);
    }
    const kindNames = new Set(kindNamesList);
    const extraReserved = new Set([
        ...kindNames,
        ...(registry?.statements ? [...registry.statements.keys()] : []),
        ...(registry?.pointRoles ? [...registry.pointRoles.keys()] : []),
    ]);
    const pointsList = Array.isArray(sketch.points) ? sketch.points : [];
    const varsList = Array.isArray(sketch.variables) ? sketch.variables : [];
    const constraintsList = Array.isArray(sketch.constraints) ? sketch.constraints : [];
    const macrosList = Array.isArray(sketch.macros) ? sketch.macros : [];
    const macroCallsList = Array.isArray(sketch.macroCalls) ? sketch.macroCalls : [];
    const scenariosList = Array.isArray(sketch.scenarios) ? sketch.scenarios : [];
    const pointIdent = identMap(pointsList, 'label', extraReserved);
    const varIdent = identMap(varsList, 'name', extraReserved);
    const kindOf = (type) =>
        registry && typeof registry.hasConstraintKind === 'function' && registry.hasConstraintKind(type)
            ? registry.getConstraintKind(type)
            : null;
    const helpers = {pointIdent, varIdent, vec, tuple, fmtNum, space, kindOf};

    if (header) add(`# Point-CAD sketch (PCS v${sketch.version ?? 1})`);
    add(`space ${spaceName}`);
    add(`units ${sketch.units?.length ?? 'mm'} ${sketch.units?.angle ?? 'deg'}`);

    // statements registered by extensions (e.g. `gamut srgb`)
    const extLines = [];
    if (registry && registry.statements) {
        for (const st of registry.statements.values()) {
            if (typeof st.emit === 'function') {
                try {
                    const emitted = st.emit(sketch, helpers);
                    if (Array.isArray(emitted)) extLines.push(...emitted);
                } catch (err) {
                    console.error(`emitWithMap: error emitting statement '${st.id ?? 'unknown'}':`, err);
                }
            }
        }
    }
    for (const l of extLines) add(l);

    const vars = varsList.filter((v) => !v.macro);
    if (vars.length) add('');
    for (const v of vars) {
        const value = adoptSolution && v.solved != null ? v.solved : v.value;
        add(
            `var ${varIdent.get(v.id) ?? v.id} = ${fmtNum(value)}${v.locked ? ' locked' : ''}${v.shared ? ' shared' : ''}`,
            v.id
        );
    }

    const points = pointsList.filter((p) => !p.macro);
    if (points.length) add('');
    for (const p of points) {
        const ident = pointIdent.get(p.id) ?? p.id;
        const pos = adoptSolution && p.solved ? p.solved : p.seed;
        const roleDef = p.role && registry?.pointRoles ? registry.pointRoles.get(p.role) : null;
        let line = `point ${ident} at ${vec(pos)}`;
        if (p.role) line += ` ${p.role}`;
        if (roleDef ? !!p.fixed !== !!roleDef.fixed : p.fixed) line += p.fixed ? ' fixed' : ' free';
        if (p.label != null && p.label !== '' && ident !== p.label) line += ` label "${esc(p.label)}"`;
        add(line, p.id);
    }

    const constraints = constraintsList.filter((c) => !c.macro);
    if (constraints.length) add('');
    const keyCount = new Map();
    const keyOf = (c) => `${c.type}|${JSON.stringify(c.params ?? {})}|${(c.points ?? []).join(',')}`;
    for (const c of constraints) keyCount.set(keyOf(c), (keyCount.get(keyOf(c)) ?? 0) + 1);
    for (const c of constraints) {
        const kind = kindOf(c.type);
        const paramNames = kind?.params?.map((p) => p.name) ?? Object.keys(c.params ?? {});
        const parts = [
            c.type,
            ...paramNames.map((k) => String(c.params?.[k] ?? '')).filter(Boolean),
            ...(c.points ?? []).map((id) => pointIdent.get(id) ?? id),
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

    for (const def of macrosList) {
        add('');
        add(`def ${def.name}(${(def.params ?? []).join(', ')}) {`, `def:${def.name}`);
        for (const l of String(def.body)
            .split('\n')
            .map((s) => s.trim())
            .filter(Boolean))
            add(`  ${l}`);
        add('}');
    }
    if (macroCallsList.length) add('');
    for (const call of macroCallsList) {
        const args = (call.args ?? []).map((a) => {
            const p = findPoint(sketch, a);
            return p ? pointIdent.get(p.id) : a;
        });
        add(`${call.name} ${args.join(' ')}`, call.id);
    }

    const scenarioWord =
        (registry?.statements && [...registry.statements.values()].find((s) => s.scenarioKeyword)?.id) ??
        'scenario';
    for (const s of scenariosList) {
        add('');
        add(`${scenarioWord} ${s.id} {`, `scenario:${s.id}`);
        for (const [ref, coords] of Object.entries(s.points ?? {})) {
            const p = findPoint(sketch, ref);
            if (!p) {
                console.warn(`emitWithMap: scenario '${s.id}' references unknown point '${ref}'`);
            }
            add(`  point ${p ? pointIdent.get(p.id) : ref} at ${vec(coords)}`);
        }
        for (const [ref, value] of Object.entries(s.variables ?? {})) {
            const v = findVariable(sketch, ref);
            if (!v) {
                console.warn(`emitWithMap: scenario '${s.id}' references unknown variable '${ref}'`);
            }
            add(`  var ${v ? varIdent.get(v.id) : ref} = ${fmtNum(value)}`);
        }
        add('}');
    }

    add('');
    const s = sketch.solver ?? {};
    add(
        `solver ${s.method ?? 'lm'} iterations ${s.maxIterations ?? 50} tolerance ${s.tolerance ?? 1e-6} objective ${fmtNum(s.objectiveScale ?? 0.001)} frame ${s.frame ?? 'auto'}`,
        'solver'
    );
    const view = sketch.view ?? {};
    const cam = view.camera ?? {};
    add(
        `view camera ${tuple(cam.position ?? [0, 0, 100])} target ${tuple(cam.target ?? [0, 0, 0])} up ${tuple(cam.up ?? [0, 1, 0])} ${cam.projection ?? 'perspective'} fov ${fmtNum(cam.fov ?? 45)}`,
        'view'
    );
    const shown = ['seeds', 'labels', 'axes'].filter(
        (f, i) => Boolean(view[['showSeeds', 'showLabels', 'showAxes'][i]])
    );
    const hidden = ['seeds', 'labels', 'axes'].filter((f) => !shown.includes(f));
    add(
        `view grid ${view.grid ?? 'on'}${shown.length ? ` show ${shown.join(' ')}` : ''}${hidden.length ? ` hide ${hidden.join(' ')}` : ''}`
    );

    return {text: lines.join('\n') + '\n', map};
}

export function emit(sketch, options) {
    try {
        return emitWithMap(sketch, options).text;
    } catch (err) {
        console.error('emit: failed to emit PCS script from sketch:', err);
        throw err;
    }
}