import { describe, it, expect } from "vitest";
import {
  parseManagerPermissions,
  DEFAULT_MANAGER_PERMISSIONS,
} from "./managerPermissions";

describe("parseManagerPermissions", () => {
  it("returns all-false defaults for null/undefined/non-object", () => {
    expect(parseManagerPermissions(null)).toEqual(DEFAULT_MANAGER_PERMISSIONS);
    expect(parseManagerPermissions(undefined)).toEqual(DEFAULT_MANAGER_PERMISSIONS);
    expect(parseManagerPermissions("garbage")).toEqual(DEFAULT_MANAGER_PERMISSIONS);
    expect(parseManagerPermissions(42)).toEqual(DEFAULT_MANAGER_PERMISSIONS);
  });

  it("reads known keys and coerces to boolean", () => {
    const parsed = parseManagerPermissions({
      can_manage_payments: true,
      can_edit_chairs: "true", // valor não-boolean vira false (só boolean true conta)
    });
    expect(parsed.can_manage_payments).toBe(true);
    expect(parsed.can_edit_chairs).toBe(false);
    expect(parsed.can_view_financials).toBe(false);
    expect(parsed.can_invite_barbers).toBe(false);
  });

  it("ignores unknown keys", () => {
    const parsed = parseManagerPermissions({ hacker_key: true });
    expect(parsed).toEqual(DEFAULT_MANAGER_PERMISSIONS);
  });
});
