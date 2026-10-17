// `theme` / `gamut` statements, point roles, auto-gamut constraints and
// helpers for solving a palette over its themes.
import {registry as defaultRegistry} from '../../core/registry.js';
import {buildProblem} from '../../core/problem.js';
import {findScenario} from '../../core/model.js';
export const POINTCAD_MIME = 'application/vnd.pointcad';
export const THEMECAD_MIME = 'application/vnd.themecad';
export const PCAD_TEXT_MIME = 'text/x-pcad';
export const POINTCAD_MIMES = Object.freeze([
     POINTCAD_MIME,
     THEMECAD_MIME,
     PCAD_TEXT_MIME,
     'application/x-pointcad',
     'application/x-themecad',
]);
export const POINTCAD_EXTENSIONS = Object.freeze(['.pcad', '.tcad', '.pointcad', '.themecad']);

/** Roles a colour point can take (§3.1). `fixed` feeds the solver, `export` the emitters. */
export const POINT_ROLES = [
    {
        id: 'anchor',
        fixed: true,
        export: true,
        description: 'Theme input that is also a token (brand colour, canvas)',
    },
    {
        id: 'orientation',
        fixed: true,
        export: false,
        description: 'Theme input that steers derived colours but is not a token',
    },
    {id: 'derived', fixed: false, export: true, description: 'Solver output, exported as a token'},
    {id: 'helper', fixed: false, export: false, description: 'Solver scaffolding, never exported'},
];

/** `theme NAME { … }` is sugar for the core `scenario` statement. */
export const themeStatement = {
    id: 'theme',
    scenarioKeyword: true,
    description: 'theme NAME { [point] P at colour …  var V = number … }',
    parse(parser) {
        return parser.parseScenario();
    },
};

export const GAMUT_MODES = ['srgb', 'off'];

export function gamutMode(sketch) {
    return sketch?.extensions?.theme?.gamut ?? 'off';
}

/**
 * `gamut srgb|off` switches automatic gamut constraints for exported
 * points; `gamut P <= 0` is the ordinary constraint statement.
 */
export const gamutStatement = {
    id: 'gamut',
    description: 'gamut srgb|off — auto-add `gamut P <= 0` for every exported point',
    parse(parser) {
        const next = parser.peek(1);
        if (next && next.type === 'ident' && GAMUT_MODES.includes(next.value)) {
            parser.next();
            parser.next();
            const sk = parser.ctx.sketch;
            if (!sk.extensions || typeof sk.extensions !== 'object') sk.extensions = {};
            sk.extensions.theme = {...(sk.extensions.theme ?? {}), gamut: next.value};
            parser.ctx.ops.push({op: 'gamut', id: next.value});
            return;
        }
        return parser.parseConstraint();
    },
    emit(sketch) {
        const mode = sketch.extensions?.theme?.gamut;
        return mode ? [`gamut ${mode}`] : [];
    },
};
const escStr = (s) => String(s ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
function ensureThemeExt(sketch) {
     if (!sketch.extensions || typeof sketch.extensions !== 'object') sketch.extensions = {};
     if (!sketch.extensions.theme || typeof sketch.extensions.theme !== 'object') {
         sketch.extensions.theme = {};
     }
     return sketch.extensions.theme;
}
function acceptStringOrIdent(parser, what) {
     if (parser.is('string') || parser.is('ident')) return parser.next().value;
     return parser.expect('string', undefined, what).value;
}
/**
  * `project "Name"` — sets the project title in the sketch's theme metadata.
  */
export const projectStatement = {
     id: 'project',
     description: 'project "<name>" — project name for emitted theme artifacts',
     parse(parser) {
         parser.next(); // consume 'project'
         const name = acceptStringOrIdent(parser, 'project name string');
         const ext = ensureThemeExt(parser.ctx.sketch);
         ext.project = name;
         parser.ctx.ops.push({op: 'project', name});
     },
     emit(sketch) {
         const name = sketch.extensions?.theme?.project;
         return name ? [`project "${escStr(name)}"`] : [];
     },
};
/**
  * `template "preview.html" [css "preview.css"]` or
  * `template html "preview.html"` / `template css "preview.css"`
  * References external HTML/CSS template files from the PCS script.
  */
export const templateStatement = {
     id: 'template',
     description: 'template [html|css] "<path>" — reference external preview HTML and CSS files',
     parse(parser) {
         parser.next(); // consume 'template'
         const ext = ensureThemeExt(parser.ctx.sketch);
         if (!ext.template || typeof ext.template !== 'object') ext.template = {};
         if (parser.is('string')) {
             ext.template.html = parser.next().value;
         }
         while (!parser.atEnd()) {
             if (parser.acceptIdent('html')) {
                 ext.template.html = acceptStringOrIdent(parser, 'HTML template path');
             } else if (parser.acceptIdent('css')) {
                 ext.template.css = acceptStringOrIdent(parser, 'CSS template path');
             } else {
                 break;
             }
         }
         parser.ctx.ops.push({op: 'template', template: {...ext.template}});
     },
     emit(sketch) {
         const tpl = sketch.extensions?.theme?.template;
         if (!tpl || typeof tpl !== 'object') return [];
         const lines = [];
         if (tpl.html) lines.push(`template html "${escStr(tpl.html)}"`);
         if (tpl.css) lines.push(`template css "${escStr(tpl.css)}"`);
         return lines;
     },
};
/**
  * `output [css] "<path>" [tokens "<path>"] [guide "<path>"] [prefix "color-"]
  *  [format oklch|oklab|rgb|hex] [scope ":root"] [switching "media,attribute"]
  *  [default <theme>] [fallback]`
  * Declares output file paths and emitter options directly in PCS syntax.
  */
export const outputStatement = {
     id: 'output',
     description: 'output [css|tokens|guide] "<path>" [prefix "…"] [format oklch|rgb|hex] [scope ":root"] [switching "…"] [default <theme>] [fallback]',
     parse(parser) {
         parser.next(); // consume 'output'
         const ext = ensureThemeExt(parser.ctx.sketch);
         if (!ext.output || typeof ext.output !== 'object') ext.output = {};
         const out = ext.output;
         if (parser.is('string')) {
             out.css = parser.next().value;
         }
         while (!parser.atEnd()) {
             if (parser.acceptIdent('css')) {
                 out.css = acceptStringOrIdent(parser, 'CSS output path');
             } else if (parser.acceptIdent('tokens')) {
                 out.tokens = acceptStringOrIdent(parser, 'tokens JSON output path');
             } else if (parser.acceptIdent('guide') || parser.acceptIdent('md')) {
                 out.guide = acceptStringOrIdent(parser, 'markdown guide output path');
             } else if (parser.acceptIdent('prefix')) {
                 out.prefix = acceptStringOrIdent(parser, 'custom property prefix');
             } else if (parser.acceptIdent('format')) {
                 out.format = acceptStringOrIdent(parser, 'color format (oklch, oklab, rgb, hex)');
             } else if (parser.acceptIdent('scope')) {
                 out.scope = acceptStringOrIdent(parser, 'CSS selector scope');
             } else if (parser.acceptIdent('switching') || parser.acceptIdent('switch')) {
                 const modes = [acceptStringOrIdent(parser, 'switch mode')];
                 while (parser.accept('punct', ',')) {
                     modes.push(acceptStringOrIdent(parser, 'switch mode'));
                 }
                 out.switchMode = modes.join(',');
             } else if (parser.acceptIdent('default') || parser.acceptIdent('defaultTheme')) {
                 out.defaultTheme = acceptStringOrIdent(parser, 'default theme id');
             } else if (parser.acceptIdent('fallback')) {
                 if (parser.acceptIdent('off') || parser.acceptIdent('false')) out.fallback = false;
                 else {
                     parser.acceptIdent('on') || parser.acceptIdent('true');
                     out.fallback = true;
                 }
             } else {
                 break;
             }
         }
         parser.ctx.ops.push({op: 'output', output: {...out}});
     },
     emit(sketch) {
         const out = sketch.extensions?.theme?.output;
         if (!out || typeof out !== 'object') return [];
         const lines = [];
         const cssOpts = [];
         if (out.css) cssOpts.push(`css "${escStr(out.css)}"`);
         if (out.prefix !== undefined && out.prefix !== 'color-') cssOpts.push(`prefix "${escStr(out.prefix)}"`);
         if (out.format && out.format !== 'oklch') cssOpts.push(`format ${out.format}`);
         if (out.scope && out.scope !== ':root') cssOpts.push(`scope "${escStr(out.scope)}"`);
         if (out.switchMode && out.switchMode !== 'media,attribute') cssOpts.push(`switching "${escStr(out.switchMode)}"`);
         if (out.defaultTheme) cssOpts.push(`default ${out.defaultTheme}`);
         if (out.fallback) cssOpts.push('fallback');
         if (cssOpts.length) {
             if (!out.css) cssOpts.unshift('css "tokens.css"');
             lines.push(`output ${cssOpts.join(' ')}`);
         }
         if (out.tokens) lines.push(`output tokens "${escStr(out.tokens)}"`);
         if (out.guide) lines.push(`output guide "${escStr(out.guide)}"`);
         return lines;
     },
};
export const THEME_STATEMENTS = [
     themeStatement,
     gamutStatement,
     projectStatement,
     templateStatement,
     outputStatement,
];
/** Read theme metadata (project, template, output) declared in the sketch. */
export function themeMetadata(sketch) {
     const t = sketch?.extensions?.theme ?? {};
     return {
         project: t.project ?? null,
         gamut: t.gamut ?? 'off',
         template: {
             html: t.template?.html ?? null,
             css: t.template?.css ?? null,
         },
         output: {
             css: t.output?.css ?? null,
             tokens: t.output?.tokens ?? null,
             guide: t.output?.guide ?? null,
             prefix: t.output?.prefix,
             format: t.output?.format,
             scope: t.output?.scope,
             switchMode: t.output?.switchMode,
             defaultTheme: t.output?.defaultTheme,
             fallback: t.output?.fallback,
         },
     };
}


export const isExported = (p) => p && p.export !== false;
export const exportedPoints = (sketch) => (sketch?.points ? sketch.points.filter(isExported) : []);

/** Implicit `gamut P <= 0` for every exported point without an explicit one. */
export function implicitGamutConstraints(sketch, reg) {
    if (!sketch) {
        console.error('implicitGamutConstraints: Missing sketch object');
        return [];
    }
    if (!reg) {
        console.error('implicitGamutConstraints: Missing registry object');
        return [];
    }
    if (gamutMode(sketch) !== 'srgb') return [];
    if (!reg.hasConstraintKind('gamut')) {
        console.warn('implicitGamutConstraints: Gamut constraint kind "gamut" is not registered');
        return [];
    }
    const gamutKind = reg.getConstraintKind('gamut');
    if (!reg.kindSupportsSpace(gamutKind, sketch.space)) {
        console.warn(`implicitGamutConstraints: Gamut constraint does not support color space "${sketch.space}"`);
        return [];
    }
    const covered = new Set(
        (sketch.constraints ?? []).filter((c) => c.type === 'gamut').flatMap((c) => c.points ?? [])
    );
    return exportedPoints(sketch)
        .filter((p) => !covered.has(p.id))
        .map((p) => ({
            id: `gamut:${p.id}`,
            type: 'gamut',
            points: [p.id],
            params: {},
            target: {kind: 'atMost', value: 0},
            weight: 1,
            enabled: true,
            implicit: true,
        }));
}

/** Solve a palette over all (or the given) themes; returns the SolveResult with `perScenario`. */
export function solveThemes(
    sketch,
    {registry: reg = defaultRegistry, scenarios = true, primary = null, ...solverOptions} = {}
) {
    if (!sketch) {
        console.error('solveThemes: Missing sketch argument');
        throw new Error('solveThemes requires a valid sketch');
    }
    if (!reg) {
        console.error('solveThemes: Missing registry');
        throw new Error('solveThemes requires a valid registry');
    }
    const solverMethod = sketch.solver?.method;
    let solver = null;
    if (solverMethod && reg.solvers?.has(solverMethod)) {
        solver = reg.getSolver(solverMethod);
    } else if (reg.solvers?.size > 0) {
        solver = [...reg.solvers.values()][0];
    }
    if (!solver) {
        console.error(`solveThemes: No solver registered in registry (requested: "${solverMethod ?? 'default'}")`);
        throw new Error('No solver registered');
    }
    try {
        const problem = buildProblem(sketch, reg, {
            scenarios: sketch.scenarios?.length ? scenarios : undefined,
            primary,
        });
        return solver.solve(problem, {
            maxIterations: sketch.solver?.maxIterations,
            tolerance: sketch.solver?.tolerance,
            ...solverOptions,
        });
    } catch (err) {
        console.error(`solveThemes: Solving palette failed: ${err?.message ?? err}`);
        throw err;
    }
}

/**
 * Colour of every point in one theme: the solved block when available,
 * else the theme's override, else the sketch's solved / seed position.
 */
export function scenarioColors(sketch, result = null, scenarioId = null) {
    if (!sketch?.points) {
        console.error('scenarioColors: Invalid or missing sketch points');
        return new Map();
    }
    const sol = scenarioId != null ? result?.perScenario?.[scenarioId] : null;
    const scen = scenarioId != null ? findScenario(sketch, scenarioId) : null;
    if (scenarioId != null && !scen) {
        console.warn(`scenarioColors: Scenario "${scenarioId}" not found in sketch`);
    }
    const out = new Map();
    for (const p of sketch.points) {
        const c =
            sol?.points?.[p.id] ?? scen?.points?.[p.id] ?? scen?.points?.[p.label] ?? p.solved ?? p.seed;
        if (!c) {
            console.warn(`scenarioColors: Point "${p.id}" (${p.label}) has no valid coordinates; fallback to [0, 0, 0]`);
            out.set(p.id, [0, 0, 0]);
        } else {
            out.set(p.id, c.slice());
        }
    }
    return out;
}

/** `{ id, colors }` for each theme, or a single anonymous entry when the sketch has none. */
export function themeList(sketch, result = null) {
    if (!sketch) {
        console.error('themeList: Missing sketch argument');
        return [];
    }
    const scen = sketch.scenarios ?? [];
    if (!scen.length) return [{id: null, colors: scenarioColors(sketch, result, null)}];
    return scen.map((s) => ({id: s.id, colors: scenarioColors(sketch, result, s.id)}));
}

export function kebab(label) {
    if (label == null) return '';
    return String(label)
        .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
        .replace(/([A-Za-z])(\d)/g, '$1-$2')
        .replace(/[^A-Za-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .toLowerCase();
}