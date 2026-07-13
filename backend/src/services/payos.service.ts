import "dotenv/config";
import { PayOS } from "@payos/node";
import { AppError } from "../utils/AppError";

const requiredPayOSEnv = [
  "PAYOS_CLIENT_ID",
  "PAYOS_API_KEY",
  "PAYOS_CHECKSUM_KEY",
] as const;

export function assertPayOSConfigured() {
  const missingKeys = requiredPayOSEnv.filter((key) => !process.env[key]);

  if (missingKeys.length > 0) {
    throw new AppError("Chưa cấu hình payOS trên backend.", 400);
  }
}

export function getPayOSUrls() {
  const returnUrl = process.env.PAYOS_RETURN_URL;
  const cancelUrl = process.env.PAYOS_CANCEL_URL;

  if (!returnUrl || !cancelUrl) {
    throw new AppError("Chưa cấu hình return/cancel URL cho payOS trên backend.", 400);
  }

  return { returnUrl, cancelUrl };
}

export const payOS = new PayOS({
  clientId: process.env.PAYOS_CLIENT_ID || "",
  apiKey: process.env.PAYOS_API_KEY || "",
  checksumKey: process.env.PAYOS_CHECKSUM_KEY || "",
  logLevel: "warn",
});

