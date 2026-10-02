// Public API barrel. Importing this module registers the built-ins and the
// <point-cad> custom element.
import {PointCad} from './ui/point-cad.js';
import {Viewport} from './ui/viewport.js';

export * from './core/index.js';
export * from './lang/index.js';
export {PointCad, Viewport};

// Register <point-cad> custom element if running in a browser environment.
if (typeof customElements !== 'undefined') {
    try {
        if (!PointCad) {
            console.error('Failed to register <point-cad> custom element: PointCad class is not defined.');
        } else if (!customElements.get('point-cad')) {
            customElements.define('point-cad', PointCad);
            console.info('Custom element <point-cad> registered successfully.');
        }
    } catch (error) {
        console.error('Failed to register <point-cad> custom element:', error);
    }
} else if (typeof window !== 'undefined') {
    console.warn('customElements is not available in the current window environment; <point-cad> registration skipped.');
}