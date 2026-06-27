export function formatCurrency(value: number | string | null | undefined) {
  const numberValue = compactMoneyDisplayValue(value);

  return `${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(numberValue)} VND`;
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
export function getDigits(value: string | number | null | undefined) {
  return String(value ?? "").replace(/[^0-9]/g, "");
}

export function parseMoneyInput(value: string | number | null | undefined) {
  const digits = getDigits(value);
  if (!digits) return 0;

  const numberValue = Number(digits);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

export function formatMoneyInputValue(value: string | number | null | undefined) {
  const numberValue = parseMoneyInput(value);
  if (numberValue <= 0) return "";

  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(numberValue);
}

export function compactMoneyDisplayValue(value: string | number | null | undefined) {
  const numberValue = Number(value || 0);
  if (!Number.isFinite(numberValue) || numberValue <= 0) return 0;

  return numberValue >= 10000 ? Math.round(numberValue / 1000) : numberValue;
}

export function compactProductPrice(value: string | number | null | undefined) {
  const numberValue = typeof value === "number" ? value : parseMoneyInput(value);
  if (!Number.isFinite(numberValue) || numberValue <= 0) return 0;

  return compactMoneyDisplayValue(numberValue);
}