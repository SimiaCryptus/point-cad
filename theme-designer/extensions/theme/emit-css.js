// Palette -> CSS custom properties, one block per theme.
import {registry as defaultRegistry} from '../../core/registry.js';
import {exportedPoints, kebab, themeList} from './themes.js';

/**
 * Emits CSS custom properties (variables) for a Point-CAD sketch theme.
 *
 * Generates one CSS block per theme variant with support for media queries
 * (`prefers-color-scheme`), data attributes (`[data-theme="..."]`), and CSS classes (`.theme-...`).
 *
 * @param {object} sketch - The sketch model object containing points and space definition.
 * @param {object|null} [result=null] - The solved evaluation result mapping point IDs to coordinates.
 * @param {object} [options={}] - Emission configuration options.
 * @param {string} [options.prefix='color-'] - Variable name prefix, e.g. '--color-'.
 * @param {string} [options.format='oklch'] - CSS color function format ('oklch', 'oklab', 'rgb', 'hex').
 * @param {string[]} [options.switchMode=['media', 'attribute']] - Theme switching mechanisms ('media', 'attribute', 'class').
 * @param {string|null} [options.defaultTheme=null] - ID of the default theme block.
 * @param {string} [options.scope=':root'] - CSS selector scope for the base variables.
 * @param {boolean} [options.fallback=false] - Whether to prepend an sRGB fallback prior to modern color formats.
 * @param {boolean} [options.header=true] - Whether to include a comment header summarizing colours and themes.
 * @param {object|null} [options.space=null] - Explicit color space override; defaults to registry lookup.
 * @param {object} [options.registry=defaultRegistry] - Color space registry instance.
 * @returns {string} Emitted CSS stylesheet string.
 * @throws {TypeError} If sketch is invalid or not an object.
 * @throws {Error} If color space is unknown or lacks formatLiteral capability.
 */
export function emitCSS(sketch, result = null, options = {}) {
    if (!sketch || typeof sketch !== 'object') {
        console.error('emitCSS: Invalid sketch provided (must be an object):', sketch);
        throw new TypeError('Invalid sketch: must be a valid sketch object');
    }

    const {
        prefix = 'color-',
        format = 'oklch',
        switchMode = ['media', 'attribute'],
        defaultTheme = null,
        scope = ':root',
        fallback = false,
        header = true,
        space = null,
        registry = defaultRegistry,
    } = options;
    const sp = space ?? registry?.getSpace?.(sketch.space);
    if (!sp) {
        console.error(`emitCSS: Color space '${sketch.space}' not found in registry`);
        throw new Error(`Space '${sketch.space}' not found in registry`);
    }
    if (typeof sp.formatLiteral !== 'function') {
        console.error(`emitCSS: Space '${sketch.space}' cannot format colours (missing formatLiteral)`);
        throw new Error(`Space '${sketch.space}' cannot format colours`);
    }

    const points = exportedPoints(sketch);
    if (!points || points.length === 0) {
        console.warn('emitCSS: Sketch has no exported points; CSS output will contain empty rule blocks');
    }

    const themes = themeList(sketch, result);
    if (!themes || themes.length === 0) {
        console.warn('emitCSS: No themes found for sketch; returning empty stylesheet');
        return header ? `/* Point-CAD theme — 0 colours */\n` : '';
    }

    let def = themes.find((t) => t.id === defaultTheme);
    if (defaultTheme != null && !def) {
        console.warn(
            `emitCSS: Default theme '${defaultTheme}' not found among themes: [${themes.map((t) => t.id).filter(Boolean).join(', ')}]. Falling back to '${themes[0]?.id ?? 'first theme'}'.`
        );
        def = themes[0];
    } else if (!def) {
        def = themes[0];
    }

    const modes = new Set(Array.isArray(switchMode) ? switchMode : switchMode != null ? [switchMode] : []);

    const decls = (colors, themeId) =>
        points.map((p) => {
            const c = colors?.get?.(p.id);
            const name = `--${prefix}${kebab(p.label || String(p.id))}`;
            if (c == null) {
                console.warn(`emitCSS: Color missing for point '${p.label}' (id: ${p.id}) in theme '${themeId ?? 'default'}'`);
                return `  ${name}: initial;`;
            }
            const lines = [];
            try {
                if (fallback && format !== 'rgb' && format !== 'hex')
                    lines.push(`  ${name}: ${sp.formatLiteral(c, 'rgb')};`);
                lines.push(`  ${name}: ${sp.formatLiteral(c, format)};`);
            } catch (err) {
                console.error(`emitCSS: Failed to format color for point '${p.label}' (${p.id}) using format '${format}':`, err);
                throw err;
            }
            return lines.join('\n');
        });
    const block = (selector, colors, themeId) => `${selector} {\n${decls(colors, themeId).join('\n')}\n}`;
    const themed = (id) => (scope === ':root' ? '' : scope);

    const out = [];
    if (header) {
        const themeIds = themes.map((t) => t.id).filter(Boolean);
        const themeSummary = themeIds.length > 0 ? `, themes: ${themeIds.join(', ')}` : '';
        out.push(
            `/* Point-CAD theme — ${points.length} colour${points.length === 1 ? '' : 's'}${themeSummary} */`
        );
    }
    out.push(block(scope, def.colors, def.id));
    for (const t of themes) {
        if (t.id == null || t === def) continue;
        if (modes.has('media') && (t.id === 'dark' || t.id === 'light')) {
            out.push(
                `@media (prefers-color-scheme: ${t.id}) {\n${block(scope, t.colors, t.id).replace(/^/gm, '  ')}\n}`
            );
        }
    }
    for (const t of themes) {
        if (t.id == null) continue;
        if (modes.has('attribute')) out.push(block(`${themed(t.id)}[data-theme="${t.id}"]`, t.colors, t.id));
        if (modes.has('class')) out.push(block(`${themed(t.id)}.theme-${t.id}`, t.colors, t.id));
    }
    return out.join('\n') + '\n';
}