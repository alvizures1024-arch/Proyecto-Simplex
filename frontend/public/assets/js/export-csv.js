"use strict";

// CSV UTF-8 con BOM para conservar tildes al abrir el archivo en Excel.
(() => {
  const states = {
    optimal: "Óptimo", infeasible: "Inviable", unbounded: "No acotado",
    limit: "Límite de iteraciones",
  };
  const operators = { "<=": "Menor o igual (<=)", ">=": "Mayor o igual (>=)", "=": "Igual (=)" };

  function cell(value) {
    let text = value == null ? "" : String(value);
    // Las cadenas se tratan como texto; los números negativos siguen siendo números.
    if (typeof value === "string" && /^[=+\-@\t\r\n]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  }

  function serialize(problem, result) {
    const variables = problem.obj.map((_, i) => `x${i + 1}`);
    const rows = [
      ["SimplexLab · Reporte del problema"],
      ["Tipo de optimización", problem.max ? "Maximizar" : "Minimizar"],
      ["Estado", states[result.status] || result.status],
      [], ["Función objetivo"],
      ["Variable", ...variables], ["Coeficiente", ...problem.obj],
      [], ["Restricciones"],
      ["Restricción", ...variables, "Comparador", "Límite"],
      ...problem.cons.map((c, i) => [`R${i + 1}`, ...c.a, operators[c.op], c.b]),
      [], ["Condición", "Todas las variables son no negativas"],
      [], ["Resultados"],
    ];
    if (result.status === "optimal") {
      rows.push(["Valor óptimo Z", result.z], ["Variable", "Valor óptimo"]);
      result.sol.forEach((value, i) => rows.push([variables[i], value]));
    }
    const logs = result.logs || [];
    rows.push(["Pivotes realizados", result.count ?? logs.filter(log => log.enter != null).length]);
    logs.forEach((log, index) => {
      rows.push([], [`Tabla ${index + 1}`, log.phase]);
      if (log.enter != null) {
        rows.push(["Columna del pivote", log.names[log.enter]], ["Fila del pivote", log.leave + 1]);
      }
      rows.push(["Base", ...log.names, "LD"]);
      log.table.forEach((row, i) => rows.push([
        i === log.table.length - 1 ? "Z" : log.names[log.basis[i]], ...row,
      ]));
    });
    // Todas las filas tienen el mismo número de campos, incluso entre secciones.
    const width = Math.max(...rows.map(row => row.length));
    return "\uFEFF" + rows.map(row => Array.from(
      { length: width }, (_, i) => cell(row[i]),
    ).join(",")).join("\r\n") + "\r\n";
  }

  function download(problem, result) {
    const blob = new Blob([serialize(problem, result)], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    link.href = url;
    link.download = `simplexlab-${stamp}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  globalThis.SimplexCsv = { serialize, download };
  if (typeof module !== "undefined" && module.exports) module.exports = globalThis.SimplexCsv;
})();
