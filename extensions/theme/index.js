// Theme designer extension (headless part): registers the OKLab space,
// colour constraint kinds, `theme` / `gamut` statements, point roles and
// automatic gamut constraints. Import `./ui/index.js` for the UI panel.
import { registry as defaultRegistry } from "../../core/index.js";
import { oklab } from "./space-oklab.js";
import { colorConstraintKinds } from "./constraints-color.js";
import { themeStatement, gamutStatement, POINT_ROLES, implicitGamutConstraints } from "./themes.js";

export function registerTheme(reg = defaultRegistry) {
  if (!reg.hasSpace(oklab.id)) reg.registerSpace(oklab);
  for (const k of colorConstraintKinds) if (!reg.hasConstraintKind(k.id)) reg.registerConstraintKind(k);
  for (const st of [themeStatement, gamutStatement]) if (!reg.hasStatement(st.id)) reg.registerStatement(st);
  for (const r of POINT_ROLES) if (!reg.pointRoles.has(r.id)) reg.registerPointRole(r);
  if (!reg.implicitConstraints.includes(implicitGamutConstraints)) reg.registerImplicitConstraints(implicitGamutConstraints);
  return reg;
}

registerTheme();

export { oklab } from "./space-oklab.js";
export * from "./measures-color.js";
export * from "./constraints-color.js";
export * from "./themes.js";
export { emitCSS } from "./emit-css.js";
export { emitTokens, emitTokensString } from "./emit-tokens.js";