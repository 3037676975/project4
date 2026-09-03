"use client";

import Link from "next/link";
import { type FormEvent, type ReactNode, useCallback, useEffect, useState } from "react";

type Config = {
  provider: string;
  merchantId: string;
  appId: string;
  callbackUrl: string;
  apiV2KeyConfigured: boolean;
  ready: boolean;
};

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const data = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(data.error || `请求失败（${response.status}）`);
  return data;
}

export default function WechatV2Client() {
  const [config, setConfig] = useState<Config | null>(null);
  const [apiV2Key, setApiV2Key] = useState("");
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const load = useCallback(async () => {
    const result = await api<{ configs: Config[] }>("/api/platform/payment");
    const wechat = result.configs.find((item) => item.provider === "wechat");
    if (!wechat) throw new Error("未找到微信支付配置。");
    setConfig(wechat);
    setApiV2Key("");
  }, []);

  useEffect(() => {
    void load().catch((error) => setNotice({ kind: "error", text: error.message }));
  }, [load]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!config) return;
    if (!config.appId.trim() || !config.merchantId.trim() || (!apiV2Key.trim() && !config.apiV2KeyConfigured)) {
      setNotice({ kind: "error", text: "请填写 AppID、商户号和 API V2 Key。" });
      return;
    }
    setBusy("save"); setNotice(null);
    try {
      const result = await api<{ message: string }>("/api/platform/payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save",
          provider: "wechat",
          appId: config.appId.trim(),
          merchantId: config.merchantId.trim(),
          apiV2Key: apiV2Key.trim(),
        }),
      });
      await load();
      setNotice({ kind: "ok", text: result.message });
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "保存失败" });
    } finally { setBusy(""); }
  }

  async function test() {
    setBusy("test"); setNotice(null);
    try {
      const result = await api<{ message: string }>("/api/platform/payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test", provider: "wechat" }),
      });
      setNotice({ kind: "ok", text: result.message });
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "检查失败" });
    } finally { setBusy(""); }
  }

  if (!config) return <main style={page}><div style={wrap}>正在加载微信支付配置…</div></main>;

  return <main style={page}><div style={wrap}>
    <header style={head}>
      <div>
        <p style={kicker}>WECHAT PAY V2</p>
        <h1 style={{ margin: "6px 0", fontSize: 34 }}>微信支付 V2</h1>
        <p style={muted}>只填 3 项，其他参数由 Project4 自动配置。</p>
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <Link href="/platform" style={linkBtn}>返回后台</Link>
        <Link href="/platform/payment-lab" style={linkBtn}>支付日志</Link>
      </div>
    </header>

    {notice && <div style={{ ...noticeBox, background: notice.kind === "ok" ? "#eafaf4" : "#fff0ed", color: notice.kind === "ok" ? "#126d51" : "#a33b25", borderColor: notice.kind === "ok" ? "#bce9d8" : "#ffcabc" }}>{notice.text}</div>}

    <section style={statusPanel}>
      <div><b style={{ fontSize: 18 }}>当前状态</b><p style={muted}>V2 Native 扫码支付 · 全站统一配置</p></div>
      <span style={{ ...badge, background: config.ready ? "#e9f9f2" : "#fff5e5", color: config.ready ? "#137a58" : "#9a6719" }}>{config.ready ? "参数已保存" : "等待配置"}</span>
    </section>

    <form onSubmit={save} style={panel}>
      <Field label="AppID">
        <input style={input} value={config.appId} onChange={(event) => setConfig({ ...config, appId: event.target.value })} placeholder="例如 wx1234567890abcdef" autoComplete="off"/>
      </Field>
      <Field label="商户号 mch_id">
        <input style={input} value={config.merchantId} onChange={(event) => setConfig({ ...config, merchantId: event.target.value })} placeholder="微信支付商户号" autoComplete="off"/>
      </Field>
      <Field label={`API V2 Key${config.apiV2KeyConfigured ? "（已保存，留空表示不修改）" : ""}`}>
        <input style={input} type="password" value={apiV2Key} onChange={(event) => setApiV2Key(event.target.value)} placeholder="微信商户平台 → API 安全 → APIv2 密钥" autoComplete="new-password"/>
      </Field>

      <div style={automaticBox}>
        <b>以下内容系统自动处理</b>
        <span>服务器 IP、微信下单接口、订单查询接口、回调地址、V2 签名方式</span>
      </div>

      <div style={actions}>
        <button style={primary} disabled={Boolean(busy)}>{busy === "save" ? "正在保存…" : "保存配置"}</button>
        <button type="button" style={secondary} disabled={Boolean(busy) || !config.apiV2KeyConfigured} onClick={() => void test()}>{busy === "test" ? "正在检测…" : "检测是否连通"}</button>
      </div>
    </form>

    <section style={panel}>
      <b style={{ fontSize: 18 }}>你只需要看检测结果</b>
      <div style={tips}>
        <p><strong>✅ 微信支付配置正常</strong>：三项配置和服务器网络都通。</p>
        <p><strong>❌ API V2 Key 错误</strong>：重新填写 Key。</p>
        <p><strong>❌ AppID 与商户号不匹配</strong>：换成同一套微信商户资料。</p>
        <p><strong>❌ 无法连接微信支付</strong>：再检查服务器网络。</p>
      </div>
    </section>
  </div></main>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label style={{ display: "block", marginBottom: 18 }}><span style={{ display: "block", fontSize: 14, fontWeight: 800, marginBottom: 8 }}>{label}</span>{children}</label>;
}

const page = { minHeight: "100vh", background: "#f5f7fb", color: "#172033", padding: 28 } as const;
const wrap = { maxWidth: 760, margin: "0 auto" } as const;
const head = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 20, marginBottom: 20 } as const;
const kicker = { margin: 0, color: "#14a06f", fontWeight: 900, fontSize: 12, letterSpacing: ".12em" } as const;
const muted = { margin: "5px 0 0", color: "#748095", lineHeight: 1.7 } as const;
const panel = { background: "white", border: "1px solid #e4e8ef", borderRadius: 18, padding: 24, marginBottom: 16, boxShadow: "0 8px 26px rgba(24,35,60,.04)" } as const;
const statusPanel = { ...panel, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 } as const;
const input = { width: "100%", minHeight: 48, border: "1px solid #dbe1ea", borderRadius: 11, padding: "0 13px", background: "#fff", color: "#1d2738", fontSize: 15, boxSizing: "border-box" } as const;
const automaticBox = { display: "flex", flexDirection: "column", gap: 5, marginTop: 4, padding: 14, background: "#f7f9fc", border: "1px solid #e4e8ef", borderRadius: 12, color: "#687487", fontSize: 13 } as const;
const actions = { display: "flex", gap: 10, flexWrap: "wrap", marginTop: 20 } as const;
const primary = { minHeight: 44, border: 0, borderRadius: 11, padding: "0 18px", background: "#15966b", color: "white", fontWeight: 800, cursor: "pointer" } as const;
const secondary = { minHeight: 44, border: "1px solid #cfd6e2", borderRadius: 11, padding: "0 18px", background: "white", color: "#293448", fontWeight: 800, cursor: "pointer" } as const;
const linkBtn = { ...secondary, display: "inline-flex", alignItems: "center", textDecoration: "none" } as const;
const noticeBox = { border: "1px solid", borderRadius: 13, padding: 14, marginBottom: 16, fontWeight: 700 } as const;
const badge = { padding: "7px 10px", borderRadius: 999, fontWeight: 800, fontSize: 13 } as const;
const tips = { color: "#647087", lineHeight: 1.8, marginTop: 10 } as const;
