import { Suspense } from "react";
import MobileScanClient from "./mobile-scan-client";

export default function MobileScanPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-slate-900 text-white font-medium">Đang tải máy quét...</div>}>
      <MobileScanClient />
    </Suspense>
  );
}
