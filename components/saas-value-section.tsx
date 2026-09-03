"use client";

const items = [
  ["RAG 知识库", "企业文档、FAQ 与业务资料统一接入，回答可追溯。"],
  ["Agent 工作流", "让 AI 根据业务规则规划任务并调用工具。"],
  ["MCP 工具连接", "连接企业系统，让客服从回答走向执行。"],
  ["私有化部署", "支持 Docker 部署与企业数据隔离。"],
] as const;

export default function SaasValueSection() {
  return (
    <section style={{ padding: "80px 24px" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <p style={{ color: "#6366f1", fontWeight: 700 }}>AI SERVICE PLATFORM</p>
        <h2 style={{ fontSize: 40 }}>从 AI 客服到企业智能服务平台</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 20 }}>
          {items.map(([title, desc]) => (
            <article key={title} style={{ padding: 24, borderRadius: 20, background: "white", border: "1px solid #e5e7eb" }}>
              <h3>{title}</h3>
              <p>{desc}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
