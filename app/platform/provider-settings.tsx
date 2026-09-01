"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

type ProviderKind = "generation" | "embedding" | "rerank" | "ocr";
type ProviderConfig = {
  kind: ProviderKind; provider: string; baseUrl: string; model: string; secondaryModel: string | null;
  dimensions: number | null; configured: boolean; keyHint: string | null; credentialIdHint?: string | null;
  region?: string | null; updatedAt: string | null; requiresReindex?: boolean; reuseEmbeddingKey?: boolean;
  candidateCount?: number | null; topN?: number | null; managedBy?: string;
};
type ProviderResponse = {
  generation: ProviderConfig; embedding: ProviderConfig; rerank: ProviderConfig; ocr: ProviderConfig;
  migration?: { adopted: number; tenantId: string | null };
};

const initialGeneration: ProviderConfig = { kind: "generation", provider: "deepseek", baseUrl: "https://api.deepseek.com", model: "deepseek-v4-flash", secondaryModel: null, dimensions: null, configured: false, keyHint: null, updatedAt: null };
const initialEmbedding: ProviderConfig = { kind: "embedding", provider: "infinity", baseUrl: "https://embedding.example.com/v1", model: "BAAI/bge-m3", secondaryModel: null, dimensions: 1024, configured: false, keyHint: null, updatedAt: null };
const initialRerank: ProviderConfig = { kind: "rerank", provider: "siliconflow", baseUrl: "https://api.siliconflow.cn/v1", model: "BAAI/bge-reranker-v2-m3", secondaryModel: null, dimensions: null, configured: false, keyHint: null, updatedAt: null, reuseEmbeddingKey: true, candidateCount: 12, topN: 3 };
const initialOcr: ProviderConfig = { kind: "ocr", provider: "docling", baseUrl: "https://parser.example.com", model: "rapidocr", secondaryModel: null, dimensions: null, configured: false, keyHint: null, credentialIdHint: null, region: null, updatedAt: null };

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init); const data = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(data.error || `请求失败（${response.status}）`);
  return data;
}

export default function PlatformProviderSettings() {
  const [generation, setGeneration] = useState(initialGeneration); const [embedding, setEmbedding] = useState(initialEmbedding);
  const [rerank, setRerank] = useState(initialRerank); const [ocr, setOcr] = useState(initialOcr);
  const [secrets, setSecrets] = useState<Record<ProviderKind, { apiKey: string; credentialId: string }>>({ generation: { apiKey: "", credentialId: "" }, embedding: { apiKey: "", credentialId: "" }, rerank: { apiKey: "", credentialId: "" }, ocr: { apiKey: "", credentialId: "" } });
  const [busy, setBusy] = useState(""); const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const data = await api<ProviderResponse>("/api/settings?scope=platform");
    setGeneration(data.generation); setEmbedding(data.embedding); setRerank(data.rerank); setOcr(data.ocr); setLoaded(true);
    if (data.migration?.adopted) setNotice({ kind: "ok", text: `已自动接管 ${data.migration.adopted} 项原有模型服务配置，密钥无需重新填写。` });
  }, []);
  useEffect(() => { const timer = window.setTimeout(() => void load().catch((error) => setNotice({ kind: "error", text: error instanceof Error ? error.message : "配置加载失败" })), 0); return () => clearTimeout(timer); }, [load]);

  function providerConfig(kind: ProviderKind) { return kind === "generation" ? generation : kind === "embedding" ? embedding : kind === "rerank" ? rerank : ocr; }
  function storeProvider(kind: ProviderKind, config: ProviderConfig) { if (kind === "generation") setGeneration(config); else if (kind === "embedding") setEmbedding(config); else if (kind === "rerank") setRerank(config); else setOcr(config); }
  function setSecret(kind: ProviderKind, field: "apiKey" | "credentialId", value: string) { setSecrets((current) => ({ ...current, [kind]: { ...current[kind], [field]: value } })); }
  function clearSecrets(kind: ProviderKind) { setSecrets((current) => ({ ...current, [kind]: { apiKey: "", credentialId: "" } })); }

  function switchProvider(kind: "embedding" | "ocr", provider: string) {
    if (kind === "embedding") setEmbedding(provider === "openai"
      ? { ...embedding, provider, baseUrl: "https://api.openai.com/v1", model: "text-embedding-3-small", dimensions: 1536, configured: false, keyHint: null }
      : { ...embedding, provider: "infinity", baseUrl: "https://embedding.example.com/v1", model: "BAAI/bge-m3", dimensions: 1024, configured: false, keyHint: null });
    else {
      const presets: Record<string, Partial<ProviderConfig>> = {
        docling: { provider: "docling", baseUrl: "https://parser.example.com", model: "rapidocr", region: null },
        compatible: { provider: "compatible", baseUrl: "https://ocr.example.com", model: "parse", region: null },
        openai: { provider: "openai", baseUrl: "https://api.openai.com/v1", model: "gpt-4.1-mini", region: null },
        baidu: { provider: "baidu", baseUrl: "https://aip.baidubce.com", model: "general_basic", secondaryModel: "table", region: null },
        tencent: { provider: "tencent", baseUrl: "https://ocr.tencentcloudapi.com", model: "GeneralBasicOCR", secondaryModel: "RecognizeTableOCR", region: "ap-guangzhou" },
      };
      setOcr({ ...ocr, ...presets[provider], configured: false, keyHint: null, credentialIdHint: null });
    }
    clearSecrets(kind);
  }

  async function saveProvider(event: FormEvent, kind: ProviderKind) {
    event.preventDefault(); setBusy(`save-${kind}`); setNotice(null); const config = providerConfig(kind);
    try {
      const saved = await api<ProviderConfig>("/api/settings?scope=platform", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...config, ...secrets[kind] }) });
      storeProvider(kind, saved); clearSecrets(kind);
      const label = kind === "generation" ? "DeepSeek 生成模型" : kind === "embedding" ? "Embedding" : kind === "rerank" ? "Rerank 重排" : "OCR / 文档解析";
      setNotice({ kind: "ok", text: saved.requiresReindex ? `${label}已保存。向量模型发生变化，全部企业文档已标记为待重建。` : `${label}已设为平台统一服务，全部企业立即生效。` });
    } catch (error) { setNotice({ kind: "error", text: error instanceof Error ? error.message : "保存失败" }); } finally { setBusy(""); }
  }

  async function testProvider(kind: ProviderKind) {
    setBusy(`test-${kind}`); setNotice(null);
    try {
      const data = await api<{ message: string; dimensions?: number; score?: number; engine?: string }>("/api/settings/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind }) });
      setNotice({ kind: "ok", text: `${data.message}${data.dimensions ? ` · ${data.dimensions} 维` : ""}${typeof data.score === "number" ? ` · 测试相关度 ${data.score.toFixed(3)}` : ""}${data.engine ? ` · ${data.engine}` : ""}` });
    } catch (error) { setNotice({ kind: "error", text: error instanceof Error ? error.message : "连接失败" }); } finally { setBusy(""); }
  }

  function providerForm(config: ProviderConfig, kind: ProviderKind) {
    const title = kind === "generation" ? "DeepSeek 生成模型" : kind === "embedding" ? "Embedding 向量服务" : kind === "rerank" ? "Rerank 重排服务" : "OCR 与文档解析";
    const kicker = kind === "generation" ? "Generation" : kind === "embedding" ? "Platform embedding" : kind === "rerank" ? "Precision reranking" : "Multi-provider OCR";
    const modelLabel = kind === "generation" ? "生成模型" : kind === "embedding" ? "Embedding 模型" : kind === "rerank" ? "Rerank 模型" : "OCR 接口 / 引擎";
    const selfHosted = config.provider === "infinity" || config.provider === "docling" || config.provider === "compatible";
    const cloudPair = kind === "ocr" && (config.provider === "baidu" || config.provider === "tencent");
    const reusingEmbeddingKey = kind === "rerank" && Boolean(config.reuseEmbeddingKey);
    const credentialLabel = config.provider === "baidu" ? "百度云 API Key" : "腾讯云 SecretId";
    const secretLabel = config.provider === "baidu" ? "百度云 Secret Key" : config.provider === "tencent" ? "腾讯云 SecretKey" : kind === "rerank" ? "硅基流动 API Key" : selfHosted ? "服务 Token" : "API Key";
    const setConfig = (next: ProviderConfig) => storeProvider(kind, next);
    const fixedUrl = kind === "generation" || kind === "rerank" || config.provider === "openai" || config.provider === "baidu" || config.provider === "tencent";
    return <section className="card form-card provider-card" key={kind}><div className="card-head"><div><p className="section-kicker">{kicker}</p><h2>{title}</h2></div><span className={config.configured ? "live-badge" : "warn-badge"}>{config.configured ? "平台已配置" : "待配置"}</span></div><form className="settings-form" onSubmit={(event) => saveProvider(event, kind)}>
      {kind === "embedding" && <><label>服务方式<span>支持自建服务或兼容的向量 API</span></label><select value={config.provider} onChange={(event) => switchProvider("embedding", event.target.value)}><option value="infinity">Infinity / BGE-M3 兼容 API</option><option value="openai">OpenAI API</option></select></>}
      {kind === "rerank" && <><label>服务方式<span>调用硅基流动专用重排端点</span></label><select value={config.provider} disabled><option value="siliconflow">硅基流动 / BGE-Reranker</option></select></>}
      {kind === "ocr" && <><label>服务方式<span>云服务使用各自官方鉴权；兼容服务使用 Bearer Token</span></label><select value={config.provider} onChange={(event) => switchProvider("ocr", event.target.value)}><option value="docling">自建 Docling / RapidOCR</option><option value="baidu">百度智能云 OCR</option><option value="tencent">腾讯云 OCR</option><option value="openai">OpenAI 文档视觉</option><option value="compatible">通用兼容 OCR API</option></select></>}
      <label>API Base URL<span>{fixedUrl ? "官方 HTTPS 地址已锁定，防止密钥发送到错误服务器" : "填写公网 HTTPS 服务地址，禁止内网地址"}</span></label><input value={config.baseUrl} readOnly={fixedUrl} onChange={(event) => setConfig({ ...config, baseUrl: event.target.value })}/>
      <label>{modelLabel}</label>
      {kind === "ocr" && config.provider === "baidu" ? (
        <select value={config.model} onChange={(event) => setConfig({ ...config, model: event.target.value })}>
          <option value="general_basic">图片 / 扫描 PDF：通用文字识别标准版</option>
          <option value="accurate_basic">图片 / 扫描 PDF：通用文字识别高精度版</option>
        </select>
      ) : kind === "ocr" && config.provider === "tencent" ? (
        <select value={config.model} onChange={(event) => setConfig({ ...config, model: event.target.value })}>
          <option value="GeneralBasicOCR">图片 / 扫描 PDF：通用印刷体识别</option>
          <option value="GeneralAccurateOCR">图片 / 扫描 PDF：通用文字识别高精度版</option>
        </select>
      ) : (
        <input value={config.model} onChange={(event) => setConfig({ ...config, model: event.target.value })}/>
      )}
      {kind === "ocr" && config.provider === "baidu" && <><label>表格识别接口<span>结构化保留单元格行列，支持表格图片和表格 PDF</span></label><select value={config.secondaryModel || "table"} onChange={(event) => setConfig({ ...config, secondaryModel: event.target.value })}><option value="table">表格文字识别 V2（table）</option></select></>}
      {kind === "ocr" && config.provider === "tencent" && <><label>表格识别接口<span>结构化保留单元格行列，支持表格图片和表格 PDF</span></label><select value={config.secondaryModel || "RecognizeTableOCR"} onChange={(event) => setConfig({ ...config, secondaryModel: event.target.value })}><option value="RecognizeTableOCR">表格识别 V2（RecognizeTableOCR）</option></select></>}
      {kind === "embedding" && <><label>向量维度<span>{config.provider === "infinity" && config.model === "BAAI/bge-m3" ? "BGE-M3 固定为 1024；变更后全部企业文档需要重建索引" : "必须与服务实际输出完全一致"}</span></label><input type="number" min="256" max="4096" value={config.dimensions || 1024} onChange={(event) => setConfig({ ...config, dimensions: Number(event.target.value) })}/></>}
      {kind === "rerank" && <><div className="field-grid"><div><label>候选数量<span>向量检索先召回多少段</span></label><input type="number" min="2" max="50" value={config.candidateCount || 12} onChange={(event) => setConfig({ ...config, candidateCount: Number(event.target.value) })}/></div><div><label>最终保留<span>重排后交给生成模型</span></label><input type="number" min="1" max="8" value={config.topN || 3} onChange={(event) => setConfig({ ...config, topN: Number(event.target.value) })}/></div></div><label className="reuse-secret"><input type="checkbox" checked={reusingEmbeddingKey} onChange={(event) => { setConfig({ ...config, reuseEmbeddingKey: event.target.checked }); clearSecrets("rerank"); }}/><span><b>复用 Embedding API Key</b><small>Embedding 同样使用硅基流动时推荐开启，密钥更新会自动同步。</small></span></label></>}
      {kind === "ocr" && config.provider === "tencent" && <><label>地域 Region</label><input value={config.region || "ap-guangzhou"} onChange={(event) => setConfig({ ...config, region: event.target.value })}/></>}
      {cloudPair && <><label>{credentialLabel}<span>{config.credentialIdHint ? `当前：${config.credentialIdHint}；留空保留` : "加密保存，浏览器无法再次读取"}</span></label><div className="secret-field"><input type="password" autoComplete="new-password" value={secrets[kind].credentialId} onChange={(event) => setSecret(kind, "credentialId", event.target.value)} placeholder={config.credentialIdHint ? "留空保留现有凭据" : credentialLabel}/><span>加密</span></div></>}
      <label>{secretLabel}<span>{reusingEmbeddingKey ? `将复用 Embedding 密钥${config.keyHint ? `：${config.keyHint}` : ""}` : config.configured ? `当前：${config.keyHint}；留空保留现有密钥` : "AES-256-GCM 加密保存，浏览器无法再次读取"}</span></label><div className="secret-field"><input type="password" autoComplete="new-password" disabled={reusingEmbeddingKey} value={secrets[kind].apiKey} onChange={(event) => setSecret(kind, "apiKey", event.target.value)} placeholder={reusingEmbeddingKey ? "自动复用，无需重复填写" : config.configured ? "留空保留现有密钥" : selfHosted ? "至少 12 位随机 Token" : "填写服务商密钥"}/><span>{reusingEmbeddingKey ? "复用" : "加密"}</span></div>
      {kind === "ocr" && <p className="provider-help">现已支持三种导入模式：普通图片 OCR、逐页扫描 PDF OCR、表格图片/PDF 结构化 OCR。原生 Excel 直接解析单元格，不消耗 OCR 次数；Word、Excel、PPT 建议使用 Docling 或 OpenAI 文档解析。</p>}
      <div className="form-actions"><button className="primary-button fit" disabled={busy === `save-${kind}`}>{busy === `save-${kind}` ? "保存中…" : "保存平台配置"}</button><button className="secondary-button" type="button" onClick={() => testProvider(kind)} disabled={!config.configured || busy === `test-${kind}`}>{busy === `test-${kind}` ? "测试中…" : "测试连接"}</button></div>
    </form></section>;
  }

  if (!loaded && !notice) return <div className="source-empty platform-loading">正在读取平台模型服务…</div>;
  return <div className="platform-provider-page">{notice && <div className={`toast ${notice.kind}`}><span>{notice.kind === "ok" ? "✓" : "!"}</span>{notice.text}<button onClick={() => setNotice(null)}>×</button></div>}<section className="service-intro card"><div><p className="section-kicker">Platform provider control</p><h2>全平台模型与文档服务</h2><p>这里的配置由超级管理员统一维护，企业账号只能使用，不能查看或修改密钥。</p></div><div className="service-status"><span className={generation.configured ? "ready" : ""}>DeepSeek</span><span className={embedding.configured ? "ready" : ""}>Embedding</span><span className={rerank.configured ? "ready" : ""}>Rerank</span><span className={ocr.configured ? "ready" : ""}>OCR · {ocr.provider}</span></div></section><section className="card platform-provider-boundary"><div><b>统一生效</b><span>保存后，全部租户的质量测试、官网客服和客户 API 使用同一套平台服务。</span></div><div><b>旧密钥已接管</b><span>首次进入会自动复制原有加密配置，不要求重新填写；原租户配置保留用于回滚。</span></div><div><b>企业不可见</b><span>企业后台不显示配置表单，服务端也拒绝企业账号写入或测试密钥。</span></div></section><div className="provider-grid">{providerForm(generation, "generation")}{providerForm(embedding, "embedding")}{providerForm(rerank, "rerank")}{providerForm(ocr, "ocr")}</div></div>;
}
