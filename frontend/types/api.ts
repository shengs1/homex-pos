export type ApiSuccess<T> = {
  success: true;
  message: string;
  data: T;
};

export type ApiError = {
  success: false;
  message: string;
};

export type ApiResponse<T> = ApiSuccess<T>;

export type Pagination = {
  page: number;
  limit: number;
  totalItems: number;
  totalPages: number;
};

export type PaginatedData<T> = {
  items: T[];
  pagination: Pagination;
  summary?: any;
};
