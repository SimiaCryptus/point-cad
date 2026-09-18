// Palette -> W3C Design Tokens JSON, one group per theme, with a
// `$extensions.pointcad` block naming the constraints that bind each colour.
import { registry as defaultRegistry } from '../../core/registry.js';
import { exportedPoints, themeList, kebab } from './themes.js';

export function emitTokens(
  sketch,
  result = null,
  { format = 'oklch', space = null, registry = defaultRegistry } = {}
) {
  const sp = space ?? registry.getSpace(sketch.space);
  const points = exportedPoints(sketch);
  const doc = {};
  for (const t of themeList(sketch, result)) {
    const group = {};
    const residuals = result?.perScenario?.[t.id]?.residuals ?? result?.perConstraint ?? [];
    for (const p of points) {
      const binding = sketch.constraints.filter((c) => c.points.includes(p.id));
      group[kebab(p.label)] = {
        $type: 'color',
        $value: sp.formatLiteral(t.colors.get(p.id), format),
        $extensions: {
          pointcad: {
            id: p.id,
            role: p.role ?? null,
            constraints: binding.map((c) => {
              const r = residuals.find((x) => x.id === c.id);
              return {
                id: c.id,
                type: c.type,
                status: r?.status ?? null,
                residual: r?.residual ?? null,
              };
            }),
          },
        },
      };
    }
    doc[t.id ?? 'default'] = group;
  }
  return doc;
}

export function emitTokensString(sketch, result, options) {
  return JSON.stringify(emitTokens(sketch, result, options), null, 2);
}
