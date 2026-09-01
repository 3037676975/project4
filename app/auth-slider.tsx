"use client";

import { KeyboardEvent, useCallback, useEffect, useRef, useState } from "react";

type Portal = "platform" | "admin" | "workspace";

export default function AuthSlider({ purpose, portal, resetKey, onVerified }: {
  purpose: "register" | "login"; portal: Portal; resetKey: string;
  onVerified: (value: { challengeId: string; sliderTicket: string }) => void;
}) {
  const onVerifiedRef = useRef(onVerified);
  useEffect(() => { onVerifiedRef.current = onVerified; }, [onVerified]);
  const [challengeId, setChallengeId] = useState(""); const [target, setTarget] = useState(75); const [position, setPosition] = useState(0);
  const [status, setStatus] = useState<"loading" | "ready" | "verifying" | "verified" | "error">("loading");
  const [message, setMessage] = useState("拖动滑块，使方块与缺口对齐");

  const create = useCallback(async () => {
    setStatus("loading"); setPosition(0); setMessage("正在生成安全验证…"); onVerifiedRef.current({ challengeId: "", sliderTicket: "" });
    try {
      const response = await fetch("/api/auth/slider", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "create", purpose, portal }) });
      const data = await response.json() as { challengeId?: string; targetPosition?: number; error?: string };
      if (!response.ok || !data.challengeId || typeof data.targetPosition !== "number") throw new Error(data.error || "滑块加载失败。");
      setChallengeId(data.challengeId); setTarget(data.targetPosition); setStatus("ready"); setMessage("拖动滑块，使方块与缺口对齐");
    } catch (error) { setStatus("error"); setMessage(error instanceof Error ? error.message : "滑块加载失败。"); }
  }, [portal, purpose]);

  useEffect(() => { const timer = window.setTimeout(() => void create(), 0); return () => window.clearTimeout(timer); }, [create, resetKey]);

  async function verify(value: number) {
    if (status !== "ready" || !challengeId) return; setStatus("verifying"); setMessage("正在校验位置…");
    try {
      const response = await fetch("/api/auth/slider", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "verify", challengeId, position: value }) });
      const data = await response.json() as { challengeId?: string; sliderTicket?: string; error?: string };
      if (!response.ok || !data.challengeId || !data.sliderTicket) throw new Error(data.error || "滑块验证失败。");
      setStatus("verified"); setPosition(target); setMessage("验证通过，可以发送验证码"); onVerifiedRef.current({ challengeId: data.challengeId, sliderTicket: data.sliderTicket });
    } catch (error) {
      setStatus("error"); setMessage(error instanceof Error ? error.message : "滑块验证失败。");
      window.setTimeout(() => void create(), 900);
    }
  }

  function keyboard(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" || event.key === " ") { event.preventDefault(); void verify(Number(event.currentTarget.value)); }
  }

  return <div className={`auth-slider ${status}`} aria-live="polite">
    <div className="auth-slider-scene">
      <span className="auth-slider-target" style={{ left: `calc(${target}% - 22px)` }}>◇</span>
      <span className="auth-slider-piece" style={{ left: `calc(${position}% - 22px)` }}>{status === "verified" ? "✓" : "◆"}</span>
      <div className="auth-slider-progress" style={{ width: `${position}%` }}/>
      <input aria-label="安全验证滑块" type="range" min="0" max="100" step="1" value={position} disabled={status !== "ready"}
        onChange={(event) => setPosition(Number(event.target.value))}
        onPointerUp={(event) => void verify(Number(event.currentTarget.value))}
        onKeyDown={keyboard}/>
    </div>
    <div className="auth-slider-message"><span>{status === "verified" ? "✓" : status === "error" ? "!" : "↔"}</span>{message}{status === "error" && <button type="button" onClick={() => void create()}>刷新</button>}</div>
  </div>;
}
