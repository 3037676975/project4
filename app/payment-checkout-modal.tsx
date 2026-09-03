"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type CheckoutOrder = { orderNo: string; provider: string; status: string; amountCents: number; paymentUrl: string; expiresAt: string; plan?: { name: string } };
type QueryResponse = { order?: { status?: string }; providerState?: { providerStatus?: string; message?: string }; syncError?: string; error?: string };
type QrConstructor = new (element: HTMLElement, options: { text: string; width: number; height: number; correctLevel?: number }) => unknown;
declare global { interface Window { QRCode?: QrConstructor & { CorrectLevel?: { M?: number } } } }

let qrLoader: Promise<void> | null = null;
function ensureQrCode() {
  if (typeof window === "undefined" || window.QRCode) return Promise.resolve();
  if (qrLoader) return qrLoader;
  qrLoader = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-business-payment-qr="1"]');
    if (existing) { existing.addEventListener("load", () => resolve(), { once: true }); existing.addEventListener("error", () => reject(new Error("二维码组件加载失败")), { once: true }); return; }
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js";
    script.async = true; script.dataset.businessPaymentQr = "1";
    script.onload = () => resolve(); script.onerror = () => reject(new Error("二维码组件加载失败"));
    document.head.appendChild(script);
  });
  return qrLoader;
}

function PaymentQr({ value }: { value: string }) {
  const ref = useRef<HTMLDivElement>(null); const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    void ensureQrCode().then(() => {
      if (!active || !ref.current || !window.QRCode) return;
      ref.current.innerHTML = "";
      new window.QRCode(ref.current, { text: value, width: 232, height: 232, correctLevel: window.QRCode.CorrectLevel?.M });
    }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [value]);
  if (failed) return <div style={{ padding: 28, textAlign: "center", color: "#7a8597" }}>二维码组件加载失败，请复制支付内容后使用支付 App 打开。</div>;
  return <div ref={ref} style={{ width: 252, minHeight: 252, margin: "0 auto", padding: 10, background: "#fff", borderRadius: 18, boxShadow: "0 12px 34px rgba(17,24,39,.12)" }}/>;
}

export default function PaymentCheckoutModal({ order, onClose, onPaid }: { order: CheckoutOrder; onClose: () => void; onPaid: () => void }) {
  const [status, setStatus] = useState(order.status); const [message, setMessage] = useState("等待扫码付款"); const [checking, setChecking] = useState(false); const paidOnce = useRef(false);
  const providerName = order.provider === "wechat" ? "微信支付" : order.provider === "alipay" ? "支付宝" : "在线支付";
  const expired = Date.parse(order.expiresAt) <= Date.now();
  const query = useCallback(async (silent = false) => {
    if (!silent) setChecking(true);
    try {
      const headers = new Headers(); const tenantId = localStorage.getItem("knowflow_tenant_id"); if (tenantId) headers.set("x-tenant-id", tenantId);
      const response = await fetch(`/api/payments/query?orderNo=${encodeURIComponent(order.orderNo)}`, { headers });
      const data = await response.json() as QueryResponse;
      if (data.order?.status) setStatus(data.order.status);
      setMessage(data.providerState?.message || data.syncError || data.error || (data.order?.status === "fulfilled" ? "支付成功，套餐已开通" : "等待扫码付款"));
      if (data.order?.status === "fulfilled" && !paidOnce.current) { paidOnce.current = true; onPaid(); }
    } catch (error) {
      if (!silent) setMessage(error instanceof Error ? error.message : "查单失败，请稍后重试");
    } finally { if (!silent) setChecking(false); }
  }, [onPaid, order.orderNo]);

  useEffect(() => {
    if (status === "fulfilled" || expired) return;
    const timer = window.setInterval(() => void query(true), 2500);
    void query(true);
    return () => window.clearInterval(timer);
  }, [expired, query, status]);

  const paid = status === "fulfilled";
  return <div role="dialog" aria-modal="true" style={{ position: "fixed", inset: 0, zIndex: 1200, display: "grid", placeItems: "center", padding: 20, background: "rgba(10,18,34,.58)", backdropFilter: "blur(7px)" }}>
    <section style={{ width: "min(880px, 96vw)", maxHeight: "92vh", overflow: "auto", borderRadius: 24, background: "#fff", boxShadow: "0 28px 80px rgba(0,0,0,.24)", padding: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 20, marginBottom: 18 }}><div><p className="section-kicker">SECURE CHECKOUT</p><h2 style={{ margin: "4px 0 6px" }}>{paid ? "支付成功" : `${providerName}扫码付款`}</h2><span style={{ color: "#748095" }}>{order.plan?.name || "套餐订单"} · 订单创建后自动查单并验签开通</span></div><button type="button" className="secondary-button fit" onClick={onClose}>{paid ? "完成" : "关闭"}</button></div>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(280px,.9fr) minmax(320px,1.1fr)", gap: 20 }}>
        <div style={{ border: "1px solid #e6eaf0", borderRadius: 20, background: paid ? "#f1fbf6" : "#f8fafc", padding: 22, textAlign: "center" }}>
          {!paid && !expired ? <PaymentQr value={order.paymentUrl}/> : <div style={{ minHeight: 252, display: "grid", placeItems: "center", fontSize: 64 }}>{paid ? "✓" : "×"}</div>}
          <strong style={{ display: "block", marginTop: 14, fontSize: 18 }}>{paid ? "付款已确认，套餐已生效" : expired ? "订单二维码已过期" : `请使用${providerName.replace("支付", "")}扫码`}</strong>
          <small style={{ display: "block", marginTop: 7, color: "#7a8597" }}>系统每 2.5 秒主动查单；只有验签、交易号和金额全部一致才会开通套餐。</small>
        </div>
        <div style={{ border: "1px solid #e6eaf0", borderRadius: 20, padding: 20 }}>
          <div className="auth-line"><span>订单号</span><b style={{ overflowWrap: "anywhere" }}>{order.orderNo}</b></div>
          <div className="auth-line"><span>套餐</span><b>{order.plan?.name || "—"}</b></div>
          <div className="auth-line"><span>金额</span><b>¥{(order.amountCents / 100).toFixed(2)}</b></div>
          <div className="auth-line"><span>渠道</span><b>{providerName}</b></div>
          <div className="auth-line"><span>状态</span><b>{paid ? "已支付并开通" : expired ? "已过期" : status === "pending" ? "等待付款" : status}</b></div>
          <div className="auth-line"><span>有效期</span><b>{new Date(order.expiresAt).toLocaleTimeString("zh-CN")}</b></div>
          <div className="security-warning" style={{ marginTop: 14 }}><b>{paid ? "支付完成" : "支付状态"}</b><span>{message}</span></div>
          {!paid && !expired && <><div className="copy-field" style={{ marginTop: 14 }}><code style={{ overflowWrap: "anywhere", maxHeight: 84, overflow: "auto" }}>{order.paymentUrl}</code><button type="button" onClick={() => void navigator.clipboard.writeText(order.paymentUrl)}>复制</button></div><div className="form-actions" style={{ marginTop: 14 }}><button type="button" className="secondary-button" disabled={checking} onClick={() => void query()}>{checking ? "查询中…" : "立即查询支付状态"}</button></div></>}
        </div>
      </div>
    </section>
  </div>;
}
