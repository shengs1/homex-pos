"use client";

import { useEffect, useState } from "react";
import { Wifi, WifiOff } from "lucide-react";
import { useLanguage } from "@/contexts/language-context";

export function NetworkStatusBar() {
  const { t } = useLanguage();
  const [isOnline, setIsOnline] = useState(true);
  const [demoMessage, setDemoMessage] = useState("");

  useEffect(() => {
    function updateOnlineStatus() {
      setIsOnline(window.navigator.onLine);
    }

    function handleDemoRestriction() {
      setDemoMessage(t("demo.restriction"));
      window.setTimeout(() => setDemoMessage(""), 4500);
    }

    updateOnlineStatus();
    window.addEventListener("online", updateOnlineStatus);
    window.addEventListener("offline", updateOnlineStatus);
    window.addEventListener("homex-pos:demo-restriction", handleDemoRestriction);

    return () => {
      window.removeEventListener("online", updateOnlineStatus);
      window.removeEventListener("offline", updateOnlineStatus);
      window.removeEventListener("homex-pos:demo-restriction", handleDemoRestriction);
    };
  }, [t]);

  if (isOnline && !demoMessage) return null;

  return (
    <div className="border-b bg-amber-50 px-4 py-2 text-sm text-amber-900 md:px-6">
      <div className="flex items-center gap-2">
        {isOnline ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
        <span>{demoMessage || t("network.offlineWarning")}</span>
      </div>
    </div>
  );
}
