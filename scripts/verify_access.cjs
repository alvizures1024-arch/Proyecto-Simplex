const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const { chromium } = require("playwright");
const { authenticate } = require("./browser_auth.cjs");

(async () => {
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  try {
    const page = await browser.newPage({
      viewport: { width: 1366, height: 1000 },
    });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("http://localhost:8080");
    await page.locator("#auth-form").waitFor();
    assert.equal(await page.locator("#application").isVisible(), false);
    assert.match(await page.locator("footer").innerText(), /7ª calle 25-55/);
    assert.match(await page.locator("footer").innerText(), /24567890/);
    const api = await page.request.get("http://localhost:8000/api/problems");
    assert.equal(api.status(), 401);
    fs.mkdirSync(path.resolve("artifacts"), { recursive: true });
    await page.screenshot({
      path: "artifacts/login-desktop.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    await page.screenshot({
      path: "artifacts/login-mobile.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 1366, height: 1000 });
    const account = await authenticate(page);
    await page.reload();
    await page.locator("#application").waitFor();
    await page.locator("[data-open]").first().waitFor();
    await page.locator("[data-open]").first().click();
    await page.locator("#export-csv").waitFor();
    await page.locator("#logout:enabled").waitFor();
    // Intercepta únicamente el clic mailto: para no abrir un cliente ni enviar correo.
    await page.evaluate(() =>
      document.addEventListener(
        "click",
        (event) => {
          if (event.target.closest('a[href^="mailto:"]'))
            event.preventDefault();
        },
        true,
      ),
    );
    await page.locator("#report-open").click();
    await page.locator("#report-subject").fill("Error con una restricción");
    await page
      .locator("#report-message")
      .fill("Al ingresar un decimal aparece un resultado que quiero revisar.");
    await page.locator("#report-form button[type=submit]").click();
    const href = await page.locator("#report-mail-link").getAttribute("href");
    const mail = new URL(href);
    assert.equal(mail.protocol, "mailto:");
    assert.equal(mail.pathname, "alvizures1024@gmail.com");
    assert.match(mail.searchParams.get("subject"), /Error con una restricción/);
    assert.ok(mail.searchParams.get("body").includes(account.email));
    assert.match(
      await page.locator("#report-status").innerText(),
      /pulsa Enviar/,
    );
    await page.screenshot({
      path: "artifacts/reporte-desktop.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    await page.screenshot({
      path: "artifacts/reporte-mobile.png",
      fullPage: true,
    });
    await page.locator("#report-close").click();
    await page.locator("#logout").click();
    await page.locator("#auth-form").waitFor();
    assert.equal(
      (await page.request.get("http://localhost:8000/api/problems")).status(),
      401,
    );
    // Tras registrarse, el formulario puede seguir en modo Crear cuenta.
    if (await page.locator("#register-name-field").isVisible())
      await page.locator("#auth-toggle").click();
    await page.locator("#auth-email").fill(account.email);
    await page.locator("#auth-password").fill("ClaveIncorrecta");
    await page.locator("#auth-submit").click();
    await page.waitForFunction(() =>
      document.querySelector("#auth-error").textContent.includes("incorrectos"),
    );
    await page.locator("#auth-password").fill(account.password);
    await page.locator("#auth-submit").click();
    await page.locator("#application").waitFor();
    await page.locator("#logout").click();
    await page.locator("#auth-form").waitFor();
    assert.deepEqual(errors, []);
    console.log(
      "OK: registro/login reales con MySQL, sesión persistente, cierre, API protegida, footer, correo preparado sin envío y vista móvil.",
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
