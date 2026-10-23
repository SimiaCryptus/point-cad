import {fmt, h, panelShell} from '../dom.js';
import {addVariable, IDENT_RE, removeEntity, uniqueName} from '../../core/model.js';

export function createVariablesPanel(ctx) {
    const body = h('div');
    const el = panelShell('Variables', body);

    function update() {
        try {
            const sk = ctx.sketch;
            const ro = ctx.readonly;
            body.replaceChildren();
            const variables = sk?.variables || [];
            const tbody = h('tbody');
            for (const v of variables) {
                tbody.append(
                    h(
                        'tr',
                        {class: v.macro ? 'pc-macro' : ''},
                        h(
                            'td',
                            {},
                            h('input', {
                                type: 'text',
                                class: 'pc-in pc-in-name',
                                value: v.name,
                                disabled: ro,
                                onchange: (e) => {
                                    try {
                                        const name = e.target.value.trim();
                                        if (!IDENT_RE.test(name)) {
                                            console.warn(`[VariablesPanel] Invalid identifier '${name}' for variable ${v.id}`);
                                            ctx.error('validation', `'${name}' is not a valid identifier`);
                                            e.target.value = v.name;
                                            return;
                                        }
                                        if (variables.some((other) => other.id !== v.id && other.name === name)) {
                                            console.warn(`[VariablesPanel] Duplicate variable identifier '${name}'`);
                                            ctx.error('validation', `Variable '${name}' already exists`);
                                            e.target.value = v.name;
                                            return;
                                        }
                                        if (v.name !== name) {
                                            console.log(`[VariablesPanel] Renaming variable ${v.name} -> ${name} (${v.id})`);
                                            v.name = name;
                                            ctx.commit('variable');
                                        }
                                    } catch (err) {
                                        console.error(`[VariablesPanel] Failed to update variable name for ${v.name}:`, err);
                                        if (typeof ctx.error === 'function') {
                                            ctx.error('variable', `Failed to rename variable: ${err.message || err}`);
                                        }
                                    }
                                },
                            })
                        ),
                        h(
                            'td',
                            {},
                            h('input', {
                                type: 'number',
                                step: 'any',
                                class: 'pc-in pc-in-num',
                                value: v.value,
                                disabled: ro,
                                onchange: (e) => {
                                    try {
                                        const num = Number(e.target.value);
                                        if (Number.isNaN(num)) {
                                            console.warn(`[VariablesPanel] Non-numeric value '${e.target.value}' for variable ${v.name}`);
                                            ctx.error('validation', `'${e.target.value}' is not a valid number`);
                                            e.target.value = v.value;
                                            return;
                                        }
                                        console.log(`[VariablesPanel] Updating value of variable ${v.name} to ${num}`);
                                        v.value = num;
                                        delete v.solved;
                                        ctx.commit('variable');
                                    } catch (err) {
                                        console.error(`[VariablesPanel] Failed to update value for variable ${v.name}:`, err);
                                        if (typeof ctx.error === 'function') {
                                            ctx.error('variable', `Failed to update variable value: ${err.message || err}`);
                                        }
                                    }
                                },
                            })
                        ),
                        h('td', {class: 'pc-muted'}, v.solved != null ? fmt(v.solved) : '—'),
                        h(
                            'td',
                            {},
                            h('input', {
                                type: 'checkbox',
                                checked: v.locked,
                                disabled: ro,
                                title: 'Locked (solver may not change it)',
                                onchange: (e) => {
                                    try {
                                        console.log(`[VariablesPanel] Updating locked status for ${v.name} to ${e.target.checked}`);
                                        v.locked = e.target.checked;
                                        ctx.commit('variable');
                                    } catch (err) {
                                        console.error(`[VariablesPanel] Failed to update lock status for variable ${v.name}:`, err);
                                        if (typeof ctx.error === 'function') {
                                            ctx.error('variable', `Failed to update lock status: ${err.message || err}`);
                                        }
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
                                        title: 'Delete variable',
                                        onclick: () => {
                                            try {
                                                console.log(`[VariablesPanel] Deleting variable ${v.name} (${v.id})`);
                                                removeEntity(sk, v.id);
                                                ctx.commit('variable');
                                            } catch (err) {
                                                console.error(`[VariablesPanel] Failed to delete variable ${v.name}:`, err);
                                                if (typeof ctx.error === 'function') {
                                                    ctx.error('variable', `Failed to delete variable: ${err.message || err}`);
                                                }
                                            }
                                        },
                                    },
                                    '✕'
                                )
                        )
                    )
                );
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
                            h('th', {}, 'Name'),
                            h('th', {}, 'Value'),
                            h('th', {}, 'Solved'),
                            h('th', {}, 'Lock'),
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
                                    const name = uniqueName(sk, 'v');
                                    console.log(`[VariablesPanel] Adding new variable ${name}`);
                                    addVariable(sk, {name, value: 0, locked: true});
                                    ctx.commit('variable');
                                } catch (err) {
                                    console.error('[VariablesPanel] Failed to add variable:', err);
                                    if (typeof ctx.error === 'function') {
                                        ctx.error('variable', `Failed to add variable: ${err.message || err}`);
                                    }
                                }
                            },
                        },
                        '+ Variable'
                    )
                );
            }
        } catch (err) {
            console.error('[VariablesPanel] Render update failed:', err);
        }
    }

    return {el, update};
}