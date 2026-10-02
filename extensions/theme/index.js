// Theme designer extension (headless part): registers the OKLab space,
// colour constraint kinds, `theme` / `gamut` statements, point roles and
// automatic gamut constraints. Import `./ui/index.js` for the UI panel.
import {registry as defaultRegistry} from '../../core/index.js';
import {oklab} from './space-oklab.js';
import {colorConstraintKinds} from './constraints-color.js';
import {gamutStatement, implicitGamutConstraints, POINT_ROLES, themeStatement} from './themes.js';


export function registerTheme(reg = defaultRegistry) {
    if (!reg || typeof reg !== 'object') {
        console.error('[theme-extension] Cannot register theme: provided registry is null or not an object', reg);
        throw new TypeError('Cannot register theme: invalid registry');
    }

    try {
        const hasSpace = typeof reg.hasSpace === 'function' ? reg.hasSpace(oklab.id) : false;
        if (!hasSpace) {
            if (typeof reg.registerSpace === 'function') {
                reg.registerSpace(oklab);
            } else {
                console.warn(`[theme-extension] Registry does not support registerSpace for space "${oklab?.id}".`);
            }
        }
    } catch (err) {
        console.error(`[theme-extension] Error registering color space "${oklab?.id}":`, err);
        throw err;
    }

    for (const k of colorConstraintKinds) {
        try {
            const hasKind = typeof reg.hasConstraintKind === 'function' ? reg.hasConstraintKind(k.id) : false;
            if (!hasKind) {
                if (typeof reg.registerConstraintKind === 'function') {
                    reg.registerConstraintKind(k);
                } else {
                    console.warn(`[theme-extension] Registry does not support registerConstraintKind for "${k?.id}".`);
                }
            }
        } catch (err) {
            console.error(`[theme-extension] Error registering constraint kind "${k?.id}":`, err);
            throw err;
        }
    }

    for (const st of [themeStatement, gamutStatement]) {
        try {
            const hasSt = typeof reg.hasStatement === 'function' ? reg.hasStatement(st.id) : false;
            if (!hasSt) {
                if (typeof reg.registerStatement === 'function') {
                    reg.registerStatement(st);
                } else {
                    console.warn(`[theme-extension] Registry does not support registerStatement for "${st?.id}".`);
                }
            }
        } catch (err) {
            console.error(`[theme-extension] Error registering statement "${st?.id}":`, err);
            throw err;
        }
    }

    for (const r of POINT_ROLES) {
        try {
            const hasRole = typeof reg.hasPointRole === 'function'
                ? reg.hasPointRole(r.id)
                : Boolean(reg.pointRoles?.has(r.id));
            if (!hasRole) {
                if (typeof reg.registerPointRole === 'function') {
                    reg.registerPointRole(r);
                } else {
                    console.warn(`[theme-extension] Registry does not support registerPointRole for "${r?.id}".`);
                }
            }
        } catch (err) {
            console.error(`[theme-extension] Error registering point role "${r?.id}":`, err);
            throw err;
        }
    }

    try {
        const hasImplicit = Array.isArray(reg.implicitConstraints)
            ? reg.implicitConstraints.includes(implicitGamutConstraints)
            : false;
        if (!hasImplicit) {
            if (typeof reg.registerImplicitConstraints === 'function') {
                reg.registerImplicitConstraints(implicitGamutConstraints);
            } else {
                console.warn('[theme-extension] Registry does not support registerImplicitConstraints.');
            }
        }
    } catch (err) {
        console.error('[theme-extension] Error registering implicit gamut constraints:', err);
        throw err;
    }

    return reg;
}

try {
    registerTheme();
} catch (err) {
    console.error('[theme-extension] Automatic registration with default registry failed:', err);
}

export {oklab} from './space-oklab.js';
export * from './measures-color.js';
export * from './constraints-color.js';
export * from './themes.js';
export {emitCSS} from './emit-css.js';
export {emitTokens, emitTokensString} from './emit-tokens.js';