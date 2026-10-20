"use strict";
const EPS = 1e-8;
const $ = (id) => document.getElementById(id);
let constraintRows = [];
const fmt = (n) =>
  Number.isFinite(n)
    ? Math.abs(n) < EPS
      ? "0"
      : Number(n.toFixed(6)).toString()
    : "—";
const h = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const nVars = () => Number($("vars").value);
function input(value = 0, cl = "") {
  return `<input type="number" step="any" class="${cl}" value="${h(value)}" aria-label="Coeficiente">`;
}
function renderObjective(vals) {
  let n = nVars();
  $("objective").style.setProperty("--cols", n);
  $("objective").innerHTML = Array.from(
    { length: n },
    (_, i) =>
      `<div><div class="coeflabel">x${i + 1}</div>${input(vals?.[i] ?? 0, "objcoef")}</div>`,
  ).join("");
}
function addConstraint(vals, op = "<=", rhs = 0) {
  const id = globalThis.crypto?.randomUUID
    ? crypto.randomUUID()
    : String(Date.now() + Math.random());
  constraintRows.push({ id, vals: vals || Array(nVars()).fill(0), op, rhs });
  renderConstraints();
}
function capture() {
  constraintRows = Array.from(document.querySelectorAll(".constraint")).map(
    (el) => ({
      id: el.dataset.id,
      vals: Array.from(el.querySelectorAll(".concoef")).map((x) => x.value),
      op: el.querySelector("select").value,
      rhs: el.querySelector(".rhs").value,
    }),
  );
}
function renderConstraints() {
  let n = nVars();
  $("constraints").innerHTML = constraintRows
    .map(
      (r, k) =>
        `<div class="constraint" data-id="${r.id}"><div class="constraint-title">R${k + 1}<button type="button" class="remove" data-id="${r.id}" aria-label="Eliminar restricción">Eliminar</button></div><div class="coefs" style="--cols:${n}">${Array.from({ length: n }, (_, i) => `<div><div class="coeflabel">x${i + 1}</div>${input(r.vals[i] ?? 0, "concoef")}</div>`).join("")}</div><div class="constraint-foot"><select aria-label="Comparador"><option value="<=" ${r.op === "<=" ? "selected" : ""}>≤ (menor o igual)</option><option value=">=" ${r.op === ">=" ? "selected" : ""}>≥ (mayor o igual)</option><option value="=" ${r.op === "=" ? "selected" : ""}>= (igual)</option></select>${input(r.rhs, "rhs")}</div></div>`,
    )
    .join("");
}
$("add").onclick = () => {
  capture();
  if (constraintRows.length >= 30) {
    alert("Máximo de 30 restricciones.");
    return;
  }
  addConstraint();
};
$("constraints").addEventListener("click", (e) => {
  if (e.target.classList.contains("remove")) {
    capture();
    constraintRows = constraintRows.filter((r) => r.id !== e.target.dataset.id);
    renderConstraints();
  }
});
$("vars").onchange = () => {
  const old = Array.from(document.querySelectorAll(".objcoef")).map(
    (x) => x.value,
  );
  capture();
  renderObjective(old);
  renderConstraints();
};
function reset() {
  constraintRows = [];
  renderObjective();
  addConstraint();
  addConstraint();
  $("results").innerHTML =
    '<div class="result-empty"><div class="graphic">▦</div><h3>Listo para optimizar</h3><p>Ingresa el modelo y pulsa <b>Resolver problema</b>.</p></div>';
}
$("clear").onclick = reset;
$("example").onclick = () => {
  $("vars").value = "2";
  document.querySelector('input[name="mode"][value="max"]').checked = true;
  renderObjective([3, 5]);
  constraintRows = [];
  addConstraint([1, 0], "<=", 4);
  addConstraint([0, 2], "<=", 12);
  addConstraint([3, 2], "<=", 18);
  $("solve").click();
};
function readProblem() {
  capture();
  const numbers = (a) =>
    a.map((x) => {
      if (x === "" || !Number.isFinite(Number(x)))
        throw Error(
          "Todos los coeficientes y límites deben contener números válidos.",
        );
      return Number(x);
    });
  const obj = numbers(
    Array.from(document.querySelectorAll(".objcoef")).map((x) => x.value),
  );
  if (!constraintRows.length) throw Error("Agrega al menos una restricción.");
  if (constraintRows.length > 30) throw Error("Máximo de 30 restricciones.");
  const cons = constraintRows.map((r) => ({
    a: numbers(r.vals),
    op: r.op,
    b: numbers([r.rhs])[0],
  }));
  return {
    obj,
    cons,
    max: document.querySelector('input[name="mode"]:checked').value === "max",
  };
}
function tableHtml(log) {
  return `<div class="tablewrap"><table><thead><tr><th>Base</th>${log.names.map((x) => `<th>${h(x)}</th>`).join("")}<th>LD</th></tr></thead><tbody>${log.table.map((r, i) => `<tr><td>${i === log.table.length - 1 ? "Z" : h(log.names[log.basis[i]] || "?")}</td>${r.map((v, j) => `<td class="${i === log.leave && j === log.enter ? "pivot" : ""}">${fmt(v)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}
function output(res, problem) {
  const box = $("results");
  if (res.status === "optimal") {
    box.innerHTML = `<div class="summary"><div class="metric"><span>Valor óptimo Z</span><strong>${fmt(res.z)}</strong></div><div class="metric"><span>Pivotes realizados</span><strong>${res.count}</strong></div><div class="metric"><span>Estado</span><strong style="font-size:19px;color:#168c74">Óptimo</strong></div></div><div class="success">✓ Solución óptima encontrada.</div><div class="result-section"><h3>Valores de decisión</h3><div class="tablewrap"><table><thead><tr><th>Variable</th><th>Valor óptimo</th></tr></thead><tbody>${res.sol.map((x, i) => `<tr><td>x${i + 1}</td><td>${fmt(x)}</td></tr>`).join("")}</tbody></table></div><h3>Procedimiento paso a paso</h3><p>Se muestra cada tabla simplex, incluyendo la fase I cuando fue necesaria. La celda verde identifica el pivote aplicado para obtener esa tabla.</p>${res.logs.map((l, i) => `<div class="iteration"><h4>Tabla ${i + 1} · ${l.phase}</h4>${tableHtml(l)}</div>`).join("")}<button class="btn secondary" onclick="window.print()">Imprimir resultados</button></div>`;
  } else {
    const messages = {
      infeasible:
        "El modelo no tiene solución factible: sus restricciones son incompatibles.",
      unbounded:
        "La función objetivo es no acotada en la dirección de optimización.",
      limit: "Se alcanzó el límite de iteraciones. Revisa el modelo.",
    };
    box.innerHTML = `<div class="error"><b>No se encontró solución óptima.</b><br>${messages[res.status] || "No pudo resolverse el problema."}</div><div class="result-section"><h3>Tablas calculadas</h3>${res.logs.map((l, i) => `<div class="iteration"><h4>Tabla ${i + 1} · ${l.phase}</h4>${tableHtml(l)}</div>`).join("")}</div>`;
  }
  const exportProblem = structuredClone(problem);
  const exportResult = structuredClone(res);
  box.insertAdjacentHTML("beforeend", '<div class="result-section"><button type="button" id="export-csv" class="btn secondary">Exportar CSV</button></div>');
  $("export-csv").onclick = () => SimplexCsv.download(exportProblem, exportResult);
}
