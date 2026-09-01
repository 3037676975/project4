"use client";

import { useEffect, useMemo, useState } from "react";

type Template = {
  code: string;
  name: string;
  description: string;
  icon: string;
  themeColor: string;
  questions: string[];
  demoDocumentName: string;
};

type Result = {
  completed: boolean;
  template: { code: string; name: string };
  demo: { requested: boolean; created: boolean; indexStatus: string };
  widget: { published: boolean; publicUrl: string; embedCode: string };
  warning?: string | null;
};

function tenantHeaders(init?: HeadersInit) {
  const headers = new Headers(init); const tenantId = localStorage.getItem("knowflow_tenant_id");
  if (tenantId) headers.set("x-tenant-id", tenantId); return headers;
}

async function call<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, { ...init, headers: tenantHeaders(init?.headers) });
  const data = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(data.error || `请求失败（${response.status}）`);
  return data;
}

export default function OnboardingWizard({
  open,
  companyName,
  billingEmail,
  canAdmin,
  onClose,
  onCompleted,
}: {
  open: boolean;
  companyName: string;
  billingEmail: string;
  canAdmin: boolean;
  onClose: () => void;
  onCompleted: (result: Result) => void | Promise<void>;
}) {
  const [step, setStep] = useState(1); const [templates, setTemplates] = useState<Template[]>([]);
  const [name, setName] = useState(companyName); const [email, setEmail] = useState(billingEmail);
  const [template, setTemplate] = useState("manufacturing_after_sales"); const [includeDemoData, setIncludeDemoData] = useState(true);
  const [publishWidget, setPublishWidget] = useState(true); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  useEffect(() => {
    if (!open) return; let active = true;
    void call<{ templates: Template[]; assistant?: { industryTemplate?: string } | null }>("/api/onboarding")
      .then((data) => { if (!active) return; setStep(1); setName(companyName); setEmail(billingEmail); setError(""); setTemplates(data.templates); if (data.assistant?.industryTemplate) setTemplate(data.assistant.industryTemplate); })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : "开通信息加载失败"); });
    return () => { active = false; };
  }, [open, companyName, billingEmail]);
  const selected = useMemo(() => templates.find((item) => item.code === template) || templates[0], [templates, template]);
  if (!open) return null;

  function next() {
    setError("");
    if (step === 1 && (!name.trim() || !/^\S+@\S+\.\S+$/.test(email.trim()))) { setError("请填写企业名称和有效的业务联系邮箱。"); return; }
    if (step === 2 && !selected) { setError("请选择一个行业模板。"); return; }
    setStep((current) => Math.min(4, current + 1));
  }

  async function finish() {
    if (!canAdmin || !selected) return; setBusy(true); setError("");
    try {
      const result = await call<Result>("/api/onboarding", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        companyName: name.trim(), billingEmail: email.trim(), template: selected.code, includeDemoData, publishWidget,
      }) });
      await onCompleted(result);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "企业开通失败"); }
    finally { setBusy(false); }
  }

  return <div className="onboarding-backdrop" role="dialog" aria-modal="true" aria-label="新企业开通向导">
    <section className="onboarding-modal">
      <header className="onboarding-head"><div><p className="section-kicker">Enterprise launch wizard</p><h2>新企业开通向导</h2><p>用 4 步准备一个可以测试、演示和发布的企业 AI 客服。</p></div><button type="button" onClick={onClose} aria-label="关闭开通向导">×</button></header>
      <div className="onboarding-progress">{["企业资料", "行业模板", "演示数据", "确认发布"].map((label, index) => <div className={step >= index + 1 ? "active" : ""} key={label}><span>{index + 1}</span><b>{label}</b></div>)}</div>
      <div className="onboarding-body">
        {step === 1 && <section className="onboarding-step"><div className="onboarding-copy"><span className="step-icon">企</span><div><h3>建立企业专属工作台</h3><p>企业名称会显示在左侧品牌区和后台顶部；联系邮箱用于账单与合规通知。</p></div></div><div className="field-grid"><div><label>企业名称</label><input value={name} onChange={(event) => setName(event.target.value)} autoFocus placeholder="例如：星川智能设备有限公司"/></div><div><label>业务联系邮箱</label><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="admin@company.com"/></div></div></section>}
        {step === 2 && <section className="onboarding-step"><div className="onboarding-copy"><span className="step-icon">模</span><div><h3>选择最接近的行业模板</h3><p>会同步设置助手身份、拒答边界、欢迎语、推荐问题和品牌颜色，后续仍可修改。</p></div></div><div className="template-cards">{templates.map((item) => <button type="button" className={template === item.code ? "selected" : ""} onClick={() => setTemplate(item.code)} key={item.code}><i style={{ background: item.themeColor }}>{item.icon}</i><span><b>{item.name}</b><small>{item.description}</small></span><em>{template === item.code ? "已选择" : "选择"}</em></button>)}</div></section>}
        {step === 3 && <section className="onboarding-step"><div className="onboarding-copy"><span className="step-icon">数</span><div><h3>准备可立即验证的演示环境</h3><p>演示数据存放在当前企业自己的知识库中，不会与其他租户混用。</p></div></div><label className="launch-option"><input type="checkbox" checked={includeDemoData} onChange={(event) => setIncludeDemoData(event.target.checked)}/><span><b>创建行业演示知识</b><small>{selected?.demoDocumentName || "行业演示资料"}，自动切片并在已配置 Embedding 时向量化</small></span><em>推荐</em></label><div className="demo-question-list"><b>同时建立标准测试题</b>{selected?.questions.map((item) => <span key={item}>✓ {item}</span>)}</div></section>}
        {step === 4 && <section className="onboarding-step"><div className="onboarding-copy"><span className="step-icon">发</span><div><h3>确认开通并发布客服</h3><p>一次完成企业品牌、行业助手、演示知识和官网客服公开地址。</p></div></div><div className="launch-summary"><span><b>企业</b>{name}</span><span><b>模板</b>{selected?.name}</span><span><b>演示资料</b>{includeDemoData ? "创建并建立测试题" : "暂不创建"}</span></div><label className="launch-option"><input type="checkbox" checked={publishWidget} onChange={(event) => setPublishWidget(event.target.checked)}/><span><b>立即发布官网客服</b><small>生成公开测试链接和右下角悬浮组件代码，可随时关闭</small></span><em>{publishWidget ? "将上线" : "仅保存"}</em></label></section>}
        {error && <div className="onboarding-error">{error}</div>}
      </div>
      <footer className="onboarding-actions"><button type="button" className="secondary-button" onClick={step === 1 ? onClose : () => setStep((current) => current - 1)}>{step === 1 ? "稍后设置" : "上一步"}</button>{step < 4 ? <button type="button" className="primary-button fit" onClick={next}>下一步 <span>→</span></button> : <button type="button" className="primary-button fit" onClick={() => void finish()} disabled={busy || !canAdmin}>{busy ? "正在创建知识与客服…" : "一键开通并发布"}</button>}</footer>
    </section>
  </div>;
}
