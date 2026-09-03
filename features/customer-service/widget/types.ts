export type WidgetStatus = 'enabled' | 'disabled' | 'maintenance';

export interface WidgetSettings {
  id: string;
  tenantId: string;
  status: WidgetStatus;
  title: string;
  welcomeMessage: string;
  themeColor: string;
  avatar?: string;
  quickQuestions: string[];
}
