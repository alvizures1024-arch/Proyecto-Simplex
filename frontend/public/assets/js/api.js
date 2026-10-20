"use strict";

const apiLocation = new URL(
  document.querySelector('meta[name="api-url"]').content,
);
if (
  ["localhost", "127.0.0.1"].includes(apiLocation.hostname) &&
  ["localhost", "127.0.0.1"].includes(location.hostname)
)
  apiLocation.hostname = location.hostname;
const API_URL = apiLocation.href.replace(/\/$/, "");
let busy = false;
let historyRevision = 0;
let signedInUser = null;
let registering = false;

async function apiRequest(path, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(`${API_URL}${path}`, {
      ...options,
      credentials: "include",
      headers: { "Content-Type": "application/json", ...options.headers },
      signal: controller.signal,
    });
    const data = await response.json();
    if (!response.ok) {
      const detail = Array.isArray(data.detail)
        ? data.detail
            .map((item) => `${item.loc.join(".")}: ${item.msg}`)
            .join("; ")
        : data.detail;
      const error = new Error(
        detail || `La API devolvió el error ${response.status}.`,
      );
      error.status = response.status;
      if (response.status === 401 && !path.startsWith("/api/auth/"))
        showLogin("Tu sesión expiró. Vuelve a ingresar.");
      throw error;
    }
    return data;
  } catch (error) {
    if (error.name === "AbortError")
      throw new Error("La API tardó más de 30 segundos. Intenta de nuevo.");
    if (error instanceof TypeError)
      throw new Error(
        "No se pudo conectar con FastAPI. Revisa API_URL y que el backend esté iniciado.",
      );
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function setBusy(value) {
  busy = value;
  $("solve").disabled = value;
  $("solve").textContent = value ? "Calculando…" : "▶ Resolver problema";
  document.querySelector(".layout > section:first-child").inert = value;
  $("history-card").inert = value;
  $("logout").disabled = value;
}

function setApiStatus(text, state = "") {
  $("api-status").textContent = text;
  $("api-status").className = `status ${state}`;
}

async function checkHealth() {
  try {
    await apiRequest("/api/health");
    setApiStatus("● API y MySQL disponibles");
  } catch (error) {
    if (error.status === 503) {
      setApiStatus("● API disponible · MySQL pendiente", "partial");
    } else {
      setApiStatus("● Sin conexión con FastAPI", "offline");
    }
  }
}

const statusLabels = {
  optimal: "Óptimo",
  infeasible: "Inviable",
  unbounded: "No acotado",
  limit: "Límite de iteraciones",
};

async function loadHistory() {
  const revision = ++historyRevision;
  $("refresh-history").disabled = true;
  try {
    const rows = await apiRequest("/api/problems?limit=20");
    if (revision !== historyRevision) return;
    $("history").innerHTML = rows.length
      ? rows
          .map(
            (row) => `
      <div class="history-row">
        <div><b>#${row.id} · ${row.mode === "max" ? "Maximizar" : "Minimizar"}</b>
        · ${h(statusLabels[row.status] || row.status)}
        <small>${h(new Date(row.created_at).toLocaleString("es-GT"))} · ${row.variables} variables${row.z == null ? "" : ` · Z = ${fmt(row.z)}`}</small></div>
        <button type="button" class="btn secondary" data-open="${row.id}">Abrir</button>
      </div>`,
          )
          .join("")
      : "Aún no hay problemas guardados.";
  } catch (error) {
    if (revision === historyRevision) $("history").textContent = error.message;
  } finally {
    if (revision === historyRevision) $("refresh-history").disabled = false;
  }
}

$("solve").onclick = async () => {
  if (busy) return;
  try {
    const problem = readProblem();
    setBusy(true);
    $("save-status").textContent = "";
    const result = await apiRequest("/api/solve", {
      method: "POST",
      body: JSON.stringify(problem),
    });
    output(result, problem);
    $("save-status").textContent = result.saved
      ? `Problema #${result.id} guardado en MySQL.`
      : result.warning;
    setApiStatus(
      result.saved
        ? "● API y MySQL disponibles"
        : "● API disponible · sin guardar",
      result.saved ? "" : "partial",
    );
    await loadHistory();
  } catch (error) {
    $("results").innerHTML =
      `<div class="error"><b>No se pudo resolver:</b> ${h(error.message)}</div>`;
    $("save-status").textContent = "";
  } finally {
    setBusy(false);
  }
};

$("history").addEventListener("click", async (event) => {
  const button = event.target.closest("[data-open]");
  if (!button || busy) return;
  setBusy(true);
  try {
    const record = await apiRequest(
      `/api/problems/${encodeURIComponent(button.dataset.open)}`,
    );
    const problem = record.problem;
    $("vars").value = String(problem.obj.length);
    document.querySelector(
      `input[name="mode"][value="${problem.max ? "max" : "min"}"]`,
    ).checked = true;
    renderObjective(problem.obj);
    constraintRows = [];
    problem.cons.forEach((c) => addConstraint(c.a, c.op, c.b));
    output(record.result, problem);
    $("save-status").textContent =
      `Problema #${record.id} recuperado de MySQL.`;
  } catch (error) {
    $("save-status").textContent = error.message;
  } finally {
    setBusy(false);
  }
});

const clearForm = $("clear").onclick;
$("clear").onclick = () => {
  clearForm();
  $("save-status").textContent = "";
};
$("refresh-history").onclick = () => {
  checkHealth();
  loadHistory();
};
reset();

function showLogin(message = "") {
  signedInUser = null;
  ++historyRevision;
  $("application").hidden = true;
  $("user-menu").hidden = true;
  $("report-open").hidden = true;
  $("auth-screen").hidden = false;
  $("auth-loading").hidden = true;
  $("auth-form").hidden = false;
  $("auth-error").textContent = message;
  $("auth-password").value = "";
  $("auth-confirm").value = "";
  $("history").textContent = "";
  $("save-status").textContent = "";
  if ($("report-dialog").open) $("report-dialog").close();
  $("report-form").reset();
  $("report-mail-link").removeAttribute("href");
  $("report-mail-link").hidden = true;
  $("report-status").textContent = "";
  reset();
}

function showApplication(user) {
  signedInUser = user;
  $("auth-screen").hidden = true;
  $("application").hidden = false;
  $("user-menu").hidden = false;
  $("report-open").hidden = false;
  $("user-name").textContent = user.name;
  $("auth-password").value = "";
  $("auth-confirm").value = "";
  checkHealth();
  loadHistory();
}

$("auth-toggle").onclick = () => {
  registering = !registering;
  $("auth-title").textContent = registering ? "Crear cuenta" : "Iniciar sesión";
  $("auth-description").textContent = registering
    ? "Regístrate para ingresar a SimplexLab."
    : "Ingresa a SimplexLab para resolver y consultar problemas.";
  $("auth-submit").textContent = registering
    ? "Crear cuenta e ingresar"
    : "Ingresar";
  $("auth-switch-label").textContent = registering
    ? "¿Ya tienes cuenta?"
    : "¿No tienes cuenta?";
  $("auth-toggle").textContent = registering
    ? "Iniciar sesión"
    : "Crear cuenta";
  $("register-name-field").hidden = !registering;
  $("register-confirm-field").hidden = !registering;
  $("password-help").hidden = !registering;
  for (const id of ["auth-name", "auth-confirm"]) {
    $(id).disabled = !registering;
    $(id).required = registering;
  }
  $("auth-password").minLength = registering ? 10 : 1;
  $("auth-password").autocomplete = registering
    ? "new-password"
    : "current-password";
  $("auth-error").textContent = "";
};

$("auth-form").onsubmit = async (event) => {
  event.preventDefault();
  $("auth-error").textContent = "";
  if (registering && $("auth-password").value !== $("auth-confirm").value) {
    $("auth-error").textContent = "Las contraseñas no coinciden.";
    return;
  }
  const data = {
    email: $("auth-email").value,
    password: $("auth-password").value,
  };
  if (registering) data.name = $("auth-name").value;
  $("auth-submit").disabled = true;
  $("auth-toggle").disabled = true;
  try {
    const user = await apiRequest(
      registering ? "/api/auth/register" : "/api/auth/login",
      {
        method: "POST",
        body: JSON.stringify(data),
      },
    );
    showApplication(user);
  } catch (error) {
    $("auth-error").textContent = error.message;
  } finally {
    $("auth-submit").disabled = false;
    $("auth-toggle").disabled = false;
  }
};

$("logout").onclick = async () => {
  $("logout").disabled = true;
  try {
    await apiRequest("/api/auth/logout", { method: "POST" });
    showLogin();
  } catch (error) {
    $("save-status").textContent = error.message;
  } finally {
    $("logout").disabled = false;
  }
};

(async () => {
  try {
    showApplication(await apiRequest("/api/auth/me"));
  } catch (error) {
    showLogin(error.status === 401 ? "" : error.message);
  }
})();
