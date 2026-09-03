import type { WidgetSettings } from "./WidgetSettings";

/**
 * Widget settings persistence contract.
 *
 * Phase 2.11:
 * Repository implementations can switch between memory,
 * database, or remote configuration storage.
 */
export interface WidgetSettingsAdapter {
  get(tenantId: string): WidgetSettings | undefined;
  save(tenantId: string, settings: WidgetSettings): WidgetSettings;
}
