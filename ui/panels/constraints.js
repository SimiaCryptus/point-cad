import { h, fmt, panelShell, statusDot } from "../dom.js";
import { addConstraint, removeEntity, findVariable, findPoint, findConstraint } from "../../core/model.js";
import { arityRange } from "../../core/registry.js";

// Form target kinds. `value`, `atLeast` and `atMost` take a number or a
// variable on the right-hand side (a variable with `=` becomes a `variable`
// target, exactly like the PCS statement `distance A B = beamLength`).
const TARGET_OPTIONS = [
  ["value", "="],
  ["atLeast", "≥"],
  ["atMost", "≤"],
  ["minimize", "→ min"],
  ["maximize", "→ max"],
];
const NUMERIC = new Set(["value", "atLeast", "atMost"]);
const OPS = { value: "=", variable: "=", atLeast: "≥", atMost: "≤" };

function targetText(c, sk, kind) {
  const t = c.target ?? kind?.defaultTarget ?? { kind: "value", value: 0 };
  if (t.kind === "minimize") return "→ min";
  if (t.kind === "maximize") return "→ max";
  const rhs = t.ref != null ? findVariable(sk, t.ref)?.name ?? t.ref : fmt(t.value ?? 0);
  return `${OPS[t.kind] ?? "="} ${rhs}`;
}

export function createConstraintsPanel(ctx) {
  const list = h("div", { class: "pc-list" });
  let chosen = [];
  let paramVals = {};
  let editing = null; // id of the constraint currently loaded into the form

  // ---- add / edit form (persistent) --------------------------------------
  const formTitle = h("div", { class: "pc-muted pc-form-title" }, "New constraint");
  const kindSel = h("select", { class: "pc-in" });
  const paramsBox = h("div", { class: "pc-pts" });
  const ptsBox = h("div", { class: "pc-pts" });
  const targetSel = h("select", { class: "pc-in" }, ...TARGET_OPTIONS.map(([k, label]) => h("option", { value: k }, label)));
  const valueIn = h("input", { type: "number", step: "any", class: "pc-in pc-in-num", value: "0" });
  const varSel = h("select", { class: "pc-in", title: "Right-hand side: a number or a variable" });
  const weightIn = h("input", { type: "number", step: "any", min: "0", class: "pc-in pc-in-num", value: "1" });
  const msg = h("div", { class: "pc-msg" });
  const pickBtn = h("button", { class: "pc-btn", type: "button", onclick: () => {
    const kind = currentKind();
    if (!kind) return;
    ctx.startPick(arityRange(kind).min, (ids) => { chosen = ids; renderPts(); });
  } }, "Pick in viewport");
  const submitBtn = h("button", { class: "pc-btn pc-primary", type: "button", onclick: submit }, "+ Add constraint");
  const cancelBtn = h("button", { class: "pc-btn", type: "button", hidden: true, title: "Leave edit mode and go back to adding constraints", onclick: stopEdit }, "Cancel");
  const form = h("div", { class: "pc-form" },
    formTitle,
    h("div", { class: "pc-row" }, h("label", {}, "Kind"), kindSel, paramsBox),
    h("div", { class: "pc-row" }, h("label", {}, "Points"), ptsBox, pickBtn),
    h("div", { class: "pc-row" }, h("label", {}, "Target"), targetSel, valueIn, varSel),
    h("div", { class: "pc-row" }, h("label", {}, "Weight"), weightIn, submitBtn, cancelBtn),
    msg,
  );
  kindSel.addEventListener("change", () => { chosen = []; paramVals = {}; renderPts(); });
  targetSel.addEventListener("change", syncTarget);
  varSel.addEventListener("change", syncTarget);

  const body = h("div", {}, list, form);
  const el = panelShell("Constraints", body);

  function currentKind() {
    return ctx.registry.hasConstraintKind(kindSel.value) ? ctx.registry.getConstraintKind(kindSel.value) : null;
  }

  function syncTarget() {
    const t = targetSel.value;
    varSel.style.display = NUMERIC.has(t) ? "" : "none";
    valueIn.style.display = NUMERIC.has(t) && !varSel.value ? "" : "none";
  }

  /** Target record described by the form. */
  function readTarget() {
    const k = targetSel.value;
    if (!NUMERIC.has(k)) return { kind: k };
    if (varSel.value) return { kind: k === "value" ? "variable" : k, ref: varSel.value };
    return { kind: k, value: Number(valueIn.value) || 0 };
  }

  /** Load a target record into the form. */
  function loadTarget(t) {
    const kind = t.kind === "variable" ? "value" : TARGET_OPTIONS.some(([k]) => k === t.kind) ? t.kind : "value";
    targetSel.value = kind;
    varSel.value = t.ref ?? "";
    if (t.ref != null && varSel.value !== t.ref) varSel.value = ""; // unknown variable
    valueIn.value = t.value ?? 0;
  }

  function renderPts() {
    const kind = currentKind();
    ptsBox.replaceChildren();
    paramsBox.replaceChildren();
    if (!kind) return;
    const sk = ctx.sketch;
    for (const prm of kind.params ?? []) {
      const cur = paramVals[prm.name] ?? prm.values?.[0] ?? "";
      paramVals[prm.name] = cur;
      const input = Array.isArray(prm.values)
        ? h("select", { class: "pc-in pc-in-pt", title: prm.name, onchange: (e) => { paramVals[prm.name] = e.target.value; } }, ...prm.values.map((v) => h("option", { value: v }, v)))
        : h("input", { type: prm.type === "number" ? "number" : "text", step: "any", class: "pc-in pc-in-pt", title: prm.name, onchange: (e) => { paramVals[prm.name] = prm.type === "number" ? Number(e.target.value) : e.target.value; } });
      input.value = cur;
      paramsBox.append(input);
    }
    const range = arityRange(kind);
    const variadic = range.max > range.min;
    const count = Math.min(range.max, Math.max(range.min, chosen.filter(Boolean).length + (variadic ? 1 : 0)));
    for (let i = 0; i < count; i++) {
      const sel = h("select", { class: "pc-in pc-in-pt", onchange: (e) => { chosen[i] = e.target.value; if (variadic) renderPts(); } },
        h("option", { value: "" }, `P${i + 1}`),
        ...sk.points.map((p) => h("option", { value: p.id }, p.label)));
      if (chosen[i]) sel.value = chosen[i];
      ptsBox.append(sel);
    }
  }

  // ---- edit mode -----------------------------------------------------------
  function startEdit(c) {
    editing = c.id;
    kindSel.value = c.type;
    paramVals = { ...(c.params ?? {}) };
    chosen = c.points.slice();
    loadTarget(c.target ?? currentKind()?.defaultTarget ?? { kind: "value", value: 0 });
    weightIn.value = c.weight ?? 1;
    msg.textContent = "";
    ctx.select(c.points, false); // refreshes every window, including this form
  }

  function stopEdit() {
    editing = null;
    chosen = [];
    paramVals = {};
    targetSel.value = "value";
    varSel.value = "";
    valueIn.value = "0";
    weightIn.value = "1";
    msg.textContent = "";
    update();
  }

  /** Add a new constraint, or save the edited one. */
  function submit() {
    const sk = ctx.sketch;
    const kind = currentKind();
    if (!kind) return;
    const range = arityRange(kind);
    const points = chosen.filter((id) => id && findPoint(sk, id)).map((id) => findPoint(sk, id).id);
    if (points.length < range.min || points.length > range.max) {
      msg.textContent = `Select ${range.min === range.max ? range.min : `${range.min} or more`} points.`;
      return;
    }
    const target = readTarget();
    const weight = Number(weightIn.value) || 1;
    const params = {};
    for (const prm of kind.params ?? []) params[prm.name] = paramVals[prm.name];
    const existing = editing ? findConstraint(sk, editing) : null;
    if (existing) {
      existing.type = kind.id;
      existing.points = points;
      existing.target = target;
      existing.weight = weight;
      if (Object.keys(params).length) existing.params = params;
      else delete existing.params;
    } else {
      addConstraint(sk, { type: kind.id, points, params, target, weight });
    }
    msg.textContent = "";
    ctx.commit("constraint");
  }

  // ---- list ----------------------------------------------------------------
  function update() {
    const sk = ctx.sketch;
    const ro = ctx.readonly;
    const evals = new Map(ctx.evaluate().map((e) => [e.id, e]));
    if (editing && !findConstraint(sk, editing)) editing = null;
    list.replaceChildren();
    for (const c of sk.constraints) {
      const ev = evals.get(c.id);
      const kind = ctx.registry.hasConstraintKind(c.type) ? ctx.registry.getConstraintKind(c.type) : null;
      const params = Object.values(c.params ?? {}).join(" ");
      const pts = c.points.map((id) => findPoint(sk, id)?.label ?? id).join(" ");
      const detail = ev?.error ? ev.error : ev?.residual != null ? `${fmt(ev.measure)} (Δ ${fmt(ev.residual)})` : ev?.measure != null ? fmt(ev.measure) : "";
      const selected = c.id === editing;
      list.append(
        h("div", { class: `pc-item${c.enabled === false ? " pc-disabled" : ""}${c.macro ? " pc-macro" : ""}${selected ? " pc-item-selected" : ""}`,
          title: ro ? c.id : selected ? `${c.id} — click again to stop editing` : `${c.id} — click to edit`,
          onclick: (e) => {
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLButtonElement) return;
            if (ro) ctx.select(c.points, false);
            else if (selected) stopEdit();
            else startEdit(c);
          } },
          statusDot(ev?.status ?? "none", detail),
          h("span", { class: "pc-item-main" }, h("b", {}, c.type), params ? ` ${params}` : "", ` ${pts} `, h("span", { class: "pc-target" }, targetText(c, sk, kind))),
          h("span", { class: "pc-muted pc-item-detail", title: c.note ?? "" }, detail),
          h("input", { type: "number", step: "any", min: "0", class: "pc-in pc-in-tiny", value: c.weight ?? 1, title: "weight", disabled: ro,
            onchange: (e) => { c.weight = Number(e.target.value) || 0; ctx.commit("constraint"); } }),
          h("input", { type: "checkbox", checked: c.enabled !== false, title: "enabled", disabled: ro,
            onchange: (e) => { c.enabled = e.target.checked; ctx.commit("constraint"); } }),
          ro ? null : h("button", { class: "pc-icon", title: "Delete constraint", onclick: () => { removeEntity(sk, c.id); ctx.commit("constraint"); } }, "✕"),
        ),
      );
    }
    if (!sk.constraints.length) list.append(h("div", { class: "pc-muted pc-empty" }, "No constraints yet."));

    // refresh form option lists, preserving choices
    const kinds = ctx.registry.constraintKindsFor(sk.space);
    const prevKind = kindSel.value;
    kindSel.replaceChildren(...kinds.map((k) => h("option", { value: k.id, title: k.syntax }, k.id)));
    if (kinds.some((k) => k.id === prevKind)) kindSel.value = prevKind;
    const prevVar = varSel.value;
    varSel.replaceChildren(
      h("option", { value: "" }, "number"),
      ...sk.variables.map((v) => h("option", { value: v.id }, `${v.name}${v.locked ? " 🔒" : ""}`)),
    );
    varSel.value = sk.variables.some((v) => v.id === prevVar) ? prevVar : "";
    chosen = chosen.filter(Boolean).map((id) => (findPoint(sk, id) ? findPoint(sk, id).id : ""));
    renderPts();
    syncTarget();

    // add vs. edit mode
    formTitle.textContent = editing ? `Editing ${editing}` : "New constraint";
    submitBtn.textContent = editing ? "Save constraint" : "+ Add constraint";
    cancelBtn.hidden = !editing;
    el.classList.toggle("pc-editing", !!editing);
    form.style.display = ro ? "none" : "";
    pickBtn.disabled = !!ctx.pick;
  }

  return { el, update };
}