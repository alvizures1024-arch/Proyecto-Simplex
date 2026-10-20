const { randomBytes } = require("node:crypto");

// Puede usarse TEST_EMAIL/TEST_PASSWORD para no crear cuentas adicionales.
async function authenticate(page) {
  await page.locator("#auth-form").waitFor({ state: "visible" });
  const existing = Boolean(process.env.TEST_EMAIL && process.env.TEST_PASSWORD);
  const account = {
    email:
      process.env.TEST_EMAIL ||
      `verificacion-${randomBytes(6).toString("hex")}@example.invalid`,
    password:
      process.env.TEST_PASSWORD || randomBytes(24).toString("base64url"),
  };
  if (!existing) {
    await page.locator("#auth-toggle").click();
    await page.locator("#auth-name").fill("Verificación de interfaz");
    await page.locator("#auth-confirm").fill(account.password);
  }
  await page.locator("#auth-email").fill(account.email);
  await page.locator("#auth-password").fill(account.password);
  await page.locator("#auth-submit").click();
  await page.locator("#application").waitFor({ state: "visible" });
  return account;
}
module.exports = { authenticate };
