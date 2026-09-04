"use client";

import { usePathname } from "next/navigation";
import PublicAiWidget from "./public-ai-widget";

export default function GlobalWidgetGate() {
  const pathname = usePathname();
  if (pathname?.startsWith("/chat/")) return null;
  return <PublicAiWidget />;
}
