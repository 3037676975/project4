import type { WidgetSettings } from "./WidgetSettings";

/**
 * Database adapter contract for Widget settings.
 *
 * Phase 2.12:
 * - Repository does not know database implementation.
 * - PostgreSQL / Prisma adapter can be plugged in later.
 */
export interface WidgetSettingsDatabaseAdapter {
  findByTenant(tenantId: string): Promise<WidgetSettings | null>;

  saveByTenant(
    tenantId: string,
    settings: WidgetSettings,
  ): Promise<WidgetSettings>;
}
