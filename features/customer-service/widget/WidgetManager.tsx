"use client";

import { WidgetPanel } from "./WidgetPanel";
import { WidgetButton } from "./WidgetButton";
import { useWidgetState } from "./WidgetHooks";

export function WidgetManager() {
  const { open, toggle } = useWidgetState();

  return (
    <>
      {open && <WidgetPanel />}
      <WidgetButton onClick={toggle} />
    </>
  );
}
