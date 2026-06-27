import type { AuthUser, UserRole } from "@/types/auth";

const TOKEN_KEY = "homex_pos_token";
const USER_KEY = "homex_pos_user";

function isBrowser() {
  return typeof window !== "undefined";
}

function emitAuthChanged() {
  if (!isBrowser()) return;
  window.dispatchEvent(new Event("homex-pos:auth-changed"));
}

export function saveAuth(token: string, user: AuthUser) {
  if (!isBrowser()) return;

  try {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    emitAuthChanged();
  } catch (error) {
    console.error("Failed to save auth data", error);
  }
}

export function getAuthToken() {
  if (!isBrowser()) return null;

  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function getAuthUser(): AuthUser | null {
  if (!isBrowser()) return null;

  let rawUser: string | null = null;

  try {
    rawUser = localStorage.getItem(USER_KEY);
  } catch {
    return null;
  }

  if (!rawUser) return null;

  try {
    return JSON.parse(rawUser) as AuthUser;
  } catch {
    clearAuthStorage();
    return null;
  }
}

export function clearAuthStorage() {
  if (!isBrowser()) return;

  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  } catch (error) {
    console.error("Failed to clear auth data", error);
  } finally {
    emitAuthChanged();
  }
}

export function isAuthenticated() {
  return Boolean(getAuthToken() && getAuthUser());
}

export function isRoleAllowed(userRole: UserRole, allowedRoles: UserRole[]) {
  return allowedRoles.includes(userRole);
}

export function getDefaultPathByRole(role: UserRole) {
  if (role === "ADMIN") return "/dashboard";

  return "/dashboard";
}
