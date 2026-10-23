import {h, panelShell} from '../dom.js';

export function createScriptPanel(ctx) {
    if (!ctx) {
        console.error('createScriptPanel initialized without ctx');
    }
    let dirty = false;
    const history = [];
    let hIdx = 0;

    // The textarea grows/shrinks with the tool window (see `.pc-fill` /
    // `.pc-grow`); it owns its own scrollbar instead of the window body.
    const ta = h('textarea', {class: 'pc-script pc-grow', spellcheck: 'false', rows: 18});
    const errBox = h('div', {class: 'pc-errors'});
    const applyBtn = h(
        'button',
        {class: 'pc-btn pc-primary', type: 'button', onclick: apply},
        'Apply script'
    );
    const revertBtn = h(
        'button',
        {class: 'pc-btn', type: 'button', onclick: revert},
        'Revert'
    );
    const consoleIn = h('input', {
        type: 'text',
        class: 'pc-in pc-console',
        placeholder: 'console › point E at (10, 20, 30) · solve · set theta = 45',
    });

    ta.addEventListener('input', () => {
        dirty = true;
        el.classList.add('pc-dirty');
    });
    ta.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault();
            apply();
        }
    });
    consoleIn.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const line = consoleIn.value.trim();
            if (!line) return;
            try {
                if (typeof ctx?.exec !== 'function') {
                    console.error('ctx.exec is not a function');
                    showErrors([{message: 'Execution context missing exec method'}], 'console');
                    return;
                }
                const res = ctx.exec(line);
                if (res && res.ok) {
                    history.push(line);
                    hIdx = history.length;
                    consoleIn.value = '';
                    showErrors([]);
                } else {
                    const errors = res?.errors || [{message: 'Command failed'}];
                    console.warn('Script console command failed:', line, errors);
                    showErrors(errors, 'console');
                }
            } catch (err) {
                console.error('Exception executing script console command:', line, err);
                showErrors([{message: err.message || String(err)}], 'console');
            }
        } else if (e.key === 'ArrowUp' && history.length) {
            hIdx = Math.max(0, hIdx - 1);
            consoleIn.value = history[hIdx];
            e.preventDefault();
        } else if (e.key === 'ArrowDown' && history.length) {
            hIdx = Math.min(history.length, hIdx + 1);
            consoleIn.value = history[hIdx] ?? '';
            e.preventDefault();
        }
    });

    const body = h(
        'div',
        {class: 'pc-fill'},
        ta,
        h('div', {class: 'pc-row'}, applyBtn, revertBtn),
        errBox,
        consoleIn
    );
    const el = panelShell('Script', body, {fill: true});

    function apply() {
        try {
            if (typeof ctx?.fromScript !== 'function') {
                console.error('ctx.fromScript is not a function');
                showErrors([{line: 0, message: 'Script execution context missing fromScript method'}]);
                return;
            }
            const res = ctx.fromScript(ta.value);
            if (res && res.ok) {
                dirty = false;
                el.classList.remove('pc-dirty');
                showErrors([]);
            } else {
                const errors = res?.errors || [{line: 0, message: 'Failed to apply script'}];
                console.warn('Script execution returned errors:', errors);
                showErrors(errors);
            }
        } catch (err) {
            console.error('Exception applying script:', err);
            showErrors([{line: 0, message: err.message || String(err)}]);
        }
    }

    function revert() {
        try {
            dirty = false;
            el.classList.remove('pc-dirty');
            update();
            showErrors([]);
        } catch (err) {
            console.error('Exception reverting script:', err);
        }
    }

    function showErrors(errors = [], where) {
        const list = Array.isArray(errors) ? errors : [errors];
        if (list.length > 0) {
            console.warn(`Script panel error(s) [${where || 'script'}]:`, list);
        }
        errBox.replaceChildren(
            ...list.map((e) => {
                const msg = typeof e === 'string' ? e : (e?.message ?? String(e));
                const prefix = where === 'console'
                    ? 'console: '
                    : (e && e.line != null ? `line ${e.line}: ` : '');
                return h('div', {class: 'pc-error'}, `${prefix}${msg}`);
            })
        );
    }

    function update() {
        try {
            const ro = Boolean(ctx?.readonly);
            ta.disabled = ro;
            consoleIn.disabled = ro;
            applyBtn.disabled = ro;
            revertBtn.disabled = ro;
            if (dirty || ta.matches(':focus')) return;
            if (typeof ctx?.toScript !== 'function') {
                return;
            }
            const text = ctx.toScript();
            if (ta.value !== text) ta.value = text ?? '';
        } catch (err) {
            console.error('Exception during script panel update:', err);
        }
    }

    return {el, update, showErrors};
}