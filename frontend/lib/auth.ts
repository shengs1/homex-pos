import type { AuthUser, UserRole } from "@/types/auth";

const TOKEN_KEY = "homex_pos_token";
const USER_KEY = "homex_pos_user";

function isBrowser() {
  return typeof window !== "undefined";
}

export function saveAuth(token: string, user: AuthUser) {
  if (!isBrowser()) return;

  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function getAuthToken() {
  if (!isBrowser()) return null;

  return localStorage.getItem(TOKEN_KEY);
}

export function getAuthUser(): AuthUser | null {
  if (!isBrowser()) return null;

  const rawUser = localStorage.getItem(USER_KEY);

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

  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
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
