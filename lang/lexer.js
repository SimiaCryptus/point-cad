// Tokens, comments and source positions for PCS.

export class PcsError extends Error {
  constructor(message, line, col) {
    super(message);
    this.name = 'PcsError';
    this.line = line;
    this.col = col;
  }
}

const NUMBER_RE = /^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/;
const IDENT_START = /[A-Za-z_]/;
const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]*/;
const PUNCT = new Set(['(', ')', ',', '+', '-', '*', '/', '=', '{', '}', '%']);
const PUNCT2 = new Set(['->', '>=', '<=']);

// `#rrggbb` colour literals share their prefix with comments. A hex literal
// is only recognised where a value is expected (after `at`, `to`, `(`, `,`,
// an operator or a comparison); everywhere else `#` starts a comment.
const HEX_RE = /^#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![0-9A-Za-z_])/;
const HEX_AFTER_PUNCT = new Set(['(', ',', '=', '+', '-', '*', '/', '>=', '<=']);
const hexAllowed = (prev) =>
  !!prev &&
  ((prev.type === 'ident' && (prev.value === 'at' || prev.value === 'to')) ||
    (prev.type === 'punct' && HEX_AFTER_PUNCT.has(prev.value)));

/**
 * Tokenize a PCS source string. Newlines are emitted as tokens (they act as
 * optional statement separators); comments run from '#' to end of line.
 * Lexical errors become `error` tokens so parsing can continue on the next line.
 */
export function tokenize(src) {
  const tokens = [];
  let i = 0;
  let line = 1;
  let col = 1;
  const push = (type, value, start, l, c) =>
    tokens.push({ type, value, start, end: i, line: l, col: c });

  while (i < src.length) {
    const ch = src[i];
    const start = i;
    const l = line;
    const c = col;

    if (ch === '\n') {
      i++;
      push('newline', '\n', start, l, c);
      line++;
      col = 1;
      continue;
    }
    if (ch === ' ' || ch === '\t' || ch === '\r') {
      i++;
      col++;
      continue;
    }
    if (ch === '#') {
      const m = hexAllowed(tokens[tokens.length - 1]) ? HEX_RE.exec(src.slice(i)) : null;
      if (m) {
        i += m[0].length;
        col += m[0].length;
        push('hex', m[0], start, l, c);
        continue;
      }
      while (i < src.length && src[i] !== '\n') {
        i++;
        col++;
      }
      continue;
    }
    if (ch === '"') {
      i++;
      col++;
      let out = '';
      let closed = false;
      while (i < src.length) {
        const d = src[i];
        if (d === '\n') break;
        i++;
        col++;
        if (d === '\\' && i < src.length) {
          const e = src[i++];
          col++;
          out += e === 'n' ? '\n' : e === 't' ? '\t' : e;
          continue;
        }
        if (d === '"') {
          closed = true;
          break;
        }
        out += d;
      }
      if (!closed) push('error', 'Unterminated string', start, l, c);
      else push('string', out, start, l, c);
      continue;
    }
    if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(src[i + 1] ?? ''))) {
      const m = NUMBER_RE.exec(src.slice(i));
      i += m[0].length;
      col += m[0].length;
      push('number', m[0], start, l, c);
      continue;
    }
    if (IDENT_START.test(ch)) {
      const m = IDENT_RE.exec(src.slice(i));
      i += m[0].length;
      col += m[0].length;
      push('ident', m[0], start, l, c);
      continue;
    }
    const two = src.slice(i, i + 2);
    if (PUNCT2.has(two)) {
      i += 2;
      col += 2;
      push('punct', two, start, l, c);
      continue;
    }
    if (PUNCT.has(ch)) {
      i++;
      col++;
      push('punct', ch, start, l, c);
      continue;
    }
    i++;
    col++;
    push('error', `Unexpected character '${ch}'`, start, l, c);
  }
  push('eof', '', i, line, col);
  return tokens;
}
