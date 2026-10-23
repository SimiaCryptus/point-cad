// Palette -> W3C Design Tokens JSON, one group per theme, with a
// `$extensions.pointcad` block naming the constraints that bind each colour.
import {registry as defaultRegistry} from '../../core/registry.js';
import {exportedPoints, kebab, themeList} from './themes.js';

/**
 * Emits W3C Design Tokens JSON representation for a sketch and solver result.
 * Organizes tokens by theme group, including a `$extensions.pointcad` block
 * that captures constraint bindings, residuals, and point roles.
 *
 * @param {Object} sketch - The sketch object containing points, constraints, and space.
 * @param {Object|null} [result=null] - Solver result object.
 * @param {Object} [options={}] - Configuration options.
 * @param {string} [options.format='oklch'] - Output color literal format.
 * @param {Object|null} [options.space=null] - Explicit color space instance override.
 * @param {Object} [options.registry=defaultRegistry] - Color space registry.
 * @returns {Object} W3C Design Tokens JSON document.
 * @throws {TypeError} When sketch or registry parameters are invalid.
 * @throws {Error} When the color space cannot be resolved.
 */

export function emitTokens(
    sketch,
    result = null,
    {format = 'oklch', space = null, registry = defaultRegistry} = {}
) {
    if (!sketch || typeof sketch !== 'object') {
        console.error('emitTokens: Invalid sketch parameter provided:', sketch);
        throw new TypeError('emitTokens expects a valid sketch object');
    }

    const reg = registry ?? defaultRegistry;
    if (!reg || typeof reg.getSpace !== 'function') {
        console.error('emitTokens: Invalid registry provided:', reg);
        throw new TypeError('emitTokens expects a valid registry with a getSpace method');
    }

    const sp = space ?? reg.getSpace(sketch.space);
    if (!sp) {
        console.error(`emitTokens: Color space "${sketch.space}" could not be resolved from registry`);
        throw new Error(`Color space "${sketch.space}" not found in registry`);
    }
    if (typeof sp.formatLiteral !== 'function') {
        console.error(`emitTokens: Color space "${sketch.space}" lacks formatLiteral method:`, sp);
        throw new TypeError(`Color space "${sketch.space}" missing formatLiteral method`);
    }

    let points;
    try {
        points = exportedPoints(sketch);
    } catch (err) {
        console.error('emitTokens: Failed to retrieve exported points from sketch:', err);
        throw err;
    }
    if (!Array.isArray(points)) {
        console.warn('emitTokens: exportedPoints did not return an array; defaulting to empty list');
        points = [];
    }

    let themes;
    try {
        themes = themeList(sketch, result);
    } catch (err) {
        console.error('emitTokens: Failed to retrieve theme list:', err);
        throw err;
    }
    if (!Array.isArray(themes)) {
        console.warn('emitTokens: themeList did not return an array; defaulting to empty list');
        themes = [];
    }

    const constraints = Array.isArray(sketch.constraints) ? sketch.constraints : [];
    const doc = {};
    for (const t of themes) {
        const group = {};
        const residuals = result?.perScenario?.[t.id]?.residuals ?? result?.perConstraint ?? [];
        const residualList = Array.isArray(residuals) ? residuals : [];

        for (const p of points) {
            const binding = constraints.filter((c) => Array.isArray(c?.points) && c.points.includes(p.id));
            const color = t.colors?.get ? t.colors.get(p.id) : t.colors?.[p.id];

            let formattedValue = null;
            if (color !== undefined && color !== null) {
                try {
                    formattedValue = sp.formatLiteral(color, format);
                } catch (err) {
                    console.error(`emitTokens: Failed to format color for point "${p.id}" (${p.label}) using format "${format}":`, err);
                    throw err;
                }
            } else {
                console.warn(`emitTokens: Missing color value for point "${p.id}" (${p.label}) in theme "${t.id ?? 'default'}"`);
            }

            const tokenKey = kebab(p.label ?? p.id ?? 'unnamed');
            if (group[tokenKey] !== undefined) {
                console.warn(`emitTokens: Duplicate token key "${tokenKey}" in theme "${t.id ?? 'default'}"; overwriting previous value`);
            }

            group[tokenKey] = {
                $type: 'color',
                $value: formattedValue,
                $extensions: {
                    pointcad: {
                        id: p.id,
                        role: p.role ?? null,
                        constraints: binding.map((c) => {
                            const r = residualList.find((x) => x?.id === c.id);
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

/**
 * Emits W3C Design Tokens JSON as a formatted string.
 *
 * @param {Object} sketch - The sketch object.
 * @param {Object|null} [result=null] - Solver result object.
 * @param {Object} [options={}] - Token emission options.
 * @returns {string} Formatted JSON string.
 */
export function emitTokensString(sketch, result = null, options = {}) {
    try {
        return JSON.stringify(emitTokens(sketch, result, options), null, 2);
    } catch (err) {
        console.error('emitTokensString: Failed to serialize tokens to JSON string:', err);
        throw err;
    }
}