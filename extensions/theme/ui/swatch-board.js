// Swatch board tool window: theme tabs, exported colours rendered on the
// palette's canvas, binding-constraint status dots and the emitted CSS.
import {h, panelShell, statusDot} from '../../../ui/dom.js';
import {exportedPoints, isExported, scenarioColors} from '../themes.js';
import {emitCSS} from '../emit-css.js';
import {wcagContrast} from '../measures-color.js';

export function createSwatchPanel(ctx) {
    const tabs = h('div', {class: 'pc-row pc-theme-tabs'});
    const board = h('div', {class: 'pc-swatches'});
    const cssBox = h('pre', {class: 'pc-css'});
    const copyBtn = h(
        'button',
        {
            class: 'pc-btn',
            type: 'button',
            title: 'Copy the CSS custom properties',
            onclick: async () => {
                try {
                    await navigator.clipboard.writeText(cssBox.textContent);
                } catch (err) {
                    console.warn('Failed to copy CSS to clipboard:', err);
                }
            },
        },
        'Copy CSS'
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
                    console.error('Failed to solve themes:', err);
                }
            },
        },
        'Solve themes'
    );
    const body = h('div', {}, tabs, board, h('div', {class: 'pc-row'}, solveBtn, copyBtn), cssBox);
    const el = panelShell('Swatches', body);

    function update() {
        const sk = ctx.sketch;
        const space = ctx.getSpace();
        if (typeof space.toCSS !== 'function') {
            console.warn(`Space '${sk?.space}' is not a colour space — cannot render swatches.`);
            tabs.replaceChildren();
            board.replaceChildren(
                h(
                    'div',
                    {class: 'pc-muted pc-empty'},
                    `Space '${sk.space}' is not a colour space — start a script with 'space oklab'.`
                )
            );
            cssBox.textContent = '';
            return;
        }
        const scen = sk.scenarios ?? [];
        const active = ctx.activeScenario ?? scen[0]?.id ?? null;
        tabs.replaceChildren(
            ...scen.map((s) =>
                h(
                    'button',
                    {
                        class: `pc-btn pc-tool${s.id === active ? ' pc-active' : ''}`,
                        type: 'button',
                        title: `Show theme '${s.id}'`,
                        onclick: () => {
                            try {
                                ctx.setActiveScenario(s.id);
                            } catch (err) {
                                console.error(`Failed to activate scenario '${s.id}':`, err);
                            }
                        },
                    },
                    s.id
                )
            )
        );
        let colors = new Map();
        try {
            colors = scenarioColors(sk, ctx.result, active);
        } catch (err) {
            console.error(`Failed to compute scenario colors for '${active}':`, err);
        }
        let evals = new Map();
        try {
            evals = new Map(ctx.evaluate().map((e) => [e.id, e]));
        } catch (err) {
            console.error('Failed to evaluate constraints:', err);
        }
        const exported = exportedPoints(sk);
        const bgPoint =
            sk.points.find((p) => p.role === 'anchor' && isExported(p)) ?? exported[0] ?? null;
        const bg = bgPoint ? colors.get(bgPoint.id) : null;
        board.replaceChildren(
            ...exported.map((p) => {
                const c = colors.get(p.id);
                let css = '';
                try {
                    if (c) css = space.toCSS(c);
                } catch (err) {
                    console.error(`Failed to convert color to CSS for point '${p.id}':`, err);
                }
                const onBg = bg && p !== bgPoint;
                let bgCss = css;
                if (onBg && bg) {
                    try {
                        bgCss = space.toCSS(bg);
                    } catch (err) {
                        console.error(`Failed to convert background color to CSS for point '${p.id}':`, err);
                    }
                }
                let contrast = null;
                if (onBg && c && bg) {
                    try {
                        contrast = wcagContrast(space, c, bg);
                    } catch (err) {
                        console.error(`Failed to compute contrast for point '${p.id}':`, err);
                    }
                }
                const binding = sk.constraints.filter((k) => k.points.includes(p.id));
                let literal = '';
                try {
                    if (c) literal = space.formatLiteral(c, 'oklch');
                } catch (err) {
                    console.error(`Failed to format color literal for point '${p.id}':`, err);
                }
                return h(
                    'div',
                    {
                        class: 'pc-swatch',
                        style: `background:${onBg ? bgCss : css}`,
                        title: p.id,
                        onclick: () => {
                            try {
                                ctx.select([p.id]);
                            } catch (err) {
                                console.error(`Failed to select point '${p.id}':`, err);
                            }
                        },
                    },
                    h('div', {class: 'pc-swatch-chip', style: `background:${css}`}),
                    h(
                        'div',
                        {class: 'pc-swatch-meta', style: onBg ? `color:${css}` : ''},
                        h('b', {}, p.label + (p.role ? ` · ${p.role}` : '')),
                        h(
                            'span',
                            {},
                            literal + (contrast != null ? ` · ${contrast.toFixed(2)}:1` : '')
                        )
                    ),
                    h(
                        'div',
                        {class: 'pc-swatch-dots'},
                        ...binding.map((k) => {
                            const ev = evals.get(k.id);
                            return statusDot(
                                ev?.status ?? 'none',
                                `${k.type} ${Object.values(k.params ?? {}).join(' ')} ${k.points.join(' ')}`.replace(
                                    /\s+/g,
                                    ' '
                                )
                            );
                        })
                    )
                );
            })
        );
        if (!exported.length)
            board.append(h('div', {class: 'pc-muted pc-empty'}, 'No exported colours yet.'));
        try {
            cssBox.textContent = emitCSS(sk, ctx.result, {space, registry: ctx.registry});
        } catch (e) {
            cssBox.textContent = `/* ${e.message} */`;
        }
    }

    return {el, update};
}