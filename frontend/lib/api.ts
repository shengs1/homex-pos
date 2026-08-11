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

function getActiveUiLanguage(): "vi" | "en" {
  if (typeof document !== "undefined" && document.documentElement.lang === "en") return "en";
  if (typeof window !== "undefined" && window.localStorage.getItem("homex-pos-language") === "en") return "en";
  return "vi";
}

function genericApiError(language: "vi" | "en") {
  return language === "en"
    ? "The request could not be completed. Please check the information and try again."
    : "Không thể hoàn tất yêu cầu. Vui lòng kiểm tra thông tin và thử lại.";
}

export function getApiErrorMessage(error: unknown) {
  const language = getActiveUiLanguage();

  if (axios.isAxiosError<ApiError>(error)) {
    const serverMessage = error.response?.data?.message?.trim();
    if (serverMessage) {
      const hasVietnameseCharacters = /[À-ỹ]/.test(serverMessage);
      const looksLikeEnglishSentence = /^[\x00-\x7F]+$/.test(serverMessage) && /[A-Za-z]{3}/.test(serverMessage);

      if (language === "en" && hasVietnameseCharacters) return genericApiError(language);
      if (language === "vi" && looksLikeEnglishSentence) return genericApiError(language);
      return serverMessage;
    }

    if (error.code === "ECONNABORTED") {
      return language === "en"
        ? "The request timed out. Please try again."
        : "Yêu cầu đã quá thời gian chờ. Vui lòng thử lại.";
    }

    if (!error.response) {
      return language === "en"
        ? "Could not connect to the backend. Please check the API server."
        : "Không thể kết nối đến máy chủ. Vui lòng kiểm tra dịch vụ backend.";
    }
  }

  return language === "en"
    ? "Something went wrong. Please try again."
    : "Đã xảy ra lỗi. Vui lòng thử lại.";
}