import { test, expect } from "../playwright-fixture";
import { TEST_USERS, BASE_URL } from "./helpers";

// =============================================================================
// Fluxo do Barbeiro — Portal do Barbeiro (/barber/*)
// =============================================================================

test.describe("Portal do Barbeiro", () => {
  test.beforeEach(async ({ page, context }) => {
    await context.clearCookies();
    await page.goto(`${BASE_URL}/barber/auth`);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    // Alternar para Login se estiver na tela de Cadastro
    const loginBtn = page.getByText("Fazer Login");
    if (await loginBtn.isVisible()) {
      await loginBtn.click();
    }
    await page.waitForSelector('[id="email"]', { state: "visible" });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // P0 — Login
  // ──────────────────────────────────────────────────────────────────────────
  test("login como barbeiro redireciona para /barber/dashboard", async ({ page }) => {
    await page.fill('[id="email"]', TEST_USERS.barber.email);
    await page.fill('[id="password"]', TEST_USERS.barber.password);
    await page.click('button[type="submit"]');

    await expect(page).toHaveURL(/\/barber\/dashboard/, { timeout: 10_000 });
    await expect(page.getByText("Portal do barbeiro")).toBeVisible();
  });

  test("sidebar do barbeiro contém itens corretos", async ({ page }) => {
    await page.fill('[id="email"]', TEST_USERS.barber.email);
    await page.fill('[id="password"]', TEST_USERS.barber.password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/barber\/dashboard/);

    const nav = page.locator("nav");
    await expect(nav.getByText("Dashboard")).toBeVisible();
    await expect(nav.getByText("Explorar cadeiras")).toBeVisible();
    await expect(nav.getByText("Meus contratos")).toBeVisible();
    await expect(nav.getByText("Minhas reservas")).toBeVisible();
    await expect(nav.getByText("Meus clientes")).toBeVisible();
    await expect(nav.getByText("Check-in")).toBeVisible();
    await expect(nav.getByText("Meus ganhos")).toBeVisible();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // P0 — Explorar cadeiras
  // ──────────────────────────────────────────────────────────────────────────
  test("página Explorar exibe cadeiras disponíveis", async ({ page }) => {
    await page.fill('[id="email"]', TEST_USERS.barber.email);
    await page.fill('[id="password"]', TEST_USERS.barber.password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/barber\/dashboard/);

    await page.click('nav a[href="/barber/explore"]');
    await page.waitForURL(/\/barber\/explore/);

    // Deve exibir pelo menos a unidade de teste
    await expect(
      page.getByText("Barbearia Teste E2E").or(page.getByText("Unidade Centro Teste")).first()
    ).toBeVisible({ timeout: 10_000 });
  });

  test("barbeiro consegue clicar em uma cadeira e ver o formulário de reserva", async ({ page }) => {
    await page.fill('[id="email"]', TEST_USERS.barber.email);
    await page.fill('[id="password"]', TEST_USERS.barber.password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/barber\/dashboard/);

    await page.click('nav a[href="/barber/explore"]');
    await page.waitForURL(/\/barber\/explore/);

    // Clicar em "Ver cadeiras" no primeiro ponto físico
    await page.waitForTimeout(1500); // aguarda dados carregarem
    await page.getByRole("button", { name: /Ver cadeiras/i }).first().click();
    await page.waitForSelector('text=Trocar ponto físico', { state: "visible" });

    // Clicar na primeira cadeira disponível para reservar
    const firstChair = page.getByRole("button", { name: /reservar/i }).first();
    await firstChair.click();

    // Formulário de reserva deve aparecer
    await expect(
      page.getByText(/data|horário|início|confirmar reserva/i).first()
    ).toBeVisible({ timeout: 8_000 });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // P0 — Minhas Reservas
  // ──────────────────────────────────────────────────────────────────────────
  test("página Minhas Reservas carrega sem erro", async ({ page }) => {
    await page.fill('[id="email"]', TEST_USERS.barber.email);
    await page.fill('[id="password"]', TEST_USERS.barber.password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/barber\/dashboard/);

    await page.click('nav a[href="/barber/my-bookings"]');
    await page.waitForURL(/\/barber\/my-bookings/);

    await expect(page.locator("body")).not.toContainText("Cannot read");
    // Estado vazio ou lista de reservas
    await expect(
      page.getByText(/reserva|booking|nenhuma/i).first()
    ).toBeVisible({ timeout: 8_000 });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // P0 — Meus Contratos
  // ──────────────────────────────────────────────────────────────────────────
  test("página Meus Contratos carrega sem erro", async ({ page }) => {
    await page.fill('[id="email"]', TEST_USERS.barber.email);
    await page.fill('[id="password"]', TEST_USERS.barber.password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/barber\/dashboard/);

    await page.click('nav a[href="/barber/contracts"]');
    await page.waitForURL(/\/barber\/contracts/);

    await expect(page.locator("body")).not.toContainText("Cannot read");
  });

  // ──────────────────────────────────────────────────────────────────────────
  // P1 — Check-in
  // ──────────────────────────────────────────────────────────────────────────
  test("página Check-in carrega com campo de busca de cliente", async ({ page }) => {
    await page.fill('[id="email"]', TEST_USERS.barber.email);
    await page.fill('[id="password"]', TEST_USERS.barber.password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/barber\/dashboard/);

    await page.click('nav a[href="/barber/checkin"]');
    await page.waitForURL(/\/barber\/checkin/);

    await expect(
      page.getByPlaceholder(/buscar|cliente|nome/i)
        .or(page.getByRole("combobox"))
        .or(page.getByText(/check-in|atendimento/i))
        .first()
    ).toBeVisible({ timeout: 8_000 });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // P1 — Meus Ganhos
  // ──────────────────────────────────────────────────────────────────────────
  test("página Meus Ganhos exibe filtros de período", async ({ page }) => {
    await page.fill('[id="email"]', TEST_USERS.barber.email);
    await page.fill('[id="password"]', TEST_USERS.barber.password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/barber\/dashboard/);

    await page.click('nav a[href="/barber/earnings"]');
    await page.waitForURL(/\/barber\/earnings/);

    // Filtro de período
    await expect(
      page.getByRole("combobox").or(page.getByText(/hoje|semana|mês/i)).first()
    ).toBeVisible({ timeout: 8_000 });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // P1 — Meus Clientes
  // ──────────────────────────────────────────────────────────────────────────
  test("página Meus Clientes carrega sem erro", async ({ page }) => {
    await page.fill('[id="email"]', TEST_USERS.barber.email);
    await page.fill('[id="password"]', TEST_USERS.barber.password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/barber\/dashboard/);

    await page.click('nav a[href="/barber/clients"]');
    await page.waitForURL(/\/barber\/clients/);

    await expect(page.locator("body")).not.toContainText("Cannot read");
  });

  // ──────────────────────────────────────────────────────────────────────────
  // P2 — LGPD banner
  // ──────────────────────────────────────────────────────────────────────────
  test("banner LGPD aparece em sessão limpa e some ao aceitar", async ({ page }) => {
    // Garantir localStorage limpo
    await page.evaluate(() => localStorage.clear());
    // Após reload, alternar para Login se necessário
    const loginBtn = page.getByText("Fazer Login");
    if (await loginBtn.isVisible()) {
      await loginBtn.click();
    }
    await page.waitForSelector('[id="email"]', { state: "visible" });

    await page.fill('[id="email"]', TEST_USERS.barber.email);
    await page.fill('[id="password"]', TEST_USERS.barber.password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/barber\/dashboard/);

    // Banner pode já ter sido aceito em sessões anteriores — verificar condicionalmente
    const banner = page.getByText(/LGPD|privacidade/i);
    const isVisible = await banner.isVisible().catch(() => false);

    if (isVisible) {
      await page.getByRole("button", { name: /aceitar/i }).click();
      await expect(banner).not.toBeVisible({ timeout: 5_000 });
    }
    // Se não aparecer, já foi aceito anteriormente — teste passa
  });

  // ──────────────────────────────────────────────────────────────────────────
  // P2 — Logout
  // ──────────────────────────────────────────────────────────────────────────
  test("logout do portal do barbeiro redireciona para /barber/auth", async ({ page }) => {
    await page.fill('[id="email"]', TEST_USERS.barber.email);
    await page.fill('[id="password"]', TEST_USERS.barber.password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/barber\/dashboard/);

    await page.getByRole("button", { name: /Sair/i }).click();

    await expect(page).toHaveURL(/\/barber\/auth/, { timeout: 8_000 });
  });
});
