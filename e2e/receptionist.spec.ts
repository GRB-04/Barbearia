import { test, expect } from "../playwright-fixture";
import { TEST_USERS, BASE_URL } from "./helpers";

// =============================================================================
// Fluxo do Recepcionista — Portal do Barbeiro (/barber/*) em modo Recepção
// =============================================================================

test.describe("Portal da Recepcionista", () => {
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
  // P0 — Login e Menus Restritos
  // ──────────────────────────────────────────────────────────────────────────
  test("login como recepcionista redireciona e exibe menu específico", async ({ page }) => {
    await page.fill('[id="email"]', TEST_USERS.receptionist.email);
    await page.fill('[id="password"]', TEST_USERS.receptionist.password);
    await page.click('button[type="submit"]');

    // Deve redirecionar para o dashboard
    await expect(page).toHaveURL(/\/barber\/dashboard/, { timeout: 10_000 });

    // Rótulos do menu da recepção
    const nav = page.locator("nav");
    await expect(nav.getByText(/Dashboard/i)).toBeVisible();
    await expect(nav.getByText(/Clientes da Casa/i)).toBeVisible();
    await expect(nav.getByText(/Check-in/i)).toBeVisible();

    // Menus restritos de barbeiro não devem estar visíveis
    await expect(nav.getByText(/Explorar cadeiras/i)).not.toBeVisible();
    await expect(nav.getByText(/Meus contratos/i)).not.toBeVisible();
    await expect(nav.getByText(/Minhas reservas/i)).not.toBeVisible();
    await expect(nav.getByText(/Meus ganhos/i)).not.toBeVisible();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // P1 — Gestão de Clientes da Organização
  // ──────────────────────────────────────────────────────────────────────────
  test("recepcionista pode cadastrar novo cliente e visualizá-lo", async ({ page }) => {
    // Login
    await page.fill('[id="email"]', TEST_USERS.receptionist.email);
    await page.fill('[id="password"]', TEST_USERS.receptionist.password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/barber\/dashboard/);

    // Navegar para Clientes
    await page.goto(`${BASE_URL}/barber/clients`);
    await page.waitForSelector('button:has-text("Adicionar Cliente")');

    // Clicar em Adicionar Cliente
    await page.click('button:has-text("Adicionar Cliente")');

    const clientEmail = `cliente.recep.${Date.now()}@gmail.com`;
    const clientName = `Cliente Recep E2E ${Date.now()}`;

    // Preencher formulário
    await page.fill('[placeholder="Nome Completo"]', clientName);
    await page.fill('[placeholder="Telefone (opcional)"]', "11999998888");
    await page.fill('[placeholder="E-mail (opcional)"]', clientEmail);
    await page.fill('[placeholder="Observações (alergias, preferências, etc.)"]', "Cadastrado via teste E2E");

    // Salvar
    await page.click('button:has-text("Salvar")');

    // Fechar diálogo (se houver toast ou dialog fechar automático)
    await expect(page.getByText("Cliente salvo com sucesso!")).toBeVisible({ timeout: 5000 });

    // Verificar se o cliente aparece na lista de clientes
    await page.fill('[placeholder="Buscar cliente por nome, e-mail ou telefone..."]', clientName);
    await expect(page.getByText(clientName)).toBeVisible();
  });
});
