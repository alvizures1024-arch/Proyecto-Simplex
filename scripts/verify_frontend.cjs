// Verificación opcional: npm install --no-save playwright
// Ejecutar desde la raíz: node scripts/verify_frontend.cjs
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");
const { pathToFileURL } = require("node:url");
const { chromium } = require("playwright");
const { authenticate } = require("./browser_auth.cjs");

const root = path.resolve(__dirname, "..");
const processes = [];
let browser;

function start(command, args, env = {}) {
  const child = spawn(command, args, {
    cwd: root,
    windowsHide: true,
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.output = "";
  child.stdout.on("data", (chunk) => {
    child.output += chunk;
  });
  child.stderr.on("data", (chunk) => {
    child.output += chunk;
  });
  child.on("error", (error) => {
    child.output += error.message;
  });
  processes.push(child);
  return child;
}

async function waitFor(url) {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(
    `No inició ${url}\n${processes.map((p) => p.output).join("\n")}`,
  );
}

(async () => {
  const python =
    process.env.TEST_PYTHON ||
    path.join(root, ".venv", "Scripts", "python.exe");
  start(
    python,
    [
      "-m",
      "uvicorn",
      "app.main:app",
      "--app-dir",
      "backend",
      "--host",
      "127.0.0.1",
      "--port",
      "18000",
    ],
    {
      CORS_ORIGINS: "http://127.0.0.1:18080",
    },
  );
  start("php", ["-S", "127.0.0.1:18080", "-t", "frontend/public"], {
    API_URL: "http://127.0.0.1:18000",
  });
  await Promise.all([
    waitFor("http://127.0.0.1:18000/docs"),
    waitFor("http://127.0.0.1:18080"),
  ]);
  browser = await chromium.launch({
    channel: process.env.TEST_BROWSER || "msedge",
    headless: true,
  });
  const page = await browser.newPage({
    viewport: { width: 1366, height: 1000 },
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto(
    pathToFileURL(path.join(root, "version-html", "index.html")).href,
  );
  await page.locator("#example").click();
  assert.match(await page.locator("#results").innerText(), /36/);
  assert.match(
    await page.locator("#results").innerText(),
    /Solución óptima encontrada/,
  );

  await page.goto("http://127.0.0.1:18080");
  await authenticate(page);
  await page.locator("#example").click();
  await page.locator(".success").waitFor();
  assert.equal(await page.locator(".metric strong").first().innerText(), "36");
  assert.match(
    await page.locator("#save-status").innerText(),
    /guardado en MySQL/,
  );
  await page.locator("#solve:enabled").waitFor();

  // Minimización que necesita fase I, usando realmente FastAPI por HTTP.
  await page.locator("#clear").click();
  await page.locator('input[name="mode"][value="min"] + span').click();
  await page.locator(".objcoef").nth(0).fill("1");
  await page.locator(".objcoef").nth(1).fill("1");
  const rows = page.locator(".constraint");
  const values = [
    [1, 2, 4],
    [4, 2, 12],
  ];
  for (let i = 0; i < 2; i++) {
    await rows.nth(i).locator(".concoef").nth(0).fill(String(values[i][0]));
    await rows.nth(i).locator(".concoef").nth(1).fill(String(values[i][1]));
    await rows.nth(i).locator("select").selectOption(">=");
    await rows.nth(i).locator(".rhs").fill(String(values[i][2]));
  }
  await page.locator("#solve").click();
  await page.locator(".success").waitFor();
  assert.equal(
    await page.locator(".metric strong").first().innerText(),
    "3.333333",
  );
  assert.match(await page.locator("#results").innerText(), /Fase I/);
  await page.locator("#solve:enabled").waitFor();

  // Historial: contrato de UI con respuesta controlada; la persistencia real
  // la cubren las pruebas HTTP y requiere además un MySQL iniciado.
  const storedProblem = {
    obj: [3, 5],
    max: true,
    cons: [
      { a: [1, 0], op: "<=", b: 4 },
      { a: [0, 2], op: "<=", b: 12 },
      { a: [3, 2], op: "<=", b: 18 },
    ],
  };
  const apiResponse = await page.request.post(
    "http://127.0.0.1:18000/api/solve",
    { data: storedProblem },
  );
  assert.equal(apiResponse.status(), 200);
  const apiResult = await apiResponse.json();
  await page.route("**/api/problems?limit=20", (route) =>
    route.fulfill({
      json: [
        {
          id: 42,
          mode: "max",
          status: "optimal",
          variables: 2,
          z: 36,
          created_at: "2026-10-20T18:00:00+00:00",
        },
      ],
    }),
  );
  await page.route("**/api/problems/42", (route) =>
    route.fulfill({
      json: {
        id: 42,
        problem: storedProblem,
        result: apiResult,
      },
    }),
  );
  await page.locator("#refresh-history").click();
  await page.locator('[data-open="42"]').click();
  await page.waitForFunction(() =>
    document.querySelector("#save-status").textContent.includes("recuperado"),
  );
  assert.equal(await page.locator(".objcoef").first().inputValue(), "3");
  assert.equal(await page.locator(".metric strong").first().innerText(), "36");

  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await page.locator("#clear").click();
  await page.locator("#vars").selectOption("6");
  assert.equal(await page.locator(".objcoef").count(), 6);
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  assert.deepEqual(errors, []);
  fs.mkdirSync(path.join(root, "artifacts"), { recursive: true });
  await page.screenshot({
    path: path.join(root, "artifacts", "frontend-mobile.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 1366, height: 1000 });
  await page.screenshot({
    path: path.join(root, "artifacts", "frontend-desktop.png"),
    fullPage: true,
  });
  console.log(
    "OK: HTML independiente, registro/login, PHP + FastAPI y MySQL reales, minimización, recuperación de historial simulada y diseño móvil.",
  );
  await page.locator("#logout").click();
  await page.locator("#auth-form").waitFor();
})()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (browser) await browser.close();
    for (const child of processes) child.kill();
  });
