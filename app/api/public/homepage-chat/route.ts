import { POST as publicChatPost } from "../chat/route";
import { createEmbedToken, loadPublicWidgetAssistant } from "../../../../lib/public-widget";
import { getRuntime } from "../../../../lib/runtime";

type HomepageChatPayload = {
  message?: unknown;
  question?: unknown;
  conversationId?: unknown;
  conversationToken?: unknown;
  visitorId?: unknown;
  mode?: unknown;
};

function fallbackAnswer(question: string) {
  const text = question.toLowerCase();
  if (/价格|套餐|收费|多少钱|费用/.test(text)) {
    return "KnowFlow 支持按企业规模和客服能力配置套餐。你可以告诉我团队人数、预计月会话量和是否需要人工客服，我可以继续帮你梳理适合的方案。";
  }
  if (/演示|demo|试用|体验/.test(text)) {
    return "可以。你可以直接在当前窗口体验官网客服，也可以进入控制台配置知识库、AI 助手和人工接待流程。";
  }
  if (/人工|客服|联系|售后/.test(text)) {
    return "支持 AI 先接待、人工无缝接管。正式启用后，访客不需要切换窗口，转人工后会直接进入客服工作台。";
  }
  if (/rag|知识库|文档|pdf|word|excel/.test(text)) {
    return "KnowFlow 可以把企业文档接入知识库，通过 RAG 检索后生成有依据的回答，并保留来源、Trace 和质量评估。";
  }
  if (/部署|docker|私有化|服务器/.test(text)) {
    return "支持 Docker 私有化部署，也可以通过 GitHub + 宝塔自动部署。模型服务、向量库和业务应用可以按你的服务器资源拆分。";
  }
  return "收到你的问题。当前官网客服已经可以正常接收消息；如果后台已启用公开 AI 助手，我会优先走真实知识库与模型回答。你也可以问我：套餐、RAG、人工客服、私有化部署或预约演示。";
}

export async function POST(request: Request) {
  let payload: HomepageChatPayload;
  try {
    payload = await request.json() as HomepageChatPayload;
  } catch {
    return Response.json({ error: "请求格式不正确。" }, { status: 400 });
  }

  const questionSource = typeof payload.question === "string" ? payload.question : payload.message;
  const question = typeof questionSource === "string" ? questionSource.trim() : "";
  if (!question) return Response.json({ error: "请输入你的问题。" }, { status: 400 });
  if (question.length > 1200) return Response.json({ error: "问题不能超过 1200 个字符。" }, { status: 400 });

  try {
    const row = await getRuntime().DB.prepare(`
      SELECT public_id
      FROM assistants
      WHERE public_enabled = 1
        AND status = 'active'
        AND public_id IS NOT NULL
        AND public_id <> ''
      ORDER BY updated_at DESC
      LIMIT 1
    `).first<{ public_id: string }>();

    if (!row?.public_id) {
      return Response.json({ answer: fallbackAnswer(question), mode: "ai", fallback: true, sources: [] });
    }

    const assistant = await loadPublicWidgetAssistant(row.public_id);
    if (!assistant) {
      return Response.json({ answer: fallbackAnswer(question), mode: "ai", fallback: true, sources: [] });
    }

    const embedToken = await createEmbedToken(assistant, "direct");
    const forwardedHeaders = new Headers(request.headers);
    forwardedHeaders.set("content-type", "application/json");
    forwardedHeaders.delete("content-length");

    const forwarded = new Request(new URL("/api/public/chat", request.url), {
      method: "POST",
      headers: forwardedHeaders,
      body: JSON.stringify({
        publicId: row.public_id,
        question,
        conversationId: typeof payload.conversationId === "string" ? payload.conversationId : "",
        conversationToken: typeof payload.conversationToken === "string" ? payload.conversationToken : "",
        visitorId: typeof payload.visitorId === "string" ? payload.visitorId : "",
        embedToken,
        mode: payload.mode === "human" ? "human" : "ai",
      }),
    });

    const response = await publicChatPost(forwarded);
    if (response.ok) return response;

    const data = await response.clone().json().catch(() => null) as { error?: string } | null;
    if (response.status >= 500 || response.status === 402 || response.status === 403 || response.status === 404) {
      return Response.json({
        answer: data?.error ? `${data.error} 我先用官网基础知识为你回答：${fallbackAnswer(question)}` : fallbackAnswer(question),
        mode: "ai",
        fallback: true,
        sources: [],
      });
    }
    return response;
  } catch {
    return Response.json({ answer: fallbackAnswer(question), mode: "ai", fallback: true, sources: [] });
  }
}
