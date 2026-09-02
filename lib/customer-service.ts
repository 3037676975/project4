import { PublicApiError } from "./api-keys";
import { getRuntime } from "./runtime";
import { constantTimeEqual, randomToken, sha256 } from "./security";

export type FaqCandidate = { id: string; question: string; answer: string; keywords_json?: string; priority?: number };
export type FaqMatch = { id: string; question: string; answer: string; score: number };

export function normalizeFaqText(value: string) {
  return value.toLowerCase().normalize("NFKC").replace(/[\p{P}\p{S}\s]+/gu, "").trim();
}

function bigrams(value: string) {
  const clean = normalizeFaqText(value); const output = new Set<string>();
  if (clean.length < 2) { if (clean) output.add(clean); return output; }
  for (let index = 0; index < clean.length - 1; index += 1) output.add(clean.slice(index, index + 2));
  return output;
}

function keywordList(value: string | undefined) {
  if (!value) return [] as string[];
  try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string").map(normalizeFaqText).filter(Boolean) : []; }
  catch { return value.split(/[,，\n]/).map(normalizeFaqText).filter(Boolean); }
}

export function scoreFaqCandidate(query: string, candidate: Pick<FaqCandidate, "question" | "keywords_json">) {
  const q = normalizeFaqText(query); const question = normalizeFaqText(candidate.question);
  if (!q || !question) return 0;
  if (q === question) return 1;
  const shorter = Math.min(q.length, question.length); const longer = Math.max(q.length, question.length);
  if (shorter >= 4 && (q.includes(question) || question.includes(q)) && shorter / longer >= 0.68) return 0.94;
  const keywords = keywordList(candidate.keywords_json);
  if (keywords.some((keyword) => keyword.length >= 2 && (q === keyword || q.includes(keyword)))) return 0.9;
  const qa = bigrams(q); const qb = bigrams(question); if (!qa.size || !qb.size) return 0;
  let intersection = 0; for (const item of qa) if (qb.has(item)) intersection += 1;
  const dice = 2 * intersection / (qa.size + qb.size);
  return dice >= 0.82 ? Math.min(0.89, dice) : dice * 0.82;
}

export async function findFaqMatch(tenantId: string, assistantId: string, question: string): Promise<FaqMatch | null> {
  const result = await getRuntime().DB.prepare(`SELECT id, question, answer, keywords_json, priority FROM customer_faqs
    WHERE tenant_id = ? AND assistant_id = ? AND enabled = 1 ORDER BY priority DESC, updated_at DESC LIMIT 200`)
    .bind(tenantId, assistantId).all<FaqCandidate>();
  let best: FaqMatch | null = null;
  for (const row of result.results) {
    const score = scoreFaqCandidate(question, row);
    if (!best || score > best.score) best = { id: row.id, question: row.question, answer: row.answer, score };
  }
  if (!best || best.score < 0.86) return null;
  await getRuntime().DB.prepare("UPDATE customer_faqs SET hit_count = hit_count + 1, updated_at = ? WHERE id = ? AND tenant_id = ?")
    .bind(new Date().toISOString(), best.id, tenantId).run().catch(() => undefined);
  return best;
}

export async function issueConversationToken() {
  const token = randomToken(32); return { token, hash: await sha256(token) };
}

export async function conversationTokenMatches(token: string, expectedHash: string | null | undefined) {
  if (!token || !expectedHash) return false;
  const actual = await sha256(token); return constantTimeEqual(actual, expectedHash);
}

export async function requireConversationToken(token: string, expectedHash: string | null | undefined) {
  if (!await conversationTokenMatches(token, expectedHash)) throw new PublicApiError(403, "会话凭据无效，请刷新客服窗口后重试。", "conversation_access_denied");
}
