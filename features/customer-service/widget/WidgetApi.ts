export async function sendWidgetMessage(payload: {
  question: string;
  visitorId: string;
  mode: "ai" | "human";
}) {
  const response = await fetch("/api/public/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      publicId: "default",
      ...payload,
    }),
  });

  return response.json();
}
