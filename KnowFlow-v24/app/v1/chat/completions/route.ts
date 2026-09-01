import { authenticateCustomerApiKey, openAiErrorResponse, PublicApiError } from "../../../../lib/api-keys";
import { completeOnce, parseMessages, persistCompletion, prepareCompletion, PreparedCompletion, TokenUsage } from "../../../../lib/completion";

type RequestBody = { model?: unknown; messages?: unknown; stream?: unknown; max_tokens?: unknown; max_completion_tokens?: unknown };

function responseHeaders(prepared: PreparedCompletion, contentType = "application/json") {
  return { "Content-Type": contentType, "X-Request-Id": prepared.requestId, "X-KB-Trace-Id": prepared.traceId, "Cache-Control": "no-store" };
}

export async function POST(request: Request) {
  try {
    const context = await authenticateCustomerApiKey(request, "chat:completions");
    let body: RequestBody; try { body = await request.json() as RequestBody; } catch { throw new PublicApiError(400, "Request body must be valid JSON"); }
    const messages = parseMessages(body.messages); const model = typeof body.model === "string" ? body.model : null;
    const maxTokens = Math.min(4000, Math.max(1, Math.round(Number(body.max_completion_tokens ?? body.max_tokens ?? 900))));
    const prepared = await prepareCompletion({ tenantId: context.tenantId, apiKeyId: context.apiKeyId, boundAssistantId: context.assistantId, model, messages });
    if (body.stream === true) return streamResponse(prepared, maxTokens);
    const result = await completeOnce(prepared, maxTokens); const id = `chatcmpl_${prepared.requestId.slice(4)}`;
    return new Response(JSON.stringify({ id, object: "chat.completion", created: Math.floor(Date.now() / 1000), model: prepared.assistant.modelAlias,
      choices: [{ index: 0, message: { role: "assistant", content: result.answer }, finish_reason: "stop" }], usage: result.usage,
      system_fingerprint: null }), { status: 200, headers: responseHeaders(prepared) });
  } catch (error) { return openAiErrorResponse(error); }
}

async function streamResponse(prepared: PreparedCompletion, maxTokens: number) {
  if (!prepared.grounded) {
    const recorded = await persistCompletion({ prepared, answer: prepared.assistant.fallbackMessage, status: "fallback" });
    const encoder = new TextEncoder(); const completionId = `chatcmpl_${prepared.requestId.slice(4)}`; const created = Math.floor(Date.now() / 1000);
    const payload = { id: completionId, object: "chat.completion.chunk", created, model: prepared.assistant.modelAlias,
      choices: [{ index: 0, delta: { role: "assistant", content: prepared.assistant.fallbackMessage }, finish_reason: "stop" }],
      usage: recorded.usage };
    const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\ndata: [DONE]\n\n`)); controller.close(); } });
    return new Response(stream, { status: 200, headers: responseHeaders(prepared, "text/event-stream; charset=utf-8") });
  }
  const upstream = await fetch(`${prepared.provider.baseUrl}/chat/completions`, {
    method: "POST", headers: { Authorization: `Bearer ${prepared.provider.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: prepared.provider.model, messages: prepared.messages, temperature: prepared.assistant.temperature, max_tokens: maxTokens, stream: true, stream_options: { include_usage: true } }),
    signal: AbortSignal.timeout(120000),
  });
  if (!upstream.ok || !upstream.body) {
    const text = await upstream.text(); let message = "Generation provider error";
    try { message = (JSON.parse(text) as { error?: { message?: string } }).error?.message || message; } catch { /* upstream text */ }
    await persistCompletion({ prepared, answer: null, status: "error" }).catch(() => undefined);
    throw new PublicApiError(upstream.status >= 400 && upstream.status < 500 ? upstream.status : 502, message, "upstream_error");
  }
  const encoder = new TextEncoder(); const decoder = new TextDecoder(); const completionId = `chatcmpl_${prepared.requestId.slice(4)}`; const created = Math.floor(Date.now() / 1000);
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = upstream.body!.getReader(); let buffer = ""; let answer = ""; let usage: Partial<TokenUsage> = {}; let upstreamModel = prepared.provider.model; let done = false;
      const emitLine = (line: string) => {
        if (!line.startsWith("data:")) return;
        const raw = line.slice(5).trim(); if (!raw || raw === "[DONE]") { if (raw === "[DONE]") done = true; return; }
        try {
          const chunk = JSON.parse(raw) as { id?: string; object?: string; created?: number; model?: string; choices?: Array<{ delta?: { content?: string } }>; usage?: Partial<TokenUsage> };
          upstreamModel = chunk.model || upstreamModel; const delta = chunk.choices?.[0]?.delta?.content || ""; answer += delta; if (chunk.usage) usage = chunk.usage;
          chunk.id = completionId; chunk.object = "chat.completion.chunk"; chunk.created = created; chunk.model = prepared.assistant.modelAlias;
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
        } catch { /* ignore provider comments */ }
      };
      try {
        while (!done) {
          const read = await reader.read(); if (read.done) break; buffer += decoder.decode(read.value, { stream: true });
          const lines = buffer.split(/\r?\n/); buffer = lines.pop() || ""; for (const line of lines) emitLine(line);
        }
        if (buffer.trim()) emitLine(buffer.trim());
        await persistCompletion({ prepared, answer, usage, status: "success", model: upstreamModel }).catch(() => undefined);
        controller.enqueue(encoder.encode("data: [DONE]\n\n")); controller.close();
      } catch (error) { controller.error(error); }
      finally { reader.releaseLock(); }
    },
    cancel() { upstream.body?.cancel().catch(() => undefined); },
  });
  return new Response(stream, { status: 200, headers: responseHeaders(prepared, "text/event-stream; charset=utf-8") });
}
