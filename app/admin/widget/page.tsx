"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface WidgetSettings {
  enabled: boolean;
  title: string;
  welcomeMessage: string;
  avatar: string;
  themeColor: string;
  position: string;
  mode: string;
  quickQuestions: string[];
}

const defaultSettings: WidgetSettings = {
  enabled: true,
  title: "KnowFlow AI 客服",
  welcomeMessage: "你好，我可以帮助你查询产品、价格和技术方案。",
  avatar: "🤖",
  themeColor: "#2563eb",
  position: "right",
  mode: "hybrid",
  quickQuestions: ["产品介绍", "价格咨询", "联系客服"],
};

export default function WidgetAdminPage() {
  const [settings, setSettings] = useState<WidgetSettings>(defaultSettings);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/admin/widget-settings")
      .then((res) => res.json())
      .then((data) => setSettings({ ...defaultSettings, ...data }))
      .catch(() => setSettings(defaultSettings));
  }, []);

  async function save() {
    await fetch("/api/admin/widget-settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <main style={{ minHeight: "100vh", padding: 40, background: "#f8fafc" }}>
      <Link href="/admin" style={{ color: "#2563eb" }}>← 返回超级管理员后台</Link>
      <h1 style={{ marginTop: 24, fontSize: 36 }}>AI 客服 Widget 配置中心</h1>
      <p style={{ color: "#64748b" }}>Phase 2.8：后台配置真实驱动官网悬浮客服。</p>

      <section style={{ maxWidth: 900, marginTop: 30, background: "white", padding: 30, borderRadius: 24 }}>
        <label>开启 Widget</label>
        <input type="checkbox" checked={settings.enabled} onChange={(e) => setSettings({ ...settings, enabled: e.target.checked })} />

        <h3>客服标题</h3>
        <input value={settings.title} onChange={(e) => setSettings({ ...settings, title: e.target.value })} />

        <h3>欢迎语</h3>
        <textarea value={settings.welcomeMessage} onChange={(e) => setSettings({ ...settings, welcomeMessage: e.target.value })} />

        <h3>工作模式</h3>
        <select value={settings.mode} onChange={(e) => setSettings({ ...settings, mode: e.target.value })}>
          <option value="ai">AI自动接待</option>
          <option value="hybrid">AI+人工</option>
          <option value="human">人工客服</option>
        </select>

        <h3>快捷问题</h3>
        <input value={settings.quickQuestions.join(" / ")} onChange={(e) => setSettings({ ...settings, quickQuestions: e.target.value.split("/").map((v) => v.trim()) })} />

        <button onClick={save} style={{ marginTop: 24, padding: "12px 30px", borderRadius: 12, background: settings.themeColor, color: "white", border: 0 }}>
          保存配置
        </button>
        {saved && <p>保存成功</p>}
      </section>
    </main>
  );
}
