import { authenticateCustomerApiKey, openAiErrorResponse, PublicApiError } from "../../../lib/api-keys";
import { completeOnce, parseMessages, prepareCompletion } from "../../../lib/completion";

export async function POST(request: Request) {
  try {
    const context = await authenticateCustomerApiKey(request, "responses");
    let body: { model?: unknown; input?: unknown; instructions?: unknown; max_output_tokens?: unknown; stream?: unknown };
    try { body = await request.json() as typeof body; } catch { throw new PublicApiError(400, "Request body must be valid JSON"); }
    const rawMessages = typeof body.input === "string" ? [{ role: "user", content: body.input }] : body.input;
    const messages = parseMessages([...(typeof body.instructions === "string" && body.instructions.trim() ? [{ role: "system", content: body.instructions }] : []), ...(Array.isArray(rawMessages) ? rawMessages : [])]);
    const model = typeof body.model === "string" ? body.model : null; const maxTokens = Math.min(4000, Math.max(1, Math.round(Number(body.max_output_tokens ?? 900))));
    const prepared = await prepareCompletion({ tenantId: context.tenantId, apiKeyId: context.apiKeyId, boundAssistantId: context.assistantId, model, messages });
    const result = await completeOnce(prepared, maxTokens); const id = `resp_${prepared.requestId.slice(4)}`; const createdAt = Math.floor(Date.now() / 1000);
    const response = { id, object: "response", created_at: createdAt, status: "completed", model: prepared.assistant.modelAlias,
      output: [{ id: `msg_${crypto.randomUUID().replaceAll("-", "")}`, type: "message", status: "completed", role: "assistant", content: [{ type: "output_text", annotations: [], text: result.answer }] }],
      output_text: result.answer, usage: { input_tokens: result.usage.prompt_tokens, output_tokens: result.usage.completion_tokens, total_tokens: result.usage.total_tokens }, error: null, incomplete_details: null, metadata: {} };
    if (body.stream === true) {
      const encoder = new TextEncoder(); const eventStream = new ReadableStream<Uint8Array>({ start(controller) {
        controller.enqueue(encoder.encode(`event: response.created\ndata: ${JSON.stringify({ type: "response.created", response: { ...response, status: "in_progress", output: [] } })}\n\n`));
        controller.enqueue(encoder.encode(`event: response.output_text.delta\ndata: ${JSON.stringify({ type: "response.output_text.delta", item_id: response.output[0].id, output_index: 0, content_index: 0, delta: result.answer })}\n\n`));
        controller.enqueue(encoder.encode(`event: response.completed\ndata: ${JSON.stringify({ type: "response.completed", response })}\n\n`)); controller.close();
      } });
      return new Response(eventStream, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store", "X-Request-Id": prepared.requestId, "X-KB-Trace-Id": prepared.traceId } });
    }
    return new Response(JSON.stringify(response), { headers: { "Content-Type": "application/json", "X-Request-Id": prepared.requestId, "X-KB-Trace-Id": prepared.traceId } });
  } catch (error) { return openAiErrorResponse(error); }
}
