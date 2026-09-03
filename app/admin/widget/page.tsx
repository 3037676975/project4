import Link from "next/link";

const settings = [
  {
    title: "网站悬浮窗开关",
    desc: "控制企业官网右下角 AI 客服入口是否展示",
    value: "已开启",
  },
  {
    title: "默认欢迎语",
    desc: "访客第一次打开客服窗口时显示",
    value: "你好，我是 KnowFlow AI 客服，有什么可以帮助你？",
  },
  {
    title: "快捷问题预设",
    desc: "减少访客输入成本，支持产品咨询、价格、技术支持",
    value: "套餐咨询 / 产品演示 / 售后支持",
  },
  {
    title: "智能接待模式",
    desc: "支持 AI 自动回复与人工客服接管",
    value: "AI 优先 + 人工兜底",
  },
];

export default function WidgetAdminPage() {
  return (
    <main style={{ minHeight: "100vh", padding: 40, background: "linear-gradient(135deg,#f8fafc,#eef2ff)", color: "#111827" }}>
      <Link href="/admin" style={{ color: "#2563eb", textDecoration: "none" }}>
        ← 返回超级管理员后台
      </Link>

      <div style={{ maxWidth: 1000, marginTop: 30 }}>
        <h1 style={{ fontSize: 36, marginBottom: 8 }}>AI 客服悬浮窗配置中心</h1>
        <p style={{ color: "#64748b" }}>参考 AI-CS 风格，集中管理官网 Widget 展示、预设问题和接待策略。</p>

        <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 20, marginTop: 30 }}>
          {settings.map((item) => (
            <article key={item.title} style={{ background: "white", borderRadius: 24, padding: 24, border: "1px solid #e2e8f0", boxShadow: "0 15px 35px rgba(15,23,42,.06)" }}>
              <h2 style={{ fontSize: 20 }}>{item.title}</h2>
              <p style={{ color: "#64748b", minHeight: 45 }}>{item.desc}</p>
              <div style={{ background: "#f8fafc", borderRadius: 14, padding: 14, marginBottom: 16 }}>{item.value}</div>
              <button style={{ width: "100%", padding: "12px", borderRadius: 14, border: 0, background: "#2563eb", color: "white", cursor: "pointer" }}>
                编辑配置
              </button>
            </article>
          ))}
        </section>

        <section style={{ marginTop: 30, background: "#111827", color: "white", borderRadius: 24, padding: 28 }}>
          <h2>悬浮窗预览</h2>
          <div style={{ marginTop: 20, background: "white", color: "#111827", borderRadius: 18, padding: 20, maxWidth: 360 }}>
            <b>🤖 KnowFlow AI 客服</b>
            <p>你好，需要了解产品还是技术方案？</p>
            <button>价格咨询</button> <button>在线演示</button>
          </div>
        </section>
      </div>
    </main>
  );
}
