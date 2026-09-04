"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

type ProviderKind = "generation" | "embedding" | "rerank" | "ocr";
type EditableProviderKind = Exclude<ProviderKind, "ocr">;
type ProviderConfig = {
  kind: ProviderKind;
  provider: string;
  baseUrl: string;
  model: string;
  secondaryModel: string | null;
  dimensions: number | null;
  configured: boolean;
  keyHint: string | null;
  updatedAt: string | null;
  requiresReindex?: boolean;
  reuseEmbeddingKey?: boolean;
  candidateCount?: number | null;
  topN?: number | null;
  managedBy?: string;
};
type ProviderResponse = {
  generation: ProviderConfig;
  embedding: ProviderConfig;
  rerank: ProviderConfig;
  ocr: ProviderConfig;
  migration?: { adopted: number; tenantId: string | null; removedOcr?: number };
};
type ServiceHealth = {
  checkedAt: string;
  services: Array<{ id: string; name: string; status: "healthy" | "degraded" | "stopped"; detail: string }>;
};

const initialGeneration: ProviderConfig = { kind: "generation", provider: "deepseek", baseUrl: "https://api.deepseek.com", model: "deepseek-v4-flash", secondaryModel: null, dimensions: null, configured: false, keyHint: null, updatedAt: null };
const initialEmbedding: ProviderConfig = { kind: "embedding", provider: "siliconflow", baseUrl: "https://api.siliconflow.cn/v1", model: "BAAI/bge-m3", secondaryModel: null, dimensions: 1024, configured: false, keyHint: null, updatedAt: null };
const initialRerank: ProviderConfig = { kind: "rerank", provider: "siliconflow", baseUrl: "https://api.siliconflow.cn/v1", model: "BAAI/bge-reranker-v2-m3", secondaryModel: null, dimensions: null, configured: false, keyHint: null, updatedAt: null, reuseEmbeddingKey: true, candidateCount: 12, topN: 3 };
const initialOcr: ProviderConfig = { kind: "ocr", provider: "paddleocr", baseUrl: "http://paddleocr:8002", model: "PP-OCRv6-small", secondaryModel: null, dimensions: null, configured: false, keyHint: null, updatedAt: null, managedBy: "builtin" };

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const data = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(data.error || `请求失败（${response.status}）`);
  return data;
}

export default function PlatformProviderSettings() {
  const [generation, setGeneration] = useState(initialGeneration);
  const [embedding, setEmbedding] = useState(initialEmbedding);
  const [rerank, setRerank] = useState(initialRerank);
  const [ocr, setOcr] = useState(initialOcr);
  const [secrets, setSecrets] = useState<Record<EditableProviderKind, string>>({ generation: "", embedding: "", rerank: "" });
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [serviceHealth, setServiceHealth] = useState<ServiceHealth | null>(null);

  const load = useCallback(async () => {
    const data = await api<ProviderResponse>("/api/settings?scope=platform");
    setGeneration(data.generation);
    setEmbedding(data.embedding);
    setRerank(data.rerank);
    setOcr(data.ocr);
    setLoaded(true);
    if (data.migration?.removedOcr) {
      setNotice({ kind: "ok", text: `已清理 ${data.migration.removedOcr} 条旧云 OCR 配置；现在全部企业统一使用本地 PaddleOCR。` });
    } else if (data.migration?.adopted) {
      setNotice({ kind: "ok", text: `已自动接管 ${data.migration.adopted} 项平台模型配置。` });
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load().catch((error) => setNotice({ kind: "error", text: error instanceof Error ? error.message : "配置加载失败" })), 0);
    return () => clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    let active = true;
    const refresh = () => void api<ServiceHealth>("/api/platform/services")
      .then((result) => { if (active) setServiceHealth(result); })
      .catch(() => { if (active) setServiceHealth(null); });
    const first = window.setTimeout(refresh, 0);
    const interval = window.setInterval(refresh, 15000);
    return () => { active = false; window.clearTimeout(first); window.clearInterval(interval); };
  }, []);

  function providerConfig(kind: EditableProviderKind) {
    return kind === "generation" ? generation : kind === "embedding" ? embedding : rerank;
  }

  function storeProvider(kind: EditableProviderKind, config: ProviderConfig) {
    if (kind === "generation") setGeneration(config);
    else if (kind === "embedding") setEmbedding(config);
    else setRerank(config);
  }

  function switchEmbedding(provider: string) {
    setEmbedding(provider === "openai"
      ? { ...embedding, provider: "openai", baseUrl: "https://api.openai.com/v1", model: "text-embedding-3-small", dimensions: 1536, configured: false, keyHint: null }
      : { ...embedding, provider: "siliconflow", baseUrl: "https://api.siliconflow.cn/v1", model: "BAAI/bge-m3", dimensions: 1024, configured: false, keyHint: null });
    setSecrets((current) => ({ ...current, embedding: "" }));
  }

  async function saveProvider(event: FormEvent, kind: EditableProviderKind) {
    event.preventDefault();
    setBusy(`save-${kind}`);
    setNotice(null);
    const config = providerConfig(kind);
    try {
      const saved = await api<ProviderConfig>("/api/settings?scope=platform", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...config, apiKey: secrets[kind] }),
      });
      storeProvider(kind, saved);
      setSecrets((current) => ({ ...current, [kind]: "" }));
      const label = kind === "generation" ? "DeepSeek 生成模型" : kind === "embedding" ? "Embedding" : "Rerank 重排";
      setNotice({ kind: "ok", text: saved.requiresReindex ? `${label}已保存；全部企业文档已标记为待重建向量。` : `${label}已保存并对全部企业生效。` });
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "保存失败" });
    } finally {
      setBusy("");
    }
  }

  async function testProvider(kind: ProviderKind) {
    setBusy(`test-${kind}`);
    setNotice(null);
    try {
      const data = await api<{ message: string; dimensions?: number; score?: number; engine?: string }>("/api/settings/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind }),
      });
      setNotice({ kind: "ok", text: `${data.message}${data.dimensions ? ` · ${data.dimensions} 维` : ""}${typeof data.score === "number" ? ` · 相关度 ${data.score.toFixed(3)}` : ""}${data.engine ? ` · ${data.engine}` : ""}` });
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "连接失败" });
    } finally {
      setBusy("");
    }
  }

  function providerForm(config: ProviderConfig, kind: EditableProviderKind) {
    const title = kind === "generation" ? "DeepSeek 生成模型" : kind === "embedding" ? "Embedding 向量服务" : "Rerank 重排服务";
    const kicker = kind === "generation" ? "Generation" : kind === "embedding" ? "Platform embedding" : "Precision reranking";
    const keyLabel = kind === "generation" ? "DeepSeek API Key" : kind === "embedding" ? "Embedding API Key" : "Rerank API Key";
    const setConfig = (next: ProviderConfig) => storeProvider(kind, next);
    return <section className="card form-card provider-card" key={kind}>
      <div className="card-head"><div><p className="section-kicker">{kicker}</p><h2>{title}</h2></div><span className={config.configured ? "live-badge" : "warn-badge"}>{config.configured ? "平台已配置" : "待配置"}</span></div>
      <form className="settings-form" onSubmit={(event) => saveProvider(event, kind)}>
        {kind === "embedding" && <><label>服务方式<span>默认推荐硅基流动 BGE-M3</span></label><select value={config.provider} onChange={(event) => switchEmbedding(event.target.value)}><option value="siliconflow">硅基流动 / BGE-M3</option><option value="openai">OpenAI API</option></select></>}
        {kind === "rerank" && <><label>服务方式<span>固定硅基流动 BGE-Reranker，可复用 Embedding 密钥</span></label><select value="siliconflow" disabled><option value="siliconflow">硅基流动 / BGE-Reranker</option></select></>}
        <label>API Base URL</label><input value={config.baseUrl} readOnly />
        <label>{kind === "generation" ? "生成模型" : kind === "embedding" ? "Embedding 模型" : "Rerank 模型"}</label>
        <input value={config.model} readOnly={config.provider === "siliconflow" || kind === "rerank"} onChange={(event) => setConfig({ ...config, model: event.target.value })}/>
        {kind === "embedding" && <><label>向量维度<span>硅基流动 BGE-M3 固定 1024 维</span></label><input type="number" min="256" max="4096" value={config.dimensions || 1024} readOnly={config.provider === "siliconflow"} onChange={(event) => setConfig({ ...config, dimensions: Number(event.target.value) })}/></>}
        {kind === "rerank" && <><label className="reuse-secret"><input type="checkbox" checked={Boolean(config.reuseEmbeddingKey)} onChange={(event) => setConfig({ ...config, reuseEmbeddingKey: event.target.checked })}/><span><b>复用 Embedding API Key</b><small>推荐开启，避免重复维护同一硅基流动密钥。</small></span></label><div className="field-grid"><div><label>候选数量</label><input type="number" min="2" max="50" value={config.candidateCount || 12} onChange={(event) => setConfig({ ...config, candidateCount: Number(event.target.value) })}/></div><div><label>最终保留</label><input type="number" min="1" max="8" value={config.topN || 3} onChange={(event) => setConfig({ ...config, topN: Number(event.target.value) })}/></div></div></>}
        {!(kind === "rerank" && config.reuseEmbeddingKey) && <><label>{keyLabel}<span>{config.keyHint ? `当前：${config.keyHint}` : "密钥只在服务器加密保存"}</span></label><input type="password" autoComplete="new-password" value={secrets[kind]} placeholder={config.configured ? "留空表示保持现有密钥" : "请输入 API Key"} onChange={(event) => setSecrets((current) => ({ ...current, [kind]: event.target.value }))}/></>}
        <div className="provider-actions"><button className="primary-button" disabled={busy === `save-${kind}`}>{busy === `save-${kind}` ? "保存中…" : "保存配置"}</button><button className="secondary-button" type="button" disabled={!config.configured || busy === `test-${kind}`} onClick={() => void testProvider(kind)}>{busy === `test-${kind}` ? "检测中…" : "测试连接"}</button></div>
      </form>
    </section>;
  }

  const paddle = serviceHealth?.services.find((item) => item.id === "paddleocr");
  const paddleHealthy = paddle?.status === "healthy";

  return <>
    <section className="platform-section-intro"><div><p className="section-kicker">Platform model services</p><h2>全平台模型与文档服务</h2><p>生成、向量和重排仍由超级管理员统一配置；OCR 已收口为服务器内置 PaddleOCR，不再使用百度、腾讯云、OpenAI 或其他外部 OCR。</p></div></section>
    {notice && <div className={`toast ${notice.kind}`}><span>{notice.kind === "ok" ? "✓" : "!"}</span>{notice.text}<button onClick={() => setNotice(null)}>×</button></div>}
    {!loaded ? <div className="source-empty platform-loading">正在加载模型服务配置…</div> : <div className="provider-grid">
      {providerForm(generation, "generation")}
      {providerForm(embedding, "embedding")}
      {providerForm(rerank, "rerank")}
      <section className="card form-card provider-card">
        <div className="card-head"><div><p className="section-kicker">Local OCR</p><h2>PaddleOCR 本地识别</h2></div><span className={paddleHealthy ? "live-badge" : "warn-badge"}>{paddleHealthy ? "本地运行中" : paddle ? "服务异常" : "检测中"}</span></div>
        <div className="settings-form">
          <label>服务方式<span>固定服务器内置，不产生百度/腾讯云 OCR 调用费用</span></label><input value="PaddleOCR / PP-OCRv6 Small" readOnly />
          <label>内部地址<span>仅 Docker 内网访问，不对公网开放</span></label><input value={ocr.baseUrl || "http://paddleocr:8002"} readOnly />
          <label>识别模型</label><input value={ocr.model || "PP-OCRv6-small"} readOnly />
          <label>当前状态</label><input value={paddle?.detail || (ocr.configured ? "等待健康检查" : "PARSER_API_KEY 或本地服务尚未就绪")} readOnly />
          <div className="provider-actions"><button className="secondary-button" type="button" disabled={busy === "test-ocr"} onClick={() => void testProvider("ocr")}>{busy === "test-ocr" ? "检测中…" : "检查本地 OCR"}</button></div>
          <p className="settings-help">旧的百度 OCR、腾讯云 OCR、OpenAI 文档视觉和通用兼容 OCR 配置会自动清理。企业上传图片或扫描 PDF 时统一调用此本地服务。</p>
        </div>
      </section>
    </div>}
    {serviceHealth && <section className="card platform-table-card"><div className="card-head"><div><p className="section-kicker">Runtime health</p><h2>基础服务状态</h2></div><small>{new Date(serviceHealth.checkedAt).toLocaleString("zh-CN")}</small></div><div className="platform-table">{serviceHealth.services.map((service) => <div className="platform-row" key={service.id}><span><b>{service.name}</b><small>{service.detail}</small></span><span><i className={`state ${service.status === "healthy" ? "active" : "suspended"}`}>{service.status === "healthy" ? "正常" : service.status === "degraded" ? "异常" : "未运行"}</i></span></div>)}</div></section>}
  </>;
}
