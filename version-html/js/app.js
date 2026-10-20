"use strict";
const EPS = 1e-8,
  MAX_IT = 200;
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
function simplex(problem) {
  const n = problem.obj.length,
    names = Array.from({ length: n }, (_, i) => `x${i + 1}`),
    artificial = new Set(),
    basis = [],
    rows = [];
  let variableCount = n;
  const addColumn = (name) => {
    names.push(name);
    variableCount++;
    rows.forEach((r) => r.splice(r.length - 1, 0, 0));
    return variableCount - 1;
  };
  let sc = 0,
    ec = 0,
    ac = 0;
  for (const c of problem.cons) {
    let a = c.a.slice(),
      b = c.b,
      op = c.op;
    if (b < -EPS) {
      a = a.map((v) => -v);
      b = -b;
      op = op === "<=" ? ">=" : op === ">=" ? "<=" : "=";
    }
    const row = Array(variableCount).fill(0);
    for (let j = 0; j < n; j++) row[j] = a[j];
    row.push(Math.abs(b) < EPS ? 0 : b);
    rows.push(row);
    if (op === "<=") {
      const idx = addColumn(`h${++sc}`);
      row[idx] = 1;
      basis.push(idx);
    } else if (op === ">=") {
      let idx = addColumn(`e${++ec}`);
      row[idx] = -1;
      idx = addColumn(`a${++ac}`);
      row[idx] = 1;
      basis.push(idx);
      artificial.add(idx);
    } else {
      const idx = addColumn(`a${++ac}`);
      row[idx] = 1;
      basis.push(idx);
      artificial.add(idx);
    }
  }
  let tab = rows;
  let logs = [];
  let count = 0;
  function initObjective(cost) {
    let obj = Array(variableCount + 1).fill(0);
    for (let j = 0; j < variableCount; j++) obj[j] = -(cost[j] || 0);
    for (let i = 0; i < tab.length; i++) {
      let cb = cost[basis[i]] || 0;
      if (cb) for (let j = 0; j <= variableCount; j++) obj[j] += cb * tab[i][j];
    }
    tab.push(obj);
  }
  function snapshot(phase, enter = null, leave = null) {
    logs.push({
      phase,
      names: names.slice(),
      basis: basis.slice(),
      table: tab.map((r) => r.slice()),
      enter,
      leave,
    });
  }
  function pivot(row, col) {
    const div = tab[row][col];
    tab[row] = tab[row].map((v) => v / div);
    for (let i = 0; i < tab.length; i++)
      if (i !== row) {
        const factor = tab[i][col];
        if (Math.abs(factor) > EPS)
          for (let j = 0; j < tab[i].length; j++)
            tab[i][j] -= factor * tab[row][j];
      }
    basis[row] = col;
    tab = tab.map((r) => r.map((v) => (Math.abs(v) < EPS ? 0 : v)));
  }
  function run(phase) {
    snapshot(phase);
    while (true) {
      if (++count > MAX_IT) return "limit";
      let obj = tab[tab.length - 1],
        enter = -1;
      for (let j = 0; j < variableCount; j++)
        if (obj[j] < -EPS) {
          enter = j;
          break;
        }
      if (enter === -1) return "optimal";
      let leave = -1,
        ratio = Infinity;
      for (let i = 0; i < basis.length; i++) {
        let d = tab[i][enter];
        if (d > EPS) {
          let r = tab[i][variableCount] / d;
          if (
            r < ratio - EPS ||
            (Math.abs(r - ratio) < EPS &&
              (leave === -1 || basis[i] < basis[leave]))
          ) {
            ratio = r;
            leave = i;
          }
        }
      }
      if (leave < 0) return "unbounded";
      pivot(leave, enter);
      snapshot(phase, enter, leave);
    }
  }
  if (artificial.size) {
    const c = Array(variableCount).fill(0);
    artificial.forEach((j) => (c[j] = -1));
    initObjective(c);
    const status = run("Fase I · factibilidad");
    if (status !== "optimal")
      return { status: status === "limit" ? "limit" : "infeasible", logs };
    if (tab[tab.length - 1][variableCount] < -1e-6)
      return { status: "infeasible", logs };
    tab.pop();
    for (let i = basis.length - 1; i >= 0; i--)
      if (artificial.has(basis[i])) {
        let entering = -1;
        for (let j = 0; j < variableCount; j++)
          if (!artificial.has(j) && Math.abs(tab[i][j]) > EPS) {
            entering = j;
            break;
          }
        if (entering !== -1) {
          tab.push(Array(variableCount + 1).fill(0));
          pivot(i, entering);
          tab.pop();
        } else {
          if (Math.abs(tab[i][variableCount]) > 1e-6)
            return { status: "infeasible", logs };
          tab.splice(i, 1);
          basis.splice(i, 1);
        }
      }
    const keep = Array.from({ length: variableCount }, (_, j) => j).filter(
      (j) => !artificial.has(j),
    );
    basis.splice(0, basis.length, ...basis.map((j) => keep.indexOf(j)));
    tab = tab.map((r) => [...keep.map((j) => r[j]), r[variableCount]]);
    const remaining = keep.map((j) => names[j]);
    names.splice(0, names.length, ...remaining);
    variableCount = names.length;
  }
  const c = Array(variableCount).fill(0);
  for (let j = 0; j < n; j++)
    c[j] = problem.max ? problem.obj[j] : -problem.obj[j];
  initObjective(c);
  const status = run("Fase II · optimización");
  if (status !== "optimal") return { status, logs };
  const sol = Array(n).fill(0);
  for (let i = 0; i < basis.length; i++)
    if (basis[i] < n) sol[basis[i]] = tab[i][variableCount];
  return {
    status: "optimal",
    z: (problem.max ? 1 : -1) * tab[tab.length - 1][variableCount],
    sol,
    logs,
    count: logs.filter((l) => l.enter !== null).length,
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
$("solve").onclick = () => {
  try {
    const problem = readProblem();
    output(simplex(problem), problem);
  } catch (e) {
    $("results").innerHTML =
      `<div class="error"><b>Revisa los datos:</b> ${h(e.message)}</div>`;
  }
};
reset();
