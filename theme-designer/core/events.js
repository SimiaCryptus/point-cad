// Tiny typed event emitter (no DOM dependency).
export class Emitter {
    /**
     * Creates a new Emitter instance.
     */
    constructor() {
        /** @type {Map<string, Set<Function>>} */
        this._handlers = new Map();
    }

    /**
     * Register an event listener for a given event type.
     * @param {string} type - Event type name or '*' for wildcard events.
     * @param {Function} fn - Handler callback function.
     * @returns {() => void} Unsubscribe function.
     */

    on(type, fn) {
        if (typeof type !== 'string' || !type) {
            console.error('[Emitter] Invalid event type provided to on():', type);
            throw new TypeError(`Event type must be a non-empty string, received: ${typeof type}`);
        }
        if (typeof fn !== 'function') {
            console.error(`[Emitter] Invalid handler provided for event "${type}":`, fn);
            throw new TypeError(`Event handler must be a function, received: ${typeof fn}`);
        }

        if (!this._handlers.has(type)) this._handlers.set(type, new Set());
        this._handlers.get(type).add(fn);
        return () => this.off(type, fn);
    }

    /**
     * Register a one-time event listener for a given event type.
     * @param {string} type - Event type name or '*' for wildcard events.
     * @param {Function} fn - Handler callback function.
     * @returns {() => void} Unsubscribe function.
     */

    once(type, fn) {
        if (typeof fn !== 'function') {
            console.error(`[Emitter] Invalid handler provided for once("${type}"):`, fn);
            throw new TypeError(`Event handler must be a function, received: ${typeof fn}`);
        }

        const off = this.on(type, (detail) => {
            off();
            fn(detail);
        });
        return off;
    }

    /**
     * Remove an event listener for a given event type.
     * @param {string} type - Event type name.
     * @param {Function} fn - Handler callback to remove.
     */

    off(type, fn) {
        if (typeof type !== 'string') {
            console.warn('[Emitter] Invalid event type provided to off():', type);
            return;
        }
        const handlers = this._handlers.get(type);
        if (!handlers) return;
        handlers.delete(fn);
        if (handlers.size === 0) {
            this._handlers.delete(type);
        }
    }

    /**
     * Emit an event to all registered listeners.
     * @param {string} type - Event type to emit.
     * @param {any} [detail] - Event payload or detail object.
     */

    emit(type, detail) {
        if (typeof type !== 'string' || !type) {
            console.error('[Emitter] Invalid event type provided to emit():', type);
            return;
        }

        const directHandlers = this._handlers.get(type);
        if (directHandlers && directHandlers.size > 0) {
            for (const fn of [...directHandlers]) {
                try {
                    fn(detail);
                } catch (error) {
                    console.error(`[Emitter] Exception thrown in handler for event "${type}":`, error);
                }
            }
        }

        const wildcardHandlers = this._handlers.get('*');
        if (wildcardHandlers && wildcardHandlers.size > 0) {
            for (const fn of [...wildcardHandlers]) {
                try {
                    fn({type, detail});
                } catch (error) {
                    console.error(`[Emitter] Exception thrown in wildcard handler for event "${type}":`, error);
                }
            }
        }
    }

    /**
     * Remove all event listeners for a specific type or all listeners if type is omitted.
     * @param {string} [type] - Event type to clear.
     */
    removeAllListeners(type) {
        if (type !== undefined) {
            if (typeof type !== 'string') {
                console.warn('[Emitter] Invalid event type provided to removeAllListeners():', type);
                return;
            }
            this._handlers.delete(type);
        } else {
            this._handlers.clear();
        }
    }

    /**
     * Get listener count for a given event type.
     * @param {string} type - Event type.
     * @returns {number} Number of active listeners.
     */
    listenerCount(type) {
        if (typeof type !== 'string') {
            console.warn('[Emitter] Invalid event type provided to listenerCount():', type);
            return 0;
        }
        return this._handlers.get(type)?.size ?? 0;
    }
}