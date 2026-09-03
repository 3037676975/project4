import Link from "next/link";

const settings = [
  ["Widget 状态", "控制官网右下角 AI 客服是否展示", "已开启"],
  ["欢迎语", "访客首次进入时展示", "你好，我是 KnowFlow AI 客服"],
  ["快捷问题", "降低访客输入成本", "产品介绍 / 价格咨询 / 联系销售"],
  ["接待模式", "AI 与人工客服策略", "AI 优先 + 人工兜底"],
];

export default function WidgetAdminPage() {
  return (
    <main style={{ minHeight: "100vh", padding: 40, background: "#f8fafc" }}>
      <Link href="/admin" style={{ color: "#2563eb" }}>← 返回超级管理员后台</Link>
      <h1 style={{ marginTop: 24, fontSize: 36 }}>AI 客服 Widget 配置中心</h1>
      <p style={{ color: "#64748b" }}>Phase 2.7：统一管理悬浮窗展示、访客体验和接待策略。</p>

      <section style={{ display: "grid", gap: 20, gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", marginTop: 30 }}>
        {settings.map(([title, desc, value]) => (
          <article key={title} style={{ background: "white", padding: 24, borderRadius: 20, border: "1px solid #e2e8f0" }}>
            <h2>{title}</h2>
            <p style={{ color: "#64748b" }}>{desc}</p>
            <div style={{ background: "#f1f5f9", padding: 14, borderRadius: 12 }}>{value}</div>
            <button style={{ marginTop: 16, width: "100%", padding: 12, borderRadius: 12, border: 0, background: "#2563eb", color: "white" }}>编辑配置</button>
          </article>
        ))}
      </section>
    </main>
  );
}
