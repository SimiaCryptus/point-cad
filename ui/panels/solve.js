import {fmt, h, panelShell, statusDot} from '../dom.js';
import {findPoint} from '../../core/model.js';

export function createSolvePanel(ctx) {
    const methodSel = h('select', {
        class: 'pc-in',
        onchange: (e) => {
            try {
                ctx.sketch.solver.method = e.target.value;
                ctx.commit('solver');
            } catch (err) {
                console.error('Failed to change solver method:', err);
            }
        },
    });
    const iterIn = h('input', {
        type: 'number',
        min: '1',
        step: '1',
        class: 'pc-in pc-in-num',
        onchange: (e) => {
            try {
                ctx.sketch.solver.maxIterations = Math.max(1, Number(e.target.value) || 1);
                ctx.commit('solver');
            } catch (err) {
                console.error('Failed to update solver max iterations:', err);
            }
        },
    });
    const tolIn = h('input', {
        type: 'number',
        step: 'any',
        class: 'pc-in pc-in-num',
        onchange: (e) => {
            try {
                ctx.sketch.solver.tolerance = Number(e.target.value) || 1e-6;
                ctx.commit('solver');
            } catch (err) {
                console.error('Failed to update solver tolerance:', err);
            }
        },
    });
    const objIn = h('input', {
        type: 'number',
        step: 'any',
        min: '0',
        class: 'pc-in pc-in-num',
        title: 'Global weight scale for minimize/maximize terms',
        onchange: (e) => {
            try {
                ctx.sketch.solver.objectiveScale = Number(e.target.value) || 0;
                ctx.commit('solver');
            } catch (err) {
                console.error('Failed to update solver objective scale:', err);
            }
        },
    });
    const frameChk = h('input', {
        type: 'checkbox',
        title:
            'When at most one point is fixed, re-centre the solved sketch and align it to its principal axes so the free rigid-body frame is pinned instead of reported as slack',
        onchange: (e) => {
            try {
                ctx.sketch.solver.frame = e.target.checked ? 'auto' : 'none';
                ctx.commit('solver');
            } catch (err) {
                console.error('Failed to update solver frame mode:', err);
            }
        },
    });
    const centerBtn = h(
        'button',
        {
            class: 'pc-btn',
            type: 'button',
            title:
                'Re-centre the sketch now and align it to its principal axes (seeds and solution move together)',
            onclick: () => {
                try {
                    ctx.center();
                } catch (err) {
                    console.error('Failed to center sketch:', err);
                }
            },
        },
        'Center now'
    );
    const solveBtn = h(
        'button',
        {
            class: 'pc-btn pc-primary',
            type: 'button',
            onclick: () => {
                try {
                    ctx.solve();
                } catch (err) {
                    console.error('Failed to execute sketch solver:', err);
                }
            },
        },
        'Solve'
    );
    const resetBtn = h(
        'button',
        {
            class: 'pc-btn',
            type: 'button',
            onclick: () => {
                try {
                    ctx.reset();
                } catch (err) {
                    console.error('Failed to reset sketch to seeds:', err);
                }
            },
        },
        'Reset to seeds'
    );
    const adoptBtn = h(
        'button',
        {
            class: 'pc-btn',
            type: 'button',
            onclick: () => {
                try {
                    ctx.adopt();
                } catch (err) {
                    console.error('Failed to adopt solver solution:', err);
                }
            },
        },
        'Adopt solution'
    );
    const summary = h('div', {class: 'pc-summary'});
    const list = h('div', {class: 'pc-list'});
    const scenRow = h('div', {class: 'pc-row pc-theme-tabs'});

    const body = h(
        'div',
        {},
        h('div', {class: 'pc-row'}, solveBtn, resetBtn, adoptBtn),
        scenRow,
        h('div', {class: 'pc-row'}, h('label', {}, 'Method'), methodSel),
        h(
            'div',
            {class: 'pc-row'},
            h('label', {}, 'Iterations'),
            iterIn,
            h('label', {}, 'Tolerance'),
            tolIn
        ),
        h('div', {class: 'pc-row'}, h('label', {}, 'Objective scale'), objIn),
        h(
            'div',
            {class: 'pc-row'},
            h('label', {}, 'Frame'),
            h('label', {class: 'pc-check'}, frameChk, 'auto-center & align'),
            centerBtn
        ),
        summary,
        list
    );
    const el = panelShell('Solve', body);

    function update() {
        try {
            const sk = ctx.sketch;
            const ro = ctx.readonly;
            const solvers = [...ctx.registry.solvers.values()];
            methodSel.replaceChildren(...solvers.map((s) => h('option', {value: s.id}, s.name ?? s.id)));
            methodSel.value = sk.solver.method;
            iterIn.value = sk.solver.maxIterations;
            tolIn.value = sk.solver.tolerance;
            objIn.value = sk.solver.objectiveScale ?? 0.001;
            frameChk.checked = (sk.solver.frame ?? 'auto') !== 'none';
            for (const i of [methodSel, iterIn, tolIn, objIn, frameChk, centerBtn, resetBtn, adoptBtn])
                i.disabled = ro;
            adoptBtn.disabled = ro || !sk.points.some((p) => p.solved);
            centerBtn.disabled = ro || sk.points.filter((p) => p.fixed).length > 1 || !sk.points.length;
            const active = ctx.activeScenario ?? null;
            scenRow.hidden = !(sk.scenarios ?? []).length;
            scenRow.replaceChildren(
                h('label', {}, 'Scenario'),
                ...(sk.scenarios ?? []).map((s) =>
                    h(
                        'button',
                        {
                            class: `pc-btn pc-tool${s.id === active ? ' pc-active' : ''}`,
                            type: 'button',
                            title: `Show the '${s.id}' solution`,
                            onclick: () => {
                                try {
                                    ctx.setActiveScenario(s.id);
                                } catch (err) {
                                    console.error(`Failed to set active scenario '${s.id}':`, err);
                                }
                            },
                        },
                        s.id
                    )
                )
            );

            const r = ctx.result;
            summary.replaceChildren();
            list.replaceChildren();
            if (!r) {
                summary.append(h('div', {class: 'pc-muted'}, 'Not solved yet.'));
                return;
            }
            const flags = [];
            if (r.overConstrained)
                flags.push(
                    h(
                        'div',
                        {class: 'pc-flag pc-flag-bad'},
                        'Over-constrained or stuck: some equalities cannot be met.'
                    )
                );
            if (r.underConstrained)
                flags.push(
                    h(
                        'div',
                        {class: 'pc-flag pc-flag-warn'},
                        `Under-constrained: ${r.dof?.real ?? 0} free degree${(r.dof?.real ?? 0) === 1 ? '' : 's'} of freedom (nearest solution to the seeds was chosen).`
                    )
                );
            const dofRigid = r.dof?.rigid ?? 0;
            const dofReal = r.dof?.real ?? 0;
            const dofTotal = r.dof?.total ?? (dofRigid + dofReal);
            if (dofRigid > 0) {
                flags.push(
                    h(
                        'div',
                        {class: 'pc-flag pc-flag-info'},
                        r.gaugeFixed
                            ? `${dofRigid} rigid-body DOF gauge-fixed: the sketch was re-centred and aligned to its principal axes (not counted as under-constrained).`
                            : `${dofRigid} rigid-body DOF: the sketch floats freely — enable frame auto-alignment or fix a point.`
                    )
                );
            }
            summary.append(
                h(
                    'div',
                    {class: `pc-result ${r.converged ? 'pc-status-ok' : 'pc-status-bad'}`},
                    statusDot(r.converged ? 'ok' : 'bad'),
                    h('b', {}, r.converged ? 'Converged' : 'Did not converge'),
                    ` · ${r.iterations} iter · residual ${fmt(r.residualNorm, 6)} · unknowns ${r.unknowns} · rank ${r.rank} · DOF ${dofTotal} (${dofRigid} rigid + ${dofReal} real)`
                ),
                ...flags
            );
            for (const pc of (r.perConstraint ?? [])) {
                if (pc.scenario != null && active != null && pc.scenario !== active) continue;
                const c = sk.constraints.find((x) => x.id === pc.id);
                const pts = (c?.points ?? pc.points ?? [])
                    .map((id) => findPoint(sk, id)?.label ?? id)
                    .join(' ');
                const op = pc.targetKind === 'atLeast' ? '≥' : pc.targetKind === 'atMost' ? '≤' : 'vs';
                const text =
                    pc.status === 'objective'
                        ? `${fmt(pc.measure)} (objective)`
                        : `${fmt(pc.measure)} ${op} ${fmt(pc.target)} · Δ ${fmt(pc.residual, 5)}`;
                list.append(
                    h(
                        'div',
                        {
                            class: 'pc-item',
                            onclick: () => {
                                try {
                                    if (c?.points) ctx.select(c.points);
                                } catch (err) {
                                    console.error(`Failed to select points for constraint '${pc.id}':`, err);
                                }
                            },
                        },
                        statusDot(pc.status),
                        h('span', {class: 'pc-item-main'}, h('b', {}, pc.type), ` ${pts}`),
                        h('span', {class: 'pc-muted'}, text)
                    )
                );
            }
        } catch (err) {
            console.error('Failed to update solve panel:', err);
        }
    }

    return {el, update};
}