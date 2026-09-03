export type WidgetEvent =
  | "open"
  | "close"
  | "send_message"
  | "handoff"
  | "reset";

export function createWidgetEvent(event: WidgetEvent) {
  return {
    event,
    timestamp: new Date().toISOString(),
  };
}
