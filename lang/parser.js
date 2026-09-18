// PCS parser: statements -> model operations on a working copy of a sketch.
// Constraint kinds and extra statements are looked up in the registry, so
// extensions extend the grammar by registering a kind or a statement.
import { tokenize, PcsError } from './lexer.js';
import * as M from '../core/model.js';
import { registry as defaultRegistry, arityRange, arityText } from '../core/registry.js';
import { applyCommand, COMMANDS } from './commands.js';
import { findMacro, defineMacro, nextMacroInstance, expandMacroTokens } from './macros.js';

export const STATEMENT_WORDS = new Set([
  'space',
  'units',
  'var',
  'point',
  'def',
  'scenario',
  'solver',
  'view',
  ...COMMANDS,
]);
export const RESERVED = new Set([
  ...STATEMENT_WORDS,
  'at',
  'fixed',
  'free',
  'locked',
  'shared',
  'label',
  'id',
  'weight',
  'note',
  'disabled',
  'enabled',
  'min',
  'max',
  'minimize',
  'maximize',
  'to',
  'scenarios',
  'camera',
  'target',
  'up',
  'perspective',
  'orthographic',
  'fov',
  'grid',
  'show',
  'hide',
  'iterations',
  'tolerance',
  'objective',
  'method',
  'frame',
]);
const META_WORDS = new Set(['weight', 'note', 'disabled', 'enabled', 'id']);

const describe = (tok) =>
  tok.type === 'eof'
    ? 'end of input'
    : tok.type === 'newline'
      ? 'end of line'
      : tok.type === 'string'
        ? `"${tok.value}"`
        : `'${tok.value}'`;

const sameJSON = (a, b) => JSON.stringify(a ?? {}) === JSON.stringify(b ?? {});

/**
 * Parse PCS text against a sketch. The sketch is cloned first; the caller
 * decides whether to adopt the result (typically only when `ok`).
 */
export function parse(text, options = {}) {
  const reg = options.registry ?? defaultRegistry;
  const sketch = M.cloneSketch(options.sketch ?? M.createSketch());
  const ctx = {
    text,
    sketch,
    registry: reg,
    errors: [],
    ops: [],
    commands: [],
    macroInstance: null,
    depth: 0,
  };
  new Parser(tokenize(text), ctx).parseAll();
  return {
    sketch,
    errors: ctx.errors,
    ops: ctx.ops,
    commands: ctx.commands,
    ok: ctx.errors.length === 0,
  };
}

export class Parser {
  constructor(tokens, ctx) {
    this.t = tokens;
    this.i = 0;
    this.ctx = ctx;
  }

  // ---- token helpers ---------------------------------------------------
  peek(o = 0) {
    return this.t[Math.min(this.i + o, this.t.length - 1)];
  }
  next() {
    const tok = this.t[this.i];
    if (tok.type !== 'eof') this.i++;
    return tok;
  }
  is(type, value) {
    const p = this.peek();
    return p.type === type && (value === undefined || p.value === value);
  }
  isIdent(v) {
    return this.is('ident', v);
  }
  accept(type, value) {
    return this.is(type, value) ? this.next() : null;
  }
  acceptIdent(v) {
    return this.accept('ident', v);
  }
  expect(type, value, what) {
    if (this.is(type, value)) return this.next();
    throw this.error(
      `Expected ${what ?? (value !== undefined ? `'${value}'` : type)}, got ${describe(this.peek())}`
    );
  }
  error(msg, tok = this.peek()) {
    return new PcsError(msg, tok.line, tok.col);
  }
  skipNewlines() {
    while (this.accept('newline'));
  }
  skipLine() {
    while (!this.is('newline') && !this.is('eof')) this.next();
  }
  /** Skip to the `}` closing a block whose `{` has already been consumed. */
  skipBlock(depth = 1) {
    while (!this.is('eof')) {
      const tk = this.next();
      if (tk.type === 'punct' && tk.value === '{') depth++;
      else if (tk.type === 'punct' && tk.value === '}' && --depth === 0) return;
    }
  }
  atEnd() {
    return this.is('newline') || this.is('eof');
  }
  space() {
    const reg = this.ctx.registry;
    const id = this.ctx.sketch.space;
    return reg.hasSpace(id) ? reg.getSpace(id) : null;
  }

  // ---- driver ----------------------------------------------------------
  parseAll() {
    for (;;) {
      this.skipNewlines();
      if (this.is('eof')) break;
      const start = this.peek();
      try {
        this.parseStatement();
      } catch (e) {
        if (!(e instanceof PcsError)) {
          if (e instanceof Error) e = new PcsError(e.message, start.line, start.col);
          else throw e;
        }
        const prefix = this.ctx.macroInstance ? `in macro ${this.ctx.macroInstance}: ` : '';
        this.ctx.errors.push({
          message: prefix + e.message,
          line: e.line ?? start.line,
          col: e.col ?? start.col,
        });
        this.skipLine();
      }
    }
  }

  parseStatement() {
    const tok = this.peek();
    if (tok.type === 'error') throw this.error(tok.value);
    if (tok.type !== 'ident') throw this.error(`Unexpected ${describe(tok)}`);
    const w = tok.value;
    switch (w) {
      case 'space':
        return this.parseSpace();
      case 'units':
        return this.parseUnits();
      case 'var':
        return this.parseVar();
      case 'point':
        return this.parsePoint();
      case 'def':
        return this.parseDef();
      case 'scenario':
        return this.parseScenario();
      case 'solver':
        return this.parseSolver();
      case 'view':
        return this.parseView();
      case 'solve':
      case 'reset':
      case 'adopt':
      case 'center':
      case 'delete':
      case 'set':
      case 'move':
        return this.parseCommand();
      default:
        break;
    }
    const reg = this.ctx.registry;
    if (reg.hasStatement(w)) return reg.getStatement(w).parse(this, this.ctx);
    if (reg.hasConstraintKind(w)) return this.parseConstraint();
    if (findMacro(this.ctx.sketch, w)) return this.parseMacroCall();
    throw this.error(`Unknown statement '${w}'`);
  }

  // ---- expressions (seed / scalar) ------------------------------------
  parseExpr() {
    let v = this.parseTerm();
    while (this.is('punct', '+') || this.is('punct', '-')) {
      const op = this.next().value;
      v = this.applyOp(op, v, this.parseTerm());
    }
    return v;
  }
  parseTerm() {
    let v = this.parseUnary();
    while (this.is('punct', '*') || this.is('punct', '/')) {
      const op = this.next().value;
      v = this.applyOp(op, v, this.parseUnary());
    }
    return v;
  }
  parseUnary() {
    if (this.accept('punct', '-')) {
      const v = this.parseUnary();
      return Array.isArray(v) ? v.map((x) => -x) : -v;
    }
    if (this.accept('punct', '+')) return this.parseUnary();
    return this.parsePrimary();
  }
  parsePrimary() {
    const tok = this.peek();
    if (tok.type === 'number') {
      this.next();
      return Number(tok.value);
    }
    if (tok.type === 'hex') {
      this.next();
      return this.literal('hex', [tok.value], tok);
    }
    if (tok.type === 'punct' && tok.value === '(') {
      this.next();
      const first = this.parseExpr();
      if (this.accept('punct', ',')) {
        const comps = [first, this.parseExpr()];
        while (this.accept('punct', ',')) comps.push(this.parseExpr());
        this.expect('punct', ')');
        if (comps.some((c) => typeof c !== 'number'))
          throw this.error('Vector components must be numbers', tok);
        return comps;
      }
      this.expect('punct', ')');
      return first;
    }
    if (tok.type === 'ident') {
      const fns = this.space()?.literalFunctions;
      if (
        Array.isArray(fns) &&
        fns.includes(tok.value) &&
        this.peek(1).type === 'punct' &&
        this.peek(1).value === '('
      ) {
        return this.parseLiteralCall();
      }
      const p = M.findPoint(this.ctx.sketch, tok.value);
      if (p) {
        this.next();
        return p.seed.slice();
      }
      const v = M.findVariable(this.ctx.sketch, tok.value);
      if (v) {
        this.next();
        return v.value;
      }
      throw this.error(`Unknown identifier '${tok.value}'`);
    }
    throw this.error(`Expected an expression, got ${describe(tok)}`);
  }
  /**
   * Space-provided literal such as `oklch(70% 0.14 262)` or `rgb(59 91 219)`.
   * Components may be separated by spaces or commas and carry a `%`; an
   * optional `/ alpha` tail is accepted and ignored.
   */
  parseLiteralCall() {
    const nameTok = this.next();
    this.expect('punct', '(');
    const args = [];
    let alpha = false;
    while (!this.is('punct', ')')) {
      if (this.atEnd()) throw this.error(`Unterminated ${nameTok.value}(...) literal`, nameTok);
      if (this.accept('punct', ',')) continue;
      if (this.accept('punct', '/')) {
        alpha = true;
        continue;
      }
      let sign = 1;
      if (this.accept('punct', '-')) sign = -1;
      else this.accept('punct', '+');
      const numTok = this.expect('number', undefined, `${nameTok.value}() component`);
      const percent = !!this.accept('punct', '%');
      if (!alpha) args.push({ value: sign * Number(numTok.value), percent });
    }
    this.expect('punct', ')');
    return this.literal(nameTok.value, args, nameTok);
  }
  literal(name, args, tok) {
    const space = this.space();
    if (typeof space?.parseLiteral !== 'function')
      throw this.error(`Space '${this.ctx.sketch.space}' has no ${name} literals`, tok);
    let coords;
    try {
      coords = space.parseLiteral(name, args);
    } catch (e) {
      throw this.error(e.message, tok);
    }
    if (!Array.isArray(coords)) throw this.error(`Invalid ${name} literal`, tok);
    return coords;
  }
  applyOp(op, a, b) {
    const na = typeof a === 'number';
    const nb = typeof b === 'number';
    if (na && nb) return op === '+' ? a + b : op === '-' ? a - b : op === '*' ? a * b : a / b;
    if (!na && !nb && (op === '+' || op === '-')) {
      if (a.length !== b.length) throw this.error('Vector dimension mismatch');
      return a.map((x, i) => (op === '+' ? x + b[i] : x - b[i]));
    }
    if (!na && nb && (op === '*' || op === '/')) return a.map((x) => (op === '*' ? x * b : x / b));
    if (na && !nb && op === '*') return b.map((x) => x * a);
    throw this.error(
      `Cannot apply '${op}' to ${na ? 'number' : 'vector'} and ${nb ? 'number' : 'vector'}`
    );
  }
  parseNumber(what) {
    const tok = this.peek();
    const v = this.parseExpr();
    if (typeof v !== 'number' || !Number.isFinite(v))
      throw this.error(`Expected a number for ${what}`, tok);
    return v;
  }
  parseVector(what, dim) {
    const tok = this.peek();
    const v = this.parseExpr();
    if (!Array.isArray(v) || v.length !== dim)
      throw this.error(`Expected a ${dim}-component vector for ${what}`, tok);
    return v;
  }
  parseName(what) {
    const tok = this.expect('ident', undefined, what);
    const reg = this.ctx.registry;
    const kindReserved =
      reg.hasConstraintKind(tok.value) &&
      reg.kindSupportsSpace(reg.getConstraintKind(tok.value), this.ctx.sketch.space);
    if (
      RESERVED.has(tok.value) ||
      kindReserved ||
      reg.hasStatement(tok.value) ||
      reg.pointRoles.has(tok.value)
    ) {
      throw this.error(`'${tok.value}' is a reserved word and cannot be used as a ${what}`, tok);
    }
    return tok;
  }

  // ---- statements ------------------------------------------------------
  parseSpace() {
    this.next();
    const tok = this.expect('ident', undefined, 'space id');
    if (!this.ctx.registry.hasSpace(tok.value))
      throw this.error(`Unknown space '${tok.value}'`, tok);
    this.ctx.sketch.space = tok.value;
    this.ctx.ops.push({ op: 'space', id: tok.value });
  }

  parseUnits() {
    this.next();
    const len = this.expect('ident', undefined, 'length unit').value;
    const ang = this.expect('ident', undefined, 'angle unit').value;
    this.ctx.sketch.units = { length: len, angle: ang };
    this.ctx.ops.push({ op: 'units', length: len, angle: ang });
  }

  parseVar() {
    this.next();
    const sk = this.ctx.sketch;
    do {
      const nameTok = this.parseName('variable name');
      let value = null;
      let locked = null;
      let shared = null;
      let explicitId = null;
      if (this.accept('punct', '=')) value = this.parseNumber('variable value');
      for (;;) {
        if (this.acceptIdent('locked')) locked = true;
        else if (this.acceptIdent('free')) locked = false;
        else if (this.acceptIdent('shared')) shared = true;
        else if (this.acceptIdent('id')) explicitId = this.expect('ident', undefined, 'id').value;
        else break;
      }
      const existing =
        (explicitId && sk.variables.find((v) => v.id === explicitId)) ||
        M.findVariable(sk, nameTok.value);
      if (existing) {
        if (value !== null && existing.value !== value) {
          existing.value = value;
          delete existing.solved;
        }
        if (locked !== null) existing.locked = locked;
        if (shared !== null) existing.shared = shared;
        existing.name = nameTok.value;
        this.ctx.ops.push({ op: 'var', id: existing.id, created: false });
      } else {
        const v = M.addVariable(sk, {
          id: explicitId ?? undefined,
          name: nameTok.value,
          value: value ?? 0,
          locked: locked ?? false,
          shared: shared ?? false,
          macro: this.ctx.macroInstance ?? undefined,
        });
        this.ctx.ops.push({ op: 'var', id: v.id, created: true });
      }
    } while (this.accept('punct', ','));
  }

  parsePoint() {
    this.next();
    const sk = this.ctx.sketch;
    const reg = this.ctx.registry;
    const dim = reg.getSpace(sk.space).dim;
    const nameTok = this.parseName('point name');
    this.expect('ident', 'at', "'at'");
    const seed = this.parseVector('point seed', dim);
    let fixed = null;
    let label = null;
    let explicitId = null;
    let role = null;
    for (;;) {
      if (this.acceptIdent('fixed')) fixed = true;
      else if (this.acceptIdent('free')) fixed = false;
      else if (this.acceptIdent('label'))
        label = this.expect('string', undefined, 'label string').value;
      else if (this.acceptIdent('id')) explicitId = this.expect('ident', undefined, 'id').value;
      else if (this.is('ident') && reg.pointRoles.has(this.peek().value)) role = this.next().value;
      else break;
    }
    const roleDef = role ? reg.pointRoles.get(role) : null;
    const existing =
      (explicitId && sk.points.find((p) => p.id === explicitId)) || M.findPoint(sk, nameTok.value);
    if (existing) {
      if (!M.sameCoords(existing.seed, seed)) {
        existing.seed = seed;
        delete existing.solved;
      }
      if (roleDef) {
        existing.role = role;
        if (roleDef.export === false) existing.export = false;
        else delete existing.export;
      }
      if (fixed !== null) existing.fixed = fixed;
      else if (roleDef) existing.fixed = !!roleDef.fixed;
      if (label !== null) existing.label = label;
      else if (existing.id !== nameTok.value) existing.label = nameTok.value;
      this.ctx.ops.push({ op: 'point', id: existing.id, created: false });
    } else {
      let id = explicitId ?? undefined;
      if (!id && label !== null && !sk.points.some((p) => p.id === nameTok.value))
        id = nameTok.value;
      const p = M.addPoint(sk, {
        id,
        label: label ?? nameTok.value,
        seed,
        fixed: fixed ?? roleDef?.fixed ?? false,
        role: role ?? undefined,
        export: roleDef ? roleDef.export !== false : undefined,
        macro: this.ctx.macroInstance ?? undefined,
      });
      this.ctx.ops.push({ op: 'point', id: p.id, created: true });
    }
  }

  /**
   * `KIND params… points… target meta…`. Points beyond the kind's minimum
   * are consumed while the next word is a point (variadic kinds); the
   * target may be `=`, `>=`, `<=` (number or variable) or `->` min/max, and
   * may be omitted when the kind declares a `defaultTarget`.
   */
  parseConstraint() {
    const sk = this.ctx.sketch;
    const reg = this.ctx.registry;
    const kindTok = this.next();
    const kind = reg.getConstraintKind(kindTok.value);
    if (!reg.kindSupportsSpace(kind, sk.space)) {
      const why = kind.requires?.length ? ` (needs ${kind.requires.join(', ')})` : '';
      throw this.error(`'${kind.id}' is not available in space '${sk.space}'${why}`, kindTok);
    }
    const params = {};
    for (const prm of kind.params ?? []) {
      if (prm.type === 'number') params[prm.name] = this.parseNumber(prm.name);
      else {
        const t = this.expect('ident', undefined, `${prm.name} (${kind.syntax})`);
        if (Array.isArray(prm.values) && !prm.values.includes(t.value)) {
          throw this.error(
            `Expected one of ${prm.values.join(', ')} for ${prm.name}, got '${t.value}'`,
            t
          );
        }
        params[prm.name] = t.value;
      }
    }
    const range = arityRange(kind);
    const points = [];
    while (points.length < range.max) {
      if (points.length >= range.min && (!this.is('ident') || META_WORDS.has(this.peek().value)))
        break;
      const tok = this.expect(
        'ident',
        undefined,
        `point ${points.length + 1} of ${arityText(kind)} (${kind.syntax})`
      );
      const p = M.findPoint(sk, tok.value);
      if (!p) throw this.error(`Unknown point '${tok.value}'`, tok);
      points.push(p.id);
    }
    const bound = (targetKind) => {
      if (this.is('ident')) {
        const tok = this.next();
        const v = M.findVariable(sk, tok.value);
        if (!v) throw this.error(`Unknown variable '${tok.value}'`, tok);
        return { kind: targetKind === 'value' ? 'variable' : targetKind, ref: v.id };
      }
      return { kind: targetKind, value: this.parseNumber('target value') };
    };
    let target;
    if (this.accept('punct', '=')) target = bound('value');
    else if (this.accept('punct', '>=')) target = bound('atLeast');
    else if (this.accept('punct', '<=')) target = bound('atMost');
    else if (this.accept('punct', '->')) {
      const tok = this.expect('ident', undefined, "'min' or 'max'");
      if (tok.value === 'min' || tok.value === 'minimize') target = { kind: 'minimize' };
      else if (tok.value === 'max' || tok.value === 'maximize') target = { kind: 'maximize' };
      else throw this.error(`Expected 'min' or 'max', got ${describe(tok)}`, tok);
    } else if (kind.defaultTarget) target = { ...kind.defaultTarget };
    else
      throw this.error(
        `Expected '=', '>=', '<=' or '->' after ${kind.id} points, got ${describe(this.peek())}`
      );

    const meta = { weight: null, note: null, enabled: null, id: null };
    for (;;) {
      if (this.acceptIdent('weight')) meta.weight = this.parseNumber('weight');
      else if (this.acceptIdent('note'))
        meta.note = this.expect('string', undefined, 'note string').value;
      else if (this.acceptIdent('disabled')) meta.enabled = false;
      else if (this.acceptIdent('enabled')) meta.enabled = true;
      else if (this.acceptIdent('id')) meta.id = this.expect('ident', undefined, 'id').value;
      else break;
    }
    const existing = meta.id
      ? M.findConstraint(sk, meta.id)
      : sk.constraints.find(
          (c) =>
            c.type === kind.id &&
            c.points.length === points.length &&
            c.points.every((id, i) => id === points[i]) &&
            sameJSON(c.params, params)
        );
    if (existing) {
      existing.type = kind.id;
      existing.points = points;
      existing.target = target;
      if (Object.keys(params).length) existing.params = params;
      else delete existing.params;
      if (meta.weight !== null) existing.weight = meta.weight;
      if (meta.enabled !== null) existing.enabled = meta.enabled;
      if (meta.note !== null) existing.note = meta.note;
      this.ctx.ops.push({ op: 'constraint', id: existing.id, created: false });
    } else {
      const c = M.addConstraint(sk, {
        id: meta.id ?? undefined,
        type: kind.id,
        points,
        params,
        target,
        weight: meta.weight ?? 1,
        enabled: meta.enabled ?? true,
        note: meta.note ?? undefined,
        macro: this.ctx.macroInstance ?? undefined,
      });
      this.ctx.ops.push({ op: 'constraint', id: c.id, created: true });
    }
  }

  parseDef() {
    const defTok = this.next();
    if (this.ctx.macroInstance)
      throw this.error('Nested macro definitions are not allowed', defTok);
    const name = this.parseName('macro name').value;
    this.expect('punct', '(');
    const params = [];
    if (!this.is('punct', ')')) {
      do params.push(this.parseName('parameter name').value);
      while (this.accept('punct', ','));
    }
    this.expect('punct', ')');
    this.skipNewlines();
    const open = this.expect('punct', '{');
    const bodyStart = open.end;
    let depth = 1;
    let close = null;
    for (;;) {
      const tk = this.next();
      if (tk.type === 'eof') throw this.error(`Unterminated macro '${name}': missing '}'`, defTok);
      if (tk.type === 'punct' && tk.value === '{') depth++;
      if (tk.type === 'punct' && tk.value === '}' && --depth === 0) {
        close = tk;
        break;
      }
    }
    const body = this.ctx.text ? this.ctx.text.slice(bodyStart, close.start) : '';
    defineMacro(this.ctx.sketch, { name, params, body });
    this.ctx.ops.push({ op: 'def', id: name });
  }

  parseMacroCall() {
    const sk = this.ctx.sketch;
    const nameTok = this.next();
    const def = findMacro(sk, nameTok.value);
    if (this.ctx.depth > 16) throw this.error('Macro expansion too deep', nameTok);
    const args = [];
    for (let k = 0; k < def.params.length; k++) {
      if (!(this.is('ident') || this.is('number') || this.is('hex'))) {
        throw this.error(
          `Macro '${def.name}' expects ${def.params.length} arguments (${def.params.join(', ')}), got ${k}`,
          nameTok
        );
      }
      args.push(this.next());
    }
    const argValues = args.map((a) => a.value);
    if (
      sk.macroCalls.some(
        (c) =>
          c.name === def.name &&
          c.args.length === argValues.length &&
          c.args.every((a, i) => a === argValues[i])
      )
    ) {
      return; // structural diff: identical call already applied
    }
    const instance = nextMacroInstance(sk, def.name);
    sk.macroCalls.push({ id: instance, name: def.name, args: argValues });
    const tokens = expandMacroTokens(def, args, instance);
    const sub = new Parser(tokens, {
      ...this.ctx,
      macroInstance: instance,
      depth: this.ctx.depth + 1,
    });
    const before = this.ctx.errors.length;
    sub.parseAll();
    for (let k = before; k < this.ctx.errors.length; k++) {
      this.ctx.errors[k].line = nameTok.line;
      this.ctx.errors[k].col = nameTok.col;
    }
    this.ctx.ops.push({ op: 'macro', id: instance, name: def.name, args: argValues });
  }

  /**
   * `scenario NAME { [point] P at vec …  var V = number … }` — a named set of
   * overrides solved as its own block of a stacked problem (§6.3 of the
   * theme notes). Extensions may register aliases such as `theme`.
   */
  parseScenario() {
    const sk = this.ctx.sketch;
    const kwTok = this.next();
    const idTok = this.parseName(`${kwTok.value} name`);
    const dim = this.ctx.registry.getSpace(sk.space).dim;
    const points = {};
    const variables = {};
    this.skipNewlines();
    this.expect('punct', '{');
    try {
      for (;;) {
        this.skipNewlines();
        if (this.accept('punct', '}')) break;
        if (this.is('eof'))
          throw this.error(`Unterminated ${kwTok.value} '${idTok.value}': missing '}'`, kwTok);
        if (this.acceptIdent('var')) {
          const nameTok = this.expect('ident', undefined, 'variable name');
          const v = M.findVariable(sk, nameTok.value);
          if (!v) throw this.error(`Unknown variable '${nameTok.value}'`, nameTok);
          this.expect('punct', '=');
          variables[v.id] = this.parseNumber('variable value');
        } else {
          this.acceptIdent('point');
          const nameTok = this.expect('ident', undefined, 'point name');
          const p = M.findPoint(sk, nameTok.value);
          if (!p) throw this.error(`Unknown point '${nameTok.value}'`, nameTok);
          this.expect('ident', 'at', "'at'");
          points[p.id] = this.parseVector(`position of '${nameTok.value}'`, dim);
          // A scenario override only moves coordinates, but its lines are
          // usually copied from the model, so a trailing role word
          // (`derived`, `anchor`, …) or `label "…"` is accepted and ignored.
          for (;;) {
            if (this.is('ident') && this.ctx.registry.pointRoles.has(this.peek().value))
              this.next();
            else if (this.acceptIdent('label')) this.expect('string', undefined, 'label string');
            else break;
          }
        }
        if (!this.atEnd() && !this.is('punct', '}'))
          throw this.error(`Unexpected ${describe(this.peek())} in ${kwTok.value} block`);
      }
    } catch (e) {
      this.skipBlock();
      throw e;
    }
    M.defineScenario(sk, { id: idTok.value, points, variables });
    this.ctx.ops.push({ op: 'scenario', id: idTok.value });
  }

  parseSolver() {
    this.next();
    const s = this.ctx.sketch.solver;
    const OPTS = new Set(['iterations', 'tolerance', 'objective', 'method', 'frame']);
    const methodName = () => {
      let name = this.expect('ident', undefined, 'solver method').value;
      while (this.accept('punct', '-'))
        name += '-' + this.expect('ident', undefined, 'solver method').value;
      return name;
    };
    if (this.is('ident') && !OPTS.has(this.peek().value)) s.method = methodName();
    while (this.is('ident') && OPTS.has(this.peek().value)) {
      const w = this.next().value;
      if (w === 'iterations')
        s.maxIterations = Math.max(1, Math.round(this.parseNumber('iterations')));
      else if (w === 'tolerance') s.tolerance = this.parseNumber('tolerance');
      else if (w === 'objective') s.objectiveScale = this.parseNumber('objective scale');
      else if (w === 'frame') {
        const tok = this.expect('ident', undefined, "'auto' or 'none'");
        if (tok.value !== 'auto' && tok.value !== 'none') {
          throw this.error(`Expected 'auto' or 'none' after 'frame', got ${describe(tok)}`, tok);
        }
        s.frame = tok.value;
      } else s.method = methodName();
    }
    this.ctx.ops.push({ op: 'solver' });
  }

  parseView() {
    this.next();
    const view = this.ctx.sketch.view;
    const FLAGS = { seeds: 'showSeeds', labels: 'showLabels', axes: 'showAxes' };
    for (;;) {
      if (this.acceptIdent('camera')) view.camera.position = this.parseVector('camera position', 3);
      else if (this.acceptIdent('target'))
        view.camera.target = this.parseVector('camera target', 3);
      else if (this.acceptIdent('up')) view.camera.up = this.parseVector('camera up', 3);
      else if (this.acceptIdent('perspective')) view.camera.projection = 'perspective';
      else if (this.acceptIdent('orthographic')) view.camera.projection = 'orthographic';
      else if (this.acceptIdent('fov')) view.camera.fov = this.parseNumber('fov');
      else if (this.acceptIdent('grid')) {
        const g = this.expect('ident', undefined, 'grid plane (xy, xz, yz or none)').value;
        if (!['xy', 'xz', 'yz', 'none'].includes(g)) throw this.error(`Unknown grid plane '${g}'`);
        view.grid = g;
      } else if (this.isIdent('show') || this.isIdent('hide')) {
        const on = this.next().value === 'show';
        let any = false;
        while (this.is('ident') && FLAGS[this.peek().value]) {
          view[FLAGS[this.next().value]] = on;
          any = true;
        }
        if (!any) throw this.error('Expected one of: seeds, labels, axes');
      } else break;
    }
    this.ctx.ops.push({ op: 'view' });
  }

  parseCommand() {
    const tok = this.next();
    const sk = this.ctx.sketch;
    let cmd;
    switch (tok.value) {
      case 'solve':
        cmd = { op: 'solve' };
        if (this.acceptIdent('scenarios')) cmd.scenarios = true;
        else if (this.acceptIdent('scenario')) {
          const t = this.expect('ident', undefined, 'scenario name');
          if (!M.findScenario(sk, t.value)) throw this.error(`Unknown scenario '${t.value}'`, t);
          cmd.scenario = t.value;
        }
        break;
      case 'reset':
      case 'adopt':
      case 'center':
        cmd = { op: tok.value };
        break;
      case 'delete':
        cmd = { op: 'delete', ref: this.expect('ident', undefined, 'entity to delete').value };
        break;
      case 'set': {
        const ref = this.expect('ident', undefined, 'variable name').value;
        this.expect('punct', '=');
        cmd = { op: 'set', ref, value: this.parseNumber('value') };
        break;
      }
      case 'move': {
        const ref = this.expect('ident', undefined, 'point name').value;
        this.expect('ident', 'to', "'to'");
        cmd = {
          op: 'move',
          ref,
          seed: this.parseVector('position', this.ctx.registry.getSpace(sk.space).dim),
        };
        break;
      }
      default:
        throw this.error(`Unknown command '${tok.value}'`, tok);
    }
    try {
      if (!applyCommand(sk, cmd, this.ctx.registry)) this.ctx.commands.push(cmd);
    } catch (e) {
      throw this.error(e.message, tok);
    }
    this.ctx.ops.push({ op: 'command', command: cmd });
  }
}
