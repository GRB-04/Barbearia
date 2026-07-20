export type ManagerPermissions = {
  can_manage_payments: boolean;
  can_edit_chairs: boolean;
  can_view_financials: boolean;
  can_invite_barbers: boolean;
};

export const DEFAULT_MANAGER_PERMISSIONS: ManagerPermissions = {
  can_manage_payments: false,
  can_edit_chairs: false,
  can_view_financials: false,
  can_invite_barbers: false,
};

export const MANAGER_PERMISSION_LABELS: Record<keyof ManagerPermissions, string> = {
  can_manage_payments: "Gerenciar pagamentos dos barbeiros",
  can_edit_chairs: "Editar cadeiras do ponto",
  can_view_financials: "Ver relatório financeiro do ponto",
  can_invite_barbers: "Convidar barbeiros",
};

export function parseManagerPermissions(raw: unknown): ManagerPermissions {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ...DEFAULT_MANAGER_PERMISSIONS };
  }

  const source = raw as Record<string, unknown>;
  const result = { ...DEFAULT_MANAGER_PERMISSIONS };

  (Object.keys(DEFAULT_MANAGER_PERMISSIONS) as (keyof ManagerPermissions)[]).forEach(
    (key) => {
      result[key] = source[key] === true;
    }
  );

  return result;
}
