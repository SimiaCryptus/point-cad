// Console-only verbs. The parser applies model-level commands directly to
// its working copy of the sketch; `solve` is handed back to the host.
import * as M from '../core/model.js';
import {alignSketchFrame} from '../core/problem.js';

export const COMMANDS = Object.freeze(['solve', 'reset', 'adopt', 'center', 'delete', 'set', 'move']);

/**
 * Apply a command to a sketch. Returns true when handled here, false when
 * the host must handle it (currently only `solve`). `registry` is optional
 * and only needed by commands that touch geometry (`center`).
 *
 * @param {object} sketch - The sketch model to apply the command to.
 * @param {object} cmd - The command descriptor object with an `op` property.
 * @param {object} [registry] - Entity registry containing geometry definitions.
 * @returns {boolean} True if the command was handled internally, false if delegated to host.
 * @throws {Error} If sketch or cmd is invalid, referenced entities do not exist, or cmd is unrecognized.
 */
export function applyCommand(sketch, cmd, registry) {
    if (!sketch) {
        console.error('applyCommand failed: Missing sketch object');
        throw new Error('Sketch object is required');
    }
    if (!cmd || typeof cmd !== 'object' || typeof cmd.op !== 'string') {
        console.error('applyCommand failed: Invalid command object', cmd);
        throw new Error("Invalid command: Expected an object with a string 'op' property");
    }
    console.debug(`Applying command '${cmd.op}'`, cmd);

    switch (cmd.op) {
        case 'reset':
            console.debug('Resetting sketch solution');
            M.resetSolution(sketch);
            return true;
        case 'adopt':
            console.debug('Adopting sketch solution into base state');
            M.adoptSolution(sketch);
            return true;
        case 'center':
            if (!registry) {
                console.warn("Executing 'center' command without registry; alignment may be limited");
            }
            console.debug('Aligning sketch frame');
            alignSketchFrame(sketch, registry);
            return true;
        case 'delete':
            if (!cmd.ref) {
                console.error("applyCommand failed: 'delete' command missing 'ref' property", cmd);
                throw new Error("Command 'delete' requires 'ref' property");
            }
            console.debug(`Deleting entity '${cmd.ref}' from sketch`);
            if (!M.removeEntity(sketch, cmd.ref)) {
                console.error(`applyCommand failed: Unknown entity '${cmd.ref}' cannot be deleted`);
                throw new Error(`Unknown entity '${cmd.ref}'`);
            }
            return true;
        case 'set':
            if (!cmd.ref) {
                console.error("applyCommand failed: 'set' command missing 'ref' property", cmd);
                throw new Error("Command 'set' requires 'ref' property");
            }
            if (cmd.value === undefined) {
                console.error("applyCommand failed: 'set' command missing 'value' property", cmd);
                throw new Error("Command 'set' requires 'value' property");
            }
            console.debug(`Setting variable '${cmd.ref}' to ${cmd.value}`);
            M.setVariable(sketch, cmd.ref, cmd.value);
            return true;
        case 'move':
            if (!cmd.ref) {
                console.error("applyCommand failed: 'move' command missing 'ref' property", cmd);
                throw new Error("Command 'move' requires 'ref' property");
            }
            if (cmd.seed === undefined) {
                console.error("applyCommand failed: 'move' command missing 'seed' property", cmd);
                throw new Error("Command 'move' requires 'seed' property");
            }
            console.debug(`Moving point '${cmd.ref}' to seed position`, cmd.seed);
            M.movePoint(sketch, cmd.ref, cmd.seed);
            return true;
        case 'solve':
            console.debug("Command 'solve' delegated to host");
            return false;
        default:
            console.error(`applyCommand failed: Unknown command '${cmd.op}'`, cmd);
            throw new Error(`Unknown command '${cmd.op}'`);
    }
}