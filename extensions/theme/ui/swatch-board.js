// Swatch board tool window: theme tabs, exported colours rendered on the
// palette's canvas, binding-constraint status dots and the emitted CSS.
import { h, panelShell, statusDot } from "../../../ui/dom.js";
import { exportedPoints, isExported, scenarioColors } from "../themes.js";
import { emitCSS } from "../emit-css.js";
import { wcagContrast } from "../measures-color.js";

export function createSwatchPanel(ctx) {
  const tabs = h("div", { class: "pc-row pc-theme-tabs" });
  const board = h("div", { class: "pc-swatches" });
  const cssBox = h("pre", { class: "pc-css" });
  const copyBtn = h("button", { class: "pc-btn", type: "button", title: "Copy the CSS custom properties", onclick: async () => {
    try { await navigator.clipboard.writeText(cssBox.textContent); } catch { /* clipboard unavailable */ }
  } }, "Copy CSS");
  const solveBtn = h("button", { class: "pc-btn pc-primary", type: "button", onclick: () => ctx.solve() }, "Solve themes");
  const body = h("div", {}, tabs, board, h("div", { class: "pc-row" }, solveBtn, copyBtn), cssBox);
  const el = panelShell("Swatches", body);

  function update() {
    const sk = ctx.sketch;
    const space = ctx.getSpace();
    if (typeof space.toCSS !== "function") {
      tabs.replaceChildren();
      board.replaceChildren(h("div", { class: "pc-muted pc-empty" }, `Space '${sk.space}' is not a colour space — start a script with 'space oklab'.`));
      cssBox.textContent = "";
      return;
    }
    const scen = sk.scenarios ?? [];
    const active = ctx.activeScenario ?? scen[0]?.id ?? null;
    tabs.replaceChildren(...scen.map((s) => h("button", {
      class: `pc-btn pc-tool${s.id === active ? " pc-active" : ""}`, type: "button", title: `Show theme '${s.id}'`,
      onclick: () => ctx.setActiveScenario(s.id),
    }, s.id)));
    const colors = scenarioColors(sk, ctx.result, active);
    const evals = new Map(ctx.evaluate().map((e) => [e.id, e]));
    const exported = exportedPoints(sk);
    const bgPoint = sk.points.find((p) => p.role === "anchor" && isExported(p)) ?? exported[0] ?? null;
    const bg = bgPoint ? colors.get(bgPoint.id) : null;
    board.replaceChildren(...exported.map((p) => {
      const c = colors.get(p.id);
      const css = space.toCSS(c);
      const onBg = bg && p !== bgPoint;
      const contrast = onBg ? wcagContrast(space, c, bg) : null;
      const binding = sk.constraints.filter((k) => k.points.includes(p.id));
      return h("div", { class: "pc-swatch", style: `background:${onBg ? space.toCSS(bg) : css}`, title: p.id, onclick: () => ctx.select([p.id]) },
        h("div", { class: "pc-swatch-chip", style: `background:${css}` }),
        h("div", { class: "pc-swatch-meta", style: onBg ? `color:${css}` : "" },
          h("b", {}, p.label + (p.role ? ` · ${p.role}` : "")),
          h("span", {}, space.formatLiteral(c, "oklch") + (contrast ? ` · ${contrast.toFixed(2)}:1` : "")),
        ),
        h("div", { class: "pc-swatch-dots" }, ...binding.map((k) => {
          const ev = evals.get(k.id);
          return statusDot(ev?.status ?? "none", `${k.type} ${Object.values(k.params ?? {}).join(" ")} ${k.points.join(" ")}`.replace(/\s+/g, " "));
        })),
      );
    }));
    if (!exported.length) board.append(h("div", { class: "pc-muted pc-empty" }, "No exported colours yet."));
    try {
      cssBox.textContent = emitCSS(sk, ctx.result, { space, registry: ctx.registry });
    } catch (e) {
      cssBox.textContent = `/* ${e.message} */`;
    }
  }

  return { el, update };
}