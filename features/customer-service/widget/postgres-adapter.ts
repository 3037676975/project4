import type { WidgetSettings, WidgetSettingsAdapter } from './database-adapter'

/**
 * PostgreSQL adapter placeholder.
 *
 * Phase 2.13:
 * This keeps storage logic isolated from the service layer.
 * The next migration step will replace the temporary implementation
 * with Drizzle ORM queries.
 */
export class PostgresWidgetAdapter implements WidgetSettingsAdapter {
  async get(tenantId: string): Promise<WidgetSettings | null> {
    void tenantId
    return null
  }

  async save(settings: WidgetSettings): Promise<WidgetSettings> {
    return settings
  }
}
