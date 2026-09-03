import test from "node:test";
import assert from "node:assert/strict";
import { conversationTokenMatches, issueConversationToken, normalizeFaqText, scoreFaqCandidate } from "../lib/customer-service.ts";

test("conversation access token is hashed and rejects wrong token", async () => {
  const issued = await issueConversationToken();
  assert.ok(issued.token.length > 30); assert.equal(await conversationTokenMatches(issued.token, issued.hash), true); assert.equal(await conversationTokenMatches(issued.token + "x", issued.hash), false);
});
test("FAQ normalization handles punctuation and exact questions", () => {
  assert.equal(normalizeFaqText(" 怎么退款？ "), "怎么退款");
  assert.equal(scoreFaqCandidate("怎么退款？", { question: "怎么退款", keywords_json: "[]" }), 1);
});
test("FAQ keywords can produce a high confidence direct match without broad false positives", () => {
  assert.ok(scoreFaqCandidate("我想申请退款流程", { question: "售后政策", keywords_json: JSON.stringify(["退款流程"]) }) >= 0.86);
  assert.ok(scoreFaqCandidate("今天天气怎么样", { question: "怎么退款", keywords_json: JSON.stringify(["退款"]) }) < 0.86);
});
