// Boot logic shared by demo/theme.html and every harness file it exports.
// Wires the log, the embedded handoff document (when the page carries one),
// the Open… button / drag-and-drop loader and each [data-export] /
// [data-action="solve"] button in the host page.
import './index.js';
import {themeDoc} from './doc-store.js';
import {buildMarkdown, hostContext, saveArtifact} from './handoff.js';

export const EXPORTS = ['css', 'tokens', 'pcad', 'md', 'html'];

const DOC_BLOCK_RE = /<script[^>]*\bid=["']theme-doc["'][^>]*>([\s\S]*?)<\/script>/i;
const asPayload = (obj) =>
    obj && typeof obj === 'object' && ('doc' in obj || 'pcad' in obj) ? obj : null;

/**
 * `{ doc, pcad }` from the text of a saved harness (its `theme-doc` block) or
 * of a bare JSON document with the same shape; null for anything else.
 */
export function parseHarness(text) {
    const src = String(text ?? '');
    const m = DOC_BLOCK_RE.exec(src);
    try {
        return asPayload(JSON.parse(m ? m[1] : src));
    } catch (err) {
        if (m) {
            console.error('Failed to parse harness JSON payload from theme-doc script block:', err);
        }
        return null;
    }
}

/** `{ doc, pcad }` embedded in a `<script type="application/json" id="theme-doc">`. */
export function readEmbeddedDoc(scope = document) {
    const el = scope.getElementById?.('theme-doc') ?? document.getElementById('theme-doc');
    if (!el) return null;
    try {
        return asPayload(JSON.parse(el.textContent || '{}'));
    } catch (err) {
        console.error('Failed to parse embedded document from #theme-doc script tag:', err);
        return null;
    }
}

/**
 * Apply a `{ doc, pcad }` payload: the document restores every handoff and
 * preview field (missing ones fall back to the defaults), the script
 * replaces the sketch. Returns the script's parse result, or null when the
 * payload carries no script.
 */
export function applyPayload(el, payload) {
    try {
        if (payload?.doc) themeDoc.set(payload.doc);
        if (payload?.doc?.project) document.title = `${payload.doc.project} — Point-CAD theme`;
        return payload?.pcad != null ? el.fromScript(String(payload.pcad)) : null;
    } catch (err) {
        console.error('Failed to apply harness payload:', err);
        throw err;
    }
}

/**
 * Load the text of a file into the harness: a saved harness (.html), a bare
 * theme-doc JSON, a sketch document (.json) or a PCS script (.pcad).
 * Returns `{ kind, ok, errors }`.
 */
export function loadText(el, text, name = '') {
    try {
        const payload = parseHarness(text);
        if (payload) {
            const res = applyPayload(el, payload);
            if (res && !res.ok) {
                console.warn(`Harness payload script for "${name}" has parse errors:`, res.errors);
            }
            return {kind: 'harness', ok: res ? res.ok : true, errors: res?.errors ?? []};
        }
        if (String(text).trimStart().startsWith('{') || /\.json$/i.test(name)) {
            el.fromJSON(text);
            return {kind: 'json', ok: true, errors: []};
        }
        const res = el.fromScript(String(text));
        if (!res.ok) {
            console.warn(`PCAD script for "${name}" has parse errors:`, res.errors);
        }
        return {kind: 'pcad', ok: res.ok, errors: res.errors};
    } catch (err) {
        console.error(`Failed to load text for "${name}":`, err);
        throw err;
    }
}

export async function bootHarness(elOrOpts, opts = {}) {
    // Accept both bootHarness(el, opts) and bootHarness({ element, log, scope }).
    const isElement = elOrOpts && typeof elOrOpts.addEventListener === 'function';
    const cfg = isElement ? opts : (elOrOpts ?? {});
    const el = isElement ? elOrOpts : (cfg.element ?? cfg.el ?? null);
    const {log = null, scope = document} = cfg;
    if (!el || typeof el.addEventListener !== 'function') {
        const err = new TypeError(
            'bootHarness needs the <point-cad> element: bootHarness(document.getElementById("cad")) ' +
            'or bootHarness({ element }).'
        );
        console.error('bootHarness initialization error:', err);
        throw err;
    }
    const say = (s) => {
        if (!log) return;
        log.textContent += s + '\n';
        log.scrollTop = log.scrollHeight;
    };

    el.addEventListener('pointcad:solve', (e) => {
        const r = e.detail.result;
        const per = r.perScenario
            ? Object.entries(r.perScenario)
                .map(([id, s]) => `${id}: ${s.residuals.filter((x) => x.status === 'bad').length} unmet`)
                .join(' · ')
            : '';
        const msg = `solve: converged=${r.converged} iterations=${r.iterations} residual=${r.residualNorm.toExponential(3)} ${per}`;
        console.log(msg, r);
        say(msg);
    });
    el.addEventListener('pointcad:error', (e) => {
        console.error(`Point-CAD error [${e.detail?.kind}]:`, e.detail?.detail);
        say(`error [${e.detail.kind}]: ${JSON.stringify(e.detail.detail)}`);
    });

    const embedded = readEmbeddedDoc(scope);
    await customElements.whenDefined('point-cad');
    if (embedded) {
        if (embedded.pcad != null) el.removeAttribute('src'); // the embedded sketch wins over any src=
        const res = applyPayload(el, embedded);
        if (res) {
            const msg = res.ok
                ? `loaded embedded sketch — ${themeDoc.get().project}`
                : 'embedded sketch has errors, see the Script window';
            if (!res.ok) {
                console.warn('Embedded sketch has parse errors:', res.errors);
            } else {
                console.log(msg);
            }
            say(msg);
        } else {
            const msg = `loaded embedded handoff fields — ${themeDoc.get().project}`;
            console.log(msg);
            say(msg);
        }
    }

    const ctx = hostContext(el);
    const save = (kind) => {
        try {
            const a = saveArtifact(ctx, kind);
            console.log(`Saved artifact "${kind}":`, a.name);
            say(`saved ${a.name}`);
            return a;
        } catch (err) {
            console.error(`Export failed for "${kind}":`, err);
            say(`export failed: ${err.message}`);
            return null;
        }
    };
    const open = (text, name = 'file') => {
        try {
            const r = loadText(el, text, name);
            const msg = r.ok
                ? `opened ${name} (${r.kind})`
                : `opened ${name}: ${r.errors.length} parse error(s), see the Script window`;
            if (!r.ok) {
                console.warn(`Opened "${name}" with errors:`, r.errors);
            } else {
                console.log(msg);
            }
            say(msg);
            return r;
        } catch (err) {
            console.error(`Open failed for "${name}":`, err);
            say(`open failed: ${err.message}`);
            return null;
        }
    };
    const pickFile = () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.html,.htm,.pcad,.json,text/html,application/json,text/plain';
        input.addEventListener('change', async () => {
            const f = input.files?.[0];
            if (f) {
                try {
                    const content = await f.text();
                    open(content, f.name);
                } catch (err) {
                    console.error(`Failed to read selected file "${f.name}":`, err);
                    say(`read failed: ${err.message}`);
                }
            }
        });
        input.click();
    };
    for (const btn of scope.querySelectorAll('[data-export]'))
        btn.addEventListener('click', () => save(btn.dataset.export));
    for (const btn of scope.querySelectorAll('[data-action="open"]'))
        btn.addEventListener('click', pickFile);
    for (const btn of scope.querySelectorAll('[data-action="solve"]')) {
        btn.addEventListener('click', () => {
            try {
                el.solve();
            } catch (err) {
                console.error('Solve action threw exception:', err);
                /* reported through pointcad:error */
            }
        });
    }
    // drop a saved harness / .pcad / .json anywhere on the element
    el.addEventListener('dragover', (e) => e.preventDefault());
    el.addEventListener('drop', async (e) => {
        const f = e.dataTransfer?.files?.[0];
        if (!f) return;
        e.preventDefault();
        try {
            const content = await f.text();
            open(content, f.name);
        } catch (err) {
            console.error(`Failed to read dropped file "${f.name}":`, err);
            say(`drop read failed: ${err.message}`);
        }
    });
    const readyMsg =
        'ready — Swatches / Preview / Handoff windows: edit anchors and rules, solve, then save the CSS, the guide (.md) or the whole harness (.html) · Open… loads a saved harness';
    console.log(readyMsg);
    say(readyMsg);
    return {
        element: el,
        save,
        open,
        doc: themeDoc,
        guide: () => {
            try {
                return buildMarkdown(ctx);
            } catch (err) {
                console.error('Failed to build markdown guide:', err);
                throw err;
            }
        },
    };
}