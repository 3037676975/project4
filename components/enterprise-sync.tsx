"use client";

import { useEffect } from "react";

const SIGNATURE_KEY = "knowflow_plan_signature";
const ACTIVE_NAV_KEY = "knowflow_enterprise_active_nav";

function planSignature(data: unknown) {
  const plans = (data as { plans?: Array<{ id?: string; code?: string; name?: string; monthlyPriceCents?: number }> })?.plans;
  if (!Array.isArray(plans)) return "";
  return plans.map((item) => `${item.id || item.code}:${item.name}:${Number(item.monthlyPriceCents || 0)}`).sort().join("|");
}

export default function EnterpriseSync() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    let stopped = false;
    let timer = 0;

    const rememberNav = (event: MouseEvent) => {
      const button = (event.target as HTMLElement | null)?.closest("button.nav-item") as HTMLButtonElement | null;
      if (!button) return;
      const label = button.textContent?.replace(/^\s*\d+\s*/, "").trim();
      if (label) sessionStorage.setItem(ACTIVE_NAV_KEY, label);
    };

    const restoreNav = () => {
      const label = sessionStorage.getItem(ACTIVE_NAV_KEY);
      if (!label) return;
      const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>("button.nav-item"));
      const match = buttons.find((button) => button.textContent?.includes(label));
      if (match && !match.classList.contains("active")) match.click();
    };

    const checkPlans = async () => {
      if (stopped || !document.querySelector(".enterprise-sidebar")) return;
      try {
        const tenantId = localStorage.getItem("knowflow_tenant_id") || "";
        const response = await fetch("/api/billing", {
          cache: "no-store",
          headers: tenantId ? { "x-tenant-id": tenantId } : undefined,
        });
        if (!response.ok) return;
        const signature = planSignature(await response.json());
        if (!signature) return;
        const previous = localStorage.getItem(SIGNATURE_KEY);
        localStorage.setItem(SIGNATURE_KEY, signature);
        if (previous && previous !== signature) window.location.reload();
      } catch {
        // Keep the workspace usable even when a background refresh fails.
      }
    };

    document.addEventListener("click", rememberNav, true);
    window.setTimeout(restoreNav, 120);
    void checkPlans();
    const onFocus = () => void checkPlans();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    timer = window.setInterval(() => void checkPlans(), 60_000);

    return () => {
      stopped = true;
      document.removeEventListener("click", rememberNav, true);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
      window.clearInterval(timer);
    };
  }, []);

  return null;
}
