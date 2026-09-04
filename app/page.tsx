import Link from "next/link";
import { accountAccess } from "../lib/app-auth";
import { optionalAccount } from "../lib/page-auth";
import styles from "./homepage.module.css";

export const dynamic = "force-dynamic";

const benefits = [
  ["7×24 小时在线", "全时段智能响应", "✦"],
  ["高效解决问题", "平均响应时间 < 3s", "◷"],
  ["无缝转人工", "复杂问题一键转接", "↗"],
  ["数据驱动优化", "会话分析持续改进", "⌁"],
] as const;

const conversations = [
  ["访客 · 北京", "产品功能介绍", "10:24", "AI", "blue", "/brand/visitor-male-v3.jpg"],
  ["访客 · 上海", "如何接入网站客服？", "10:22", "人工", "orange", "/brand/visitor-female-v3.jpg"],
  ["访客 · 广州", "价格与套餐说明", "10:18", "AI", "blue", "/brand/visitor-male-v3.jpg"],
  ["访客 · 深圳", "售后与技术支持", "10:16", "人工", "orange", "/brand/visitor-female-v3.jpg"],
] as const;

const stats = [
  ["会话总数", "1,285", "+18%"],
  ["AI 解决率", "68%", "+12%"],
  ["平均响应", "2.8s", "-8%"],
  ["转人工率", "18%", "-6%"],
] as const;

const features = [
  ["AI 智能接待", "FAQ、知识库与大模型协同回答，先解决高频问题，再把复杂咨询交给人工。", "01"],
  ["人工客服 Inbox", "待接待、未读、我的会话、访客画像与附件集中在一张工作台。", "02"],
  ["网站客服 Widget", "一段代码接入官网，默认展开、快捷问题、AI / 人工切换都可以配置。", "03"],
  ["Trace 与服务分析", "查看 RAG、模型调用、命中来源、转人工率与响应时长，问题可追溯。", "04"],
] as const;

const scenarios = [
  ["电商售后", "物流、退款、发票先由 AI 处理，异常订单自动转人工。"],
  ["SaaS 售前", "回答产品与套餐问题，识别高意向访客并沉淀销售线索。"],
  ["教育咨询", "课程、报名、开班政策统一口径，复杂咨询交给顾问。"],
  ["企业内部服务", "制度、流程、产品手册进入统一知识库，减少重复问答。"],
] as const;

export default async function Page() {
  const account = await optionalAccount();
  const access = account ? await accountAccess(account) : null;
  const consoleHref = access?.destination || "/login";
  const primaryHref = account ? consoleHref : "/register";
  const primaryLabel = account ? "进入控制台" : "免费开始";

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div className={styles.nav}>
          <Link href="/" className={styles.brand} aria-label="KnowFlow 首页">
            <span className={styles.brandMark}><i/><i/><i/></span>
            <span className={styles.brandText}><b>KnowFlow</b><small>AI CUSTOMER SERVICE</small></span>
          </Link>
          <nav className={styles.navLinks} aria-label="官网导航">
            <a href="#product">产品</a><a href="#solutions">解决方案</a><a href="#scenarios">客户案例</a><a href="#operations">运营价值</a><a href="#security">安全部署</a>
          </nav>
          <div className={styles.navActions}>
            <Link href={consoleHref} className={styles.login}>{account ? "返回后台" : "登录"}</Link>
            <Link href={primaryHref} className={styles.navCta}>{primaryLabel}</Link>
          </div>
        </div>
      </header>

      <section className={styles.hero}>
        <div className={styles.heroGrid}>
          <div className={styles.heroCopy}>
            <div className={styles.eyebrow}><span>✦</span> 新一代 AI 客服平台，让服务更高效</div>
            <h1>AI 客服 + 人工接待<br/><span>懂业务的智能客服</span></h1>
            <p>KnowFlow 把企业知识库、FAQ、网站客服、人工接待与服务分析放进同一条链路。AI 负责高频问题，复杂咨询无缝转人工，让每一次服务都更专业、更有温度。</p>
            <div className={styles.heroActions}>
              <Link href={primaryHref} className={styles.primaryButton}>{primaryLabel}<b>→</b></Link>
              <a href="#product" className={styles.secondaryButton}>查看客服工作台</a>
            </div>
            <div className={styles.benefitRow}>
              {benefits.map(([title, desc, icon]) => <div key={title}><span>{icon}</span><section><b>{title}</b><small>{desc}</small></section></div>)}
            </div>
          </div>

          <div className={styles.heroAside} aria-hidden="true">
            <div className={styles.glowOne}/><div className={styles.glowTwo}/>
            <div className={styles.agentCard}>
              <img src="/brand/support-agent-v3.jpg" alt="真人客服"/>
              <div><small>人工客服在线</small><b>平均 45 秒接入</b></div>
              <span>● 在线</span>
            </div>
            <div className={styles.floatCard}><b>AI 解决率</b><strong>68%</strong><small>今日实时统计</small></div>
          </div>
        </div>

        <div className={styles.dashboard} id="product">
          <div className={styles.dashboardTop}><div><span className={styles.miniLogo}>K</span><section><b>服务收件箱</b><small>AI 与人工共享同一会话上下文</small></section></div><div className={styles.dashboardTopActions}><span><i/> 2 位客服在线</span><button>+ 新建规则</button></div></div>
          <div className={styles.workspace}>
            <aside className={styles.inbox}>
              <header><div><b>会话收件箱</b><small>今天</small></div><em>12</em></header>
              <div className={styles.inboxTabs}><button className={styles.tabActive}>全部</button><button>待接待 3</button><button>我的</button></div>
              {conversations.map(([name, text, time, mode, tone, avatar], index) => <article className={index === 0 ? styles.activeConversation : ""} key={name}>
                <img src={avatar} alt={`${name} 真人头像`}/>
                <section><b>{name}</b><p>{text}</p><small>官网 · {time}</small></section>
                <span className={tone === "orange" ? styles.tagOrange : styles.tagBlue}>{mode}</span>
              </article>)}
              <footer>查看全部会话 <b>→</b></footer>
            </aside>

            <section className={styles.liveChat}>
              <header><div><img src="/brand/visitor-male-v3.jpg" alt="访客真人头像"/><section><b>访客 · 来自北京</b><small>官网价格页 · 第 3 次访问</small></section></div><div><span>AI 服务中</span><button>转人工</button><button>结束会话</button></div></header>
              <div className={styles.chatBody}>
                <div className={styles.timeDivider}><span/>今天 10:24<span/></div>
                <div className={styles.botMessage}><span className={styles.botAvatar}>✦</span><section><small>KnowFlow AI</small><p>你好！很高兴为你服务。你想了解产品功能、套餐，还是网站接入方式？</p></section></div>
                <div className={styles.userMessage}>请问支持自定义知识库吗？</div>
                <div className={styles.botMessage}><span className={styles.botAvatar}>✦</span><section><small>KnowFlow AI</small><p>支持。你可以上传企业文档、FAQ 或网页内容，AI 会优先基于知识库检索并给出有依据的回答。</p><em>✓ 知识库命中 · 3 个来源</em></section></div>
                <div className={styles.handoff}><span/>低置信度问题可一键转人工，历史上下文自动保留<span/></div>
              </div>
              <footer className={styles.composer}><button>＋</button><div>输入回复，Enter 发送…</div><span>发送 ↑</span></footer>
            </section>

            <aside className={styles.insights}>
              <section className={styles.visitorCard}><header><b>访客信息</b><span>高意向</span></header><div className={styles.visitorMain}><img src="/brand/visitor-male-v3.jpg" alt="访客真人头像"/><div><b>网页访客 #A318</b><small>北京 · 官网价格页</small></div></div><dl><div><dt>来源</dt><dd>官网首页</dd></div><div><dt>设备</dt><dd>macOS · Chrome</dd></div><div><dt>历史会话</dt><dd>3 次</dd></div></dl></section>
              <section className={styles.statGrid}>{stats.map(([label,value,delta]) => <article key={label}><small>{label}</small><b>{value}</b><span>{delta}</span></article>)}</section>
              <section className={styles.miniAnalytics}><div><small>FAQ 命中率</small><b>82%</b><span>↑ 11%</span></div><div className={styles.sparkline}><i/><i/><i/><i/><i/><i/></div></section>
              <section className={styles.traceMini}><header><b>会话追踪</b><a href="/platform">查看 Trace →</a></header><div><span>01</span><p><b>RAG 检索</b><small>命中产品知识库</small></p></div><div><span>02</span><p><b>生成回答</b><small>来源可追溯</small></p></div></section>
            </aside>
          </div>
        </div>
      </section>

      <section className={styles.trustBar}><div><p><b>深受企业团队信赖</b><small>从咨询到成交，把服务能力变成可复用资产</small></p><div className={styles.trustNames}><span>电商零售</span><span>SaaS 软件</span><span>教育服务</span><span>企业服务</span><span>内部知识</span></div></div></section>

      <section className={styles.section} id="solutions">
        <div className={styles.sectionHeading}><div><span>WHY KNOWFLOW</span><h2>不是多一个聊天框，<br/>而是一套完整的客户服务系统。</h2></div><p>从 AI 自动回答到人工接管，从会话轨迹到数据复盘，核心能力围绕同一个访客、同一条会话链路协同工作。</p></div>
        <div className={styles.featureGrid}>{features.map(([title,desc,no]) => <article key={title}><div><span>{no}</span><i>↗</i></div><h3>{title}</h3><p>{desc}</p></article>)}</div>
      </section>

      <section className={styles.flowSection} id="operations">
        <div className={styles.flowInner}><div className={styles.flowCopy}><span>SERVICE FLOW</span><h2>让每一次咨询都有清晰的处理链路。</h2><p>先检索，再回答；低置信度就转人工；服务结束后，所有关键节点都可以复盘。</p><Link href={primaryHref} className={styles.lightButton}>开始配置 <b>→</b></Link></div><div className={styles.flowSteps}><article><span>01</span><b>访客提问</b><small>官网 Widget</small></article><i>→</i><article><span>02</span><b>知识检索</b><small>FAQ + RAG</small></article><i>→</i><article><span>03</span><b>AI 回答</b><small>来源可追溯</small></article><i>→</i><article><span>04</span><b>人工接管</b><small>上下文保留</small></article></div></div>
      </section>

      <section className={styles.section} id="scenarios">
        <div className={styles.sectionHeading}><div><span>SCENARIOS</span><h2>适合真正需要“服务闭环”的业务。</h2></div><p>不是只做问答演示，而是让 AI、人工客服、知识库和运营数据真正进入业务流程。</p></div>
        <div className={styles.scenarioGrid}>{scenarios.map(([title,desc],index) => <article key={title}><span>0{index+1}</span><h3>{title}</h3><p>{desc}</p><b>了解场景 →</b></article>)}</div>
      </section>

      <section className={styles.security} id="security"><div><span>SECURITY & DEPLOYMENT</span><h2>企业数据，按你的方式部署。</h2><p>支持 Docker 私有化部署、租户隔离、权限控制与审计追踪。模型、向量数据库与业务服务可以按资源独立拆分。</p><div className={styles.securityPills}><span>Docker 私有化</span><span>多租户隔离</span><span>权限控制</span><span>Trace 审计</span></div></div><Link href={primaryHref} className={styles.primaryButton}>进入控制台 <b>→</b></Link></section>

      <footer className={styles.footer}><div><div className={styles.footerBrand}><span className={styles.brandMark}><i/><i/><i/></span><section><b>KnowFlow</b><small>AI CUSTOMER SERVICE</small></section></div><p>让 AI 真正进入客户服务，而不是停留在演示聊天框。</p></div><span>© 2026 KnowFlow · AI 客服与知识运营平台</span></footer>
    </main>
  );
}
