"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type LabOrder = {
  orderNo: string; provider: string; status: string; amountCents: number; currency: string; providerTradeNo?: string | null;
  planName: string; tenantName: string; createdAt: string; paidAt?: string | null; fulfilledAt?: string | null; expiresAt?: string | null;
};
type LabLog = {
  id: string; direction: string; provider: string; eventType: string; orderNo?: string | null; status: string;
  message: string; detail: Record<string, unknown>; createdAt: string;
};
type LabData = {
  profile: { name: string; implementation: string; providers: string[]; rules: string[]; endpoints: Record<string, string> };
  state: { mode: string; provider: string; ready: boolean; channels: Array<{ provider: string; name: string; ready: boolean; mode: string }> };
  orders: LabOrder[]; logs: LabLog[]; generatedAt: string;
};

function money(cents: number) { return `¥${(Number(cents || 0) / 100).toFixed(2)}`; }
function localDate(value?: string | null) { return value ? new Date(value).toLocaleString("zh-CN") : "—"; }
function statusText(value: string) {
  const map: Record<string, string> = { pending: "待支付", paid: "已支付", fulfilled: "已履约", refunded: "已退款", processed: "已处理", verified: "已验签", failed: "失败", rejected: "已拒绝", duplicate: "重复通知" };
  return map[value] || value;
}

export default function PaymentLabClient() {
  const [data, setData] = useState<LabData | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/platform/payment/lab", { cache: "no-store" });
      const result = await response.json() as LabData & { error?: string };
      if (!response.ok) throw new Error(result.error || `加载失败（${response.status}）`);
      setData(result);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Payment Lab 加载失败"); }
    finally { setBusy(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  return <main style={{ minHeight: "100vh", background: "#f5f7fb", color: "#172033", padding: "32px" }}>
    <div style={{ maxWidth: 1400, margin: "0 auto" }}>
      <header style={{ display: "flex", gap: 18, alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div><p style={{ margin: 0, color: "#6d5dfc", fontWeight: 800, letterSpacing: ".12em", fontSize: 12 }}>PAYMENT LAB</p><h1 style={{ margin: "6px 0", fontSize: 34 }}>支付订单与回调监控</h1><p style={{ margin: 0, color: "#687386" }}>参考 Project3 Payment Lab 思路，保留 Project4 的支付宝 RSA2 与微信支付 API v3。</p></div>
        <div style={{ display: "flex", gap: 10 }}><Link href="/platform" style={buttonStyle}>返回平台后台</Link><button type="button" onClick={() => void load()} disabled={busy} style={{ ...buttonStyle, border: 0, background: "#5f45e8", color: "white", cursor: "pointer" }}>{busy ? "刷新中…" : "刷新数据"}</button></div>
      </header>

      {error && <div style={{ background: "#fff0ed", border: "1px solid #ffc8bb", color: "#a53920", padding: 14, borderRadius: 14, marginBottom: 18 }}>{error}</div>}
      <section style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 14, marginBottom: 18 }}>
        <Card label="支付状态" value={data?.state.ready ? "正式收款就绪" : data?.state.mode === "sandbox" ? "沙箱模式" : "待配置"} detail={`首选渠道：${data?.state.provider || "—"}`} />
        <Card label="最近订单" value={String(data?.orders.length || 0)} detail="最多展示最近 100 笔" />
        <Card label="支付日志" value={String(data?.logs.length || 0)} detail="请求 / 回调 / 查询 / 退款" />
        <Card label="支付实现" value="RSA2 + API v3" detail="不使用微信 V2 / MD5" />
      </section>

      <section style={panelStyle}><div style={panelHeadStyle}><div><b style={{ fontSize: 18 }}>渠道状态</b><p style={subStyle}>只有配置完整且公网 HTTPS 可用的渠道才允许正式下单。</p></div></div><div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 12 }}>{(data?.state.channels || []).map((channel) => <div key={channel.provider} style={{ border: "1px solid #e4e8f0", borderRadius: 14, padding: 16 }}><div style={{ display: "flex", justifyContent: "space-between" }}><b>{channel.name}</b><span style={{ color: channel.ready ? "#138a61" : "#a56b16", fontWeight: 700 }}>{channel.ready ? "已就绪" : "未就绪"}</span></div><small style={{ color: "#778295" }}>{channel.provider} · {channel.mode}</small></div>)}</div></section>

      <section style={panelStyle}><div style={panelHeadStyle}><div><b style={{ fontSize: 18 }}>统一支付订单</b><p style={subStyle}>业务订单、支付状态、第三方交易号、履约状态统一查看。</p></div></div><div style={{ overflowX: "auto" }}><table style={tableStyle}><thead><tr>{["订单号","企业 / 套餐","渠道","金额","状态","第三方交易号","创建时间","支付 / 履约"].map((item) => <th key={item} style={thStyle}>{item}</th>)}</tr></thead><tbody>{(data?.orders || []).map((order) => <tr key={order.orderNo}><td style={tdStyle}><code>{order.orderNo}</code></td><td style={tdStyle}><b>{order.tenantName}</b><br/><small>{order.planName}</small></td><td style={tdStyle}>{order.provider}</td><td style={tdStyle}>{money(order.amountCents)}</td><td style={tdStyle}><Status value={order.status}/></td><td style={tdStyle}>{order.providerTradeNo || "—"}</td><td style={tdStyle}>{localDate(order.createdAt)}</td><td style={tdStyle}><small>支付：{localDate(order.paidAt)}<br/>履约：{localDate(order.fulfilledAt)}</small></td></tr>)}{!data?.orders.length && <tr><td colSpan={8} style={{ ...tdStyle, textAlign: "center", color: "#8993a5" }}>暂无支付订单</td></tr>}</tbody></table></div></section>

      <section style={panelStyle}><div style={panelHeadStyle}><div><b style={{ fontSize: 18 }}>Payment Lab 日志</b><p style={subStyle}>敏感字段在写入前自动脱敏；不会展示支付私钥、API Key 或原始回调签名。</p></div><span style={{ color: "#7b8495", fontSize: 12 }}>更新：{localDate(data?.generatedAt)}</span></div><div style={{ overflowX: "auto" }}><table style={tableStyle}><thead><tr>{["时间","方向","渠道","事件","订单号","状态","说明"].map((item) => <th key={item} style={thStyle}>{item}</th>)}</tr></thead><tbody>{(data?.logs || []).map((log) => <tr key={log.id}><td style={tdStyle}>{localDate(log.createdAt)}</td><td style={tdStyle}>{log.direction}</td><td style={tdStyle}>{log.provider}</td><td style={tdStyle}><code>{log.eventType}</code></td><td style={tdStyle}>{log.orderNo || "—"}</td><td style={tdStyle}><Status value={log.status}/></td><td style={tdStyle}>{log.message || "—"}</td></tr>)}{!data?.logs.length && <tr><td colSpan={7} style={{ ...tdStyle, textAlign: "center", color: "#8993a5" }}>暂无 Payment Lab 日志</td></tr>}</tbody></table></div></section>

      <section style={panelStyle}><div style={panelHeadStyle}><div><b style={{ fontSize: 18 }}>模块规则</b><p style={subStyle}>Project4 保留现代支付协议，只复用 Project3 的模块化与风控原则。</p></div></div><div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>{(data?.profile.rules || []).map((rule) => <span key={rule} style={{ padding: "8px 11px", background: "#f0edff", color: "#5841c9", borderRadius: 999, fontSize: 13, fontWeight: 700 }}>{rule}</span>)}</div></section>
    </div>
  </main>;
}

function Card({ label, value, detail }: { label: string; value: string; detail: string }) { return <article style={{ ...panelStyle, marginBottom: 0 }}><span style={{ color: "#7a8496", fontSize: 13 }}>{label}</span><strong style={{ display: "block", margin: "8px 0 4px", fontSize: 24 }}>{value}</strong><small style={{ color: "#8791a2" }}>{detail}</small></article>; }
function Status({ value }: { value: string }) { const good = ["fulfilled","processed","verified","paid","refunded"].includes(value); return <span style={{ display: "inline-block", padding: "5px 8px", borderRadius: 999, fontSize: 12, fontWeight: 700, background: good ? "#e7f8f1" : "#fff4df", color: good ? "#157a59" : "#8d651e" }}>{statusText(value)}</span>; }

const panelStyle = { background: "white", border: "1px solid #e5e9f1", borderRadius: 18, padding: 20, marginBottom: 18, boxShadow: "0 8px 28px rgba(20,32,60,.04)" } as const;
const panelHeadStyle = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginBottom: 16 } as const;
const subStyle = { margin: "5px 0 0", color: "#788396", fontSize: 13 } as const;
const buttonStyle = { display: "inline-flex", alignItems: "center", justifyContent: "center", minHeight: 40, padding: "0 14px", border: "1px solid #dfe4ec", borderRadius: 11, background: "white", color: "#30384a", textDecoration: "none", fontWeight: 700, fontSize: 13 } as const;
const tableStyle = { width: "100%", borderCollapse: "collapse", minWidth: 980, fontSize: 13 } as const;
const thStyle = { textAlign: "left", padding: "10px 11px", borderBottom: "1px solid #e7eaf0", color: "#747f91", fontWeight: 700, whiteSpace: "nowrap" } as const;
const tdStyle = { padding: "11px", borderBottom: "1px solid #eef0f4", verticalAlign: "top", color: "#374155" } as const;
