"use client";

import { useEffect, useRef, useState } from "react";

type Provider = "wechat" | "alipay";
type TestOrder = { provider: Provider; orderNo: string; amountCents: number; payUrl: string; expiresAt: string; message: string };
type QueryResult = { paid: boolean; providerStatus: string; message: string; tradeNo: string | null; amountCents: number | null };
type QrConstructor = new (element: HTMLElement, options: { text: string; width: number; height: number; correctLevel?: number }) => unknown;

declare global {
  interface Window { QRCode?: QrConstructor & { CorrectLevel?: { M?: number } } }
}

let qrLoader: Promise<void> | null = null;
function ensureQrCode() {
  if (typeof window === "undefined" || window.QRCode) return Promise.resolve();
  if (qrLoader) return qrLoader;
  qrLoader = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-payment-qr="1"]');
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("二维码组件加载失败")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js";
    script.async = true;
    script.dataset.paymentQr = "1";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("二维码组件加载失败"));
    document.head.appendChild(script);
  });
  return qrLoader;
}

async function api<T>(body: Record<string, unknown>): Promise<T> {
  const response = await fetch("/api/platform/payment", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(data.error || `请求失败（${response.status}）`);
  return data;
}

function PaymentQr({ value }: { value: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    void ensureQrCode().then(() => {
      if (!active || !ref.current || !window.QRCode) return;
      ref.current.innerHTML = "";
      const level = window.QRCode.CorrectLevel?.M;
      new window.QRCode(ref.current, { text: value, width: 220, height: 220, correctLevel: level });
    }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [value]);
  if (failed) return <div style={{ padding: 18, textAlign: "center" }}>二维码组件未加载，请复制下方支付链接。</div>;
  return <div ref={ref} style={{ width: 220, minHeight: 220, margin: "0 auto", padding: 10, background: "#fff", borderRadius: 14, boxShadow: "0 8px 24px rgba(20,30,55,.08)" }}/>;
}

export default function PaymentTestPanel({ provider, enabled, callbackHttpsReady }: { provider: Provider; enabled: boolean; callbackHttpsReady: boolean }) {
  const [order, setOrder] = useState<TestOrder | null>(null);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  async function createOrder() {
    setBusy("create"); setError(""); setOrder(null); setResult(null);
    try {
      const response = await api<{ order: TestOrder }>({ action: "create_test_order", provider });
      setOrder(response.order);
      setResult({ paid: false, providerStatus: "WAITING", message: "等待扫码支付", tradeNo: null, amountCents: response.order.amountCents });
    } catch (err) { setError(err instanceof Error ? err.message : "测试二维码生成失败"); }
    finally { setBusy(""); }
  }

  async function queryOrder(silent = false) {
    if (!order) return;
    if (!silent) setBusy("query");
    try {
      const response = await api<{ result: QueryResult }>({ action: "query_test_order", provider, orderNo: order.orderNo });
      setResult(response.result); if (!silent) setError("");
    } catch (err) { if (!silent) setError(err instanceof Error ? err.message : "测试订单查询失败"); }
    finally { if (!silent) setBusy(""); }
  }

  useEffect(() => {
    if (!order || result?.paid) return;
    const timer = window.setInterval(() => {
      if (Date.parse(order.expiresAt) <= Date.now()) { window.clearInterval(timer); return; }
      void queryOrder(true);
    }, 2500);
    return () => window.clearInterval(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.orderNo, result?.paid]);

  const providerName = provider === "wechat" ? "微信" : "支付宝";
  const expired = order ? Date.parse(order.expiresAt) <= Date.now() : false;
  const status = result?.paid ? "已支付" : expired ? "已过期" : result?.providerStatus || "等待生成";

  return <section style={{ marginTop: 20, borderTop: "1px solid #e7ebf1", paddingTop: 20 }}>
    <div className="card-head compact">
      <div><p className="section-kicker">PAYMENT LAB</p><h2>{providerName}真实测试收款</h2><p style={{ margin: "6px 0 0", color: "#748095" }}>生成真实 ¥0.01 测试订单和付款二维码，自动查单；测试付款不会开通任何套餐。</p></div>
      <span className={result?.paid ? "live-badge" : "warn-badge"}>{status}</span>
    </div>

    {!callbackHttpsReady && <div className="security-warning" style={{ marginTop: 14 }}><b>当前使用 HTTP</b><span>配置检测和测试二维码可以继续使用；正式上线建议绑定 HTTPS 域名后再开放给客户付款。</span></div>}
    {error && <div className="security-warning" style={{ marginTop: 14 }}><b>测试失败</b><span>{error}</span></div>}

    {!order ? <div style={{ marginTop: 16 }}>
      <button type="button" className="secondary-button" disabled={!enabled || Boolean(busy)} onClick={() => void createOrder()}>{busy === "create" ? "正在请求支付平台…" : `生成 ¥0.01 ${providerName}测试二维码`}</button>
      {!enabled && <small style={{ display: "block", marginTop: 8, color: "#8a95a6" }}>请先保存当前支付配置。</small>}
    </div> : <div style={{ display: "grid", gridTemplateColumns: "minmax(260px, .8fr) minmax(320px, 1.2fr)", gap: 18, marginTop: 16 }}>
      <div style={{ border: "1px solid #e5e9f0", borderRadius: 16, background: "#f8fafc", padding: 18, textAlign: "center" }}>
        <PaymentQr value={order.payUrl}/>
        <strong style={{ display: "block", marginTop: 14, fontSize: 17 }}>{providerName}扫码支付 ¥0.01</strong>
        <small style={{ display: "block", marginTop: 6, color: "#7a8597" }}>二维码约 5 分钟有效 · 这是实际 1 分钱测试支付</small>
      </div>
      <div style={{ border: "1px solid #e5e9f0", borderRadius: 16, padding: 18 }}>
        <div className="auth-line"><span>测试订单号</span><b style={{ overflowWrap: "anywhere" }}>{order.orderNo}</b></div>
        <div className="auth-line"><span>金额</span><b>¥0.01</b></div>
        <div className="auth-line"><span>支付状态</span><b>{status}</b></div>
        <div className="auth-line"><span>有效期</span><b>{new Date(order.expiresAt).toLocaleTimeString("zh-CN")}</b></div>
        {result?.message && <div className="security-warning" style={{ marginTop: 12 }}><b>平台返回</b><span>{result.message}</span></div>}
        <div className="copy-field" style={{ marginTop: 14 }}><code style={{ overflowWrap: "anywhere" }}>{order.payUrl}</code><button type="button" onClick={() => void navigator.clipboard.writeText(order.payUrl)}>复制</button></div>
        <div className="form-actions" style={{ marginTop: 14 }}>
          <button type="button" className="secondary-button" disabled={Boolean(busy)} onClick={() => void queryOrder()}>{busy === "query" ? "查询中…" : "立即查询支付状态"}</button>
          <button type="button" className="secondary-button" disabled={Boolean(busy)} onClick={() => void createOrder()}>重新生成二维码</button>
        </div>
      </div>
    </div>}
  </section>;
}
