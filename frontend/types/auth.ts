export type UserRole = "ADMIN" | "CASHIER";

export type AuthUser = {
  id: number;
  employeeCode?: string | null;
  fullName: string;
  email: string;
  role: UserRole;
};

export type LoginRequest = {
  email: string;
  password: string;
};

export type LoginResponseData = {
  token: string;
  user: AuthUser;
};
