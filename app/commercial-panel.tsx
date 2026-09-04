"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type AssistantConfig = {
  id: string; publicId: string; publicEnabled: boolean; brandName: string; welcomeMessage: string; themeColor: string;
  leadCaptureEnabled: boolean; handoffEnabled: boolean; handoffLabel: string; industryTemplate: string;
  suggestedQuestions: string[]; allowedDomains: string[]; privacyNotice: string; privacyPolicyUrl: string;
  privacyVersion: string; retentionDays: number; version: number;
};
type AssistantCore = {
  id: string; name: string; modelAlias: string; knowledgeBaseId: string; systemPrompt: string; temperature: number;
  topK: number; qualityThreshold: number; fallbackMessage: string; version: number; updatedAt: string | null;
};
type KnowledgeBase = {
  id: string; name: string; description: string; isDefault: boolean; position: number; documentCount: number;
  categoryCount: number; assistantCount: number; createdAt: string;
};
type CommercialData = {
  assistant: AssistantConfig;
  templates: Array<{ code: string; name: string }>;
  summary: { conversations: number; resolved: number; grounded: number; unresolved: number; resolutionRate: number; leads: number; openTickets: number; pipelineCents: number; wonCents: number; revenueCents: number; costCents: number; grossProfitCents: number };
  plan: { code: string; name: string; widgetConversationQuota: number; leadQuota: number; features: string[] };
  monthly: { month: string; conversations: number; leads: number };
};
type Member = { id: string; email: string; displayName: string; role: string; status: string };

async function request<T>(url: string, init?: RequestInit) {
  const headers = new Headers(init?.headers);
  const tenantId = localStorage.getItem("knowflow_tenant_id");
  if (tenantId) headers.set("x-tenant-id", tenantId);
  const response = await fetch(url, { ...init, headers, cache: "no-store" });
  const data = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(data.error || `请求失败（${response.status}）`);
  return data;
}

function money(cents: number) {
  return new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY", maximumFractionDigits: 0 }).format(Number(cents || 0) / 100);
}

export default function CommercialPanel({ canAdmin, onNotice }: {
  canAdmin: boolean; members: Member[]; onNotice: (notice: { kind: "ok" | "error"; text: string }) => void;
}) {
  const [data, setData] = useState<CommercialData | null>(null);
  const [config, setConfig] = useState<AssistantConfig | null>(null);
  const [assistantCore, setAssistantCore] = useState<AssistantCore | null>(null);
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([]);
  const [knowledgeBaseId, setKnowledgeBaseId] = useState("");
  const [template, setTemplate] = useState("manufacturing_after_sales");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [commercial, bases, assistant] = await Promise.all([
      request<CommercialData>("/api/commercial"),
      request<{ activeKnowledgeBaseId: string; knowledgeBases: KnowledgeBase[] }>("/api/knowledge-bases"),
      request<AssistantCore>("/api/assistant"),
    ]);
    setData(commercial);
    setConfig(commercial.assistant);
    setTemplate(commercial.assistant.industryTemplate || commercial.templates[0]?.code || "manufacturing_after_sales");
    setKnowledgeBases(bases.knowledgeBases);
    setAssistantCore(assistant);
    setKnowledgeBaseId(assistant.knowledgeBaseId || bases.activeKnowledgeBaseId || bases.knowledgeBases[0]?.id || "");
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load().catch((error) => onNotice({ kind: "error", text: error instanceof Error ? error.message : "网站客服配置加载失败" })), 0);
    return () => window.clearTimeout(timer);
  }, [load, onNotice]);

  const origin = typeof window === "undefined" ? "https://your-site.example" : window.location.origin;
  const publicUrl = config?.publicId ? `${origin}/chat/${config.publicId}` : "";
  const embed = useMemo(() => `<script src="${origin}/widget.js?publicId=${config?.publicId || ""}" async></script>`, [origin, config?.publicId]);
  const selectedKnowledge = knowledgeBases.find((item) => item.id === knowledgeBaseId) || null;

  async function copy(value: string) {
    await navigator.clipboard.writeText(value);
    onNotice({ kind: "ok", text: "已复制到剪贴板。" });
  }

  async function writeAssistantBinding(core: AssistantCore, nextKnowledgeBaseId: string) {
    return request<AssistantCore>("/api/assistant", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: core.name,
        modelAlias: core.modelAlias,
        knowledgeBaseId: nextKnowledgeBaseId,
        systemPrompt: core.systemPrompt,
        temperature: core.temperature,
        topK: core.topK,
        qualityThreshold: core.qualityThreshold,
        fallbackMessage: core.fallbackMessage,
      }),
    });
  }

  async function applyKnowledgeBase() {
    if (!assistantCore || !knowledgeBaseId) return;
    setBusy("knowledge");
    try {
      const saved = await writeAssistantBinding(assistantCore, knowledgeBaseId);
      setAssistantCore(saved);
      onNotice({ kind: "ok", text: `网站客服已绑定“${selectedKnowledge?.name || "所选"}”知识库，后续 RAG 只从该知识库检索。` });
      await load();
    } catch (error) {
      onNotice({ kind: "error", text: error instanceof Error ? error.message : "知识库绑定失败" });
    } finally { setBusy(null); }
  }

  async function saveConfig(event: FormEvent) {
    event.preventDefault(); if (!config) return; setBusy("config");
    try {
      await request<{ message: string }>("/api/commercial", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "saveWidget", ...config }),
      });
      if (assistantCore && knowledgeBaseId && assistantCore.knowledgeBaseId !== knowledgeBaseId) await writeAssistantBinding(assistantCore, knowledgeBaseId);
      await load();
      onNotice({ kind: "ok", text: "官网客服设置和知识库绑定已一起保存并发布。" });
    } catch (error) {
      onNotice({ kind: "error", text: error instanceof Error ? error.message : "发布失败" });
    } finally { setBusy(null); }
  }

  async function applyTemplate() {
    if (!confirm("行业模板只调整客服话术、欢迎语和推荐问题；知识来源仍使用上方所选知识库。继续？")) return;
    setBusy("template");
    try {
      await request("/api/commercial", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "applyTemplate", template }),
      });
      const freshCore = await request<AssistantCore>("/api/assistant");
      if (knowledgeBaseId && freshCore.knowledgeBaseId !== knowledgeBaseId) await writeAssistantBinding(freshCore, knowledgeBaseId);
      await load();
      onNotice({ kind: "ok", text: "行业模板已应用；客服仍绑定你选择的知识库，不会切换知识来源。" });
    } catch (error) {
      onNotice({ kind: "error", text: error instanceof Error ? error.message : "模板应用失败" });
    } finally { setBusy(null); }
  }

  async function publishNow() {
    setBusy("publish");
    try {
      if (assistantCore && knowledgeBaseId && assistantCore.knowledgeBaseId !== knowledgeBaseId) await writeAssistantBinding(assistantCore, knowledgeBaseId);
      const result = await request<{ message: string }>("/api/commercial", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "publishNow" }),
      });
      await load(); onNotice({ kind: "ok", text: result.message });
    } catch (error) {
      onNotice({ kind: "error", text: error instanceof Error ? error.message : "发布失败" });
    } finally { setBusy(null); }
  }

  if (!data || !config || !assistantCore) return <section className="card commercial-loading"><span className="spinner dark"/> 正在加载网站客服配置…</section>;
  const leadAvailable = data.plan.features.includes("lead_capture");
  const handoffAvailable = data.plan.features.includes("handoff");

  return <>
    <section className="commercial-hero card">
      <div><p className="section-kicker">Website AI support</p><h2>网站 Widget：先选知识库，再发布客服</h2><p>网站客服的事实来源由知识库决定；行业模板只负责话术风格，不再替代知识库选择。</p></div>
      <div className="commercial-plan"><span>{data.plan.name}</span><b>{data.monthly.conversations}/{data.plan.widgetConversationQuota}</b><small>本月客服会话</small>{!config.publicEnabled && <button className="primary-button fit" onClick={() => void publishNow()} disabled={!canAdmin || busy === "publish"}>一键发布客服</button>}</div>
    </section>

    <section className="metric-grid commercial-metrics">
      <article><span>绑定知识库</span><strong>{selectedKnowledge?.name || "未选择"}</strong><small>{selectedKnowledge?.documentCount || 0} 个文档</small></article>
      <article><span>近 30 天会话</span><strong>{data.summary.conversations}</strong><small>{data.summary.resolutionRate}% 人工确认解决率</small></article>
      <article><span>销售线索</span><strong>{data.summary.leads}</strong><small>{data.monthly.leads}/{data.plan.leadQuota} 本月额度</small></article>
      <article><span>预计商机</span><strong>{money(data.summary.pipelineCents)}</strong><small>已成交 {money(data.summary.wonCents)}</small></article>
    </section>

    <div className="commercial-layout">
      <section className="card form-card">
        <div className="card-head"><div><p className="section-kicker">Knowledge binding</p><h2>官网客服发布设置</h2></div><span className={config.publicEnabled ? "live-badge" : "warn-badge"}>{config.publicEnabled ? "已上线" : "未公开"}</span></div>

        <div className="widget-kb-binding">
          <label>网站客服知识库<span>这是客服回答事实的唯一主要来源</span></label>
          <div className="template-row widget-kb-row"><select value={knowledgeBaseId} onChange={(event) => setKnowledgeBaseId(event.target.value)}>{knowledgeBases.map((item) => <option value={item.id} key={item.id}>{item.name} · {item.documentCount} 文档{item.isDefault ? " · 默认" : ""}</option>)}</select><button className="secondary-button" type="button" onClick={() => void applyKnowledgeBase()} disabled={!canAdmin || !knowledgeBaseId || busy === "knowledge"}>{busy === "knowledge" ? "应用中…" : "应用知识库"}</button></div>
          <p className="widget-kb-note">{selectedKnowledge?.description || "选择一个企业知识库。发布后，官网访客的问题会优先从这个知识库做 RAG 检索。"}</p>
        </div>

        <details className="industry-template-optional"><summary>行业模板（可选，只调整客服话术）</summary><div className="template-row"><select value={template} onChange={(event) => setTemplate(event.target.value)}>{data.templates.map((item) => <option value={item.code} key={item.code}>{item.name}</option>)}</select><button className="secondary-button" type="button" onClick={() => void applyTemplate()} disabled={!canAdmin || busy === "template"}>{busy === "template" ? "应用中…" : "应用行业模板"}</button></div></details>

        <form className="settings-form" onSubmit={saveConfig}>
          <label className="reuse-secret"><input type="checkbox" checked={config.publicEnabled} onChange={(event) => setConfig({ ...config, publicEnabled: event.target.checked })}/><span><b>公开官网智能客服</b><small>关闭后公开链接立即停止服务，历史会话和线索不会删除。</small></span></label>
          <div className="field-grid"><div><label>品牌 / 助手名称</label><input value={config.brandName} onChange={(event) => setConfig({ ...config, brandName: event.target.value })}/></div><div><label>主题颜色</label><input type="color" value={config.themeColor} onChange={(event) => setConfig({ ...config, themeColor: event.target.value })}/></div></div>
          <label>欢迎语</label><textarea rows={3} value={config.welcomeMessage} onChange={(event) => setConfig({ ...config, welcomeMessage: event.target.value })}/>
          <label>推荐问题<span>每行一个，最多 6 个</span></label><textarea rows={4} value={config.suggestedQuestions.join("\n")} onChange={(event) => setConfig({ ...config, suggestedQuestions: event.target.value.split("\n").map((item) => item.trim()).filter(Boolean).slice(0, 6) })}/>
          <div className="field-grid"><label className="reuse-secret"><input type="checkbox" checked={config.leadCaptureEnabled} onChange={(event) => setConfig({ ...config, leadCaptureEnabled: event.target.checked })}/><span><b>销售线索收集</b><small>{leadAvailable ? "收集公司、联系方式和采购需求" : "当前套餐未开放"}</small></span></label><label className="reuse-secret"><input type="checkbox" checked={config.handoffEnabled} onChange={(event) => setConfig({ ...config, handoffEnabled: event.target.checked })}/><span><b>转人工工单</b><small>{handoffAvailable ? "AI 无法回答时承接客户" : "当前套餐未开放"}</small></span></label></div>
          <label>人工按钮名称</label><input value={config.handoffLabel} onChange={(event) => setConfig({ ...config, handoffLabel: event.target.value })}/>
          <label>官网域名白名单<span>每行一个，例如 example.com 或 *.example.com；留空允许所有域名</span></label><textarea rows={3} value={config.allowedDomains.join("\n")} onChange={(event) => setConfig({ ...config, allowedDomains: event.target.value.split("\n").slice(0, 20) })}/>
          <label>隐私告知</label><textarea rows={3} value={config.privacyNotice} onChange={(event) => setConfig({ ...config, privacyNotice: event.target.value })}/>
          <div className="field-grid"><div><label>隐私政策 HTTPS 地址</label><input value={config.privacyPolicyUrl} onChange={(event) => setConfig({ ...config, privacyPolicyUrl: event.target.value })}/></div><div><label>客户数据保存天数</label><input type="number" min="30" max="1095" value={config.retentionDays} onChange={(event) => setConfig({ ...config, retentionDays: Number(event.target.value) })}/></div></div>
          <button className="primary-button" disabled={!canAdmin || busy === "config"}>{busy === "config" ? "发布中…" : "保存知识库并发布"}</button>
        </form>
      </section>

      <aside className="card widget-publish official-widget-publish">
        <div><p className="section-kicker">Same as official site</p><h2>右下角悬浮客服预览</h2></div>
        <div className="official-widget-preview">
          <div className="official-widget-preview-head"><img src="/brand/support-agent-v3.jpg" alt="客服"/><div><b>{config.brandName}</b><small>● AI 在线 · 知识库优先</small></div><span>×</span></div>
          <div className="official-widget-preview-tabs"><b>✦ AI 接待</b><span>◎ 转人工</span></div>
          <div className="official-widget-preview-body"><p>你好 👋</p><strong>{config.welcomeMessage}</strong><small>当前知识：{selectedKnowledge?.name || "未绑定"}</small></div>
          <div className="official-widget-preview-input">输入你的问题… <b>↑</b></div>
        </div>
        <p className="widget-preview-explain">外嵌脚本现在和官网使用同一套尺寸、圆角、阴影、真人客服头像与关闭后的头像悬浮球效果。</p>
        <label>公开测试链接</label><code>{publicUrl}</code>
        <div className="form-actions"><button className="secondary-button" onClick={() => void copy(publicUrl)}>复制链接</button><a className={`primary-button fit ${!config.publicEnabled ? "disabled" : ""}`} href={config.publicEnabled ? publicUrl : undefined} target="_blank" rel="noreferrer">打开测试</a></div>
        <label>官网悬浮组件代码</label><pre>{embed}</pre><button className="secondary-button full" onClick={() => void copy(embed)}>复制组件代码</button>
      </aside>
    </div>
  </>;
}
