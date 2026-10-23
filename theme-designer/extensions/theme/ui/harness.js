// Boot logic for the Theme-CAD PWA and harness pages.
// Handles URL parameters (?src=, ?url=, ?file=, ?pcad=, ?tcad=),
// PWA file_handlers (window.launchQueue) for application/vnd.pointcad and
// application/vnd.themecad, external template resolution (`template html/css`),
// and direct web-publishing output exports (`output css/tokens/guide`).
import './index.js';
import {themeDoc} from './doc-store.js';
import {buildMarkdown, hostContext, saveArtifact} from './handoff.js';
import {
     POINTCAD_EXTENSIONS,
     POINTCAD_MIME,
     POINTCAD_MIMES,
     THEMECAD_MIME,
     themeMetadata,
} from '../themes.js';

export const EXPORTS = ['css', 'tokens', 'pcad', 'tcad', 'template-html', 'template-css', 'md', 'html'];
export {POINTCAD_MIME, THEMECAD_MIME, POINTCAD_MIMES, POINTCAD_EXTENSIONS};

const URL_PARAM_KEYS = ['src', 'url', 'file', 'pcad', 'tcad', 'sketch'];

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
         const res = payload?.pcad != null ? el.fromScript(String(payload.pcad)) : null;
         themeDoc.syncFromSketch(el.sketch);
         const proj = themeDoc.get().project;
         if (proj) document.title = `${proj} — Theme-CAD`;
         return res;
    } catch (err) {
        console.error('Failed to apply harness payload:', err);
        throw err;
    }
}
/**
  * Resolve a URL parameter specifying a `.pcad` / `.tcad` document URL.
  * Also supports `web+pointcad://` and `web+themecad://` protocol handler URLs.
  */
export function resolveUrlParam(search = typeof location !== 'undefined' ? location.search : '') {
     if (!search) return null;
     try {
         const params = new URLSearchParams(search);
         for (const key of URL_PARAM_KEYS) {
             const raw = params.get(key);
             if (!raw) continue;
             const trimmed = raw.trim();
             if (/^web\+(pointcad|themecad):\/\//i.test(trimmed)) {
                 const inner = trimmed.replace(/^web\+(pointcad|themecad):\/\//i, '');
                 try {
                     return decodeURIComponent(inner);
                 } catch {
                     return inner;
                 }
             }
             return trimmed;
         }
     } catch (err) {
         console.error('Failed to parse URL parameters:', err);
     }
     return null;
}
/**
  * Fetch `template html` and `template css` files referenced inside the sketch
  * relative to `baseUrl` (the URL from which the `.pcad` / `.tcad` was loaded).
  */
export async function resolveSketchTemplates(sketch, baseUrl = typeof location !== 'undefined' ? location.href : '') {
     const meta = themeMetadata(sketch);
     const {html: htmlPath, css: cssPath} = meta.template;
     const loaded = {html: null, css: null};
     if (!htmlPath && !cssPath) return loaded;
     const resolveUrl = (rel) => {
         try {
             return new URL(rel, baseUrl || window.location.href).href;
         } catch {
             return rel;
         }
     };
     const patch = {};
     if (htmlPath) {
         const u = resolveUrl(htmlPath);
         try {
             const resp = await fetch(u);
             if (resp.ok) {
                 patch.html = await resp.text();
                 loaded.html = htmlPath;
             } else {
                 console.warn(`Template HTML fetch returned ${resp.status} for "${u}"`);
             }
         } catch (err) {
             console.warn(`Could not fetch template HTML "${u}":`, err);
         }
     }
     if (cssPath) {
         const u = resolveUrl(cssPath);
         try {
             const resp = await fetch(u);
             if (resp.ok) {
                 patch.css = await resp.text();
                 loaded.css = cssPath;
             } else {
                 console.warn(`Template CSS fetch returned ${resp.status} for "${u}"`);
             }
         } catch (err) {
             console.warn(`Could not fetch template CSS "${u}":`, err);
         }
     }
     if (Object.keys(patch).length > 0) {
         themeDoc.patchPreview(patch);
     }
     return loaded;
}


/**
 * Load the text of a file into the harness: a saved harness (.html), a bare
 * theme-doc JSON, a sketch document (.json) or a PCS script (.pcad).
 * Returns `{ kind, ok, errors }`.
 */
export function loadText(el, text, name = '', sourceUrl = null) {
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
             themeDoc.syncFromSketch(el.sketch, sourceUrl || name);
            return {kind: 'json', ok: true, errors: []};
        }
        const res = el.fromScript(String(text));
        if (!res.ok) {
            console.warn(`PCAD script for "${name}" has parse errors:`, res.errors);
         } else {
             themeDoc.syncFromSketch(el.sketch, sourceUrl || name);
             const proj = themeDoc.get().project;
             if (proj && typeof document !== 'undefined') {
                 document.title = `${proj} — Theme-CAD`;
             }
        }
        return {kind: 'pcad', ok: res.ok, errors: res.errors};
    } catch (err) {
        console.error(`Failed to load text for "${name}":`, err);
        throw err;
    }
}
/**
  * Fetch a Point-CAD / Theme-CAD file from a URL, parse it, and resolve its
  * referenced `template html` and `template css` files relative to that URL.
  */
export async function loadFromUrl(el, url) {
     const resolvedUrl = new URL(url, typeof location !== 'undefined' ? location.href : undefined).href;
     const resp = await fetch(resolvedUrl, {
         headers: {
             Accept: `${THEMECAD_MIME}, ${POINTCAD_MIME}, text/x-pcad, text/plain, application/json, */*`,
         },
     });
     if (!resp.ok) {
         throw new Error(`${resp.status} ${resp.statusText}`);
     }
     const contentType = (resp.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
     const text = await resp.text();
     const r = loadText(el, text, resolvedUrl, resolvedUrl);
     const templates = await resolveSketchTemplates(el.sketch, resolvedUrl);
     return {...r, url: resolvedUrl, contentType, templates};
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
     const urlTarget = resolveUrlParam();

    const embedded = readEmbeddedDoc(scope);
    await customElements.whenDefined('point-cad');

     // 1. URL parameter (?src=, ?url=, ?file=, ?pcad=, ?tcad=) takes highest priority
     if (urlTarget) {
         el.removeAttribute('src');
         try {
             const r = await loadFromUrl(el, urlTarget);
             const tplNote = [r.templates?.html, r.templates?.css].filter(Boolean).join(', ');
             const msg = r.ok
                 ? `loaded ${urlTarget}${tplNote ? ` (templates: ${tplNote})` : ''}`
                 : `loaded ${urlTarget} with ${r.errors.length} parse error(s)`;
             console.log(msg);
             say(msg);
         } catch (err) {
             console.error(`Failed to load URL parameter "${urlTarget}":`, err);
             say(`failed to load ${urlTarget}: ${err.message}`);
         }
     } else if (embedded) {
         // 2. Embedded #theme-doc block
         if (embedded.pcad != null) el.removeAttribute('src');
        const res = applyPayload(el, embedded);
         await resolveSketchTemplates(el.sketch);
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
     } else if (el.hasAttribute('src')) {
         // 3. `src` attribute on <point-cad>: load & resolve templates relative to src
         const srcAttr = el.getAttribute('src');
         el.removeAttribute('src');
         try {
             const r = await loadFromUrl(el, srcAttr);
             const tplNote = [r.templates?.html, r.templates?.css].filter(Boolean).join(', ');
             const msg = r.ok
                 ? `loaded ${srcAttr}${tplNote ? ` (templates: ${tplNote})` : ''}`
                 : `loaded ${srcAttr} with ${r.errors.length} parse error(s)`;
             console.log(msg);
             say(msg);
         } catch (err) {
             console.error(`Failed to load src="${srcAttr}":`, err);
             say(`failed to load ${srcAttr}: ${err.message}`);
         }
    }
     // Keep theme metadata & external templates synced when the user edits the script
     el.addEventListener('pointcad:change', async (e) => {
         if (e.detail?.reason === 'script' || e.detail?.reason === 'exec') {
             themeDoc.syncFromSketch(el.sketch);
             const base = themeDoc.get().sourceUrl || location.href;
             await resolveSketchTemplates(el.sketch, base);
         }
     });


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
     const open = async (text, name = 'file', sourceUrl = null) => {
        try {
             const r = loadText(el, text, name, sourceUrl);
             if (r.ok && sourceUrl) {
                 await resolveSketchTemplates(el.sketch, sourceUrl);
             }
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
         input.accept = [
             ...POINTCAD_EXTENSIONS,
             ...POINTCAD_MIMES,
             '.json',
             '.html',
             'application/json',
             'text/plain',
         ].join(',');
        input.addEventListener('change', async () => {
            const f = input.files?.[0];
            if (f) {
                try {
                    const content = await f.text();
                     await open(content, f.name);
                } catch (err) {
                    console.error(`Failed to read selected file "${f.name}":`, err);
                    say(`read failed: ${err.message}`);
                }
            }
        });
        input.click();
    };
     // PWA File Handling API: handle files opened from OS file manager for registered MIME types
     if (typeof window !== 'undefined' && 'launchQueue' in window && window.launchQueue) {
         try {
             window.launchQueue.setConsumer(async (launchParams) => {
                 if (launchParams?.targetURL) {
                     const target = resolveUrlParam(new URL(launchParams.targetURL).search);
                     if (target) {
                         await loadFromUrl(el, target);
                         return;
                     }
                 }
                 if (!launchParams?.files?.length) return;
                 const handle = launchParams.files[0];
                 const file = await handle.getFile();
                 const content = await file.text();
                 await open(content, file.name);
             });
         } catch (err) {
             console.warn('Failed to register PWA launchQueue consumer:', err);
         }
     }

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
             await open(content, f.name);
        } catch (err) {
            console.error(`Failed to read dropped file "${f.name}":`, err);
            say(`drop read failed: ${err.message}`);
        }
    });
    const readyMsg =
         'ready — edit constraints in Script, preview live with referenced templates, solve, and export CSS / .pcad';
    console.log(readyMsg);
    say(readyMsg);
    return {
        element: el,
        save,
        open,
         loadFromUrl: (url) => loadFromUrl(el, url),
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