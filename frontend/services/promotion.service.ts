import { api } from "@/lib/api";
import type { PaginatedResponse } from "@/types/api";

export type PromotionDiscountType = "AMOUNT" | "PERCENT";
export type PromotionStatus = "ACTIVE" | "EXPIRED" | "USED_UP" | "INACTIVE";

export type Promotion = {
  id: number;
  code: string;
  discountType: PromotionDiscountType;
  discountValue: number;
  minOrderAmount: number;
  usageLimit?: number | null;
  usedCount?: number | null;
  expiredAt: string;
  status: PromotionStatus;
  createdAt: string;
  updatedAt: string;
};

export type PromotionListParams = {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
};

export type PromotionPayload = {
  code: string;
  discountType: PromotionDiscountType;
  discountValue: number;
  minOrderAmount: number;
  usageLimit?: number | null;
  expiredAt: string;
  status?: PromotionStatus;
};

export type PromotionValidateBody = {
  code: string;
  subtotal: number;
};

export type PromotionValidateResult = {
  code: string;
  discountAmount: number;
  promotion: Promotion;
};

function unwrapData<T>(response: { data: { data: T } }) {
  return response.data.data;
}

export const promotionService = {
  async list(params: PromotionListParams = {}) {
    const response = await api.get<{ data: PaginatedResponse<Promotion> }>("/promotions", { params });
    return unwrapData(response);
  },

  async create(payload: PromotionPayload) {
    const response = await api.post<{ data: Promotion }>("/promotions", payload);
    return unwrapData(response);
  },

  async update(id: number, payload: PromotionPayload) {
    const response = await api.put<{ data: Promotion }>(`/promotions/${id}`, payload);
    return unwrapData(response);
  },

  async remove(id: number) {
    const response = await api.delete<{ data: Promotion }>(`/promotions/${id}`);
    return unwrapData(response);
  },

  async validate(payload: PromotionValidateBody) {
    const response = await api.post<{ data: PromotionValidateResult }>("/promotions/validate", payload);
    return unwrapData(response);
  },
};
