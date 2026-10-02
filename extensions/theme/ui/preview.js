// Preview tool window: a sample page rendered inside an iframe with the
// palette's CSS custom properties, the theme picker, and editable HTML /
// CSS templates (copy, reset) on two further tabs. The templates live in
// the shared handoff document so exports ship them too.
import {h, panelShell} from '../../../ui/dom.js';
import {emitCSS} from '../emit-css.js';
import {DEFAULT_PREVIEW_CSS, DEFAULT_PREVIEW_HTML, themeDoc} from './doc-store.js';
import {cssOptions} from './handoff.js';

export {DEFAULT_PREVIEW_HTML, DEFAULT_PREVIEW_CSS};

const SKELETON =
    '<!doctype html><html><head><meta charset="utf-8"><style id="pc-vars"></style><style id="pc-user"></style></head><body></body></html>';
const TABS = {preview: 'Preview', html: 'HTML', css: 'CSS'};

export function createPreviewPanel(ctx, overrides = {}) {
    if (overrides.html != null || overrides.css != null) {
        try {
            themeDoc.patchPreview({
                ...(overrides.html != null ? {html: overrides.html} : {}),
                ...(overrides.css != null ? {css: overrides.css} : {}),
            });
        } catch (err) {
            console.error('Failed to apply preview overrides:', err);
        }
    }
    const state = {tab: 'preview', lastHtml: null};
    const tmpl = () => themeDoc.get().preview;

    // No scripts run inside the frame; same origin keeps `contentDocument` reachable.
    const frame = h('iframe', {
        class: 'pc-preview-frame pc-grow',
        title: 'Theme preview',
        sandbox: 'allow-same-origin',
        srcdoc: SKELETON,
    });
    const themeSel = h('select', {
        class: 'pc-in',
        title: 'Theme shown in the preview',
        onchange: () => {
            try {
                ctx.setActiveScenario(themeSel.value || null);
            } catch (err) {
                console.error('Failed to set active scenario for preview:', err);
            }
        },
    });
    const status = h('div', {class: 'pc-muted pc-preview-status'});
    const htmlTa = h('textarea', {
        class: 'pc-template pc-grow',
        spellcheck: 'false',
        oninput: () => {
            try {
                themeDoc.patchPreview({html: htmlTa.value});
            } catch (err) {
                console.error('Failed to update preview HTML template:', err);
            }
        },
    });
    const cssTa = h('textarea', {
        class: 'pc-template pc-grow',
        spellcheck: 'false',
        oninput: () => {
            try {
                themeDoc.patchPreview({css: cssTa.value});
            } catch (err) {
                console.error('Failed to update preview CSS template:', err);
            }
        },
    });
    htmlTa.value = tmpl().html;
    htmlTa.value = tmpl().css;

    const copyBtn = (get, label = 'content') =>
        h(
            'button',
            {
                class: 'pc-btn',
                type: 'button',
                title: 'Copy to the clipboard',
                onclick: async () => {
                    try {
                        await navigator.clipboard.writeText(get());
                    } catch (err) {
                        console.error(`Failed to copy preview ${label} to clipboard:`, err);
                    }
                },
            },
            'Copy'
        );
    const resetBtn = (fn, label = 'template') =>
        h(
            'button',
            {
                class: 'pc-btn',
                type: 'button',
                title: 'Restore the default template',
                onclick: () => {
                    try {
                        fn();
                    } catch (err) {
                        console.error(`Failed to reset preview ${label}:`, err);
                    }
                },
            },
            'Reset'
        );

    const panes = {
        preview: h('div', {class: 'pc-pane pc-grow'}, frame),
        html: h(
            'div',
            {class: 'pc-pane pc-grow'},
            h(
                'div',
                {class: 'pc-muted'},
                'Body markup of the preview page; it ships with the exported guide and harness.'
            ),
            htmlTa,
            h(
                'div',
                {class: 'pc-row'},
                copyBtn(() => htmlTa.value, 'HTML'),
                resetBtn(() => themeDoc.patchPreview({html: DEFAULT_PREVIEW_HTML}), 'HTML')
            )
        ),
        css: h(
            'div',
            {class: 'pc-pane pc-grow'},
            h(
                'div',
                {class: 'pc-muted'},
                'CSS appended after the generated --<prefix>* properties (kebab-cased labels: textMuted → --color-text-muted).'
            ),
            cssTa,
            h(
                'div',
                {class: 'pc-row'},
                copyBtn(() => cssTa.value, 'CSS'),
                resetBtn(() => themeDoc.patchPreview({css: DEFAULT_PREVIEW_CSS}), 'CSS')
            )
        ),
    };
    const tabBtns = {};
    const tabs = h(
        'div',
        {class: 'pc-row pc-tabs'},
        ...Object.entries(TABS).map(
            ([id, title]) =>
                (tabBtns[id] = h(
                    'button',
                    {class: 'pc-btn pc-tool', type: 'button', onclick: () => showTab(id)},
                    title
                ))
        ),
        h('span', {class: 'pc-spacer'}),
        h('label', {}, 'Theme'),
        themeSel
    );
    const body = h('div', {class: 'pc-fill'}, tabs, ...Object.values(panes), status);
    const el = panelShell('Preview', body, {fill: true});
    el.style.width = '460px';
    el.style.height = '560px';
    frame.addEventListener('load', render);
    themeDoc.subscribe(() => {
        try {
            const t = tmpl();
            if (!htmlTa.matches(':focus') && htmlTa.value !== t.html) htmlTa.value = t.html;
            if (!cssTa.matches(':focus') && cssTa.value !== t.css) cssTa.value = t.css;
            if (!el.hidden) render();
        } catch (err) {
            console.error('Failed to sync themeDoc changes to preview panel:', err);
        }
    });

    function showTab(id) {
        state.tab = id;
        for (const [k, pane] of Object.entries(panes)) {
            pane.hidden = k !== id;
            tabBtns[k].classList.toggle('pc-active', k === id);
        }
    }

    /** Push the generated variables, the user CSS, the markup and the active theme into the frame. */
    function render() {
        let vars = '';
        try {
            const opt = cssOptions();
            vars = emitCSS(ctx.sketch, ctx.result, {
                ...opt,
                switchMode: ['attribute'],
                scope: ':root',
                header: false,
                registry: ctx.registry,
            });
            status.textContent = '';
        } catch (e) {
            console.error('Failed to emit CSS for preview:', e);
            status.textContent = e.message;
        }
        try {
            const doc = frame.contentDocument;
            const varsEl = doc?.getElementById('pc-vars');
            if (!doc || !varsEl) return; // frame not loaded yet: its load handler calls render()
            varsEl.textContent = vars;
            const userEl = doc.getElementById('pc-user');
            if (userEl) userEl.textContent = tmpl().css;
            if (state.lastHtml !== tmpl().html) {
                doc.body.innerHTML = tmpl().html;
                state.lastHtml = tmpl().html;
            }
            const active = ctx.activeScenario;
            if (active) doc.documentElement.setAttribute('data-theme', active);
            else doc.documentElement.removeAttribute('data-theme');
        } catch (err) {
            console.error('Failed to update preview frame content:', err);
        }
    }

    function update() {
        try {
            const scen = ctx.sketch.scenarios ?? [];
            themeSel.replaceChildren(...scen.map((s) => h('option', {value: s.id}, s.id)));
            themeSel.value = ctx.activeScenario ?? scen[0]?.id ?? '';
            themeSel.disabled = !scen.length;
            showTab(state.tab);
            render();
        } catch (err) {
            console.error('Failed to update preview panel state:', err);
        }
    }

    return {el, update};
}