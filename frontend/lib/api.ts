import axios, { AxiosError, type InternalAxiosRequestConfig } from "axios";
import { clearAuthStorage, getAuthToken } from "@/lib/auth";
import type { ApiError } from "@/types/api";

const API_URL = process.env.NEXT_PUBLIC_API_BASE_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";
let hasDispatchedUnauthorized = false;

export const api = axios.create({
  baseURL: API_URL,
  timeout: 15000,
  headers: {
    "Content-Type": "application/json",
    "ngrok-skip-browser-warning": "true",
  },
});

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = getAuthToken();

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

api.interceptors.response.use(
  (response) => {
    hasDispatchedUnauthorized = false;
    return response;
  },
  (error: AxiosError<ApiError>) => {
    const status = error.response?.status;

    if (status === 401 && typeof window !== "undefined") {
      clearAuthStorage();
      if (!hasDispatchedUnauthorized && !window.location.pathname.startsWith("/login")) {
        hasDispatchedUnauthorized = true;
        window.dispatchEvent(new Event("homex-pos:unauthorized"));
      }
    }

    if (status === 403 && error.response?.data?.message === "Demo mode restriction" && typeof window !== "undefined") {
      window.dispatchEvent(new Event("homex-pos:demo-restriction"));
    }

    return Promise.reject(error);
  }
);

export function getApiErrorMessage(error: unknown) {
  if (axios.isAxiosError<ApiError>(error)) {
    if (error.response?.data?.message) {
      return error.response.data.message;
    }

    if (error.code === "ECONNABORTED") {
      return "The request timed out. Please try again.";
    }

    if (!error.response) {
      return "Could not connect to the backend. Please check the API server.";
    }
  }

  return "Something went wrong. Please try again.";
}
