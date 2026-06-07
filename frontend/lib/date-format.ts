export function padDatePart(value: number) {
  return String(value).padStart(2, "0");
}

export function isValidDate(value: Date) {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

export function toSafeDate(value: string | Date | null | undefined) {
  if (!value) return null;

  const date = value instanceof Date ? value : new Date(value);
  if (!isValidDate(date)) return null;

  return date;
}

/**
 * Format ngày theo chuẩn Việt Nam tuyệt đối: dd/mm/yyyy.
 * Không dùng toLocaleDateString để tránh khác biệt môi trường trình duyệt/máy chủ.
 */
export function formatDateVN(value: string | Date | null | undefined) {
  const date = toSafeDate(value);
  if (!date) return "-";

  const day = padDatePart(date.getDate());
  const month = padDatePart(date.getMonth() + 1);
  const year = date.getFullYear();

  return `${day}/${month}/${year}`;
}

export function formatTimeVN(value: string | Date | null | undefined) {
  const date = toSafeDate(value);
  if (!date) return "-";

  const hour = padDatePart(date.getHours());
  const minute = padDatePart(date.getMinutes());

  return `${hour}:${minute}`;
}

export function formatDateTimeVN(value: string | Date | null | undefined) {
  const date = toSafeDate(value);
  if (!date) return "-";

  return `${formatTimeVN(date)} ${formatDateVN(date)}`;
}

/**
 * Dùng cho cột ngày giờ trong bảng: giờ ở dòng trên, ngày dd/mm/yyyy ở dòng dưới.
 */
export function formatDateTimePartsVN(value: string | Date | null | undefined) {
  const date = toSafeDate(value);

  if (!date) {
    return {
      time: "-",
      date: "-",
    };
  }

  return {
    time: formatTimeVN(date),
    date: formatDateVN(date),
  };
}

export function isoDateToDisplayDate(value: string | null | undefined) {
  if (!value) return "";

  const normalizedValue = value.slice(0, 10);
  const matched = normalizedValue.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!matched) return value;

  const [, year, month, day] = matched;
  return `${day}/${month}/${year}`;
}

export function displayDateToIsoDate(value: string) {
  const trimmedValue = value.trim();
  if (!trimmedValue) return "";

  const matched = trimmedValue.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!matched) return null;

  const day = Number(matched[1]);
  const month = Number(matched[2]);
  const year = Number(matched[3]);

  const date = new Date(year, month - 1, day);
  const isValid =
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day;

  if (!isValid) return null;

  return `${year}-${padDatePart(month)}-${padDatePart(day)}`;
}


/**
 * Dùng cho label trục X/tooltip biểu đồ Recharts.
 * Nhận chuỗi ngày từ API dạng yyyy-mm-dd hoặc ISO date và hiển thị dd/mm/yyyy.
 */
export function formatChartDateVN(value: string | Date | number | null | undefined) {
  if (value === null || value === undefined || value === "") return "-";

  if (typeof value === "number") {
    return formatDateVN(new Date(value));
  }

  return formatDateVN(value);
}
