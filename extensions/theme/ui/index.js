// Theme designer UI: the headless extension plus the Swatches, Preview and
// Handoff tool windows registered on <point-cad>. Import this module from a
// page (or use ./harness.js, which imports it and boots a whole harness).
import '../index.js';
import { PointCad } from '../../../ui/point-cad.js';
import { createSwatchPanel } from './swatch-board.js';
import { createPreviewPanel } from './preview.js';
import { createHandoffPanel } from './handoff.js';

PointCad.registerPanel('swatches', createSwatchPanel, 'Swatches');
PointCad.registerPanel('preview', createPreviewPanel, 'Preview');
PointCad.registerPanel('handoff', createHandoffPanel, 'Handoff');

export * from '../index.js';
export { createSwatchPanel } from './swatch-board.js';
export { createPreviewPanel } from './preview.js';
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
