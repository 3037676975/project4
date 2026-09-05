import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

function read(relative) {
  return fs.readFileSync(path.join(root, relative), "utf8");
}

function write(relative, value) {
  fs.writeFileSync(path.join(root, relative), value, "utf8");
}

function replaceRequired(source, from, to, label) {
  if (source.includes(to)) return source;
  if (!source.includes(from)) throw new Error(`[enterprise-consistency] 找不到补丁锚点：${label}`);
  return source.replace(from, to);
}

function patchDashboard() {
  const file = "app/dashboard.tsx";
  let source = read(file);

  source = replaceRequired(
    source,
    '  const response = await fetch(url, { ...init, headers }); const data = await response.json() as T & { error?: string };',
    '  const response = await fetch(url, { ...init, headers, cache: init?.cache ?? "no-store" }); const data = await response.json() as T & { error?: string };',
    "企业 API 禁止缓存",
  );

  source = replaceRequired(
    source,
    'function count(value: number) { return new Intl.NumberFormat("zh-CN", { notation: value > 9999 ? "compact" : "standard", maximumFractionDigits: 1 }).format(value || 0); }\nfunction date(value?: string | null) {',
    'function count(value: number) { return new Intl.NumberFormat("zh-CN", { notation: value > 9999 ? "compact" : "standard", maximumFractionDigits: 1 }).format(value || 0); }\nfunction moneyExact(cents: number) { return `¥${(Number(cents || 0) / 100).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }\nfunction date(value?: string | null) {',
    "企业套餐金额精确到分",
  );

  source = replaceRequired(
    source,
    '  const canAdmin = tenant?.currentUser.role === "owner" || tenant?.currentUser.role === "admin";\n  const indexedDocs = documents.filter((item) => item.indexStatus === "indexed").length;\n  const activePlan = billing?.plans.find((item) => item.code === billing.subscription?.plan.code);',
    '  useEffect(() => {\n    if (active !== "知识库" && active !== "套餐与账单") return;\n    let cancelled = false;\n    const refreshBilling = () => { void api<Billing>("/api/billing").then((next) => { if (!cancelled) setBilling(next); }).catch(() => undefined); };\n    refreshBilling();\n    const timer = window.setInterval(refreshBilling, 15000);\n    window.addEventListener("focus", refreshBilling);\n    return () => { cancelled = true; window.clearInterval(timer); window.removeEventListener("focus", refreshBilling); };\n  }, [active, tenant?.tenant.id]);\n\n  const canAdmin = tenant?.currentUser.role === "owner" || tenant?.currentUser.role === "admin";\n  const indexedDocs = documents.filter((item) => item.indexStatus === "indexed").length;\n  const activePlan = billing?.plans.find((item) => item.code === billing.subscription?.plan.code) || billing?.plans.find((item) => item.code === "free") || billing?.plans[0];\n  const storageQuotaBytes = Number(activePlan?.storageQuotaBytes || 0);\n  const storageUsedBytes = Number(billing?.usage.storageBytes || 0);\n  const storageRemainingBytes = Math.max(0, storageQuotaBytes - storageUsedBytes);\n  const storageUsedPercent = storageQuotaBytes ? Math.min(100, Math.round(storageUsedBytes / storageQuotaBytes * 100)) : 0;',
    "套餐/知识库实时刷新与存储额度",
  );

  const oldSelectPlan = '  async function selectPlan(code: string) { setBusy(`plan-${code}`); try { const data = await api<{ order: BillingOrder }>("/api/billing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "create_order", planCode: code, provider: paymentProvider || billing?.payment.provider, clientRequestId: createClientRequestId() }) }); if (data.order.provider === "sandbox") { if (confirm(`本地沙箱订单 ${data.order.orderNo} 已创建。现在模拟付款并验证幂等开通？`)) await api("/api/billing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "sandbox_confirm", orderNo: data.order.orderNo }) }); } else if (data.order.paymentUrl) setCheckoutOrder(data.order); setBilling(await api<Billing>("/api/billing")); setUsage(await api<Usage>("/api/usage")); setToast({ kind: "ok", text: data.order.provider === "sandbox" ? "沙箱付款完成，套餐已由订单履约程序开通。" : "订单已创建，请扫描二维码完成付款。" }); } catch (error) { setToast({ kind: "error", text: error instanceof Error ? error.message : "下单失败" }); } finally { setBusy(null); } }';
  const newSelectPlan = '  async function selectPlan(code: string) { setBusy(`plan-${code}`); try { const freshBilling = await api<Billing>("/api/billing"); const oldPlan = billing?.plans.find((item) => item.code === code); const freshPlan = freshBilling.plans.find((item) => item.code === code); setBilling(freshBilling); if (!freshPlan || freshPlan.monthlyPriceCents <= 0) throw new Error("套餐已下架或当前不可购买，请刷新后重试。"); if (oldPlan && oldPlan.monthlyPriceCents !== freshPlan.monthlyPriceCents) { setToast({ kind: "error", text: `平台刚刚更新了套餐价格：${moneyExact(oldPlan.monthlyPriceCents)} → ${moneyExact(freshPlan.monthlyPriceCents)}。页面已同步最新价格，请确认后重新点击购买。` }); return; } const data = await api<{ order: BillingOrder }>("/api/billing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "create_order", planCode: code, provider: paymentProvider || freshBilling.payment.provider, clientRequestId: createClientRequestId() }) }); if (data.order.amountCents !== freshPlan.monthlyPriceCents) { setCheckoutOrder(null); throw new Error(`订单金额 ${moneyExact(data.order.amountCents)} 与当前套餐标价 ${moneyExact(freshPlan.monthlyPriceCents)} 不一致，已阻止继续付款。`); } if (data.order.provider === "sandbox") { if (confirm(`本地沙箱订单 ${data.order.orderNo} 已创建。现在模拟付款并验证幂等开通？`)) await api("/api/billing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "sandbox_confirm", orderNo: data.order.orderNo }) }); } else if (data.order.paymentUrl) setCheckoutOrder(data.order); setBilling(await api<Billing>("/api/billing")); setUsage(await api<Usage>("/api/usage")); setToast({ kind: "ok", text: data.order.provider === "sandbox" ? "沙箱付款完成，套餐已由订单履约程序开通。" : `订单已创建，实付金额 ${moneyExact(data.order.amountCents)}，请扫描二维码完成付款。` }); } catch (error) { setToast({ kind: "error", text: error instanceof Error ? error.message : "下单失败" }); } finally { setBusy(null); } }';
  source = replaceRequired(source, oldSelectPlan, newSelectPlan, "下单前价格二次校验");

  source = replaceRequired(
    source,
    '{plan.monthlyPriceCents ? `¥${(plan.monthlyPriceCents / 100).toFixed(0)}` : "免费"}<small>/ 月</small>',
    '{plan.monthlyPriceCents ? moneyExact(plan.monthlyPriceCents) : "免费"}<small>/ 月</small>',
    "套餐卡金额显示",
  );

  source = replaceRequired(
    source,
    '<p>当前租户只能选择自己的知识库，助手也可独立绑定其中一个。</p></div><div className="kb-selector">',
    '<p>当前租户只能选择自己的知识库，助手也可独立绑定其中一个。</p></div>{storageQuotaBytes > 0 && <div title={`当前套餐 ${activePlan?.name || "—"}：已用 ${bytes(storageUsedBytes)} / ${bytes(storageQuotaBytes)}`} style={{ minWidth: 210, padding: "10px 12px", borderRadius: 14, border: "1px solid #dbe7f4", background: "linear-gradient(135deg,#f8fbff,#f4f8ff)" }}><span style={{ display: "block", color: "#64748b", fontSize: 10, fontWeight: 700 }}>知识库存储 · {activePlan?.name || "当前套餐"}</span><b style={{ display: "block", marginTop: 3, color: storageUsedPercent >= 90 ? "#c2410c" : "#0f172a", fontSize: 16 }}>剩余 {bytes(storageRemainingBytes)}</b><small style={{ display: "block", marginTop: 2, color: "#64748b" }}>已用 {bytes(storageUsedBytes)} / {bytes(storageQuotaBytes)} · {storageUsedPercent}%</small><i style={{ display: "block", height: 5, marginTop: 7, overflow: "hidden", borderRadius: 999, background: "#e2e8f0" }}><em style={{ display: "block", width: `${storageUsedPercent}%`, height: "100%", borderRadius: 999, background: storageUsedPercent >= 90 ? "#f97316" : "#2563eb" }}/></i></div>}<div className="kb-selector">',
    "知识库页存储额度卡片",
  );

  source = replaceRequired(
    source,
    '{label}{label === "客服中心" && (customerServiceBadge.unread > 0 || customerServiceBadge.waiting > 0) &&',
    '{label}{label === "知识库" && storageQuotaBytes > 0 && <span title={`知识库存储：已用 ${bytes(storageUsedBytes)} / ${bytes(storageQuotaBytes)}`} style={{ marginLeft: "auto", padding: "2px 6px", borderRadius: 999, background: storageUsedPercent >= 90 ? "#fff1e8" : "#eef5ff", color: storageUsedPercent >= 90 ? "#c2410c" : "#2563eb", fontSize: 8, fontWeight: 850, whiteSpace: "nowrap" }}>剩 {bytes(storageRemainingBytes)}</span>}{label === "客服中心" && (customerServiceBadge.unread > 0 || customerServiceBadge.waiting > 0) &&',
    "侧栏知识库剩余空间",
  );

  write(file, source);
}

function patchCommercialPanel() {
  const file = "app/commercial-panel.tsx";
  let source = read(file);
  source = replaceRequired(
    source,
    '<div className="official-widget-preview-head"><img src="/brand/support-agent-v3.jpg" alt="客服"/>',
    '<div className="official-widget-preview-head"><img src="/brand/support-agent.jpg" alt="客服"/>',
    "企业 Widget 预览头像与官网一致",
  );
  write(file, source);
}

function patchBillingApi() {
  const file = "app/api/billing/route.ts";
  let source = read(file);
  source = replaceRequired(
    source,
    '(SELECT COALESCE(SUM(char_count * 2), 0) FROM knowledge_documents WHERE tenant_id = ?) AS storage_bytes,',
    '(SELECT COALESCE(SUM(CASE WHEN storage_bytes > 0 THEN storage_bytes ELSE char_count * 2 END), 0) FROM knowledge_documents WHERE tenant_id = ?) AS storage_bytes,',
    "账单存储用量按真实文件字节统计",
  );
  write(file, source);
}

function patchKnowledgeApi() {
  const file = "app/api/knowledge/route.ts";
  let source = read(file);
  source = replaceRequired(
    source,
    'const stored = await runtime.DB.prepare("SELECT COALESCE(SUM(char_count * 2), 0) AS used FROM knowledge_documents WHERE tenant_id = ?")',
    'const stored = await runtime.DB.prepare("SELECT COALESCE(SUM(CASE WHEN storage_bytes > 0 THEN storage_bytes ELSE char_count * 2 END), 0) AS used FROM knowledge_documents WHERE tenant_id = ?")',
    "上传前存储额度检查",
  );
  source = replaceRequired(
    source,
    '} else { originalBytes = new TextEncoder().encode(pastedText).buffer; mimeType = "text/plain"; }\n    extracted = extracted.replace(/\\u0000/g, "").trim();',
    '} else { originalBytes = new TextEncoder().encode(pastedText).buffer; mimeType = "text/plain"; }\n    const storageBytes = originalBytes.byteLength;\n    extracted = extracted.replace(/\\u0000/g, "").trim();',
    "保存原文件字节数",
  );
  source = replaceRequired(
    source,
    'object_key, extracted_text, char_count,\n         page_count, status, index_status, chunk_count, ocr_used, created_at, updated_at)',
    'object_key, extracted_text, char_count, storage_bytes,\n         page_count, status, index_status, chunk_count, ocr_used, created_at, updated_at)',
    "知识文档 storage_bytes 字段",
  );
  source = replaceRequired(
    source,
    "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ready', 'indexing', 0, ?, ?, ?)",
    "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ready', 'indexing', 0, ?, ?, ?)",
    "知识文档 storage_bytes 占位符",
  );
  source = replaceRequired(
    source,
    '.bind(id, context.tenantId, kb.id, categoryId, position, name, mimeType, objectKey, extracted, extracted.length, pageCount, ocrUsed ? 1 : 0, now, now).run();',
    '.bind(id, context.tenantId, kb.id, categoryId, position, name, mimeType, objectKey, extracted, extracted.length, storageBytes, pageCount, ocrUsed ? 1 : 0, now, now).run();',
    "知识文档 storage_bytes 写入",
  );
  write(file, source);
}

function patchPlatformApi() {
  const file = "app/api/platform/route.ts";
  let source = read(file);
  source = replaceRequired(
    source,
    '(SELECT COUNT(*) FROM knowledge_documents kd WHERE kd.tenant_id = t.id) AS document_count,\n        (SELECT p.name FROM subscriptions s JOIN plans p ON p.id = s.plan_id WHERE s.tenant_id = t.id AND s.status = \'active\' ORDER BY s.created_at DESC LIMIT 1) AS plan_name,',
    '(SELECT COUNT(*) FROM knowledge_documents kd WHERE kd.tenant_id = t.id) AS document_count,\n        (SELECT COALESCE(SUM(CASE WHEN kd.storage_bytes > 0 THEN kd.storage_bytes ELSE kd.char_count * 2 END), 0) FROM knowledge_documents kd WHERE kd.tenant_id = t.id) AS storage_used_bytes,\n        (SELECT p.storage_quota_bytes FROM subscriptions s JOIN plans p ON p.id = s.plan_id WHERE s.tenant_id = t.id AND s.status = \'active\' ORDER BY s.created_at DESC LIMIT 1) AS storage_quota_bytes,\n        (SELECT p.name FROM subscriptions s JOIN plans p ON p.id = s.plan_id WHERE s.tenant_id = t.id AND s.status = \'active\' ORDER BY s.created_at DESC LIMIT 1) AS plan_name,',
    "平台租户存储用量与额度",
  );
  write(file, source);
}

function patchPlatformDashboard() {
  const file = "app/platform/platform-dashboard.tsx";
  let source = read(file);
  source = replaceRequired(
    source,
    'type TenantRow = { id: string; name: string; slug: string; status: string; credits_balance: number; company_name: string; billing_email: string; created_at: string; member_count: number; document_count: number; plan_name: string | null; plan_code: string | null; revenue_cents: number };',
    'type TenantRow = { id: string; name: string; slug: string; status: string; credits_balance: number; company_name: string; billing_email: string; created_at: string; member_count: number; document_count: number; storage_used_bytes: number; storage_quota_bytes: number | null; plan_name: string | null; plan_code: string | null; revenue_cents: number };',
    "平台租户存储类型",
  );
  source = replaceRequired(
    source,
    'function compact(value: number) { return new Intl.NumberFormat("zh-CN", { notation: Number(value) > 9999 ? "compact" : "standard", maximumFractionDigits: 1 }).format(Number(value || 0)); }\nfunction localDate',
    'function compact(value: number) { return new Intl.NumberFormat("zh-CN", { notation: Number(value) > 9999 ? "compact" : "standard", maximumFractionDigits: 1 }).format(Number(value || 0)); }\nfunction storageLabel(value: number) { if (value >= 1073741824) return `${(value / 1073741824).toFixed(1)} GB`; if (value >= 1048576) return `${(value / 1048576).toFixed(1)} MB`; return `${Math.max(0, Math.round(value / 1024))} KB`; }\nfunction localDate',
    "平台存储格式化",
  );
  source = replaceRequired(
    source,
    '<span>{tenant.member_count} / {tenant.document_count}<small>成员 / 文档</small></span>',
    '<span>{tenant.member_count} / {tenant.document_count}<small>成员 / 文档 · 存储 {storageLabel(Number(tenant.storage_used_bytes || 0))} / {storageLabel(Number(tenant.storage_quota_bytes || 0))}</small></span>',
    "平台租户列表显示存储额度",
  );
  write(file, source);
}

function patchSchema() {
  const file = "db/schema.ts";
  let source = read(file);
  source = replaceRequired(
    source,
    'extractedText: text("extracted_text").notNull(), charCount: integer("char_count").notNull(), pageCount: integer("page_count"),',
    'extractedText: text("extracted_text").notNull(), charCount: integer("char_count").notNull(), storageBytes: integer("storage_bytes").notNull().default(0), pageCount: integer("page_count"),',
    "Drizzle knowledge_documents.storage_bytes",
  );
  write(file, source);
}

patchDashboard();
patchCommercialPanel();
patchBillingApi();
patchKnowledgeApi();
patchPlatformApi();
patchPlatformDashboard();
patchSchema();
console.log("[enterprise-consistency] price/avatar/storage patches applied");
