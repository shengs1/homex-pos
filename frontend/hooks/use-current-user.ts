"use client";

import { useEffect, useState } from "react";
import { getAuthUser } from "@/lib/auth";
import type { AuthUser } from "@/types/auth";

export function useCurrentUser() {
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    setUser(getAuthUser());
  }, []);

  return user;
}
