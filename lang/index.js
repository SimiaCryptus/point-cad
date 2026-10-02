import {PcsError, tokenize} from './lexer.js';
import {parse, Parser, RESERVED, STATEMENT_WORDS} from './parser.js';
import {emit, emitWithMap, fmtNum} from './emitter.js';
import {collectLocals, defineMacro, expandMacroTokens, findMacro, nextMacroInstance,} from './macros.js';
import {applyCommand, COMMANDS} from './commands.js';

/**
 * Compiles PCS source code into target output.
 *
 * Orchestrates the compiler pipeline:
 *   1. Tokenization (`tokenize`)
 *   2. Optional macro expansion (`expandMacroTokens`)
 *   3. AST parsing (`parse`)
 *   4. Code generation (`emit` or `emitWithMap`)
 *
 * @param {string} source - PCS source code to compile.
 * @param {Object} [options={}] - Compilation options.
 * @param {boolean} [options.sourceMap=false] - When true, generates and returns source maps.
 * @param {boolean} [options.expandMacros=false] - When true, expands tokens with macro definitions.
 * @param {boolean} [options.verbose=false] - Enables step-by-step progress logging via console.log.
 * @param {boolean} [options.debug=false] - Alias for options.verbose.
 * @returns {string|{ code: string, map: Object }} Emitted target code or an object containing code and map.
 * @throws {TypeError} If source is not a string or options is not an object.
 * @throws {PcsError} If a PCS language syntax/compilation error occurs.
 * @throws {Error} If an unexpected error occurs during compilation.
 */
export function compile(source, options = {}) {
    const isVerbose = Boolean(options && (options.verbose || options.debug));

    if (source === undefined || source === null) {
        const msg = 'Source code must be provided (received null or undefined).';
        console.error(`[compile] TypeError: ${msg}`);
        throw new TypeError(msg);
    }

    if (typeof source !== 'string') {
        const msg = `Source code must be a string, received ${typeof source}.`;
        console.error(`[compile] TypeError: ${msg}`);
        throw new TypeError(msg);
    }

    if (options !== null && typeof options !== 'object') {
        const msg = `Options must be an object, received ${typeof options}.`;
        console.error(`[compile] TypeError: ${msg}`);
        throw new TypeError(msg);
    }

    if (source.trim().length === 0) {
        console.warn('[compile] Warning: Source code is empty.');
    }

    if (isVerbose) {
        console.log(`[compile] Starting compilation (${source.length} characters)...`);
    }

    // 1. Lexing / Tokenization
    let tokens;
    try {
        if (isVerbose) {
            console.log('[compile] Phase 1: Tokenizing source...');
        }
        tokens = tokenize(source);
        if (isVerbose) {
            console.log(`[compile] Phase 1 complete: ${tokens.length} tokens generated.`);
        }
    } catch (err) {
        if (err instanceof PcsError || (err && 'line' in err)) {
            console.error(`[compile] Lexer error at line ${err.line}, col ${err.col}: ${err.message}`);
        } else {
            console.error(`[compile] Unexpected error during tokenization: ${err.message}`);
        }
        throw err;
    }

    // 2. Macro expansion (optional pre-processing)
    if (options.expandMacros) {
        try {
            if (isVerbose) {
                console.log('[compile] Phase 1b: Expanding macro tokens...');
            }
            tokens = expandMacroTokens(tokens);
            if (isVerbose) {
                console.log(`[compile] Phase 1b complete: ${tokens.length} tokens after expansion.`);
            }
        } catch (err) {
            if (err instanceof PcsError || (err && 'line' in err)) {
                console.error(`[compile] Macro expansion error at line ${err.line}, col ${err.col}: ${err.message}`);
            } else {
                console.error(`[compile] Unexpected error during macro expansion: ${err.message}`);
            }
            throw err;
        }
    }

    // 3. Parsing into AST
    let ast;
    try {
        if (isVerbose) {
            console.log('[compile] Phase 2: Parsing tokens into AST...');
        }
        ast = parse(tokens, options);
        if (isVerbose) {
            console.log('[compile] Phase 2 complete: AST generated successfully.');
        }
    } catch (parseErr) {
        // Fallback if parse implementation expects source string directly
        if (parseErr instanceof TypeError && parseErr.message && parseErr.message.includes('not a function')) {
            try {
                ast = parse(source, options);
            } catch (innerErr) {
                if (innerErr instanceof PcsError || (innerErr && 'line' in innerErr)) {
                    console.error(`[compile] Parser error at line ${innerErr.line}, col ${innerErr.col}: ${innerErr.message}`);
                } else {
                    console.error(`[compile] Unexpected error during parsing: ${innerErr.message}`);
                }
                throw innerErr;
            }
        } else {
            if (parseErr instanceof PcsError || (parseErr && 'line' in parseErr)) {
                console.error(`[compile] Parser error at line ${parseErr.line}, col ${parseErr.col}: ${parseErr.message}`);
            } else {
                console.error(`[compile] Unexpected error during parsing: ${parseErr.message}`);
            }
            throw parseErr;
        }
    }

    // 4. Code Generation / Emitting
    try {
        if (options.sourceMap) {
            if (isVerbose) {
                console.log('[compile] Phase 3: Emitting target code with source map...');
            }
            const result = emitWithMap(ast, options);
            if (isVerbose) {
                console.log('[compile] Phase 3 complete: Code and source map generated.');
            }
            return result;
        }

        if (isVerbose) {
            console.log('[compile] Phase 3: Emitting target code...');
        }
        const output = emit(ast, options);
        if (isVerbose) {
            console.log('[compile] Phase 3 complete: Compilation finished successfully.');
        }
        return output;
    } catch (emitErr) {
        if (emitErr instanceof PcsError || (emitErr && 'line' in emitErr)) {
            console.error(`[compile] Emitter error at line ${emitErr.line}, col ${emitErr.col}: ${emitErr.message}`);
        } else {
            console.error(`[compile] Unexpected error during code emission: ${emitErr.message}`);
        }
        throw emitErr;
    }
}

/**
 * Compiles PCS source code and returns both the emitted code and source map.
 *
 * @param {string} source - PCS source code to compile.
 * @param {Object} [options={}] - Compilation options.
 * @returns {{ code: string, map: Object }} Object containing emitted code and source map.
 * @throws {TypeError} If source or options is invalid.
 * @throws {PcsError|Error} If compilation fails during lexing, parsing, or emitting.
 */
export function compileWithMap(source, options = {}) {
    return compile(source, {...options, sourceMap: true});
}

export {
    tokenize,
    PcsError,
    parse,
    Parser,
    RESERVED,
    STATEMENT_WORDS,
    emit,
    emitWithMap,
    fmtNum,
    findMacro,
    defineMacro,
    expandMacroTokens,
    collectLocals,
    nextMacroInstance,
    COMMANDS,
    applyCommand,
};

export default {
    compile,
    compileWithMap,
    tokenize,
    PcsError,
    parse,
    Parser,
    RESERVED,
    STATEMENT_WORDS,
    emit,
    emitWithMap,
    fmtNum,
    findMacro,
    defineMacro,
    expandMacroTokens,
    collectLocals,
    nextMacroInstance,
    COMMANDS,
    applyCommand,
};