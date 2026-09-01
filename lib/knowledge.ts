export const BUILTIN_MANUAL = {
  id: "builtin-ai-kb-saas-guide",
  name: "AI客服知识库SaaS开源选型与实现手册_2026.pdf",
  mimeType: "application/pdf",
  charCount: 6840,
  pageCount: 32,
  createdAt: "2026-08-19T00:00:00.000Z",
  builtIn: true,
  content: `
本手册目标是把企业知识库、AI 客服、API 网关与 SaaS 计费做成可商业化产品。

推荐主干：Public AI API 自研；SaaS Control Plane 自研并可使用 Vben Admin；RAGFlow 作为知识底座；LiteLLM 或 Portkey 作为内部模型网关；Dujiao-Next 负责商品、订单和支付；OpenMeter 负责用量与 Credits；Langfuse 加 Promptfoo 负责 Trace 与评测；Casdoor 或 Keycloak 负责身份。

核心边界：Public API、SaaS 数据模型、租户与权益体系、计费口径和客户运营数据必须掌握在自己手里。RAGFlow、Dujiao-Next、OpenMeter、Langfuse 等都作为可替换的内部服务，不要揉进自有核心。

必须实现的能力包括知识库文档上传、解析、Chunk、Embedding、检索、Rerank 与引用；助手 Prompt、模型、知识库绑定和版本；质量测试的答案、来源、分数、Trace、成本；多租户隔离；API Key；OpenAI 兼容接口；商品支付订阅；用量计费；成员、SSO 与审计。

OpenAI 兼容 API 第一版至少实现 GET /v1/models、GET /v1/models/{model}、POST /v1/chat/completions（非流式与 SSE），并预留 POST /v1/responses。Assistant 作为 model alias。标准响应保持干净，扩展来源、分数、成本和耗时通过 trace_id 查询。

API Key 明文只展示一次，数据库保存 prefix 与 HMAC-SHA256 哈希，并绑定 tenant_id、assistant_id、scopes、有效期、RPM、TPM 与 IP 白名单。日志不得记录完整 Authorization。每次鉴权后得到 tenant_id，后续查询强制带 tenant_id 条件。

质量测试覆盖：输入问题、期望答案与场景；Retrieval 的 query rewrite、TopK、chunk、source、similarity、rerank_score；Generation 的 Answer、Citation、Prompt Version 和模型；Quality 的 groundedness、relevance 与 citation correctness；Performance 的首 Token、总耗时与 tokens；Billing 的上游成本、Credits 与毛利；Trace ID。

MVP 4 到 8 周：建立 Tenant、User、Plan、Subscription、Entitlement、Assistant、API Key 基础表；接入 RAGFlow；实现 OpenAI 兼容接口；接 Dujiao-Next 支付 Webhook；完成质量测试页；建立 usage_records 与月度配额；完成客户和运营后台。

Phase 2 引入 LiteLLM 或 Portkey、多 Provider 与 fallback，OpenMeter Credits，Langfuse Trace，Promptfoo 或 Ragas 回归评测，优惠券和额度包，API Key scopes、IP 白名单、Webhook 与审计。企业版再增加 SSO、SCIM、私有化部署、数据保留策略与 SLA。

两套钱包分开：人民币支付余额用于购买套餐和额度包，AI Credits 用于产品消耗。上游模型价格变化只修改 Credits 规则，不直接改动客户人民币钱包。
`,
};

export type RankedSource = {
  documentId: string;
  document: string;
  chunkId: string;
  text: string;
  score: number;
};

function terms(value: string) {
  const normalized = value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ");
  const words = normalized.split(/\s+/).filter((item) => item.length > 1);
  const chinese = [...normalized.replace(/[^\p{Script=Han}]/gu, "")];
  for (let index = 0; index < chinese.length - 1; index += 1) words.push(chinese[index] + chinese[index + 1]);
  return [...new Set(words)].slice(0, 80);
}

function splitIntoChunks(text: string, size = 900, overlap = 140) {
  const clean = text.replace(/\s+/g, " ").trim();
  const chunks: string[] = [];
  let cursor = 0;
  while (cursor < clean.length) {
    let end = Math.min(cursor + size, clean.length);
    if (end < clean.length) {
      const boundary = Math.max(clean.lastIndexOf("。", end), clean.lastIndexOf("\n", end));
      if (boundary > cursor + size * 0.55) end = boundary + 1;
    }
    chunks.push(clean.slice(cursor, end));
    if (end >= clean.length) break;
    cursor = Math.max(end - overlap, cursor + 1);
  }
  return chunks;
}

export function rankKnowledge(
  question: string,
  documents: Array<{ id: string; name: string; content: string }>,
  limit = 4,
) {
  const queryTerms = terms(question);
  const candidates: RankedSource[] = [];
  for (const document of documents) {
    splitIntoChunks(document.content).forEach((text, index) => {
      const lower = text.toLowerCase();
      let hits = 0;
      for (const term of queryTerms) if (lower.includes(term)) hits += term.length > 2 ? 2 : 1;
      const phraseBoost = lower.includes(question.toLowerCase()) ? 6 : 0;
      const score = queryTerms.length ? Math.min(0.99, (hits + phraseBoost) / (queryTerms.length * 2.4)) : 0;
      candidates.push({ documentId: document.id, document: document.name, chunkId: `${document.id}-${index + 1}`, text, score });
    });
  }
  return candidates.sort((a, b) => b.score - a.score).slice(0, Math.max(1, Math.min(limit, 8)));
}
