import Link from "next/link";
import { accountAccess } from "../lib/app-auth";
import { optionalAccount } from "../lib/page-auth";
import styles from "./homepage.module.css";

export const dynamic = "force-dynamic";

const capabilities = [
  ["AI 先接待", "FAQ 与企业知识库优先回答，低置信度不强答，把重复问题挡在人工之前。", "01", "AI"],
  ["人工无缝接管", "访客不用换窗口。转人工后直接进入待接待队列，客服回复实时回到原会话。", "02", "↔"],
  ["实时客服 Inbox", "未读、待接待、我的会话、访客画像、附件与 SLA 集中在一张工作台。", "03", "▦"],
  ["报表与 Trace", "解决率、转人工率、首响时间、模型调用与 RAG 链路都能回看和定位。", "04", "⌁"],
] as const;

const scenarios = [
  ["电商售后", "物流、退款、发票等标准问题先由 AI 处理，复杂售后自动交给人工。", "售后服务"],
  ["SaaS 售前", "基于产品文档回答功能与套餐问题，并把高意向咨询沉淀为可跟进线索。", "售前转化"],
  ["教育咨询", "课程、开班、报名政策统一口径，人工坐席专注关键决策和成交。", "咨询接待"],
  ["企业内部服务", "制度、流程、产品手册进入统一知识库，减少重复内部问答。", "内部支持"],
] as const;

const trustItems = ["多租户隔离", "FAQ 优先", "人工兜底", "会话可追踪", "数据可导出", "Docker 私有化"] as const;

export default async function Page() {
  const account = await optionalAccount();
  const access = account ? await accountAccess(account) : null;
  const consoleHref = access?.destination || "/login";
  const primaryHref = account ? consoleHref : "/register";
  const primaryLabel = account ? "进入控制台" : "免费开始";

  return <main className={styles.page}>
    <header className={styles.navWrap}>
      <div className={styles.nav}>
        <Link href="/" className={styles.brand} aria-label="KnowFlow 首页">
          <span>K</span><div><b>KnowFlow</b><small>AI CUSTOMER SERVICE</small></div>
        </Link>
        <nav aria-label="官网导航">
          <a href="#inbox">客服中心</a><a href="#widget">网站客服</a><a href="#operations">运营价值</a><a href="#scenarios">行业场景</a><a href="#security">安全部署</a>
        </nav>
        <div className={styles.navActions}><Link href={consoleHref} className={styles.login}>{account ? "返回后台" : "登录"}</Link><Link href={primaryHref} className={`${styles.primaryButton} ${styles.smallButton}`}>{primaryLabel}</Link></div>
      </div>
    </header>

    <section className={styles.hero}>
      <div className={styles.heroGlowOne}/><div className={styles.heroGlowTwo}/>
      <div className={styles.heroCopy}>
        <div className={styles.badge}><i/> AI 客服 + 人工接待 + 运营分析</div>
        <h1>把每一次官网咨询，变成<br/><span>可接待、可转人工、可复盘</span>的服务。</h1>
        <p>KnowFlow 把企业知识库、FAQ、网站客服 Widget、人工客服 Inbox、访客画像、报表与 Trace 放进同一条服务链路，让 AI 真正进入业务，而不是停留在演示聊天框。</p>
        <div className={styles.heroActions}><Link href={primaryHref} className={styles.primaryButton}>{primaryLabel}<b>→</b></Link><a href="#inbox" className={styles.secondaryButton}>查看客服工作台</a></div>
        <div className={styles.heroTrust}>{trustItems.slice(0,4).map((item) => <span key={item}><i>✓</i>{item}</span>)}</div>
      </div>

      <div className={styles.productShell} id="inbox" aria-label="KnowFlow 实时客服 Inbox 产品界面示意">
        <div className={styles.browserBar}><div><i/><i/><i/></div><span>app.knowflow.ai / customer-service</span><em>客服中心</em></div>
        <div className={styles.productTopbar}><div><span className={styles.miniBrand}>K</span><section><b>实时客服 Inbox</b><small>AI 与人工共享同一会话上下文</small></section></div><nav><span><i/> 2 位客服在线</span><button>+ 新建客服规则</button></nav></div>
        <div className={styles.serviceDesk}>
          <aside className={styles.queue}>
            <header><div><b>会话</b><small>今天</small></div><span>4</span></header>
            <div className={styles.queueTabs}><button className={styles.activeTab}>待接待 1</button><button>未读 3</button><button>我的</button></div>
            <div className={`${styles.queueItem} ${styles.activeQueue}`}><img src="/brand/visitor-avatar.svg" alt=""/><section><b>产品咨询</b><p>这个套餐支持人工客服吗？</p><small>官网价格页 · 刚刚</small></section><em>2</em></div>
            <div className={styles.queueItem}><span className={`${styles.queueAvatar} ${styles.purple}`}>林</span><section><b>售后咨询</b><p>退款多久可以到账？</p><small>帮助中心 · 6 分钟前</small></section></div>
            <div className={styles.queueItem}><span className={`${styles.queueAvatar} ${styles.green}`}>陈</span><section><b>API 接入</b><p>可以接到我们的官网吗？</p><small>官网首页 · 12 分钟前</small></section></div>
            <footer><span><i/>坐席在线</span><b>平均首响实时统计</b></footer>
          </aside>

          <section className={styles.chatPanel}>
            <header><div><img src="/brand/visitor-avatar.svg" alt=""/><section><b>网页访客 #A318</b><small>上海 · 官网价格页 · 第 3 次访问</small></section></div><div className={styles.chatHeaderActions}><span>人工接待中</span><button>···</button></div></header>
            <div className={styles.messages}>
              <div className={styles.timeLine}><span/>今天 10:32<span/></div>
              <article className={styles.userMessage}>这个套餐支持人工客服吗？</article>
              <article className={styles.aiMessage}><span className={styles.aiAvatar}>AI</span><div><p>支持。AI 会先根据企业 FAQ 和知识库回答；需要人工时，可以直接进入客服工作台继续处理。</p><small>✓ FAQ 命中 · 无需调用大模型</small></div></article>
              <div className={styles.handoff}><span/>已由客服「小周」接管<span/></div>
              <article className={styles.agentMessage}><img src="/brand/support-agent.svg" alt=""/><div><b>小周 · 客服</b><p>你好，我可以继续帮你确认坐席数量、价格和网站接入方式。</p></div></article>
            </div>
            <footer className={styles.composer}><button>＋</button><div>输入回复，Enter 发送…</div><span>⌘ Enter</span><button className={styles.sendButton}>↑</button></footer>
          </section>

          <aside className={styles.profile}>
            <header><img src="/brand/visitor-avatar.svg" alt=""/><b>网页访客 #A318</b><span>正在浏览价格页</span></header>
            <section className={styles.profileBlock}><small>访客画像</small><dl><div><dt>来源</dt><dd>官网价格页</dd></div><div><dt>地区</dt><dd>上海</dd></div><div><dt>历史会话</dt><dd>3 次</dd></div><div><dt>当前模式</dt><dd className={styles.onlineText}>人工接待</dd></div></dl></section>
            <section className={styles.profileBlock}><small>本次关注</small><div className={styles.tags}><span>套餐价格</span><span>坐席数量</span><span>网站接入</span></div></section>
            <section className={styles.profileBlock}><small>客服动作</small><button className={styles.profileAction}>转为线索 <b>→</b></button><button className={styles.profileAction}>查看 Trace <b>→</b></button></section>
          </aside>
        </div>
      </div>
    </section>

    <section className={styles.trustStrip}>{trustItems.map((item) => <span key={item}><i>✓</i>{item}</span>)}</section>

    <section className={styles.section}>
      <div className={styles.sectionHeading}><div><p>ONE SERVICE DESK</p><h2>一张客服工作台，接住从 AI 到人工的完整服务流程。</h2></div><p>成熟客服系统的关键不是“功能多”，而是访客、会话、知识、人工坐席和运营数据围绕同一件事工作。KnowFlow 把这些入口放回一条真正能落地的业务链路。</p></div>
      <div className={styles.capabilityGrid}>{capabilities.map(([title,desc,no,icon]) => <article key={title}><div><span>{icon}</span><small>{no}</small></div><h3>{title}</h3><p>{desc}</p><a href="#operations">了解能力 <b>→</b></a></article>)}</div>
    </section>

    <section className={styles.widgetSection} id="widget">
      <div className={styles.widgetInner}>
        <div className={styles.widgetCopy}><p>WEBSITE WIDGET</p><h2>把客服能力放到商户官网右下角，而不是再放一个“AI 演示框”。</h2><p>访客无需登录。AI 先答，没解决就进入人工队列；图片、文件、离线邮箱和历史上下文继续沿用同一会话。</p><ul><li>AI / 人工状态始终可见</li><li>FAQ 与知识库优先回答</li><li>图片 / PDF / Office 文件可发送</li><li>访客离开后支持邮件继续跟进</li></ul><Link href={primaryHref} className={styles.lightButton}>配置网站客服 <b>→</b></Link></div>
        <div className={styles.widgetVisual}>
          <div className={styles.fakeWebsite}><header><span>ACME</span><nav>产品　定价　文档　联系</nav></header><main><small>PRODUCT SUPPORT</small><h3>复杂咨询，<br/>交给专业服务。</h3><p>AI 负责高频问题，人工负责关键客户。</p></main></div>
          <div className={styles.miniWidget}><header><img src="/brand/ai-orb.svg" alt=""/><div><b>产品售后助手</b><small><i/> AI 助手在线</small></div><span>企业专属</span></header><div className={styles.modeBar}><section><b>AI 托管</b><small>企业 FAQ 与知识库优先</small></section><button>转人工</button></div><main><article>你好，需要了解产品、套餐还是售后？</article><div>支持人工客服吗？</div><article><b>支持。</b> 需要时可以直接进入人工客服队列。</article></main><footer><button>＋</button><p>请输入您的问题…</p><button>↑</button></footer></div>
          <div className={styles.widgetLauncher}><span>✦</span><div><b>在线客服</b><small>AI + 人工</small></div></div>
        </div>
      </div>
    </section>

    <section className={styles.operations} id="operations">
      <div className={styles.sectionHeading}><div><p>运营价值 · SERVICE OPERATIONS</p><h2>让商户看见 AI 到底解决了多少问题，人工接待得怎么样。</h2></div><p>不使用虚构客户数量或漂亮百分比。后台只展示由真实会话计算出来的解决率、转人工率、首次响应、模型调用与服务成本。</p></div>
      <div className={styles.metricGrid}><article><span>AI 自动解决率</span><strong>实时统计</strong><small>AI / FAQ 成功解决 ÷ 总会话</small></article><article><span>平均首次响应</span><strong>实时统计</strong><small>进入人工队列 → 第一条人工回复</small></article><article><span>人工转接率</span><strong>实时统计</strong><small>进入人工模式的会话占比</small></article><article><span>单会话模型成本</span><strong>实时统计</strong><small>模型调用成本 ÷ 会话数</small></article></div>
      <div className={styles.traceCard}><aside><header><b>Trace</b><span>实时</span></header><button className={styles.traceActive}>退款多久能到账？<small>刚刚</small></button><button>套餐支持多少坐席？<small>3 分钟</small></button><button>接口是否支持私有化？<small>8 分钟</small></button></aside><section><header><div><small>REQUEST TRACE</small><h3>退款多久能到账？</h3></div><span>✓ 成功</span></header><div className={styles.traceFlow}><article><span>01</span><b>RAG 检索</b><small>命中售后政策</small></article><i>→</i><article><span>02</span><b>Embedding</b><small>向量召回</small></article><i>→</i><article><span>03</span><b>Rerank</b><small>重排 Top 3</small></article><i>→</i><article><span>04</span><b>LLM</b><small>生成有依据回答</small></article></div><footer><span>来源可追溯</span><span>Token 可统计</span><span>成本可核算</span><span>错误可定位</span></footer></section></div>
    </section>

    <section className={styles.section} id="scenarios"><div className={styles.sectionHeading}><div><p>行业场景 · REAL USE CASES</p><h2>先解决真实业务，再谈 AI 技术名词。</h2></div><p>同一套客服底座可以按行业配置知识、FAQ、欢迎语、Widget 和人工接待规则，不需要每个客户重新开发一套系统。</p></div><div className={styles.scenarioGrid}>{scenarios.map(([title,desc,tag],index) => <article key={title}><div><span>0{index+1}</span><small>{tag}</small></div><h3>{title}</h3><p>{desc}</p><b>AI 先接待 <i>→</i> 人工兜底</b></article>)}</div></section>

    <section className={styles.securitySection} id="security"><div><p>SECURITY & DEPLOYMENT</p><h2>数据、账号与客服会话，都在明确边界里。</h2><p>支持云端运行，也支持 Linux Docker 私有化。平台管理员、企业成员和网站访客使用不同权限与会话 Token，租户数据独立隔离。</p><div className={styles.securityTags}>{trustItems.map((item) => <span key={item}>✓ {item}</span>)}</div></div><aside><header><i/><i/><i/><b>knowflow / production</b></header><code><em>$</em> docker compose up -d</code><code><span>✓</span> knowflow&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; healthy</code><code><span>✓</span> qdrant&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; healthy</code><code><span>✓</span> email-relay&nbsp;&nbsp;&nbsp; healthy</code><footer>PRIVATE · MULTI-TENANT · AUDITABLE</footer></aside></section>

    <section className={styles.finalCta}><div><p>FROM KNOWLEDGE TO SERVICE</p><h2>让企业知识，真正变成可以交付的客服能力。</h2></div><Link href={primaryHref} className={styles.primaryButton}>{primaryLabel}<b>→</b></Link></section>

    <footer className={styles.footer}><Link href="/" className={styles.brand}><span>K</span><div><b>KnowFlow</b><small>AI CUSTOMER SERVICE</small></div></Link><p>企业知识库 · AI 客服 · 人工接待 · 运营分析</p><nav><Link href="/workspace/login">企业工作台</Link><Link href="/admin/login">内部运营</Link><Link href="/platform/login">平台管理</Link></nav><small>© 2026 KNOWFLOW</small></footer>
  </main>;
}
