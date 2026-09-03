import type { WidgetRepository } from './repository';
import type { WidgetSettings } from './types';

export class WidgetService {
  constructor(private readonly repository: WidgetRepository) {}

  async getSettings(tenantId: string) {
    return this.repository.findByTenantId(tenantId);
  }

  async updateSettings(settings: WidgetSettings) {
    return this.repository.save(settings);
  }
}
