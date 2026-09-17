// Shared "handoff document" for the theme designer: emitter options, the
// preview templates, the prose of the migration guide and the evidence
// (working notes) behind the sketch. The Preview and Handoff windows edit
// this one object and every exporter reads it, so a palette can be handed
// over as a self-contained HTML harness (which re-opens with all fields
// intact) instead of a markdown file that has to be cut and pasted. The
// field names are the ones `demo/analyze.op.md` §3 documents.

export const DEFAULT_PREVIEW_HTML = `<h2>Sample page</h2>
<p>Body text on <code>canvas</code>. <span class="muted">Secondary text uses <code>textMuted</code>.</span> A <a href="#">link</a> sits on the brand hue.</p>
<div class="card">
  <b>surface1</b>
  <div class="card">
    <b>surface2</b>
    <div class="card"><b>surface3</b> — three even lightness steps.</div>
  </div>
</div>
<p><span class="btn">Accent action</span></p>
<p class="muted">Every colour above is a solved point in OKLab; edit an anchor or a rule in the script window and re-solve.</p>`;

export const DEFAULT_PREVIEW_CSS = `/* Appended after the generated custom properties (--color-<token>). */
body { margin: 0; padding: 20px; font: 14px/1.5 system-ui, sans-serif; background: var(--color-canvas, #fff); color: var(--color-text, #222); }
h2 { margin: 0 0 4px; font-size: 20px; }
.muted { color: var(--color-text-muted, #666); }
a { color: var(--color-link, #36c); }
.card { background: var(--color-surface-1); border: 1px solid var(--color-border, #ccc); border-radius: 8px; padding: 12px; margin: 12px 0; }
.card .card { background: var(--color-surface-2); }
.card .card .card { background: var(--color-surface-3); }
.btn { display: inline-block; background: var(--color-accent, #c60); color: var(--color-canvas, #fff); border-radius: 6px; padding: 6px 12px; font-weight: 600; }`;

/** Every field the harness carries. Prose fields are markdown. */
export const DEFAULT_DOC = {
  project: "My app",
  // emitter options (see emit-css.js)
  prefix: "color-",
  format: "oklch",
  scope: ":root",
  switchMode: "media,attribute",
  defaultTheme: "",
  fallback: false,
  // migration guide
  summary: "",
  replacements:
    "| literal | where | property | token | replacement |\n" +
    "|---|---|---|---|---|\n",
  plumbing:
    "1. Load the generated stylesheet **first**, before any other CSS.\n" +
    "2. Keep the emitted `:root` block as the default theme.\n" +
    '3. Opt-in switching is `[data-theme="…"]` on `<html>`.\n' +
    "4. Add `color-scheme: light dark` to `:root` so form controls and scrollbars follow.",
  alpha:
    "Translucent uses of a token become `color-mix(in oklab, var(--color-X) 40%, transparent)`.\n" +
    "One-off shades can use relative colour syntax: `oklch(from var(--color-X) calc(l - 0.06) c h)`.\n" +
    "Shadows and scrims stay literal.",
  skip:
    "`currentColor`, `transparent`, pure black shadows/scrims, white hairlines (use `color-mix` from the text token), " +
    "and any third-party component you do not own.",
  order:
    "Replace literals → delete redundant per-theme overrides → add `color-scheme` → states → remove fallbacks.",
  findings: "",
   // evidence / working notes (analyze.op.md §2): stored so the harness is
   // self-contained; printed as an appendix of the generated guide
   inventory: "",
   tokenMap: "",
   relations: "",
   expected: "",
  preview: { html: DEFAULT_PREVIEW_HTML, css: DEFAULT_PREVIEW_CSS },
};

const clone = (v) => (typeof structuredClone === "function" ? structuredClone(v) : JSON.parse(JSON.stringify(v)));
const listeners = new Set();
let current = clone(DEFAULT_DOC);

function emit() {
  for (const fn of [...listeners]) fn(current);
}

export const themeDoc = {
  get() {
    return current;
  },
  /** Replace the whole document; missing fields fall back to the defaults. */
  set(next = {}) {
    const d = clone(next ?? {});
    current = { ...clone(DEFAULT_DOC), ...d, preview: { ...DEFAULT_DOC.preview, ...(d.preview ?? {}) } };
    emit();
  },
  patch(delta) {
    current = { ...current, ...delta };
    emit();
  },
  patchPreview(delta) {
    current = { ...current, preview: { ...current.preview, ...delta } };
    emit();
  },
  reset() {
    this.set(DEFAULT_DOC);
  },
  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};

/** File-name stem from a project title. */
export const slug = (s) =>
  String(s ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "theme";