import { api } from "@/lib/api";
import { type Promotion, type PromotionDiscountType, type PromotionStatus } from "@/types/domain";

type PaginatedResponse<T> = {
  items: T[];
  pagination: {
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
  };
};

export { type Promotion, type PromotionDiscountType, type PromotionStatus };

export type PromotionListParams = {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
};

export type PromotionPayload = {
  code: string;
  name?: string | null;
  discountType: PromotionDiscountType;
  discountValue: number;
  maxDiscountAmount?: number | null;
  minOrderAmount: number;
  usageLimit?: number | null;
  customerLimit?: number | null;
  eligibleTiers: string;
  startDate?: string;
  expiredAt: string;
  status?: PromotionStatus;
};

export type PromotionValidateBody = {
  code: string;
  subtotal: number;
  customerTier?: string | null;
  customerId?: number | null;
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
