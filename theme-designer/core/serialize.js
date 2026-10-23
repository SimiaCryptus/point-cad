// JSON import/export with versioning hooks.
import {cloneDeep, createSketch} from './model.js';

/**
 * Current document schema version.
 */
export const CURRENT_VERSION = 1;

/**
 * Registry of document schema migration functions keyed by source version.
 */
const MIGRATIONS = {
    // 0 -> 1: pre-release documents had no version field.
    0: (doc) => ({...doc, version: 1}),
};

/**
 * Migrates a document from its current schema version up to CURRENT_VERSION.
 *
 * @param {Object} doc - Document object to migrate.
 * @returns {Object} Migrated document object at CURRENT_VERSION.
 * @throws {TypeError} If doc is not a non-null object.
 * @throws {Error} If no migration step exists or migration fails to advance version.
 */
export function migrate(doc) {
    if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
        console.error('Migration failed: document must be a non-null object', doc);
        throw new TypeError('Invalid document: expected a non-null object');
    }

    let out = {...doc};
    let v = Number.isInteger(out.version) ? out.version : 0;

    if (v > CURRENT_VERSION) {
        console.warn(`Document version ${v} is newer than current supported version ${CURRENT_VERSION}. Proceeding without migration.`);
        return out;
    }

    while (v < CURRENT_VERSION) {
        const step = MIGRATIONS[v];
        if (!step) {
            console.error(`Migration error: No migration path found from version ${v} to ${CURRENT_VERSION}`);
            throw new Error(`No migration from document version ${v}`);
        }

        console.info(`Migrating document from version ${v}`);
        out = step(out);

        const nextV = Number.isInteger(out.version) ? out.version : v + 1;
        if (nextV <= v) {
            console.error(`Migration error: Step for version ${v} did not advance version number (result: ${nextV})`);
            throw new Error(`Migration step for version ${v} did not advance version number`);
        }
        v = nextV;
    }

    return out;
}

/**
 * Prepares a canonical JSON-serializable document from a sketch.
 *
 * @param {Object} sketch - The sketch model instance to serialize.
 * @returns {Object} Deep-cloned plain object document with the current schema version.
 * @throws {TypeError} If sketch is not a valid non-null object.
 */
export function toJSON(sketch) {
    if (!sketch || typeof sketch !== 'object' || Array.isArray(sketch)) {
        console.error('toJSON serialization failed: sketch must be a non-null object', sketch);
        throw new TypeError('toJSON: sketch must be a non-null object');
    }
    const doc = cloneDeep(sketch);
    doc.version = CURRENT_VERSION;
    return doc;
}

/**
 * Serializes a sketch model to a JSON formatted string.
 *
 * @param {Object} sketch - The sketch model instance to serialize.
 * @param {number|string} [space=2] - Indentation spacing for JSON output.
 * @returns {string} Stringified JSON representation.
 */
export function toJSONString(sketch, space = 2) {
    try {
        return JSON.stringify(toJSON(sketch), null, space);
    } catch (err) {
        console.error('toJSONString failed to serialize sketch:', err);
        throw err;
    }
}

/**
 * Deserializes and migrates a JSON string or document object into a Sketch model instance.
 *
 * @param {string|Object} input - JSON string or parsed document object.
 * @returns {Object} Reconstructed sketch model.
 * @throws {SyntaxError} If input is an unparseable JSON string.
 * @throws {Error} If input is not a valid sketch document.
 */
export function fromJSON(input) {
    let doc;
    if (typeof input === 'string') {
        try {
            doc = JSON.parse(input);
        } catch (err) {
            console.error('fromJSON failed: invalid JSON string provided', err);
            throw new SyntaxError(`Failed to parse sketch JSON: ${err.message}`);
        }
    } else {
        doc = input;
    }

    if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
        console.error('fromJSON failed: input is not a valid sketch document object', doc);
        throw new Error('Not a sketch document');
    }

    const migrated = migrate(doc);
    return createSketch(migrated);
}

/**
 * Guess whether a text blob is JSON or a PCS script.
 *
 * @param {string} text - Raw input text to inspect.
 * @returns {'json'|'pcad'} Detected format identifier.
 */
export function sniffFormat(text) {
    if (typeof text !== 'string') {
        console.warn('sniffFormat received non-string input, converting to string:', text);
    }
    const t = String(text ?? '').trimStart();
    return t.startsWith('{') ? 'json' : 'pcad';
}