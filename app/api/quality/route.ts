import { completeOnce, parseMessages, prepareCompletion } from "../../../lib/completion";
import { getRuntime } from "../../../lib/runtime";
import { getOrCreateTenant, requireRole, routeError } from "../../../lib/tenant";

function normalize(value: string) { return value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ""); }

export async function GET(request: Request) {
  try {
    const context = await getOrCreateTenant(request); const { DB } = getRuntime();
    const assistant = await DB.prepare("SELECT id, quality_threshold_milli, fallback_message FROM assistants WHERE tenant_id = ? AND status = 'active' ORDER BY created_at LIMIT 1").bind(context.tenantId).first<Record<string, unknown>>();
    const [cases, runs] = await Promise.all([
      DB.prepare(`SELECT id, question, expected_answer, expected_document, should_refuse, active, created_at, updated_at
        FROM quality_test_cases WHERE tenant_id = ? AND assistant_id = ? ORDER BY created_at`).bind(context.tenantId, assistant?.id).all(),
      DB.prepare(`SELECT r.id, r.test_case_id, r.trace_id, r.answer, r.grounded, r.quality_score_milli, r.passed, r.failure_reason, r.created_at
        FROM quality_test_runs r JOIN quality_test_cases c ON c.id = r.test_case_id WHERE r.tenant_id = ? AND c.assistant_id = ? ORDER BY r.created_at DESC LIMIT 100`).bind(context.tenantId, assistant?.id).all(),
    ]);
    const runRows = runs.results as Array<Record<string, unknown>>; const latest = new Map<string, Record<string, unknown>>(); for (const row of runRows) if (!latest.has(String(row.test_case_id))) latest.set(String(row.test_case_id), row);
    const serializedCases = (cases.results as Array<Record<string, unknown>>).map((row) => ({ id: row.id, question: row.question, expectedAnswer: row.expected_answer, expectedDocument: row.expected_document, shouldRefuse: Boolean(row.should_refuse), active: Boolean(row.active), createdAt: row.created_at, updatedAt: row.updated_at,
      latestRun: latest.get(String(row.id)) ? serializeRun(latest.get(String(row.id))!) : null }));
    const completed = serializedCases.filter((item) => item.latestRun); const passed = completed.filter((item) => item.latestRun?.passed).length;
    return Response.json({ threshold: Number(assistant?.quality_threshold_milli || 620) / 1000, fallbackMessage: assistant?.fallback_message,
      summary: { cases: serializedCases.length, completed: completed.length, passed, passRate: completed.length ? Math.round(passed / completed.length * 100) : null }, cases: serializedCases });
  } catch (error) { return routeError(error); }
}

function serializeRun(row: Record<string, unknown>) { return { id: row.id, traceId: row.trace_id, answer: row.answer, grounded: Boolean(row.grounded), qualityScore: Number(row.quality_score_milli) / 1000, passed: Boolean(row.passed), failureReason: row.failure_reason, createdAt: row.created_at }; }

export async function POST(request: Request) {
  try {
    const context = await getOrCreateTenant(request); requireRole(context, ["owner", "admin", "member"]); const body = await request.json() as Record<string, unknown>; const { DB } = getRuntime();
    const assistant = await DB.prepare("SELECT id FROM assistants WHERE tenant_id = ? AND status = 'active' ORDER BY created_at LIMIT 1").bind(context.tenantId).first<{ id: string }>();
    if (!assistant) return Response.json({ error: "助手尚未初始化。" }, { status: 404 });
    const action = String(body.action || "create"); const now = new Date().toISOString();
    if (action === "create") {
      const question = typeof body.question === "string" ? body.question.trim().slice(0, 1000) : ""; const expectedAnswer = typeof body.expectedAnswer === "string" ? body.expectedAnswer.trim().slice(0, 1000) : "";
      const expectedDocument = typeof body.expectedDocument === "string" ? body.expectedDocument.trim().slice(0, 160) : ""; const shouldRefuse = body.shouldRefuse === true;
      if (!question || (!shouldRefuse && !expectedAnswer)) return Response.json({ error: "请填写测试问题；非拒答题还需要标准答案。" }, { status: 400 });
      const id = `case_${crypto.randomUUID().replaceAll("-", "")}`;
      await DB.prepare(`INSERT INTO quality_test_cases
        (id, tenant_id, assistant_id, question, expected_answer, expected_document, should_refuse, active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`)
        .bind(id, context.tenantId, assistant.id, question, expectedAnswer, expectedDocument || null, shouldRefuse ? 1 : 0, now, now).run();
      return Response.json({ saved: true, id }, { status: 201 });
    }
    if (action === "run" || action === "run_all") {
      const knowledgeBaseId = typeof body.knowledgeBaseId === "string" ? body.knowledgeBaseId.trim() : "";
      const result = await DB.prepare(`SELECT id, question, expected_answer, expected_document, should_refuse FROM quality_test_cases
        WHERE tenant_id = ? AND assistant_id = ? AND active = 1 ${action === "run" ? "AND id = ?" : ""} ORDER BY created_at LIMIT 30`)
        .bind(...(action === "run" ? [context.tenantId, assistant.id, String(body.id || "")] : [context.tenantId, assistant.id])).all();
      const outputs = [];
      for (const item of result.results as Array<Record<string, unknown>>) {
        const prepared = await prepareCompletion({ tenantId: context.tenantId, boundAssistantId: assistant.id, knowledgeBaseId: knowledgeBaseId || null, messages: parseMessages([{ role: "user", content: String(item.question) }]) });
        const completion = await completeOnce(prepared, 900); const shouldRefuse = Boolean(item.should_refuse); let passed = false; let failureReason = "";
        if (shouldRefuse) { passed = !completion.grounded; if (!passed) failureReason = "应拒答，但系统找到了超过阈值的资料并回答。"; }
        else if (!completion.grounded) failureReason = "标准题未达到可靠度阈值，被系统拒答。";
        else if (item.expected_document && !prepared.sources.some((source) => source.document.includes(String(item.expected_document)))) failureReason = "未命中指定来源文档。";
        else { const expected = normalize(String(item.expected_answer)); const answer = normalize(completion.answer); passed = expected.length > 0 && answer.includes(expected); if (!passed) failureReason = "回答未包含标准答案关键内容。"; }
        const runId = `run_${crypto.randomUUID().replaceAll("-", "")}`;
        await DB.prepare(`INSERT INTO quality_test_runs
          (id, tenant_id, test_case_id, trace_id, answer, grounded, quality_score_milli, passed, failure_reason, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .bind(runId, context.tenantId, item.id, completion.traceId, completion.answer, completion.grounded ? 1 : 0, Math.round(completion.qualityScore * 1000), passed ? 1 : 0, failureReason || null, new Date().toISOString()).run();
        outputs.push({ id: item.id, runId, passed, grounded: completion.grounded, qualityScore: completion.qualityScore, failureReason });
      }
      return Response.json({ completed: outputs.length, passed: outputs.filter((item) => item.passed).length, results: outputs });
    }
    return Response.json({ error: "不支持的质量测试操作。" }, { status: 400 });
  } catch (error) { return routeError(error); }
}

export async function DELETE(request: Request) {
  try {
    const context = await getOrCreateTenant(request); requireRole(context, ["owner", "admin"]); const id = new URL(request.url).searchParams.get("id") || ""; const { DB } = getRuntime();
    const owned = await DB.prepare("SELECT id FROM quality_test_cases WHERE id = ? AND tenant_id = ?").bind(id, context.tenantId).first<{ id: string }>();
    if (!owned) return Response.json({ error: "测试题不存在。" }, { status: 404 });
    await DB.batch([DB.prepare("DELETE FROM quality_test_runs WHERE tenant_id = ? AND test_case_id = ?").bind(context.tenantId, id), DB.prepare("DELETE FROM quality_test_cases WHERE tenant_id = ? AND id = ?").bind(context.tenantId, id)]);
    return Response.json({ deleted: true });
  } catch (error) { return routeError(error); }
}
