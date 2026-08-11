"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function ReturnOrdersPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/orders");
  }, [router]);

  return null;
}
