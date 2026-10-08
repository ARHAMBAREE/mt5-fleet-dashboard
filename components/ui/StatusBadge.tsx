"use client";

import type { EaStatusValue } from "@/shared/types";

export default function StatusBadge({ status, label }: { status: EaStatusValue | string; label?: string }) {
  const cls =
    status === "ONLINE" ? "online" :
    status === "WARNING" ? "warning" :
    status === "OFFLINE" ? "offline" : "neutral";
  return <span className={`badge ${cls}`}>{label ?? status}</span>;
}
