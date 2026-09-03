export type WidgetStatus = "ai" | "human" | "offline";

export interface WidgetState {
  open: boolean;
  status: WidgetStatus;
  unread: number;
}

export const defaultWidgetState: WidgetState = {
  open: false,
  status: "ai",
  unread: 0,
};
