// Desde la raíz, con Playwright instalado: node scripts/verify_csv.cjs
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { chromium } = require("playwright");
const { authenticate } = require("./browser_auth.cjs");
const { serialize } = require("../frontend/public/assets/js/export-csv.js");

const sample = {
  obj: [-1.25, 2],
  max: false,
  cons: [{ a: [1, -0.5], op: "=", b: 2 }],
};
const infeasible = serialize(sample, { status: "infeasible", logs: [] });
assert.ok(infeasible.startsWith("\uFEFF"));
assert.ok(infeasible.includes('"-1.25"'));
assert.ok(infeasible.includes('"Igual (=)"'));
assert.ok(infeasible.includes('"Inviable"'));
assert.ok(!infeasible.includes("Valor óptimo Z"));
assert.ok(
  serialize(sample, {
    status: "unbounded",
    logs: [
      {
        phase: 'Texto, "con comillas"',
        names: ["x1"],
        basis: [0],
        table: [
          [1, 2],
          [0, 0],
        ],
        enter: null,
        leave: null,
      },
    ],
  }).includes('"Texto, ""con comillas"""'),
);

(async () => {
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  const folder = path.resolve(__dirname, "../artifacts");
  fs.mkdirSync(folder, { recursive: true });
  try {
    const page = await browser.newPage({ acceptDownloads: true });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("http://localhost:8080");
    await authenticate(page);
    assert.equal(await page.locator("#export-csv").count(), 0);
    await page.locator("[data-open]").first().click();
    await page.locator("#export-csv").waitFor();
    const original = await page.evaluate(() => ({
      obj: Array.from(document.querySelectorAll(".objcoef"), (input) =>
        Number(input.value),
      ),
      z: Number(document.querySelector(".metric strong").textContent),
    }));
    // Cambiar el formulario no debe alterar el modelo del resultado exportado.
    await page.locator(".objcoef").first().fill("999999");
    const pending = page.waitForEvent("download");
    await page.locator("#export-csv").click();
    const download = await pending;
    assert.match(download.suggestedFilename(), /^simplexlab-.*\.csv$/);
    const target = path.join(folder, "exportacion-historial.csv");
    await download.saveAs(target);
    const csv = fs.readFileSync(target, "utf8");
    assert.ok(
      csv.includes(
        `"Coeficiente",${original.obj.map((value) => `"${value}"`).join(",")}`,
      ),
    );
    assert.ok(csv.includes(`"Valor óptimo Z","${original.z}"`));
    assert.ok(csv.includes("Tabla 1"));
    await page.locator("#clear").click();
    assert.equal(await page.locator("#export-csv").count(), 0);
    await page.locator("#logout").click();
    await page.locator("#auth-form").waitFor();

    await page.goto(
      pathToFileURL(path.resolve(__dirname, "../version-html/index.html")).href,
    );
    await page.locator("#example").click();
    const staticPending = page.waitForEvent("download");
    await page.locator("#export-csv").click();
    const staticDownload = await staticPending;
    const staticTarget = path.join(folder, "exportacion-html.csv");
    await staticDownload.saveAs(staticTarget);
    assert.ok(
      fs.readFileSync(staticTarget, "utf8").includes('"Valor óptimo Z","36"'),
    );
    assert.deepEqual(errors, []);
    console.log(
      "OK: CSV descargado desde el historial real y HTML; modelo y resultado coinciden, UTF-8, decimales negativos, comillas y diagnósticos verificados.",
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
