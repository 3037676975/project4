"use client";

import { useState } from "react";
import { defaultWidgetState } from "./WidgetState";

export function useCustomerWidget() {
  const [state, setState] = useState(defaultWidgetState);

  return {
    state,
    open: () => setState((v) => ({ ...v, open: true })),
    close: () => setState((v) => ({ ...v, open: false })),
    toggle: () => setState((v) => ({ ...v, open: !v.open })),
  };
}

/**
 * Lightweight widget state hook used by WidgetManager.
 * Keeps the auto-open behavior isolated from the full customer widget hook.
 */
export function useWidgetState() {
  const [open, setOpen] = useState(true);

  return {
    open,
    setOpen,
    toggle: () => setOpen((value) => !value),
  };
}
