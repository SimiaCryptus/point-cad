// Theme designer UI: the headless extension plus the Swatches, Preview and
// Handoff tool windows registered on <point-cad>. Import this module from a
// page (or use ./harness.js, which imports it and boots a whole harness).
import '../index.js';
import {PointCad} from '../../../ui/point-cad.js';
import {createSwatchPanel} from './swatch-board.js';
import {createPreviewPanel} from './preview.js';
import {createHandoffPanel} from './handoff.js';

const panelsToRegister = [
    {id: 'swatches', factory: createSwatchPanel, label: 'Swatches'},
    {id: 'preview', factory: createPreviewPanel, label: 'Preview'},
    {id: 'handoff', factory: createHandoffPanel, label: 'Handoff'},
];

for (const {id, factory, label} of panelsToRegister) {
    try {
        if (typeof PointCad?.registerPanel === 'function') {
            PointCad.registerPanel(id, factory, label);
        } else {
            console.warn(`Unable to register panel "${id}": PointCad.registerPanel is not a function.`);
        }
    } catch (error) {
        console.error(`Error registering panel "${id}" (${label}) on PointCad:`, error);
    }
}

export * from '../index.js';
export {createSwatchPanel} from './swatch-board.js';
export {createPreviewPanel} from './preview.js';
export {
    themeDoc,
    DEFAULT_DOC,
    DEFAULT_PREVIEW_HTML,
    DEFAULT_PREVIEW_CSS,
    slug,
} from './doc-store.js';
export {
    createHandoffPanel,
    cssOptions,
    fileNames,
    tokenRows,
    buildCSS,
    buildTokens,
    buildMarkdown,
    buildHarnessHTML,
    artifact,
    saveArtifact,
    hostContext,
    download,
    FORMATS,
    SWITCH_MODES,
} from './handoff.js';