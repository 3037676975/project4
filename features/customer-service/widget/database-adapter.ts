import type { WidgetSettings } from './types'

/**
 * Database adapter contract for Widget settings.
 *
 * The service layer only depends on this contract so the storage
 * implementation can move from memory to Drizzle/PostgreSQL safely.
 */
export interface WidgetSettingsDatabaseAdapter {
  get(tenantId: string): Promise<WidgetSettings | null>
  save(tenantId: string, settings: WidgetSettings): Promise<WidgetSettings>
}
