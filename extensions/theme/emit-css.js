// Palette -> CSS custom properties, one block per theme.
import { registry as defaultRegistry } from '../../core/registry.js';
import { exportedPoints, themeList, kebab } from './themes.js';

/**
 * Options: `prefix` ("color-"), `format` (oklch | oklab | rgb | hex),
 * `switchMode` (array of "media", "attribute", "class"), `defaultTheme`,
 * `scope` (":root" or any selector), `fallback` (emit rgb() before oklch()).
 */
export function emitCSS(sketch, result = null, options = {}) {
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
  const sp = space ?? registry.getSpace(sketch.space);
  if (typeof sp.formatLiteral !== 'function')
    throw new Error(`Space '${sketch.space}' cannot format colours`);
  const points = exportedPoints(sketch);
  const themes = themeList(sketch, result);
  const def = themes.find((t) => t.id === defaultTheme) ?? themes[0];
  const modes = new Set(switchMode);

  const decls = (colors) =>
    points.map((p) => {
      const c = colors.get(p.id);
      const name = `--${prefix}${kebab(p.label)}`;
      const lines = [];
      if (fallback && format !== 'rgb' && format !== 'hex')
        lines.push(`  ${name}: ${sp.formatLiteral(c, 'rgb')};`);
      lines.push(`  ${name}: ${sp.formatLiteral(c, format)};`);
      return lines.join('\n');
    });
  const block = (selector, colors) => `${selector} {\n${decls(colors).join('\n')}\n}`;
  const themed = (id) => (scope === ':root' ? '' : scope);

  const out = [];
  if (header)
    out.push(
      `/* Point-CAD theme — ${points.length} colour${points.length === 1 ? '' : 's'}${themes[0].id ? `, themes: ${themes.map((t) => t.id).join(', ')}` : ''} */`
    );
  out.push(block(scope, def.colors));
  for (const t of themes) {
    if (t.id == null || t === def) continue;
    if (modes.has('media') && (t.id === 'dark' || t.id === 'light')) {
      out.push(
        `@media (prefers-color-scheme: ${t.id}) {\n${block(scope, t.colors).replace(/^/gm, '  ')}\n}`
      );
    }
  }
  for (const t of themes) {
    if (t.id == null) continue;
    if (modes.has('attribute')) out.push(block(`${themed(t.id)}[data-theme="${t.id}"]`, t.colors));
    if (modes.has('class')) out.push(block(`${themed(t.id)}.theme-${t.id}`, t.colors));
  }
  return out.join('\n') + '\n';
}
