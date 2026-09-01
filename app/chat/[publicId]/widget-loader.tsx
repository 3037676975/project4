"use client";

import { useEffect, useState } from "react";
import WidgetClient from "./widget-client";
import type { Config } from "./widget-client";

export default function WidgetLoader({ publicId, embedToken }: { publicId: string; embedToken: string }) {
  const [config, setConfig] = useState<Config | null>(null); const [failed, setFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => { void fetch(`/api/public/config?publicId=${encodeURIComponent(publicId)}&embedToken=${encodeURIComponent(embedToken)}`, { signal: controller.signal }).then(async (response) => {
      if (!response.ok) throw new Error("unavailable"); setConfig(await response.json() as Config);
    }).catch((error) => { if (error instanceof Error && error.name !== "AbortError") setFailed(true); }); }, 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [publicId, embedToken]);
  if (failed) return <main className="widget-unavailable"><section><span>K</span><h1>客服入口尚未启用</h1><p>请联系企业管理员检查公开客服设置或套餐状态。</p></section></main>;
  if (!config) return <main className="widget-unavailable"><section><span className="spinner dark"/><h1>正在连接企业客服</h1><p>正在读取助手和套餐配置…</p></section></main>;
  return <WidgetClient config={config} embedToken={embedToken}/>;
}
