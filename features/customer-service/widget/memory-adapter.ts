import type { WidgetSettings } from './types'
import type { WidgetSettingsDatabaseAdapter } from './database-adapter'

const storage = new Map<string, WidgetSettings>()

export class MemoryWidgetSettingsAdapter implements WidgetSettingsDatabaseAdapter {
  async get(tenantId: string): Promise<WidgetSettings | null> {
    return storage.get(tenantId) ?? null
  }

  async save(tenantId: string, settings: WidgetSettings): Promise<WidgetSettings> {
    storage.set(tenantId, settings)
    return settings
  }
}
