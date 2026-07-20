import { test, expect } from "../playwright-fixture";
import { TEST_USERS, BASE_URL } from "./helpers";

// =============================================================================
// Fluxo do Dono — Portal da Organização
// =============================================================================

/** Helper: faz login do dono a partir da página raiz */
async function ownerLogin(page: any) {
  await page.fill('[id="owner-email"]', TEST_USERS.owner.email);
  await page.fill('[id="owner-password"]', TEST_USERS.owner.password);
  await page.click('[id="btn-submit-owner"]');
}

test.describe("Portal do Dono", () => {
  test.beforeEach(async ({ page, context }) => {
    await context.clearCookies();
    await page.goto(`${BASE_URL}/`);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // P0 — Login e navegação básica
  // ──────────────────────────────────────────────────────────────────────────
  test("login como dono redireciona para /dashboard", async ({ page }) => {
    await ownerLogin(page);

    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10_000 });
    await expect(page.getByText("BarberHouse")).toBeVisible();
  });

  test("sidebar do dono contém todos os itens de navegação", async ({ page }) => {
    await ownerLogin(page);
    await page.waitForURL(/\/dashboard/);

    const nav = page.locator("nav");
    await expect(nav.getByText("Painel")).toBeVisible();
    await expect(nav.getByText("Locais")).toBeVisible();
    await expect(nav.getByText("Barbeiros")).toBeVisible();
    await expect(nav.getByText("Reservas")).toBeVisible();
    await expect(nav.getByText("Contratos")).toBeVisible();
    await expect(nav.getByText("Financeiro")).toBeVisible();
    await expect(nav.getByText("Auditoria")).toBeVisible();
    await expect(nav.getByText("Configurações")).toBeVisible();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // P0 — Locais e Cadeiras
  // ──────────────────────────────────────────────────────────────────────────
  test("dono vê a unidade de teste no cadastro de Locais", async ({ page }) => {
    await ownerLogin(page);
    await page.waitForURL(/\/dashboard/);

    await page.click('nav a[href="/locations"]');
    await page.waitForURL(/\/locations/);

    await expect(page.getByText("Unidade Centro Teste")).toBeVisible({ timeout: 8_000 });
  });

  test("dono vê as cadeiras A1 e A2 dentro da unidade", async ({ page }) => {
    await ownerLogin(page);
    await page.waitForURL(/\/dashboard/);

    await page.click('nav a[href="/locations"]');
    await page.waitForURL(/\/locations/);

    await page.getByText("Unidade Centro Teste").click();
    await page.waitForURL(/\/locations\//);

    await expect(page.getByText("A1")).toBeVisible({ timeout: 8_000 });
    await expect(page.getByText("A2")).toBeVisible({ timeout: 8_000 });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // P1 — Configurações de confirmação
  // ──────────────────────────────────────────────────────────────────────────
  test("dono consegue acessar página de Configurações", async ({ page }) => {
    await ownerLogin(page);
    await page.waitForURL(/\/dashboard/);

    await page.click('nav a[href="/settings"]');
    await page.waitForURL(/\/settings/);

    // Página carrega sem erro
    await expect(page.locator("h1, h2").first()).toBeVisible({ timeout: 8_000 });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // P1 — Reservas e Contratos (leitura)
  // ──────────────────────────────────────────────────────────────────────────
  test("página de Reservas carrega sem erro", async ({ page }) => {
    await ownerLogin(page);
    await page.waitForURL(/\/dashboard/);

    await page.click('nav a[href="/bookings"]');
    await page.waitForURL(/\/bookings/);

    await expect(page.locator("body")).not.toContainText("Error");
    await expect(page.locator("body")).not.toContainText("Cannot read");
  });

  test("página de Contratos carrega sem erro", async ({ page }) => {
    await ownerLogin(page);
    await page.waitForURL(/\/dashboard/);

    await page.click('nav a[href="/contracts"]');
    await page.waitForURL(/\/contracts/);

    await expect(page.locator("body")).not.toContainText("Cannot read");
  });

  // ──────────────────────────────────────────────────────────────────────────
  // P1 — Auditoria (LGPD)
  // ──────────────────────────────────────────────────────────────────────────
  test("página de Auditoria carrega com tabela de logs", async ({ page }) => {
    await ownerLogin(page);
    await page.waitForURL(/\/dashboard/);

    await page.click('nav a[href="/audit"]');
    await page.waitForURL(/\/audit/);

    // Deve ter cabeçalho da página ou tabela/estado vazio
    await expect(
      page.getByRole("heading").or(page.getByText(/log|auditoria|registro/i)).first()
    ).toBeVisible({ timeout: 8_000 });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // P2 — Logout
  // ──────────────────────────────────────────────────────────────────────────
  test("logout redireciona para tela de login", async ({ page }) => {
    await ownerLogin(page);
    await page.waitForURL(/\/dashboard/);

    // Botão "Sair" na sidebar
    await page.getByRole("button", { name: /Sair/i }).click();

    await expect(page).toHaveURL(/\/$|\/login|\/auth/, { timeout: 8_000 });
  });
});
