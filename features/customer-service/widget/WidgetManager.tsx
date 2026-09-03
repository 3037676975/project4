"use client";

import { useEffect, useState } from "react";
import { WidgetPanel } from "./WidgetPanel";
import { WidgetButton } from "./WidgetButton";
import { useWidgetState } from "./WidgetHooks";
import { defaultWidgetSettings, type WidgetSettings } from "./WidgetSettings";

export function WidgetManager() {
  const { open, toggle } = useWidgetState();
  const [settings, setSettings] = useState<WidgetSettings>(defaultWidgetSettings);

  useEffect(() => {
    let active = true;

    fetch("/api/admin/widget-settings")
      .then((res) => res.json())
      .then((data) => {
        if (active && data) {
          setSettings({ ...defaultWidgetSettings, ...data });
        }
      })
      .catch(() => {
        // Keep local defaults when settings service is unavailable.
      });

    return () => {
      active = false;
    };
  }, []);

  if (!settings.enabled) {
    return null;
  }

  return (
    <>
      {open && <WidgetPanel settings={settings} />}
      <WidgetButton onClick={toggle} settings={settings} />
    </>
  );
}
