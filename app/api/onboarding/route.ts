import { getIndustryTemplate, listIndustryTemplates } from "../../../lib/industry-templates";
import { indexDocument } from "../../../lib/rag";
import { getRuntime } from "../../../lib/runtime";
import { getOrCreateTenant, requireRole, routeError } from "../../../lib/tenant";

function cleanCompanyName(value: unknown) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, 120) : "";
}

function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 200;
}

function templateSummary() {
  return listIndustryTemplates().map((item) => ({
    code: item.code,
    name: item.name,
    description: item.description,
    icon: item.icon,
    themeColor: item.themeColor,
    questions: item.questions,
    demoDocumentName: item.demoDocumentName,
  }));
}

export async function GET(request: Request) {
  try {
    const context = await getOrCreateTenant(request); const { DB } = getRuntime();
    const [tenant, assistant] = await Promise.all([
      DB.prepare("SELECT name, company_name, billing_email, onboarding_completed FROM tenants WHERE id = ?")
        .bind(context.tenantId).first<Record<string, unknown>>(),
      DB.prepare(`SELECT id, public_id, public_enabled, industry_template, knowledge_base_id
        FROM assistants WHERE tenant_id = ? AND status = 'active' ORDER BY created_at LIMIT 1`)
        .bind(context.tenantId).first<Record<string, unknown>>(),
    ]);
    return Response.json({
      tenant: { name: tenant?.name, companyName: tenant?.company_name, billingEmail: tenant?.billing_email, onboardingCompleted: Boolean(tenant?.onboarding_completed) },
      assistant: assistant ? { id: assistant.id, publicId: assistant.public_id, publicEnabled: Boolean(assistant.public_enabled), industryTemplate: assistant.industry_template, knowledgeBaseId: assistant.knowledge_base_id } : null,
      templates: templateSummary(),
    });
  } catch (error) { return routeError(error); }
}

export async function POST(request: Request) {
  try {
    const context = await getOrCreateTenant(request); requireRole(context, ["owner", "admin"]);
    const body = await request.json() as Record<string, unknown>; const template = getIndustryTemplate(body.template);
    if (!template) return Response.json({ error: "请选择有效的行业模板。" }, { status: 400 });
    const companyName = cleanCompanyName(body.companyName); const billingEmail = typeof body.billingEmail === "string" ? body.billingEmail.trim().toLowerCase() : "";
    if (!companyName) return Response.json({ error: "请输入企业名称。" }, { status: 400 });
    if (!validEmail(billingEmail)) return Response.json({ error: "请输入有效的业务联系邮箱。" }, { status: 400 });
    const includeDemoData = body.includeDemoData !== false; const publishWidget = body.publishWidget !== false;
    const runtime = getRuntime(); const now = new Date().toISOString();
    const assistant = await runtime.DB.prepare(`SELECT id, public_id, knowledge_base_id FROM assistants
      WHERE tenant_id = ? AND status = 'active' ORDER BY created_at LIMIT 1`).bind(context.tenantId).first<{ id: string; public_id: string | null; knowledge_base_id: string }>();
    if (!assistant) return Response.json({ error: "助手尚未初始化。" }, { status: 404 });
    const publicId = assistant.public_id || `pub_${crypto.randomUUID().replaceAll("-", "")}`;

    await runtime.DB.batch([
      runtime.DB.prepare(`UPDATE tenants SET name = ?, company_name = ?, billing_email = ?, onboarding_completed = 1, updated_at = ? WHERE id = ?`)
        .bind(companyName, companyName, billingEmail, now, context.tenantId),
      runtime.DB.prepare(`UPDATE assistants SET name = ?, public_id = ?, public_enabled = ?, industry_template = ?, brand_name = ?,
        welcome_message = ?, theme_color = ?, suggested_questions_json = ?, system_prompt = ?, lead_capture_enabled = 1,
        handoff_enabled = 1, version = version + 1, updated_at = ? WHERE id = ? AND tenant_id = ?`)
        .bind(template.brandName, publicId, publishWidget ? 1 : 0, template.code, template.brandName, template.welcomeMessage,
          template.themeColor, JSON.stringify(template.questions), template.systemPrompt, now, assistant.id, context.tenantId),
    ]);

    let demoCreated = false; let indexStatus = "skipped"; let warning: string | null = null;
    if (includeDemoData) {
      const categoryId = `cat_demo_${template.code}_${context.tenantId.slice(-12)}`;
      const documentId = `doc_demo_${template.code}_${context.tenantId.slice(-12)}`;
      const existing = await runtime.DB.prepare("SELECT id, index_status FROM knowledge_documents WHERE id = ? AND tenant_id = ? AND knowledge_base_id = ?")
        .bind(documentId, context.tenantId, assistant.knowledge_base_id).first<{ id: string; index_status: string }>();
      if (!existing) {
        const lastCategory = await runtime.DB.prepare("SELECT COALESCE(MAX(position), 0) AS position FROM knowledge_categories WHERE tenant_id = ? AND knowledge_base_id = ?")
          .bind(context.tenantId, assistant.knowledge_base_id).first<{ position: number }>();
        const lastDocument = await runtime.DB.prepare("SELECT COALESCE(MAX(position), 0) AS position FROM knowledge_documents WHERE tenant_id = ? AND knowledge_base_id = ?")
          .bind(context.tenantId, assistant.knowledge_base_id).first<{ position: number }>();
        await runtime.DB.prepare(`INSERT OR IGNORE INTO knowledge_categories
          (id, tenant_id, knowledge_base_id, name, position, is_system, created_at, updated_at)
          VALUES (?, ?, ?, '行业演示资料', ?, 0, ?, ?)`)
          .bind(categoryId, context.tenantId, assistant.knowledge_base_id, Number(lastCategory?.position || 0) + 1, now, now).run();
        const objectKey = `tenant/${context.tenantId}/kb/${assistant.knowledge_base_id}/category/${categoryId}/${documentId}/${encodeURIComponent(template.demoDocumentName)}`;
        await runtime.BUCKET.put(objectKey, new TextEncoder().encode(template.demoText), { httpMetadata: { contentType: "text/plain; charset=utf-8" } });
        try {
          await runtime.DB.prepare(`INSERT INTO knowledge_documents
            (id, tenant_id, knowledge_base_id, category_id, position, name, mime_type, object_key, extracted_text, char_count,
             page_count, status, index_status, chunk_count, ocr_used, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, 'text/plain', ?, ?, ?, NULL, 'ready', 'indexing', 0, 0, ?, ?)`)
            .bind(documentId, context.tenantId, assistant.knowledge_base_id, categoryId, Number(lastDocument?.position || 0) + 1,
              template.demoDocumentName, objectKey, template.demoText, template.demoText.length, now, now).run();
        } catch (error) { await runtime.BUCKET.delete(objectKey).catch(() => undefined); throw error; }
        demoCreated = true;
        try {
          const indexed = await indexDocument({ tenantId: context.tenantId, knowledgeBaseId: assistant.knowledge_base_id, categoryId, documentId, text: template.demoText });
          indexStatus = indexed.indexed ? "indexed" : "needs_embedding";
        } catch (error) {
          indexStatus = "failed"; warning = `演示资料已保存，但向量化失败：${error instanceof Error ? error.message : "Embedding 服务异常"}`;
          await runtime.DB.prepare("UPDATE knowledge_documents SET index_status = 'failed', updated_at = ? WHERE id = ? AND tenant_id = ?")
            .bind(new Date().toISOString(), documentId, context.tenantId).run();
        }
      } else indexStatus = existing.index_status;

      for (let index = 0; index < template.qualityCases.length; index += 1) {
        const item = template.qualityCases[index]; const caseId = `case_demo_${template.code}_${context.tenantId.slice(-10)}_${index + 1}`;
        await runtime.DB.prepare(`INSERT OR IGNORE INTO quality_test_cases
          (id, tenant_id, assistant_id, question, expected_answer, expected_document, should_refuse, active, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`)
          .bind(caseId, context.tenantId, assistant.id, item.question, item.expectedAnswer, template.demoDocumentName, item.shouldRefuse ? 1 : 0, now, now).run();
      }
    }

    const origin = new URL(request.url).origin; const publicUrl = `${origin}/chat/${publicId}`;
    return Response.json({
      completed: true,
      template: { code: template.code, name: template.name },
      demo: { requested: includeDemoData, created: demoCreated, indexStatus },
      widget: { published: publishWidget, publicUrl, embedCode: `<script src="${origin}/widget.js?publicId=${publicId}" async></script>` },
      warning,
    });
  } catch (error) { return routeError(error); }
}
