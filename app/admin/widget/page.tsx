import Link from "next/link";

const items = [
  ["Widget 状态", "开启 / 关闭网站 AI 客服入口"],
  ["欢迎语配置", "设置访客首次打开时看到的内容"],
  ["快捷问题", "配置套餐、演示、技术支持等入口"],
  ["AI / 人工模式", "控制自动回复与人工接管流程"],
] as const;

export default function WidgetAdminPage() {
  return (
    <main style={{ minHeight: "100vh", padding: 40, background: "#f8fafc", color: "#111827" }}>
      <Link href="/admin" style={{ color: "#4f46e5" }}>← 返回管理后台</Link>
      <h1 style={{ marginTop: 24, fontSize: 32 }}>AI 客服 Widget 配置</h1>
      <p style={{ color: "#64748b" }}>管理企业网站右下角 AI 客服组件。</p>
      <section style={{ marginTop: 32, display: "grid", gap: 16, maxWidth: 760 }}>
        {items.map(([title, desc]) => (
          <article key={title} style={{ padding: 24, borderRadius: 20, background: "white", border: "1px solid #e5e7eb" }}>
            <h2 style={{ margin: 0 }}>{title}</h2>
            <p style={{ color: "#64748b" }}>{desc}</p>
            <button style={{ padding: "10px 16px", borderRadius: 12, border: 0, background: "#4f46e5", color: "white" }}>配置</button>
          </article>
        ))}
      </section>
    </main>
  );
}
