"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type WidgetConfig = { enabled: boolean; autoOpen: boolean; title: string; welcomeMessage: string; quickQuestions: string[] };
type SupportKnowledge = {
  available: boolean;
  tenantId: string;
  tenantName: string;
  assistantId: string;
  knowledgeBaseId: string;
  knowledgeBases: Array<{
    id: string; name: string; description: string; isDefault: boolean; position: number; documentCount: number; categoryCount: number;
  }>;
};
type KnowledgeDocument = {
  id: string; name: string; mimeType: string; charCount: number; status: string; indexStatus: string; chunkCount: number;
  builtIn: boolean; createdAt: string;
};
type MailConfig = {
  enabled: boolean; host: string; port: number; username: string; passwordConfigured: boolean; passwordHint: string | null;
  fromEmail: string; fromName: string; useSsl: boolean; useStarttls: boolean; relayUrl: string; relayTokenConfigured: boolean;
  relayTokenHint: string | null; relayReady: boolean; directSmtpReady: boolean; deliveryReady: boolean; deliveryMode: "direct_smtp" | "https_relay";
  codeExpiryMinutes: number; resendSeconds: number; maxAttempts: number;
  codeLength: number; orderNotifications: boolean; source: string; updatedAt: string | null;
  homepageWidget: WidgetConfig; supportEmailAllowed: boolean; supportKnowledge: SupportKnowledge;
};

async function api<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, { ...init, cache: "no-store" });
  const data = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(data.error || `请求失败（${response.status}）`);
  return data;
}

async function tenantApi<T>(tenantId: string, url: string, init?: RequestInit) {
  const headers = new Headers(init?.headers);
  headers.set("x-tenant-id", tenantId);
  const response = await fetch(url, { ...init, headers, cache: "no-store" });
  const data = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(data.error || `请求失败（${response.status}）`);
  return data;
}

function chars(value: number) {
  return new Intl.NumberFormat("zh-CN", { notation: value > 9999 ? "compact" : "standard", maximumFractionDigits: 1 }).format(Number(value || 0));
}

export default function MailSettings() {
  const [config, setConfig] = useState<MailConfig | null>(null);
  const [password, setPassword] = useState("");
  const [relayToken, setRelayToken] = useState("");
  const [testEmail, setTestEmail] = useState("");
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [quickQuestionsText, setQuickQuestionsText] = useState("");
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [feedFile, setFeedFile] = useState<File | null>(null);
  const [feedName, setFeedName] = useState("");
  const [feedText, setFeedText] = useState("");

  const loadDocuments = useCallback(async (tenantId: string, knowledgeBaseId: string) => {
    if (!tenantId || !knowledgeBaseId) { setDocuments([]); return; }
    const data = await tenantApi<{ documents: KnowledgeDocument[] }>(tenantId, `/api/knowledge?knowledgeBaseId=${encodeURIComponent(knowledgeBaseId)}`);
    setDocuments(data.documents || []);
  }, []);

  const load = useCallback(async () => {
    const data = await api<MailConfig>("/api/platform/mail");
    setConfig(data);
    setQuickQuestionsText(data.homepageWidget.quickQuestions.join("\n"));
    if (data.supportKnowledge.available && data.supportKnowledge.tenantId && data.supportKnowledge.knowledgeBaseId) {
      await loadDocuments(data.supportKnowledge.tenantId, data.supportKnowledge.knowledgeBaseId);
    } else setDocuments([]);
  }, [loadDocuments]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load().catch((error) => setNotice({ kind: "error", text: error instanceof Error ? error.message : "邮件与客服配置加载失败" })), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  function update(patch: Partial<MailConfig>) { setConfig((current) => current ? { ...current, ...patch } : current); }
  function updateWidget(patch: Partial<WidgetConfig>) { setConfig((current) => current ? { ...current, homepageWidget: { ...current.homepageWidget, ...patch } } : current); }
  function updateSupportKnowledge(patch: Partial<SupportKnowledge>) { setConfig((current) => current ? { ...current, supportKnowledge: { ...current.supportKnowledge, ...patch } } : current); }

  async function save(event: FormEvent) {
    event.preventDefault(); if (!config) return; setBusy("save"); setNotice(null);
    try {
      const saved = await api<MailConfig>("/api/platform/mail", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "save", ...config, password, relayToken }),
      });
      setConfig(saved); setPassword(""); setRelayToken("");
      setNotice({ kind: "ok", text: saved.deliveryReady ? `邮件配置已保存，当前使用${saved.deliveryMode === "direct_smtp" ? "直接 SMTP" : "HTTPS 中继"}发送。` : "SMTP 参数已保存，但发送条件尚不完整。" });
    } catch (error) { setNotice({ kind: "error", text: error instanceof Error ? error.message : "保存失败" }); }
    finally { setBusy(""); }
  }

  async function saveSupportSettings(event: FormEvent) {
    event.preventDefault(); if (!config) return; setBusy("support"); setNotice(null);
    const quickQuestions = quickQuestionsText.split(/\n|,/).map((item) => item.trim()).filter(Boolean).slice(0, 8);
    try {
      const saved = await api<MailConfig>("/api/platform/mail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "support_settings",
          homepageWidget: { ...config.homepageWidget, quickQuestions },
          supportEmailAllowed: config.supportEmailAllowed,
          supportKnowledge: { knowledgeBaseId: config.supportKnowledge.knowledgeBaseId },
        }),
      });
      setConfig(saved);
      setQuickQuestionsText(saved.homepageWidget.quickQuestions.join("\n"));
      if (saved.supportKnowledge.available) await loadDocuments(saved.supportKnowledge.tenantId, saved.supportKnowledge.knowledgeBaseId);
      setNotice({ kind: "ok", text: "全局客服配置已保存；官网客服现在会从所选知识库检索回答。" });
    } catch (error) { setNotice({ kind: "error", text: error instanceof Error ? error.message : "客服全局配置保存失败" }); }
    finally { setBusy(""); }
  }

  async function switchKnowledgeBase(id: string) {
    if (!config?.supportKnowledge.tenantId) return;
    updateSupportKnowledge({ knowledgeBaseId: id });
    setBusy("knowledge-load");
    try { await loadDocuments(config.supportKnowledge.tenantId, id); }
    catch (error) { setNotice({ kind: "error", text: error instanceof Error ? error.message : "知识库加载失败" }); }
    finally { setBusy(""); }
  }

  async function feedKnowledge(event: FormEvent) {
    event.preventDefault();
    if (!config?.supportKnowledge.available || !config.supportKnowledge.tenantId || !config.supportKnowledge.knowledgeBaseId) return;
    if (!feedFile && feedText.trim().length < 10) return setNotice({ kind: "error", text: "请选择文件，或粘贴至少 10 个字符的知识内容。" });
    setBusy("feed"); setNotice(null);
    try {
      const form = new FormData();
      form.set("knowledgeBaseId", config.supportKnowledge.knowledgeBaseId);
      form.set("recognitionMode", "auto");
      if (feedName.trim()) form.set("name", feedName.trim());
      if (feedFile) form.set("file", feedFile);
      else form.set("text", feedText.trim());
      const result = await tenantApi<{ document: KnowledgeDocument; warning?: string | null }>(config.supportKnowledge.tenantId, "/api/knowledge", { method: "POST", body: form });
      setFeedFile(null); setFeedName(""); setFeedText("");
      await load();
      setNotice({ kind: result.warning ? "error" : "ok", text: result.warning || `“${result.document.name}”已投喂并进入 RAG 索引。` });
    } catch (error) { setNotice({ kind: "error", text: error instanceof Error ? error.message : "知识投喂失败" }); }
    finally { setBusy(""); }
  }

  async function removeDocument(item: KnowledgeDocument) {
    if (!config?.supportKnowledge.available || item.builtIn || !confirm(`删除知识文档“${item.name}”？删除后官网客服将不再检索该内容。`)) return;
    setBusy(`doc-${item.id}`); setNotice(null);
    try {
      await tenantApi(config.supportKnowledge.tenantId, `/api/knowledge?id=${encodeURIComponent(item.id)}`, { method: "DELETE" });
      await load(); setNotice({ kind: "ok", text: "知识文档已删除并从检索范围移除。" });
    } catch (error) { setNotice({ kind: "error", text: error instanceof Error ? error.message : "删除失败" }); }
    finally { setBusy(""); }
  }

  async function test() {
    if (!testEmail.trim()) return setNotice({ kind: "error", text: "请输入测试收件邮箱。" });
    setBusy("test"); setNotice(null);
    try {
      const data = await api<{ message: string }>("/api/platform/mail", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "test", to: testEmail }) });
      setNotice({ kind: "ok", text: data.message });
    } catch (error) { setNotice({ kind: "error", text: error instanceof Error ? error.message : "测试发送失败" }); }
    finally { setBusy(""); }
  }

  const activeKnowledge = useMemo(() => config?.supportKnowledge.knowledgeBases.find((item) => item.id === config.supportKnowledge.knowledgeBaseId) || null, [config]);

  if (!config) return <div className="source-empty platform-loading">正在读取邮件与客服全局配置…</div>;
  return <div className="mail-settings-page">
    {notice && <div className={`toast ${notice.kind}`}><span>{notice.kind === "ok" ? "✓" : "!"}</span>{notice.text}<button onClick={() => setNotice(null)}>×</button></div>}

    <section className="card mail-service-head"><div><p className="section-kicker">GLOBAL SUPPORT CONTROL</p><h2>全局官网客服、知识库与邮件服务</h2><p>超级管理员统一控制官网客服显示、回答知识范围，以及企业是否可以使用平台 SMTP 接收工单通知。</p></div><span className={config.homepageWidget.enabled ? "live-badge" : "warn-badge"}>{config.homepageWidget.enabled ? "官网客服已启用" : "官网客服已关闭"}</span></section>

    <form className="card settings-form mail-settings-form" onSubmit={saveSupportSettings}>
      <div className="card-head"><div><p className="section-kicker">WEBSITE WIDGET</p><h2>全局 AI 客服配置</h2></div></div>
      <section className="mail-toggle-grid"><label className="reuse-secret"><input type="checkbox" checked={config.homepageWidget.enabled} onChange={(event) => updateWidget({ enabled: event.target.checked })}/><span><b>启用全局客服 Widget</b><small>关闭后官网和站内页面都不显示平台客服入口。</small></span></label><label className="reuse-secret"><input type="checkbox" checked={config.homepageWidget.autoOpen} onChange={(event) => updateWidget({ autoOpen: event.target.checked })}/><span><b>首次访问默认展开</b><small>用户关闭后记住状态，不会每次切页面重复弹出。</small></span></label></section>
      <div className="field-grid"><div><label>客服名称</label><input value={config.homepageWidget.title} onChange={(event) => updateWidget({ title: event.target.value })}/></div><div><label>企业客服邮件权限</label><label className="reuse-secret"><input type="checkbox" checked={config.supportEmailAllowed} onChange={(event) => update({ supportEmailAllowed: event.target.checked })}/><span><b>允许企业绑定客服邮箱</b><small>企业开启后，新工单/转人工/SLA 使用平台 SMTP 发送。</small></span></label></div></div>
      <label>默认欢迎语</label><textarea rows={3} value={config.homepageWidget.welcomeMessage} onChange={(event) => updateWidget({ welcomeMessage: event.target.value })}/>
      <label>快捷问题（每行一个，最多 8 个）</label><textarea rows={4} value={quickQuestionsText} onChange={(event) => setQuickQuestionsText(event.target.value)} placeholder={'了解套餐\n预约演示\nRAG 怎么用\n支持私有化吗'}/>

      <fieldset className="merchant-fieldset global-support-kb-select"><legend>全局客服回答知识库</legend>
        {config.supportKnowledge.available ? <><label>选择知识库<span>官网右下角客服会使用该知识库做 RAG</span></label><select value={config.supportKnowledge.knowledgeBaseId} onChange={(event) => void switchKnowledgeBase(event.target.value)}>{config.supportKnowledge.knowledgeBases.map((item) => <option value={item.id} key={item.id}>{item.name} · {item.documentCount} 文档{item.isDefault ? " · 默认" : ""}</option>)}</select><p>所属工作区：<b>{config.supportKnowledge.tenantName}</b>。当前选择：<b>{activeKnowledge?.name || "未选择"}</b>。保存后立即成为平台官网客服的事实知识来源。</p></> : <div className="source-empty">当前超级管理员还没有可绑定的企业工作区/助手。请先在企业工作台初始化助手和知识库。</div>}
      </fieldset>
      <div className="form-actions"><button className="primary-button fit" disabled={busy === "support"}>{busy === "support" ? "保存中…" : "保存全局客服配置"}</button></div>
    </form>

    <section className="card global-support-knowledge">
      <div className="card-head"><div><p className="section-kicker">KNOWLEDGE FEEDING</p><h2>全局客服知识库投喂管理</h2><p>上传文档或粘贴文本后，直接进入当前全局客服知识库的解析、切片、Embedding 与检索链路。</p></div><span className={config.supportKnowledge.available ? "live-badge" : "warn-badge"}>{documents.length} 文档</span></div>
      {config.supportKnowledge.available ? <>
        <div className="global-knowledge-toolbar"><div><span>当前知识库</span><b>{activeKnowledge?.name || "未选择"}</b><small>{activeKnowledge?.description || "平台官网客服专用知识范围"}</small></div><button type="button" className="secondary-button" disabled={busy === "knowledge-load"} onClick={() => void loadDocuments(config.supportKnowledge.tenantId, config.supportKnowledge.knowledgeBaseId)}>刷新文档</button></div>
        <form className="global-knowledge-feed" onSubmit={feedKnowledge}>
          <div><label>上传知识文件</label><input type="file" accept=".pdf,.docx,.xlsx,.pptx,.png,.jpg,.jpeg,.webp,.txt,.md,.csv,.json" onChange={(event) => setFeedFile(event.target.files?.[0] || null)}/><small>支持 PDF / Word / Excel / PPT / 图片 / TXT / Markdown / CSV / JSON，单文件最大 12 MB。</small></div>
          <div><label>文档名称（可选）</label><input value={feedName} onChange={(event) => setFeedName(event.target.value)} placeholder={feedFile?.name || "例如：KnowFlow 产品与售后手册"}/></div>
          <div className="global-feed-text"><label>或直接粘贴知识内容</label><textarea rows={6} value={feedText} onChange={(event) => setFeedText(event.target.value)} disabled={Boolean(feedFile)} placeholder="可以直接粘贴产品价格、功能说明、售后规则、部署说明、FAQ 等真实资料…"/></div>
          <button className="primary-button fit" disabled={busy === "feed" || (!feedFile && feedText.trim().length < 10)}>{busy === "feed" ? "解析与索引中…" : "投喂并索引"}</button>
        </form>
        <div className="global-knowledge-docs">{documents.length ? documents.map((item) => <article key={item.id}><div><b>{item.name}</b><small>{item.mimeType} · {chars(item.charCount)} 字符 · {item.chunkCount} chunks</small></div><span className={`knowledge-index-state ${item.indexStatus}`}>{item.indexStatus === "indexed" ? "已索引" : item.indexStatus === "needs_embedding" ? "待向量化" : item.indexStatus === "indexing" ? "索引中" : item.indexStatus}</span>{item.builtIn ? <em>内置</em> : <button type="button" className="ghost-danger" disabled={busy === `doc-${item.id}`} onClick={() => void removeDocument(item)}>删除</button>}</article>) : <div className="source-empty">这个知识库还没有文档。投喂第一份真实资料后，官网客服才不会“瞎回答”。</div>}</div>
      </> : <div className="source-empty">先创建并绑定一个企业工作区知识库，才能在这里投喂全局客服资料。</div>}
    </section>

    <section className="card mail-service-head"><div><p className="section-kicker">SMTP & VERIFICATION</p><h2>SMTP 邮件与验证码</h2><p>统一管理注册验证码、邮箱登录、订单通知与客服运营通知。企业账号不能查看或修改 SMTP 授权码。</p></div><span className={config.enabled && config.deliveryReady ? "live-badge" : "warn-badge"}>{config.enabled && config.deliveryReady ? `发送就绪 · ${config.deliveryMode === "direct_smtp" ? "直接 SMTP" : "HTTPS 中继"}` : "待配置"}</span></section>
    <form className="card settings-form mail-settings-form" onSubmit={save}>
      <section className="mail-toggle-grid"><label className="reuse-secret"><input type="checkbox" checked={config.enabled} onChange={(event) => update({ enabled: event.target.checked })}/><span><b>启用邮件发送</b><small>关闭后注册、邮箱验证码与客服邮件通知都会暂停。</small></span></label><label className="reuse-secret"><input type="checkbox" checked={config.orderNotifications} onChange={(event) => update({ orderNotifications: event.target.checked })}/><span><b>启用订单邮件通知</b><small>支付、续费和退款状态变化可通知企业账单邮箱。</small></span></label></section>
      <div className="field-grid"><div><label>SMTP 主机</label><input value={config.host} onChange={(event) => update({ host: event.target.value })}/></div><div><label>SMTP 端口</label><input type="number" min="1" max="65535" value={config.port} onChange={(event) => update({ port: Number(event.target.value) })}/></div><div><label>SMTP 用户名</label><input type="email" value={config.username} onChange={(event) => update({ username: event.target.value })} autoComplete="off"/></div><div><label>SMTP 授权码<span>{config.passwordConfigured ? `已配置 ${config.passwordHint || ""}；留空不修改` : "不是邮箱登录密码"}</span></label><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder={config.passwordConfigured ? "留空保留现有授权码" : "填写 SMTP 授权码"} autoComplete="new-password"/></div><div><label>发件邮箱</label><input type="email" value={config.fromEmail} onChange={(event) => update({ fromEmail: event.target.value })}/></div><div><label>发件人名称</label><input value={config.fromName} onChange={(event) => update({ fromName: event.target.value })}/></div></div>
      <div className="mail-protocol-row"><label className="reuse-secret"><input type="checkbox" checked={config.useSsl} onChange={(event) => update({ useSsl: event.target.checked, ...(event.target.checked ? { useStarttls: false } : {}) })}/><span><b>启用 SSL</b><small>QQ 邮箱 465 端口推荐</small></span></label><label className="reuse-secret"><input type="checkbox" checked={config.useStarttls} onChange={(event) => update({ useStarttls: event.target.checked, ...(event.target.checked ? { useSsl: false } : {}) })}/><span><b>启用 STARTTLS</b><small>通常用于 587 端口</small></span></label></div>
      <fieldset className="merchant-fieldset"><legend>HTTPS 邮件中继（可选）</legend><p className="mail-relay-note">托管站点默认通过 Cloudflare TCP Sockets 直接连接 465/587；Linux、Windows 私有部署也可使用内置中继。只有填写完整地址和令牌时才切换到中继。</p><label>中继发送地址</label><input type="url" value={config.relayUrl} onChange={(event) => update({ relayUrl: event.target.value })} placeholder="留空使用直接 SMTP"/><label>中继访问令牌<span>{config.relayTokenConfigured ? `已配置 ${config.relayTokenHint || ""}；留空不修改` : "仅使用中继时填写"}</span></label><input type="password" value={relayToken} onChange={(event) => setRelayToken(event.target.value)} placeholder={config.relayTokenConfigured ? "留空保留现有令牌" : "可选中继令牌"} autoComplete="new-password"/></fieldset>
      <fieldset className="merchant-fieldset"><legend>验证码策略</legend><div className="verification-policy-grid"><div><label>过期时间（分钟）</label><input type="number" min="1" max="30" value={config.codeExpiryMinutes} onChange={(event) => update({ codeExpiryMinutes: Number(event.target.value) })}/></div><div><label>重发间隔（秒）</label><input type="number" min="30" max="600" value={config.resendSeconds} onChange={(event) => update({ resendSeconds: Number(event.target.value) })}/></div><div><label>最大尝试次数</label><input type="number" min="1" max="10" value={config.maxAttempts} onChange={(event) => update({ maxAttempts: Number(event.target.value) })}/></div><div><label>验证码长度</label><input type="number" min="4" max="8" value={config.codeLength} onChange={(event) => update({ codeLength: Number(event.target.value) })}/></div></div></fieldset>
      <div className="form-actions"><button className="primary-button fit" disabled={busy === "save"}>{busy === "save" ? "保存中…" : "保存邮件配置"}</button><span className="config-source">当前来源：{config.source === "environment" ? "部署环境密钥" : config.source === "database" ? "超级管理员配置" : "默认参数"}</span></div>
    </form>
    <section className="card mail-test-card"><div><p className="section-kicker">DELIVERY TEST</p><h2>测试发送</h2><p>保存后向指定邮箱发送一封真实测试邮件，同时校验 SMTP 与中继。</p></div><div className="mail-test-action"><input type="email" value={testEmail} onChange={(event) => setTestEmail(event.target.value)} placeholder="输入收件邮箱"/><button className="secondary-button" type="button" disabled={busy === "test" || !config.enabled} onClick={() => void test()}>{busy === "test" ? "发送中…" : "发送测试邮件"}</button></div></section>
  </div>;
}
