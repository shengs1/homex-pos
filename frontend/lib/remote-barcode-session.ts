const REMOTE_BARCODE_SESSION_KEY = "homex_remote_barcode_session_id";

export function createRemoteBarcodeSessionId() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

export function isValidRemoteBarcodeSessionId(value: string | null | undefined) {
  return Boolean(value && /^[A-Z0-9]{4,12}$/.test(value));
}

export function getOrCreateRemoteBarcodeSessionId() {
  if (typeof window === "undefined") return "";

  const storedSessionId = window.localStorage.getItem(REMOTE_BARCODE_SESSION_KEY)?.toUpperCase() || "";
  if (isValidRemoteBarcodeSessionId(storedSessionId)) return storedSessionId;

  const sessionId = createRemoteBarcodeSessionId();
  window.localStorage.setItem(REMOTE_BARCODE_SESSION_KEY, sessionId);
  return sessionId;
}

export function resetRemoteBarcodeSessionId() {
  if (typeof window === "undefined") return "";

  const sessionId = createRemoteBarcodeSessionId();
  window.localStorage.setItem(REMOTE_BARCODE_SESSION_KEY, sessionId);
  return sessionId;
}

export function buildMobileScanUrl(sessionId: string) {
  if (!sessionId) return "";

  let baseUrl = process.env.NEXT_PUBLIC_MOBILE_SCAN_BASE_URL || (typeof window !== "undefined" ? window.location.origin : "");
  baseUrl = baseUrl.replace(/\/+$/, "");
  return `${baseUrl}/mobile-scan?sid=${sessionId}`;
}

const REMOTE_BARCODE_ACTIVE_TARGET_KEY = "homex_remote_barcode_active_target";
const REMOTE_BARCODE_ACTIVE_TARGET_TTL_MS = 5 * 60 * 1000;

export type RemoteBarcodeTarget = "pos" | "products";

type RemoteBarcodeTargetPayload = {
  target: RemoteBarcodeTarget;
  updatedAt: number;
};

export function setActiveRemoteBarcodeTarget(target: RemoteBarcodeTarget) {
  if (typeof window === "undefined") return;

  const payload: RemoteBarcodeTargetPayload = {
    target,
    updatedAt: Date.now(),
  };
  window.localStorage.setItem(REMOTE_BARCODE_ACTIVE_TARGET_KEY, JSON.stringify(payload));
}

export function getActiveRemoteBarcodeTarget(): RemoteBarcodeTarget | null {
  if (typeof window === "undefined") return null;

  const rawValue = window.localStorage.getItem(REMOTE_BARCODE_ACTIVE_TARGET_KEY);
  if (!rawValue) return null;

  try {
    const payload = JSON.parse(rawValue) as Partial<RemoteBarcodeTargetPayload>;
    const isValidTarget = payload.target === "pos" || payload.target === "products";
    const isFresh = typeof payload.updatedAt === "number" && Date.now() - payload.updatedAt <= REMOTE_BARCODE_ACTIVE_TARGET_TTL_MS;

    if (isValidTarget && isFresh) return payload.target!;
  } catch {
    // Clear malformed values below.
  }

  window.localStorage.removeItem(REMOTE_BARCODE_ACTIVE_TARGET_KEY);
  return null;
}

export function clearActiveRemoteBarcodeTarget(target?: RemoteBarcodeTarget) {
  if (typeof window === "undefined") return;

  if (!target || getActiveRemoteBarcodeTarget() === target) {
    window.localStorage.removeItem(REMOTE_BARCODE_ACTIVE_TARGET_KEY);
  }
}
