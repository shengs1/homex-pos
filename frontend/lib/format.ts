export function formatCurrency(value: number | string | null | undefined) {
  const numberValue = Number(value || 0);

  return `${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(numberValue)} ₫`;
}

export function formatNumber(value: number | string | null | undefined) {
  return new Intl.NumberFormat("vi-VN").format(Number(value || 0));
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

export function formatDateTime(value: string | Date | null | undefined) {
  if (!value) return "-";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "-";

  return `${pad(date.getHours())}:${pad(date.getMinutes())} ${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
}

export function formatDate(value: string | Date | null | undefined) {
  if (!value) return "-";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "-";

  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
}

export function toInputDate(value: string | Date | null | undefined) {
  if (!value) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "";

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}
