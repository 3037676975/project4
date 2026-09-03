export type WidgetMessageItem = {
  role: "ai" | "user";
  text: string;
};

export function WidgetMessage({ message }: { message: WidgetMessageItem }) {
  const user = message.role === "user";

  return (
    <div style={{ textAlign: user ? "right" : "left", marginBottom: 12 }}>
      <span
        style={{
          display: "inline-block",
          padding: 12,
          borderRadius: 16,
          background: user ? "#4f46e5" : "#f1f5f9",
          color: user ? "white" : "#111827",
        }}
      >
        {message.text}
      </span>
    </div>
  );
}
