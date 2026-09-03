import type { WidgetSettings } from './types';

export interface WidgetRepository {
  findByTenantId(tenantId: string): Promise<WidgetSettings | null>;
  save(settings: WidgetSettings): Promise<WidgetSettings>;
}

/**
 * Temporary adapter contract.
 * The next migration step will connect this interface to Drizzle/PostgreSQL.
 */
export class MemoryWidgetRepository implements WidgetRepository {
  private data = new Map<string, WidgetSettings>();

  async findByTenantId(tenantId: string) {
    return this.data.get(tenantId) ?? null;
  }

  async save(settings: WidgetSettings) {
    this.data.set(settings.tenantId, settings);
    return settings;
  }
}
