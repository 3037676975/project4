from pathlib import Path


def read(path):
    return Path(path).read_text()


def write(path, text):
    Path(path).write_text(text)


def repl(path, old, new, expected=1):
    text = read(path)
    count = text.count(old)
    if count != expected:
        raise SystemExit(f"{path}: expected {expected}, got {count}: {old[:120]!r}")
    write(path, text.replace(old, new))


# 1) Alipay business checkout: page.pay -> native precreate QR.
p = "lib/billing.ts"
text = read(p)
marker = '''function orderNumber() {
  const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  const random = crypto.getRandomValues(new Uint32Array(2));
  return `KF${date}${random[0].toString(36).toUpperCase()}${random[1].toString(36).toUpperCase()}`.slice(0, 32);
}
'''
helper = marker + '''
function extractAlipayJsonObject(raw: string, key: string) {
  const marker = `"${key}"`; const keyIndex = raw.indexOf(marker);
  if (keyIndex < 0) return "";
  const colon = raw.indexOf(":", keyIndex + marker.length); if (colon < 0) return "";
  let start = colon + 1; while (/\\s/.test(raw[start] || "")) start += 1;
  if (raw[start] !== "{") return "";
  let depth = 0; let inString = false; let escaped = false;
  for (let index = start; index < raw.length; index += 1) {
    const character = raw[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') { inString = true; continue; }
    if (character === "{") depth += 1;
    if (character === "}") { depth -= 1; if (depth === 0) return raw.slice(start, index + 1); }
  }
  return "";
}
'''
if marker not in text:
    raise SystemExit("billing.ts: orderNumber marker missing")
text = text.replace(marker, helper, 1)
old = '''  if (input.provider === "alipay") {
    const parameters: Record<string, string> = {
      app_id: config.merchantId,
      method: "alipay.trade.page.pay",
      format: "JSON",
      charset: "utf-8",
      sign_type: "RSA2",
      timestamp: chinaPaymentTimestamp(),
      version: "1.0",
      notify_url: callbackUrl,
      return_url: config.details.returnUrl || `${(runtime.APP_BASE_URL || "").replace(/\\/$/, "")}/workspace`,
      biz_content: JSON.stringify({ out_trade_no: input.orderNo, product_code: "FAST_INSTANT_TRADE_PAY", total_amount: (input.amountCents / 100).toFixed(2), subject: input.description.slice(0, 128) }),
    };
    parameters.sign = await rsaSha256Sign(alipayRequestSignContent(parameters), config.details.appPrivateKey || "");
    const checkout = new URL(config.checkoutUrl);
    checkout.search = new URLSearchParams(parameters).toString();
    return { paymentUrl: checkout.toString(), providerTradeNo: null };
  }
'''
new = '''  if (input.provider === "alipay") {
    const responseKey = "alipay_trade_precreate_response";
    const parameters: Record<string, string> = {
      app_id: config.merchantId,
      method: "alipay.trade.precreate",
      format: "JSON",
      charset: "utf-8",
      sign_type: "RSA2",
      timestamp: chinaPaymentTimestamp(),
      version: "1.0",
      notify_url: callbackUrl,
      biz_content: JSON.stringify({ out_trade_no: input.orderNo, total_amount: (input.amountCents / 100).toFixed(2), subject: input.description.slice(0, 128), timeout_express: "30m" }),
    };
    parameters.sign = await rsaSha256Sign(alipayRequestSignContent(parameters), config.details.appPrivateKey || "");
    const response = await fetch(config.checkoutUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=utf-8", Accept: "application/json" },
      body: new URLSearchParams(parameters).toString(), signal: AbortSignal.timeout(15000),
    });
    const raw = await response.text();
    if (!response.ok) throw new PublicApiError(502, `支付宝下单 HTTP ${response.status}`, "payment_gateway_error");
    let parsed: Record<string, unknown>;
    try { parsed = JSON.parse(raw) as Record<string, unknown>; }
    catch { throw new PublicApiError(502, "支付宝下单返回了无效 JSON。", "payment_gateway_error"); }
    const payload = parsed[responseKey] as Record<string, unknown> | undefined;
    if (!payload) throw new PublicApiError(502, "支付宝下单返回缺少业务响应。", "payment_gateway_error");
    const signedContent = extractAlipayJsonObject(raw, responseKey);
    const signature = typeof parsed.sign === "string" ? parsed.sign : "";
    const signatureValid = Boolean(signedContent && signature && await rsaSha256Verify(signedContent, signature, config.details.alipayPublicKey || ""));
    if (!signatureValid) throw new PublicApiError(502, "支付宝下单响应验签失败。", "payment_gateway_error");
    if (String(payload.code || "") !== "10000") throw new PublicApiError(502, String(payload.sub_msg || payload.msg || payload.sub_code || "支付宝下单失败。"), "payment_gateway_error");
    const qrCode = typeof payload.qr_code === "string" ? payload.qr_code : "";
    if (!qrCode) throw new PublicApiError(502, "支付宝下单成功但没有返回 qr_code。", "payment_gateway_error");
    return { paymentUrl: qrCode, providerTradeNo: null };
  }
'''
if text.count(old) != 1:
    raise SystemExit(f"billing.ts: page-pay block count {text.count(old)}")
write(p, text.replace(old, new, 1))


# 2) Business checkout modal with QR + polling.
Path("app/payment-checkout-modal.tsx").write_text(r'''"use client";

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
''')


# 3) Wire modal into enterprise billing UI.
p = "app/dashboard.tsx"
repl(p, 'import OnboardingWizard from "./onboarding-wizard";\n', 'import OnboardingWizard from "./onboarding-wizard";\nimport PaymentCheckoutModal from "./payment-checkout-modal";\n')
repl(p,
     '  const [tenant, setTenant] = useState<TenantData | null>(null); const [billing, setBilling] = useState<Billing | null>(null); const [paymentProvider, setPaymentProvider] = useState(""); const [apiKeys, setApiKeys] = useState<ApiKeyItem[]>([]);\n',
     '  const [tenant, setTenant] = useState<TenantData | null>(null); const [billing, setBilling] = useState<Billing | null>(null); const [paymentProvider, setPaymentProvider] = useState(""); const [checkoutOrder, setCheckoutOrder] = useState<BillingOrder | null>(null); const [apiKeys, setApiKeys] = useState<ApiKeyItem[]>([]);\n')
old_select = '''  async function selectPlan(code: string) { if (!confirm("系统将创建待支付订单。只有支付验签成功后套餐才会生效，继续？")) return; setBusy(`plan-${code}`); try { const data = await api<{ order: BillingOrder }>("/api/billing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "create_order", planCode: code, provider: paymentProvider || billing?.payment.provider, clientRequestId: crypto.randomUUID() }) }); if (data.order.provider === "sandbox") { if (confirm(`本地沙箱订单 ${data.order.orderNo} 已创建。现在模拟付款并验证幂等开通？`)) await api("/api/billing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "sandbox_confirm", orderNo: data.order.orderNo }) }); } else if (data.order.paymentUrl) window.location.assign(data.order.paymentUrl); setBilling(await api<Billing>("/api/billing")); setUsage(await api<Usage>("/api/usage")); setToast({ kind: "ok", text: data.order.provider === "sandbox" ? "沙箱付款完成，套餐已由订单履约程序开通。" : "订单已创建，请在支付页面完成付款。" }); } catch (error) { setToast({ kind: "error", text: error instanceof Error ? error.message : "下单失败" }); } finally { setBusy(null); } }
'''
new_select = '''  async function selectPlan(code: string) { if (!confirm("系统将创建待支付订单。只有支付验签成功后套餐才会生效，继续？")) return; setBusy(`plan-${code}`); try { const data = await api<{ order: BillingOrder }>("/api/billing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "create_order", planCode: code, provider: paymentProvider || billing?.payment.provider, clientRequestId: crypto.randomUUID() }) }); if (data.order.provider === "sandbox") { if (confirm(`本地沙箱订单 ${data.order.orderNo} 已创建。现在模拟付款并验证幂等开通？`)) await api("/api/billing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "sandbox_confirm", orderNo: data.order.orderNo }) }); } else if (data.order.paymentUrl) setCheckoutOrder(data.order); setBilling(await api<Billing>("/api/billing")); setUsage(await api<Usage>("/api/usage")); setToast({ kind: "ok", text: data.order.provider === "sandbox" ? "沙箱付款完成，套餐已由订单履约程序开通。" : "订单已创建，请扫描二维码完成付款。" }); } catch (error) { setToast({ kind: "error", text: error instanceof Error ? error.message : "下单失败" }); } finally { setBusy(null); } }
  async function paymentCompleted() { setBilling(await api<Billing>("/api/billing")); setUsage(await api<Usage>("/api/usage")); setToast({ kind: "ok", text: "支付已确认，套餐和 Credits 已自动开通。" }); }
'''
repl(p, old_select, new_select)
repl(p,
     '{order.paymentUrl && order.status === "pending" && <a className="secondary-button fit" href={order.paymentUrl}>继续付款</a>}',
     '{order.paymentUrl && order.status === "pending" && <button className="secondary-button fit" onClick={() => setCheckoutOrder(order)}>继续付款</button>}')
repl(p,
     '</article>; })}</section>\n    </>;\n  }\n\n  function membersView()',
     '</article>; })}</section>\n      {checkoutOrder?.paymentUrl && <PaymentCheckoutModal order={{ ...checkoutOrder, paymentUrl: checkoutOrder.paymentUrl }} onClose={() => setCheckoutOrder(null)} onPaid={() => void paymentCompleted()}/>}\n    </>;\n  }\n\n  function membersView()')
