import type { WidgetSettings } from "./WidgetSettings";
import { defaultWidgetSettings } from "./WidgetSettings";

/**
 * Widget settings repository abstraction.
 *
 * Phase 2.10.3:
 * - 当前使用内存 adapter 保证旧部署稳定
 * - 后续替换数据库时只修改 repository 实现
 * - 查询入口预留 tenantId
 */

const settingsByTenant = new Map<string, WidgetSettings>();

export function getWidgetSettingsByTenant(
  tenantId = "default",
): WidgetSettings {
  return settingsByTenant.get(tenantId) ?? defaultWidgetSettings;
}

export function saveWidgetSettingsByTenant(
  tenantId: string,
  settings: Partial<WidgetSettings>,
): WidgetSettings {
  const current = getWidgetSettingsByTenant(tenantId);

  const updated = {
    ...current,
    ...settings,
  };

  settingsByTenant.set(tenantId, updated);

  return updated;
}
