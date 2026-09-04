import Link from "next/link";
import { accountAccess } from "../lib/app-auth";
import { optionalAccount } from "../lib/page-auth";
import styles from "./homepage.module.css";

export const dynamic = "force-dynamic";

const capabilities = [
  {
    mark: "01",
    icon: "AI",
    title: "AI 先接待，答案有依据",
    description: "FAQ、企业知识库和 RAG 统一进入一条回答链路。低置信度不硬答，回答可回看来源和 Trace。",
    detail: "RAG · FAQ · 引用来源",
  },
  {
    mark: "02",
    icon: "↗",
    title: "无缝转人工，不丢上下文",
    description: "访客不用换窗口。AI 处理不了的咨询直接进入客服工作台，人工继续同一段会话。",
    detail: "Handoff · Inbox · SLA",
  },
  {
    mark: "03",
    icon: "◎",
    title: "把服务过程变成可运营的数据",
    description: "会话、未解决问题、模型调用、人工接待和线索都能被追踪，不再只看一个聊天窗口。",
    detail: "Analytics · Trace · Leads",
  },
  {
    mark: "04",
    icon: "◇",
    title: "支持 Docker 私有化部署",
    description: "业务应用、向量库和模型服务可以按资源拆分，适合企业内网、独立服务器和混合部署。",
    detail: "Docker · Qdrant · API",
  },
] as const;

const scenarios = [
  ["SaaS 售前", "让 AI 先回答产品、套餐和接入问题，高意向咨询自动沉淀为销售线索。", "售前转化"],
  ["电商售后", "物流、退款、发票等高频问题先自动处理，复杂售后再转人工。", "售后服务"],
  ["企业知识服务", "制度、流程、产品手册统一进入知识库，减少内部重复问答。", "内部支持"],
  ["教育与咨询", "课程、报名、政策问题统一口径，人工把时间留给真正需要沟通的客户。", "咨询接待"],
] as const;

const trustItems = ["多租户隔离", "来源可追溯", "人工可接管", "数据可导出", "Docker 私有化", "API 可集成"] as const;

export default async function Page() {
  const account = await optionalAccount();
  const access = account ? await accountAccess(account) : null;
  const consoleHref = access?.destination || "/login";
  const primaryHref = account ? consoleHref : "/register";
  const primaryLabel = account ? "进入控制台" : "免费开始";

  return (
    <main className={styles.page}>
      <header className={styles.navWrap}>
        <div className={styles.nav}>
          <Link href="/" className={styles.brand} aria-label="KnowFlow 首页">
            <span className={styles.brandMark}>K</span>
            <span className={styles.brandText}>
              <b>KnowFlow</b>
              <small>AI Customer Service</small>
            </span>
          </Link>

          <nav className={styles.navLinks} aria-label="官网导航">
            <a href="#capabilities">产品能力</a>
            <a href="#workflow">服务链路</a>
            <a href="#widget">网站客服</a>
            <a href="#scenarios">行业场景</a>
            <a href="#security">安全部署</a>
          </nav>

          <div className={styles.navActions}>
            <Link href={consoleHref} className={styles.loginLink}>{account ? "返回后台" : "登录"}</Link>
            <Link href={primaryHref} className={styles.navCta}>{primaryLabel}<span>↗</span></Link>
          </div>
        </div>
      </header>

      <section className={styles.hero}>
        <div className={styles.heroGlowOne} />
        <div className={styles.heroGlowTwo} />
        <div className={styles.heroGrid}>
          <div className={styles.heroCopy}>
            <div className={styles.eyebrow}><span>NEW</span> AI 客服 · 人工接待 · RAG · 运营分析</div>
            <h1>让 AI 接住咨询，<br /><em>让人工只处理真正重要的问题。</em></h1>
            <p className={styles.heroLead}>KnowFlow 把企业知识库、AI 客服、人工 Inbox、访客画像、Trace 和运营数据放进同一条服务链路。不是一个“能聊天的 Demo”，而是一套可以真正接待客户的 AI 客服系统。</p>

            <div className={styles.heroActions}>
              <Link href={primaryHref} className={styles.primaryButton}>{primaryLabel}<span>→</span></Link>
              <a href="#product-preview" className={styles.secondaryButton}>查看产品界面</a>
            </div>

            <div className={styles.heroSignals}>
              <div><b>AI + Human</b><span>同一会话上下文</span></div>
              <div><b>RAG First</b><span>企业知识优先回答</span></div>
              <div><b>Private Ready</b><span>支持私有化部署</span></div>
            </div>
          </div>

          <div className={styles.heroVisual} id="product-preview" aria-label="KnowFlow 客服工作台界面示意">
            <div className={styles.visualAura} />
            <div className={styles.productWindow}>
              <div className={styles.windowTopbar}>
                <div className={styles.windowDots}><i /><i /><i /></div>
                <span className={styles.windowAddress}>app.knowflow.ai / inbox</span>
                <span className={styles.windowStatus}><i /> Live</span>
              </div>

              <div className={styles.productBody}>
                <aside className={styles.productSidebar}>
                  <div className={styles.productLogo}>K</div>
                  <div className={`${styles.sideIcon} ${styles.sideIconActive}`}>⌁</div>
                  <div className={styles.sideIcon}>▦</div>
                  <div className={styles.sideIcon}>◇</div>
                  <div className={styles.sideIcon}>◎</div>
                  <div className={styles.sideSpacer} />
                  <div className={styles.sideAvatar}>周</div>
                </aside>

                <aside className={styles.conversationList}>
                  <div className={styles.listHeader}>
                    <div><span>INBOX</span><b>实时会话</b></div>
                    <em>4</em>
                  </div>
                  <div className={styles.listTabs}><span className={styles.listTabActive}>待处理</span><span>我的</span><span>全部</span></div>

                  <article className={`${styles.conversationItem} ${styles.conversationItemActive}`}>
                    <span className={styles.customerAvatar}>访</span>
                    <div><b>产品咨询</b><p>这个套餐支持人工客服吗？</p><small>官网价格页 · 刚刚</small></div>
                    <em>2</em>
                  </article>
                  <article className={styles.conversationItem}>
                    <span className={`${styles.customerAvatar} ${styles.avatarPurple}`}>林</span>
                    <div><b>售后咨询</b><p>退款多久可以到账？</p><small>帮助中心 · 6 分钟前</small></div>
                  </article>
                  <article className={styles.conversationItem}>
                    <span className={`${styles.customerAvatar} ${styles.avatarMint}`}>陈</span>
                    <div><b>API 接入</b><p>可以接到我们官网吗？</p><small>官网首页 · 12 分钟前</small></div>
                  </article>
                </aside>

                <section className={styles.chatWorkspace}>
                  <header className={styles.chatHeader}>
                    <div>
                      <span className={styles.chatAvatar}>访</span>
                      <div><b>网页访客 #A318</b><small>上海 · 官网价格页 · 第 3 次访问</small></div>
                    </div>
                    <span className={styles.humanBadge}>人工接待中</span>
                  </header>

                  <div className={styles.chatMessages}>
                    <div className={styles.chatDate}>今天 10:32</div>
                    <div className={styles.visitorBubble}>这个套餐支持人工客服吗？</div>
                    <div className={styles.aiReply}>
                      <span>AI</span>
                      <div><p>支持。AI 会先根据企业 FAQ 和知识库回答，需要人工时可以直接转入客服工作台。</p><small>✓ FAQ 命中 · 有依据回答</small></div>
                    </div>
                    <div className={styles.handoffLine}><span /> 已由客服「小周」接管 <span /></div>
                    <div className={styles.agentReply}>
                      <span>周</span>
                      <div><b>小周 · 客服</b><p>你好，我可以继续帮你确认坐席数量、价格和网站接入方式。</p></div>
                    </div>
                  </div>

                  <div className={styles.chatComposer}>
                    <span>＋</span><p>输入回复，Enter 发送…</p><button>↑</button>
                  </div>
                </section>

                <aside className={styles.insightPanel}>
                  <div className={styles.insightHero}>
                    <span className={styles.insightAvatar}>访</span>
                    <b>网页访客 #A318</b>
                    <small><i /> 正在浏览价格页</small>
                  </div>
                  <div className={styles.insightBlock}>
                    <span>本次关注</span>
                    <div className={styles.tagRow}><i>套餐价格</i><i>网站接入</i><i>人工客服</i></div>
                  </div>
                  <div className={styles.insightBlock}>
                    <span>AI 判断</span>
                    <div className={styles.scoreCard}><b>高意向</b><em>82</em></div>
                  </div>
                  <div className={styles.insightBlock}>
                    <span>下一步</span>
                    <div className={styles.nextAction}>转为销售线索 <b>→</b></div>
                  </div>
                </aside>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.trustBand} aria-label="产品能力摘要">
        <div>{trustItems.map((item) => <span key={item}><i>✓</i>{item}</span>)}</div>
      </section>

      <section className={styles.section} id="capabilities">
        <div className={styles.sectionIntro}>
          <div>
            <p>PRODUCT SYSTEM</p>
            <h2>不是堆功能。<br />而是把客服业务重新连成一条线。</h2>
          </div>
          <p>从访客进入官网，到 AI 检索知识、回答问题、转人工、形成线索，再到运营复盘，每一步都围绕同一个客户会话发生。</p>
        </div>

        <div className={styles.capabilityGrid}>
          {capabilities.map((item, index) => (
            <article key={item.title} className={`${styles.capabilityCard} ${index === 0 ? styles.capabilityFeatured : ""}`}>
              <div className={styles.capabilityTop}><span>{item.icon}</span><em>{item.mark}</em></div>
              <h3>{item.title}</h3>
              <p>{item.description}</p>
              <footer><span>{item.detail}</span><b>↗</b></footer>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.darkSection} id="workflow">
        <div className={styles.darkGlow} />
        <div className={styles.darkInner}>
          <div className={styles.darkIntro}>
            <p>HOW IT WORKS</p>
            <h2>一条完整的 AI 客服服务链路。</h2>
            <span>从用户提问到人工接管，每一步都可以被追踪、配置和复盘。</span>
          </div>

          <div className={styles.workflow}>
            <article><em>01</em><div className={styles.workflowIcon}>?</div><h3>访客提问</h3><p>官网 Widget、API 或其他渠道进入统一会话。</p></article>
            <i className={styles.flowArrow}>→</i>
            <article><em>02</em><div className={styles.workflowIcon}>R</div><h3>RAG 检索</h3><p>FAQ、知识库、向量召回和重排一起工作。</p></article>
            <i className={styles.flowArrow}>→</i>
            <article><em>03</em><div className={styles.workflowIcon}>AI</div><h3>可信回答</h3><p>有依据就回答，低置信度进入兜底策略。</p></article>
            <i className={styles.flowArrow}>→</i>
            <article><em>04</em><div className={styles.workflowIcon}>人</div><h3>人工接管</h3><p>上下文完整带入客服 Inbox，不让客户重复描述。</p></article>
          </div>

          <div className={styles.darkFooterStrip}>
            <span><i /> 全链路 Trace</span>
            <span><i /> 会话历史</span>
            <span><i /> 未解决问题</span>
            <span><i /> 成本与质量</span>
          </div>
        </div>
      </section>

      <section className={styles.widgetSection} id="widget">
        <div className={styles.widgetCopy}>
          <p className={styles.kicker}>WEBSITE WIDGET</p>
          <h2>把真正能工作的客服，放在官网右下角。</h2>
          <p>用户不需要登录，也不需要跳到另一个页面。AI 先回答，处理不了就转人工；同一段会话继续保留上下文、来源和访客信息。</p>
          <ul>
            <li><span>01</span><div><b>默认在线</b><small>访客打开页面即可发起咨询</small></div></li>
            <li><span>02</span><div><b>AI / 人工状态清晰</b><small>用户知道当前是谁在接待</small></div></li>
            <li><span>03</span><div><b>企业知识优先</b><small>FAQ 与 RAG 先于通用回答</small></div></li>
          </ul>
          <Link href={primaryHref} className={styles.textLink}>配置网站客服 <span>→</span></Link>
        </div>

        <div className={styles.widgetStage}>
          <div className={styles.stageGlow} />
          <div className={styles.fakeSite}>
            <header><b>Northstar</b><nav>产品　方案　资源　联系</nav></header>
            <div><small>AI SERVICE PLATFORM</small><h3>服务客户，<br />不必从零开始。</h3><p>把高频问题交给 AI，把关键客户交给团队。</p></div>
          </div>
          <div className={styles.widgetMock}>
            <header>
              <span className={styles.widgetOrb}>✦</span>
              <div><b>KnowFlow 智能客服</b><small><i /> AI 助手在线</small></div>
              <em>×</em>
            </header>
            <div className={styles.widgetMode}><b>AI 接待</b><span>转人工</span></div>
            <main>
              <div className={styles.widgetAi}>你好，需要了解产品、套餐还是部署方案？</div>
              <div className={styles.widgetUser}>支持私有化部署吗？</div>
              <div className={styles.widgetAi}><b>支持。</b> 可以使用 Docker 私有化部署，并按资源拆分业务服务、向量库和模型服务。</div>
            </main>
            <footer><span>输入你的问题…</span><button>↑</button></footer>
          </div>
        </div>
      </section>

      <section className={styles.section} id="scenarios">
        <div className={styles.sectionIntro}>
          <div><p>USE CASES</p><h2>不是只适合“客服部门”。</h2></div>
          <p>任何需要大量重复解释、又不能牺牲准确性的业务，都可以把 KnowFlow 放到客户与团队之间。</p>
        </div>
        <div className={styles.scenarioGrid}>
          {scenarios.map(([title, description, tag], index) => (
            <article key={title}>
              <span className={styles.scenarioNumber}>0{index + 1}</span>
              <div><small>{tag}</small><h3>{title}</h3><p>{description}</p></div>
              <b>↗</b>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.securitySection} id="security">
        <div className={styles.securityCard}>
          <div className={styles.securityCopy}>
            <p>SECURITY & DEPLOYMENT</p>
            <h2>数据边界、模型服务和部署方式，都由你决定。</h2>
            <span>适合从 Demo 走向真实业务。平台支持多租户隔离、API 权限、审计、数据导出与 Docker 私有化部署。</span>
            <Link href={primaryHref} className={styles.securityButton}>开始配置 <b>→</b></Link>
          </div>
          <div className={styles.securityGrid}>
            <article><span>01</span><b>多租户隔离</b><p>知识、会话、成员和配置按企业隔离。</p></article>
            <article><span>02</span><b>私有化部署</b><p>Docker、Qdrant 与模型服务可独立部署。</p></article>
            <article><span>03</span><b>数据可迁移</b><p>关键业务数据支持导出、恢复和审计。</p></article>
            <article><span>04</span><b>模型可配置</b><p>平台统一维护模型、Embedding 与 Rerank 服务。</p></article>
          </div>
        </div>
      </section>

      <section className={styles.finalCta}>
        <div className={styles.finalGlow} />
        <div>
          <p>START WITH KNOWFLOW</p>
          <h2>把你的企业知识，<br />变成真正能接待客户的 AI 服务能力。</h2>
          <span>先从一个知识库、一个网站客服入口开始，再逐步接入人工、运营和更多渠道。</span>
          <div className={styles.finalActions}>
            <Link href={primaryHref} className={styles.finalPrimary}>{primaryLabel}<b>→</b></Link>
            <Link href={consoleHref} className={styles.finalSecondary}>{account ? "返回后台" : "已有账号，去登录"}</Link>
          </div>
        </div>
      </section>

      <footer className={styles.footer}>
        <div className={styles.footerBrand}><span>K</span><div><b>KnowFlow</b><small>AI Customer Service Platform</small></div></div>
        <p>企业知识库 · AI 客服 · 人工接待 · RAG · 私有化部署</p>
        <div><a href="#capabilities">产品能力</a><a href="#workflow">服务链路</a><a href="#security">安全部署</a></div>
      </footer>
    </main>
  );
}
