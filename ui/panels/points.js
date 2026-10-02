import {fmt, h, panelShell} from '../dom.js';
import {addPoint, removeEntity, uniqueName} from '../../core/model.js';

const AXIS = ['x', 'y', 'z', 'w'];

export function createPointsPanel(ctx) {
    const body = h('div');
    const el = panelShell('Points', body);

    function update() {
        try {
            const sk = ctx.sketch;
            if (!sk) {
                console.warn('Points panel update skipped: No sketch available in context.');
                body.replaceChildren();
                return;
            }
            const ro = Boolean(ctx.readonly);
            const space = ctx.getSpace ? ctx.getSpace() : null;
            const dim = space?.dim ?? 2;
            body.replaceChildren();
            const tbody = h('tbody');
            for (const p of sk.points) {
                const selected = ctx.selection?.has?.(p.id);
                const row = h(
                    'tr',
                    {
                        class: `${selected ? 'pc-row-selected' : ''}${p.macro ? ' pc-macro' : ''}`,
                        onclick: (e) => {
                            try {
                                if (!(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLButtonElement)) {
                                    ctx.select([p.id], e.shiftKey);
                                }
                            } catch (err) {
                                console.error(`Failed to select point "${p.label}" (${p.id}):`, err);
                            }
                        },
                    },
                    h(
                        'td',
                        {},
                        h('input', {
                            type: 'text',
                            class: 'pc-in pc-in-name',
                            value: p.label,
                            disabled: ro,
                            onchange: (e) => {
                                try {
                                    const val = e.target.value.trim();
                                    if (!val) {
                                        console.warn(`Empty label entered for point "${p.label}" (${p.id}); retaining previous label.`);
                                        e.target.value = p.label;
                                        return;
                                    }
                                    p.label = val;
                                    ctx.commit('point');
                                } catch (err) {
                                    console.error(`Failed to update label for point ${p.id}:`, err);
                                }
                            },
                        })
                    ),
                    ...Array.from({length: dim}, (_, k) =>
                        h(
                            'td',
                            {},
                            h('input', {
                                type: 'number',
                                step: 'any',
                                class: 'pc-in pc-in-num',
                                value: p.seed[k] ?? 0,
                                disabled: ro,
                                title: `seed ${AXIS[k] ?? k}`,
                                onchange: (e) => {
                                    try {
                                        const val = Number(e.target.value);
                                        if (!Number.isFinite(val)) {
                                            console.warn(`Invalid coordinate value "${e.target.value}" for point "${p.label}" axis ${AXIS[k] ?? k}; resetting to ${p.seed[k] ?? 0}.`);
                                            e.target.value = p.seed[k] ?? 0;
                                            return;
                                        }
                                        p.seed[k] = val;
                                        delete p.solved;
                                        ctx.commit('point');
                                    } catch (err) {
                                        console.error(`Failed to update coordinate ${AXIS[k] ?? k} for point "${p.label}" (${p.id}):`, err);
                                    }
                                },
                            })
                        )
                    ),
                    h(
                        'td',
                        {},
                        h('input', {
                            type: 'checkbox',
                            checked: p.fixed,
                            disabled: ro,
                            title: 'Fixed (anchor)',
                            onchange: (e) => {
                                try {
                                    p.fixed = e.target.checked;
                                    ctx.commit('point');
                                } catch (err) {
                                    console.error(`Failed to toggle fixed anchor state for point "${p.label}" (${p.id}):`, err);
                                }
                            },
                        })
                    ),
                    h(
                        'td',
                        {},
                        ro
                            ? null
                            : h(
                                'button',
                                {
                                    class: 'pc-icon',
                                    title: 'Delete point',
                                    onclick: () => {
                                        try {
                                            removeEntity(sk, p.id);
                                            if (ctx.selection?.has?.(p.id)) {
                                                ctx.selection.delete(p.id);
                                            }
                                            ctx.commit('point');
                                        } catch (err) {
                                            console.error(`Failed to delete point "${p.label}" (${p.id}):`, err);
                                        }
                                    },
                                },
                                '✕'
                            )
                    )
                );
                tbody.append(row);
                if (p.solved) {
                    tbody.append(
                        h(
                            'tr',
                            {class: 'pc-subrow'},
                            h(
                                'td',
                                {colspan: dim + 3, class: 'pc-muted'},
                                `solved: (${p.solved.map((v) => fmt(v)).join(', ')})`
                            )
                        )
                    );
                }
            }
            body.append(
                h(
                    'table',
                    {class: 'pc-table'},
                    h(
                        'thead',
                        {},
                        h(
                            'tr',
                            {},
                            h('th', {}, 'Label'),
                            ...Array.from({length: dim}, (_, k) => h('th', {}, AXIS[k] ?? String(k))),
                            h('th', {}, 'Fix'),
                            h('th')
                        )
                    ),
                    tbody
                )
            );
            if (!ro) {
                body.append(
                    h(
                        'button',
                        {
                            class: 'pc-btn',
                            onclick: () => {
                                try {
                                    const p = addPoint(sk, {
                                        label: uniqueName(sk, nextLetter(sk)),
                                        seed: Array.from({length: dim}, () => 0),
                                    });
                                    ctx.select([p.id]);
                                    ctx.commit('point');
                                } catch (err) {
                                    console.error('Failed to add new point:', err);
                                }
                            },
                        },
                        '+ Point'
                    )
                );
            }
        } catch (err) {
            console.error('Failed to update points panel:', err);
        }
    }

    return {el, update};
}

function nextLetter(sk) {
    if (!sk || !Array.isArray(sk.points)) {
        return 'P';
    }
    const used = new Set(sk.points.map((p) => p.label));
    for (let i = 0; i < 26; i++) {
        const c = String.fromCharCode(65 + i);
        if (!used.has(c)) return c;
    }
    return 'P';
}