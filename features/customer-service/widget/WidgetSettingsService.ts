import type { WidgetSettings } from "./WidgetSettings";
import {
  getWidgetSettingsByTenant,
  saveWidgetSettingsByTenant,
} from "./WidgetSettingsRepository";

/**
 * Widget business service.
 *
 * UI 和 API 不直接访问 repository。
 */
export function loadTenantWidgetSettings(
  tenantId?: string,
): WidgetSettings {
  return getWidgetSettingsByTenant(tenantId);
}

export function updateTenantWidgetSettings(
  tenantId: string,
  settings: Partial<WidgetSettings>,
): WidgetSettings {
  return saveWidgetSettingsByTenant(tenantId, settings);
}
