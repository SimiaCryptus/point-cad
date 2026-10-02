// Minimal DOM helpers shared by the panels.

export function h(tag, attrs = {}, ...children) {
    let el;
    try {
        el = document.createElement(tag);
    } catch (err) {
        console.error(`[dom.h] Failed to create element with tag "${tag}":`, err);
        throw err;
    }
    for (const [k, v] of Object.entries(attrs)) {
        if (v == null || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k.startsWith('on') && typeof v === 'function')
            el.addEventListener(k.slice(2).toLowerCase(), v);
        else if (k === 'value') el.value = v;
        else if (k === 'checked') el.checked = !!v;
        else if (k === 'disabled') el.disabled = !!v;
        else if (k === 'dataset') Object.assign(el.dataset, v);
        else {
            try {
                el.setAttribute(k, v === true ? '' : v);
            } catch (err) {
                console.error(`[dom.h] Failed to set attribute "${k}" on <${tag}>:`, err);
            }
        }
    }
    for (const c of children.flat(Infinity)) {
        if (c == null || c === false) continue;
        try {
            el.append(c instanceof Node ? c : String(c));
        } catch (err) {
            console.error(`[dom.h] Failed to append child to <${tag}>:`, c, err);
        }
    }
    return el;
}

export function fmt(n, digits = 3) {
    if (typeof digits !== 'number' || digits < 0) {
        console.warn(`[dom.fmt] Invalid digits value (${digits}), falling back to 3.`);
        digits = 3;
    }
    if (n == null || !Number.isFinite(n)) return '—';
    const a = Math.abs(n);
    if (a !== 0 && (a < 1e-4 || a >= 1e7)) return n.toExponential(2);
    return String(Math.round(n * 10 ** digits) / 10 ** digits);
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
let zTop = 20;

/** Raise a floating window above its siblings. */
export function bringToFront(el) {
    if (!el || !el.style) {
        console.warn('[dom.bringToFront] Invalid DOM element passed; cannot set z-index:', el);
        return;
    }
    el.style.zIndex = String(++zTop);
}

/**
 * Floating tool window: draggable title bar, close button, resizable body.
 * Closing dispatches a bubbling `pc-window-close` event (or calls `onClose`);
 * the end of a drag dispatches `pc-window-move` with `{ x, y }`.
 * With `fill: true` the body becomes a column flexbox so a `.pc-fill` child
 * (and its `.pc-grow` children) can take the window's full height.
 */
export function panelShell(title, body, {onClose = null, fill = false} = {}) {
    const win = h('section', {class: 'pc-window', role: 'dialog', 'aria-label': title});
    const closeBtn = h(
        'button',
        {
            class: 'pc-window-close',
            type: 'button',
            title: `Close ${title}`,
            onclick: () => {
                try {
                    if (onClose) onClose();
                    else win.dispatchEvent(new CustomEvent('pc-window-close', {bubbles: true}));
                } catch (err) {
                    console.error(`[dom.panelShell] Error during window close action for "${title}":`, err);
                }
            },
        },
        '✕'
    );
    const head = h(
        'div',
        {class: 'pc-window-head'},
        h('span', {class: 'pc-panel-title'}, title),
        closeBtn
    );
    win.append(head, h('div', {class: `pc-panel-body${fill ? ' pc-panel-fill' : ''}`}, body));

    win.addEventListener('pointerdown', () => bringToFront(win));
    head.addEventListener('pointerdown', (e) => {
        if (e.button !== 0 || (e.target instanceof Element && e.target.closest('button'))) return;
        const parent = win.offsetParent ?? win.parentElement;
        if (!parent) {
            console.warn(`[dom.panelShell] Cannot drag window "${title}": missing offsetParent or parentElement.`);
            return;
        }
        const x0 = win.offsetLeft;
        const y0 = win.offsetTop;
        const sx = e.clientX;
        const sy = e.clientY;
        win.style.left = `${x0}px`;
        win.style.top = `${y0}px`;
        win.style.right = 'auto';
        const move = (ev) => {
            win.style.left = `${clamp(x0 + ev.clientX - sx, 0, Math.max(0, parent.clientWidth - 80))}px`;
            win.style.top = `${clamp(y0 + ev.clientY - sy, 0, Math.max(0, parent.clientHeight - 32))}px`;
        };
        const stop = () => {
            head.removeEventListener('pointermove', move);
            head.removeEventListener('pointerup', stop);
            head.removeEventListener('pointercancel', stop);
            try {
                if (head.hasPointerCapture && head.hasPointerCapture(e.pointerId)) {
                    head.releasePointerCapture(e.pointerId);
                }
            } catch (err) {
                console.warn(`[dom.panelShell] Failed to release pointer capture ${e.pointerId} for "${title}":`, err);
            }
            win.dispatchEvent(
                new CustomEvent('pc-window-move', {
                    bubbles: true,
                    detail: {x: win.offsetLeft, y: win.offsetTop},
                })
            );
        };
        head.addEventListener('pointermove', move);
        head.addEventListener('pointerup', stop);
        head.addEventListener('pointercancel', stop);
        try {
            head.setPointerCapture(e.pointerId);
        } catch (err) {
            console.warn(`[dom.panelShell] Failed to set pointer capture ${e.pointerId} on "${title}":`, err);
        }
        e.preventDefault();
    });
    return win;
}

export function statusDot(status, title) {
    if (!status) {
        console.warn('[dom.statusDot] Missing status argument, defaulting to "unknown".');
        status = 'unknown';
    }
    return h('span', {class: `pc-dot pc-status-${status}`, title: title ?? status});
}