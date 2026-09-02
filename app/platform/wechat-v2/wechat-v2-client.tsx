"use client";

import Link from "next/link";
import { type FormEvent, type ReactNode, useCallback, useEffect, useState } from "react";

type Config = {
  mode: string; provider: string; merchantName: string; merchantId: string; checkoutUrl: string; displayName: string;
  appId: string; queryUrl: string; spbillCreateIp: string; callbackUrl: string; apiV2KeyConfigured: boolean; ready: boolean;
};

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init); const data = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(data.error || `请求失败（${response.status}）`); return data;
}

export default function WechatV2Client() {
  const [config, setConfig] = useState<Config | null>(null); const [apiV2Key, setApiV2Key] = useState("");
  const [busy, setBusy] = useState(""); const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const load = useCallback(async () => {
    const result = await api<{ configs: Config[] }>("/api/platform/payment");
    const wechat = result.configs.find((item) => item.provider === "wechat");
    if (!wechat) throw new Error("未找到微信支付配置。"); setConfig(wechat); setApiV2Key("");
  }, []);
  useEffect(() => { void load().catch((error) => setNotice({ kind: "error", text: error.message })); }, [load]);

  async function save(event: FormEvent) {
    event.preventDefault(); if (!config) return; setBusy("save"); setNotice(null);
    try {
      const result = await api<{ message: string }>("/api/platform/payment", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save", provider: "wechat", ...config, apiV2Key }),
      });
      await load(); setNotice({ kind: "ok", text: result.message });
    } catch (error) { setNotice({ kind: "error", text: error instanceof Error ? error.message : "保存失败" }); }
    finally { setBusy(""); }
  }

  async function test() {
    setBusy("test"); setNotice(null);
    try {
      const result = await api<{ message: string; code?: string }>("/api/platform/payment", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "test", provider: "wechat" }),
      });
      setNotice({ kind: "ok", text: result.message });
    } catch (error) { setNotice({ kind: "error", text: error instanceof Error ? error.message : "检查失败" }); }
    finally { setBusy(""); }
  }

  if (!config) return <main style={page}><div style={wrap}>正在加载微信 V2 全局配置…</div></main>;
  const update = (patch: Partial<Config>) => setConfig({ ...config, ...patch });

  return <main style={page}><div style={wrap}>
    <header style={head}><div><p style={kicker}>WECHAT PAY V2</p><h1 style={{ margin: "6px 0", fontSize: 34 }}>微信支付 V2 全局配置</h1><p style={muted}>统一配置一次，Project4 全站套餐订单共用。检查配置使用 orderquery 随机不存在订单，不产生扣款。</p></div><div style={{ display: "flex", gap: 10 }}><Link href="/platform" style={linkBtn}>返回平台后台</Link><Link href="/platform/payment-lab" style={linkBtn}>Payment Lab</Link></div></header>
    {notice && <div style={{ ...noticeBox, background: notice.kind === "ok" ? "#eafaf4" : "#fff0ed", color: notice.kind === "ok" ? "#126d51" : "#a33b25", borderColor: notice.kind === "ok" ? "#bce9d8" : "#ffcabc" }}>{notice.text}</div>}
    <section style={panel}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 }}><div><b style={{ fontSize: 19 }}>全局状态</b><p style={muted}>协议固定：V2 Native + HMAC-SHA256</p></div><span style={{ fontWeight: 800, color: config.ready ? "#13835e" : "#a36b15" }}>{config.ready ? "正式收款参数完整" : "待补齐配置"}</span></div></section>
    <form onSubmit={save} style={panel}>
      <div style={grid}>
        <Field label="运行模式"><select style={input} value={config.mode} onChange={(e) => update({ mode: e.target.value })}><option value="disabled">关闭</option><option value="production">正式收款</option></select></Field>
        <Field label="渠道名称"><input style={input} value={config.displayName} onChange={(e) => update({ displayName: e.target.value })}/></Field>
        <Field label="后台商户名称"><input style={input} value={config.merchantName} onChange={(e) => update({ merchantName: e.target.value })}/></Field>
        <Field label="商户号 mch_id"><input style={input} value={config.merchantId} onChange={(e) => update({ merchantId: e.target.value.trim() })}/></Field>
        <Field label="AppID"><input style={input} value={config.appId} onChange={(e) => update({ appId: e.target.value.trim() })}/></Field>
        <Field label="服务器 IPv4"><input style={input} placeholder="例如 186.244.245.177" value={config.spbillCreateIp} onChange={(e) => update({ spbillCreateIp: e.target.value.trim() })}/></Field>
      </div>
      <Field label={`API V2 Key · ${config.apiV2KeyConfigured ? "已保存，留空不修改" : "尚未保存"}`}><input style={input} type="password" autoComplete="new-password" value={apiV2Key} onChange={(e) => setApiV2Key(e.target.value)} placeholder="微信商户平台 API 安全 → APIv2 密钥"/></Field>
      <Field label="V2 Native 下单接口"><input style={input} type="url" value={config.checkoutUrl} onChange={(e) => update({ checkoutUrl: e.target.value })}/></Field>
      <Field label="V2 订单查询接口"><input style={input} type="url" value={config.queryUrl} onChange={(e) => update({ queryUrl: e.target.value })}/></Field>
      <Field label="异步通知地址"><div style={copy}><code style={{ overflowWrap: "anywhere" }}>{config.callbackUrl}</code><button type="button" style={smallBtn} onClick={() => void navigator.clipboard.writeText(config.callbackUrl)}>复制</button></div></Field>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 20 }}><button style={primary} disabled={Boolean(busy)}>{busy === "save" ? "保存中…" : "保存微信 V2 全局配置"}</button><button type="button" style={secondary} disabled={Boolean(busy) || !config.apiV2KeyConfigured} onClick={() => void test()}>{busy === "test" ? "正在连接微信…" : "检查全局配置是否通"}</button></div>
    </form>
    <section style={panel}><b style={{ fontSize: 18 }}>检查结果怎么看</b><div style={tips}><p><strong>ORDERNOTEXIST：</strong>这是成功结果，说明 AppID、商户号、API V2 Key、签名、网络和 orderquery 都通。</p><p><strong>SIGNERROR：</strong>API V2 Key 不正确。</p><p><strong>APPID_MCHID_NOT_MATCH：</strong>AppID 与商户号不是同一套。</p><p><strong>通信失败：</strong>服务器到微信接口的网络/HTTPS 请求有问题。</p></div></section>
  </div></main>;
}

function Field({ label, children }: { label: string; children: ReactNode }) { return <label style={{ display: "block", marginTop: 16 }}><span style={{ display: "block", fontSize: 13, fontWeight: 800, marginBottom: 7 }}>{label}</span>{children}</label>; }
const page = { minHeight: "100vh", background: "#f5f7fb", color: "#172033", padding: 28 } as const;
const wrap = { maxWidth: 1050, margin: "0 auto" } as const;
const head = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 20, marginBottom: 20 } as const;
const kicker = { margin: 0, color: "#14a06f", fontWeight: 900, fontSize: 12, letterSpacing: ".12em" } as const;
const muted = { margin: "5px 0 0", color: "#748095", lineHeight: 1.7 } as const;
const panel = { background: "white", border: "1px solid #e4e8ef", borderRadius: 18, padding: 22, marginBottom: 16, boxShadow: "0 8px 26px rgba(24,35,60,.04)" } as const;
const grid = { display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: "0 14px" } as const;
const input = { width: "100%", minHeight: 44, border: "1px solid #dbe1ea", borderRadius: 11, padding: "0 12px", background: "#fff", color: "#1d2738", fontSize: 14 } as const;
const copy = { display: "flex", alignItems: "center", gap: 10, padding: 12, background: "#f7f8fb", border: "1px solid #e2e6ed", borderRadius: 11 } as const;
const primary = { minHeight: 44, border: 0, borderRadius: 11, padding: "0 17px", background: "#15966b", color: "white", fontWeight: 800, cursor: "pointer" } as const;
const secondary = { minHeight: 44, border: "1px solid #cfd6e2", borderRadius: 11, padding: "0 17px", background: "white", color: "#293448", fontWeight: 800, cursor: "pointer" } as const;
const smallBtn = { border: "1px solid #d5dbe5", borderRadius: 9, background: "white", padding: "7px 10px", fontWeight: 700, cursor: "pointer" } as const;
const linkBtn = { ...secondary, display: "inline-flex", alignItems: "center", textDecoration: "none" } as const;
const noticeBox = { border: "1px solid", borderRadius: 13, padding: 13, marginBottom: 16, fontWeight: 700 } as const;
const tips = { color: "#647087", lineHeight: 1.8, marginTop: 10 } as const;
