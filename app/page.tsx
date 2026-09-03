import Link from "next/link";
import { accountAccess } from "../lib/app-auth";
import { optionalAccount } from "../lib/page-auth";

export const dynamic = "force-dynamic";

const capabilityCards = [
  ["AI 先接待", "FAQ 与知识库优先回答，低置信度时不硬编。", "01"],
  ["人工无缝接管", "同一窗口进入等待队列，客服回复直接回到访客。", "02"],
  ["实时客服 Inbox", "未读、待接待、我的会话、分配、SLA 与访客画像集中处理。", "03"],
  ["报表与 Trace", "从首次响应到 RAG / Embedding / Rerank / LLM 都能追踪。", "04"],
] as const;

const scenarios = [
  ["电商售后", "退款、物流、发票等高频问题先由 FAQ 直答，复杂售后再转人工。", "售后"],
  ["SaaS 售前", "基于产品文档回答功能与价格问题，并把高意向咨询沉淀为线索。", "售前"],
  ["教育咨询", "课程资料、开班时间、报名政策统一口径，人工负责关键转化。", "咨询"],
  ["企业内部服务", "制度、流程、产品手册统一进入知识库，减少重复内部问答。", "内部"],
] as const;

const trustItems = ["多租户隔离", "会话 Token 保护", "FAQ 优先", "人工兜底", "Trace 可追踪", "Docker 私有化"] as const;

export default async function Page() {
  const account = await optionalAccount();
  const access = account ? await accountAccess(account) : null;
  const consoleHref = access?.destination || "/login";
  const primaryHref = account ? consoleHref : "/register";
  const primaryLabel = account ? "进入控制台" : "免费开始";

  return <main className="kf-site">
    <header className="kf-nav">
      <Link href="/" className="kf-brand"><span>K</span><div><b>KnowFlow</b><small>AI CUSTOMER SERVICE</small></div></Link>
      <nav><a href="#inbox">客服中心</a><a href="#widget">网站客服</a><a href="#operations">运营价值</a><a href="#scenarios">行业场景</a><a href="#security">安全部署</a></nav>
      <div className="kf-nav-actions"><Link href={consoleHref} className="kf-ghost-link">{account ? "返回后台" : "登录"}</Link><Link href={primaryHref} className="kf-primary small">{primaryLabel}</Link></div>
    </header>

    <section className="kf-hero">
      <div className="kf-hero-copy">
        <div className="kf-live-pill"><i/> AI + HUMAN SUPPORT · READY</div>
        <h1>让官网咨询真正变成<br/><span>可接待、可转人工、可衡量</span>的 AI 客服。</h1>
        <p>不是一个演示聊天框。KnowFlow 把企业知识库、FAQ、网站 Widget、人工客服 Inbox、访客画像、客服报表和 Trace 放进同一套商业闭环。</p>
        <div className="kf-hero-actions"><Link href={primaryHref} className="kf-primary">{primaryLabel}<b>→</b></Link><a href="#inbox" className="kf-secondary">查看客服工作台</a></div>
        <div className="kf-hero-trust">{trustItems.slice(0,4).map((item) => <span key={item}>✓ {item}</span>)}</div>
      </div>

      <div className="kf-inbox-preview" aria-label="客服中心产品预览">
        <aside className="kf-preview-queue">
          <header><b>Inbox</b><span>4</span></header>
          <div className="active"><img src="/brand/visitor-avatar.svg" alt=""/><section><b>产品咨询</b><small>这个套餐支持人工客服吗？</small></section><em>2m</em></div>
          <div><span className="avatar violet">林</span><section><b>售后咨询</b><small>退款多久能到账？</small></section><em>6m</em></div>
          <div><span className="avatar mint">陈</span><section><b>API 接入</b><small>可以对接我们的网站吗？</small></section><em>12m</em></div>
          <footer><span><i/> 2 位客服在线</span><b>待接待 1</b></footer>
        </aside>
        <section className="kf-preview-chat">
          <header><div><img src="/brand/visitor-avatar.svg" alt=""/><span><b>网页访客 #A318</b><small>上海 · 官网价格页</small></span></div><em>人工接待中</em></header>
          <div className="kf-preview-messages"><article className="visitor">这个套餐支持人工客服吗？</article><article className="ai"><span>AI</span><p>支持。AI 会先根据企业知识库回答；需要人工时可直接进入客服工作台。</p><small>FAQ 命中 · 无需调用大模型</small></article><div className="kf-handoff-line"><span/> 已由客服「小周」接管</div><article className="agent"><img src="/brand/support-agent.svg" alt=""/><p>你好，我可以继续帮你确认坐席数量和接入方式。</p></article></div>
          <footer><span>📎</span><div>输入回复，Enter 发送…</div><button>↑</button></footer>
        </section>
        <aside className="kf-preview-profile"><header><img src="/brand/visitor-avatar.svg" alt=""/><b>网页访客 #A318</b><span>高意向</span></header><dl><div><dt>来源</dt><dd>官网价格页</dd></div><div><dt>地区</dt><dd>上海</dd></div><div><dt>会话</dt><dd>3 次</dd></div><div><dt>当前模式</dt><dd>人工接待</dd></div></dl><section><small>最近问题</small><p>套餐、坐席数量、网站接入</p></section><button>查看完整画像 →</button></aside>
      </div>
    </section>

    <section className="kf-trust-strip">{trustItems.map((item) => <span key={item}><i>✓</i>{item}</span>)}</section>

    <section className="kf-section" id="inbox">
      <div className="kf-section-head"><div><p>ONE SERVICE DESK</p><h2>客服中心不是功能集合，<br/>而是一张真正能工作的 Inbox。</h2></div><p>访客从 Widget 进来后，AI、FAQ、人工坐席、访客资料、工单和 Trace 都围绕同一个会话流转，不再让商户到处找入口。</p></div>
      <div className="kf-capability-grid">{capabilityCards.map(([title,desc,no]) => <article key={title}><span>{no}</span><div className="kf-cap-icon">{no === "01" ? "✦" : no === "02" ? "↔" : no === "03" ? "▤" : "⌁"}</div><h3>{title}</h3><p>{desc}</p></article>)}</div>
    </section>

    <section className="kf-widget-section" id="widget">
      <div className="kf-widget-copy"><p>WEBSITE WIDGET</p><h2>把一个真正可服务的客服入口，放到商户官网右下角。</h2><p>访客不需要登录。AI 先回答，没解决就切人工；图片、文件和离线邮箱继续沿用同一会话。</p><ul><li>AI / 人工状态清晰可见</li><li>FAQ 与知识库优先回答</li><li>图片 / PDF / Office 文件可发送</li><li>离线后可通过邮件继续跟进</li></ul><Link href={primaryHref} className="kf-primary">配置我的 Widget <b>→</b></Link></div>
      <div className="kf-widget-demo"><div className="kf-browser-bar"><i/><i/><i/><span>your-company.com</span></div><div className="kf-store-copy"><small>PRODUCT SUPPORT</small><h3>需要帮助？<br/>我们在线。</h3><p>把复杂咨询交给 AI 与人工客服协同处理。</p></div><div className="kf-mini-widget"><header><img src="/brand/ai-orb.svg" alt=""/><div><b>产品售后助手</b><small><i/> AI 助手在线</small></div><em>安全会话</em></header><div className="kf-mini-mode"><span><b>AI 托管</b><small>企业知识库优先回答</small></span><button>转人工</button></div><main><article>你好，需要了解产品、套餐还是售后？</article><div>支持人工客服吗？</div><article><b>支持。</b>需要时可以直接进入人工客服队列。</article></main><footer><span>📎</span><p>请输入您的问题…</p><button>↑</button></footer></div></div>
    </section>

    <section className="kf-operations" id="operations">
      <div className="kf-section-head light"><div><p>SERVICE OPERATIONS</p><h2>让商户看见 AI 到底有没有产生价值。</h2></div><p>所有指标来自真实会话，不用“漂亮的演示数字”替代运营结果。</p></div>
      <div className="kf-metric-grid"><article><span>AI 自动解决率</span><strong>实时统计</strong><small>AI / FAQ 成功解决 ÷ 总会话</small></article><article><span>平均首次响应</span><strong>实时统计</strong><small>人工工单创建 → 第一条人工回复</small></article><article><span>人工转接率</span><strong>实时统计</strong><small>进入人工模式的会话占比</small></article><article><span>单会话模型成本</span><strong>实时统计</strong><small>模型成本 ÷ 会话数</small></article></div>
      <div className="kf-trace-demo"><aside><b>Trace</b><span className="active">退款多久能到账？</span><span>套餐支持多少坐席？</span><span>接口是否支持私有化？</span></aside><section><header><div><small>REQUEST TRACE</small><h3>退款多久能到账？</h3></div><em>成功</em></header><div className="kf-trace-flow"><article><span>01</span><b>RAG 检索</b><small>命中售后政策文档</small></article><i>→</i><article><span>02</span><b>Embedding</b><small>BAAI/bge-m3</small></article><i>→</i><article><span>03</span><b>Rerank</b><small>重排 Top 3</small></article><i>→</i><article><span>04</span><b>LLM</b><small>生成有依据回答</small></article></div><footer><span>来源可追溯</span><span>Token 可统计</span><span>成本可核算</span><span>错误可定位</span></footer></section></div>
    </section>

    <section className="kf-section" id="scenarios"><div className="kf-section-head"><div><p>REAL USE CASES</p><h2>先解决真实业务，<br/>再谈 AI 技术名词。</h2></div><p>同一套客服底座可以按行业配置知识、FAQ、欢迎语、Widget 和人工接待规则。</p></div><div className="kf-scenario-grid">{scenarios.map(([title,desc,tag]) => <article key={title}><span>{tag}</span><h3>{title}</h3><p>{desc}</p><b>AI 先接待 → 人工兜底</b></article>)}</div></section>

    <section className="kf-security" id="security"><div><p>SECURITY & DEPLOYMENT</p><h2>数据、账号与客服会话，都在明确边界里。</h2><p>支持云端运行，也支持 Linux Docker 私有化。平台管理员、企业成员、会话访客使用不同权限与 Token 边界。</p><div>{trustItems.map((item) => <span key={item}>✓ {item}</span>)}</div></div><aside><header><i/><i/><i/><b>knowflow / production</b></header><code><em>$</em> docker compose up -d</code><code><span>✓</span> knowflow&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; healthy</code><code><span>✓</span> qdrant&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; healthy</code><code><span>✓</span> email-relay&nbsp;&nbsp;&nbsp; healthy</code><footer>PRIVATE · MULTI-TENANT · AUDITABLE</footer></aside></section>

    <section className="kf-final"><div><p>FROM KNOWLEDGE TO SERVICE</p><h2>让企业知识，真正变成<br/>可以交付的客服能力。</h2></div><Link href={primaryHref} className="kf-primary dark">{primaryLabel}<b>→</b></Link></section>
    <footer className="kf-footer"><Link href="/" className="kf-brand"><span>K</span><div><b>KnowFlow</b><small>AI CUSTOMER SERVICE</small></div></Link><p>企业知识库 · AI 客服 · 人工接待 · 运营分析</p><nav><Link href="/workspace/login">企业工作台</Link><Link href="/admin/login">内部运营</Link><Link href="/platform/login">平台管理</Link></nav><small>© 2026 KNOWFLOW</small></footer>
  </main>;
}
