// =============================================================================
// Helpers e credenciais compartilhadas entre todos os testes E2E
// =============================================================================

export const TEST_USERS = {
  owner: {
    email: "dono.teste.e2e@gmail.com",
    password: "Teste@2026!",
  },
  barber: {
    email: "barbeiro@gmail.com",
    password: "123456",
  },
  barber2: {
    email: "barbeiro2@gmail.com",
    password: "123456",
  },
  manager: {
    email: "gerente@gmail.com",
    password: "123456",
  },
  receptionist: {
    email: "recepcionista@gmail.com",
    password: "123456",
  },
} as const;

export const TEST_IDS = {
  org: "11111111-0000-0000-0000-000000000001",
  location: "22222222-0000-0000-0000-000000000001",
  chairA1: "33333333-0000-0000-0000-000000000001",
  chairA2: "33333333-0000-0000-0000-000000000002",
  barberProfile: "44444444-0000-0000-0000-000000000001",
} as const;

export const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:8080";
