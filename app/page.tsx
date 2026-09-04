import Link from "next/link";
import { accountAccess } from "../lib/app-auth";
import { optionalAccount } from "../lib/page-auth";
import styles from "./homepage.module.css";

export const dynamic = "force-dynamic";

type UiIconName =
  | "sparkles" | "clock" | "zap" | "handoff" | "chart" | "dashboard" | "messages" | "arrow-right"
  | "search" | "filter" | "user-plus" | "more" | "link" | "file" | "check" | "send" | "plus" | "monitor" | "database" | "shield" | "trace" | "external";

function UiIcon({ name, size = 16 }: { name: UiIconName; size?: number }) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.9,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  if (name === "sparkles") return <svg {...common}><path d="M12 3.5 13.4 7.6 17.5 9l-4.1 1.4L12 14.5l-1.4-4.1L6.5 9l4.1-1.4L12 3.5Z"/><path d="m18.5 14 .7 2.1 2.1.7-2.1.7-.7 2.1-.7-2.1-2.1-.7 2.1-.7.7-2.1Z"/></svg>;
  if (name === "clock") return <svg {...common}><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 1.8"/></svg>;
  if (name === "zap") return <svg {...common}><path d="m13.2 2.8-7 10.1h5.3l-.7 8.3 7-10.1h-5.3l.7-8.3Z"/></svg>;
  if (name === "handoff") return <svg {...common}><path d="M7.5 10.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Z"/><path d="M2.8 18.8c.5-3 2.2-4.8 4.7-4.8 1.6 0 2.9.7 3.7 1.8"/><path d="M14 8.5h6.5M18.2 5.8l2.7 2.7-2.7 2.7"/><path d="M16.5 15.5h-6.2M12.7 12.8 10 15.5l2.7 2.7"/></svg>;
  if (name === "chart") return <svg {...common}><path d="M4 19V5"/><path d="M4 19h16"/><path d="m7 15 3.2-3.4 3 1.8L18 8"/><path d="M15.5 8H18v2.5"/></svg>;
  if (name === "dashboard") return <svg {...common}><rect x="3" y="3" width="7" height="7" rx="1.4"/><rect x="14" y="3" width="7" height="7" rx="1.4"/><rect x="3" y="14" width="7" height="7" rx="1.4"/><rect x="14" y="14" width="7" height="7" rx="1.4"/></svg>;
  if (name === "messages") return <svg {...common}><path d="M7.5 16.5H5l-2 2v-11A3.5 3.5 0 0 1 6.5 4h8A3.5 3.5 0 0 1 18 7.5v2"/><path d="M11 13.5A3.5 3.5 0 0 1 14.5 10h3A3.5 3.5 0 0 1 21 13.5v5l-2-2h-4.5a3.5 3.5 0 0 1-3.5-3.5v.5Z"/></svg>;
  if (name === "search") return <svg {...common}><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/></svg>;
  if (name === "filter") return <svg {...common}><path d="M4 6h16M7 12h10M10 18h4"/></svg>;
  if (name === "user-plus") return <svg {...common}><circle cx="9" cy="8" r="3.2"/><path d="M3.5 19c.5-3.4 2.5-5.2 5.5-5.2s5 1.8 5.5 5.2M18 8v6M15 11h6"/></svg>;
  if (name === "more") return <svg {...common}><circle cx="5" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1" fill="currentColor" stroke="none"/></svg>;
  if (name === "link") return <svg {...common}><path d="M9.5 14.5 7 17a3.5 3.5 0 0 1-5-5l3-3a3.5 3.5 0 0 1 5 0"/><path d="m14.5 9.5 2.5-2.5a3.5 3.5 0 1 1 5 5l-3 3a3.5 3.5 0 0 1-5 0"/><path d="m8.5 15.5 7-7"/></svg>;
  if (name === "file") return <svg {...common}><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v5h5M9 13h6M9 17h4"/></svg>;
  if (name === "check") return <svg {...common}><path d="m5 12.5 4 4L19 7"/></svg>;
  if (name === "send") return <svg {...common}><path d="m3 11 17-7-7 17-2.6-7.4L3 11Z"/><path d="m10.4 13.6 4.9-4.9"/></svg>;
  if (name === "plus") return <svg {...common}><path d="M12 5v14M5 12h14"/></svg>;
  if (name === "monitor") return <svg {...common}><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/></svg>;
  if (name === "database") return <svg {...common}><ellipse cx="12" cy="5.5" rx="7" ry="3"/><path d="M5 5.5v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6M5 11.5v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6"/></svg>;
  if (name === "shield") return <svg {...common}><path d="M12 3 19 6v5.2c0 4.6-2.7 7.8-7 9.8-4.3-2-7-5.2-7-9.8V6l7-3Z"/><path d="m9 12 2 2 4-4"/></svg>;
  if (name === "trace") return <svg {...common}><circle cx="6" cy="6" r="2"/><circle cx="18" cy="18" r="2"/><path d="M8 6h4c3 0 4 1 4 4v2c0 3-1 4-4 4H8"/></svg>;
  if (name === "external") return <svg {...common}><path d="M14 4h6v6M20 4l-9 9"/><path d="M18 13v6H5V6h6"/></svg>;
  return <svg {...common}><path d="M5 12h14"/><path d="m14 7 5 5-5 5"/></svg>;
}

const benefits = [
  ["7×24 小时在线", "过去 24h 服务正常", "clock"],
  ["秒级响应", "P50 首响 2.8 秒", "zap"],
  ["无缝转人工", "上下文完整保留", "handoff"],
  ["可追踪优化", "RAG / 模型全链路", "chart"],
] as const;

const conversations = [
  ["王先生 · 北京", "咨询私有化与报价", "18:42", "AI", "blue", "/brand/visitor-male-v3.jpg"],
  ["Mia · 上海", "网站客服接入报错", "18:39", "人工", "orange", "/brand/visitor-female-v3.jpg"],
  ["陈女士 · 广州", "知识库支持哪些格式", "18:31", "AI", "blue", "/brand/visitor-female-v3.jpg"],
  ["李工 · 深圳", "转人工规则怎么配置", "18:27", "人工", "orange", "/brand/visitor-male-v3.jpg"],
] as const;

const stats = [
  ["今日会话", "1,285", "+18%"],
  ["AI 解决率", "98%", "+2.1%"],
  ["首响 P50", "2.8s", "-8%"],
  ["人工接管", "6.4%", "-1.7%"],
] as const;

const features = [
  ["AI 智能接待", "FAQ、知识库与大模型协同回答，高频问题自动解决，复杂问题按规则交给人工。", "01"],
  ["人工客服 Inbox", "待接待、未读、我的会话、访客画像、来源页面与附件集中在同一工作台。", "02"],
  ["网站客服 Widget", "一段代码接入官网，欢迎语、默认展开、快捷问题、AI / 人工切换都可配置。", "03"],
  ["Trace 与服务分析", "查看 RAG 命中、模型调用、来源文档、转人工节点与响应时长，问题可复盘。", "04"],
] as const;

const scenarios = [
  ["电商售后", "物流、退款、发票先由 AI 处理，异常订单与情绪升级自动转人工。"],
  ["SaaS 售前", "回答产品、套餐与部署问题，识别高意向访客并同步给销售跟进。"],
  ["教育咨询", "课程、报名、开班政策统一口径，复杂咨询带上下文交给顾问。"],
  ["企业内部服务", "制度、流程、产品手册进入统一知识库，减少重复咨询和跨部门等待。"],
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
            <div className={styles.eyebrow}><span><UiIcon name="sparkles" size={14}/></span> 官网咨询、AI 接待、人工跟进，一套工作台完成</div>
            <h1>AI 客服 + 人工接待<br/><span>真正进入业务流程</span></h1>
            <p>KnowFlow 把企业知识库、FAQ、网站客服、人工接待与服务分析放进同一条链路。AI 先处理高频问题，识别不了就带着上下文转人工，服务结束后还能追踪命中来源和处理质量。</p>
            <div className={styles.heroActions}>
              <Link href={primaryHref} className={styles.primaryButton}><UiIcon name="dashboard" size={16}/>{primaryLabel}<b><UiIcon name="arrow-right" size={15}/></b></Link>
              <a href="#product" className={styles.secondaryButton}><UiIcon name="messages" size={16}/>查看真实工作台</a>
            </div>
            <div className={styles.benefitRow}>
              {benefits.map(([title, desc, icon]) => <div key={title}><span><UiIcon name={icon} size={17}/></span><section><b>{title}</b><small>{desc}</small></section></div>)}
            </div>
          </div>

          <div className={styles.heroAside} aria-hidden="true">
            <div className={styles.glowOne}/><div className={styles.glowTwo}/>
            <div className={styles.agentCard}>
              <img src="/brand/support-agent.jpg" alt="真人客服"/>
              <div><small>售前顾问 · 林然</small><b>在线 · 最近回复 42 秒</b></div>
              <span>● 在线</span>
            </div>
            <div className={styles.floatCard}><b>今日 AI 解决率</b><strong>98%</strong><small>较昨日 +2.1% · 18:54 更新</small></div>
          </div>
        </div>

        <div className={styles.dashboard} id="product">
          <div className={styles.dashboardTop}>
            <div><span className={styles.miniLogo}>K</span><section><b>服务收件箱</b><small>生产环境 · 官网渠道 · 最后同步 18:54:32</small></section></div>
            <div className={styles.dashboardTopActions}>
              <span><i/> 2 位客服在线</span>
              <span>今日 1,285 会话</span>
              <button><UiIcon name="filter" size={12}/> 筛选</button>
              <button><UiIcon name="user-plus" size={12}/> 邀请客服</button>
            </div>
          </div>
          <div className={styles.workspace}>
            <aside className={styles.inbox}>
              <header><div><b>会话收件箱</b><small>未读 12 · 待接待 3</small></div><em>12</em></header>
              <div style={{margin:"0 9px 8px",display:"flex",alignItems:"center",gap:6,padding:"7px 9px",border:"1px solid #e3e7ef",borderRadius:9,background:"#fff",color:"#9199a8",fontSize:9}}><UiIcon name="search" size={12}/>搜索访客、手机号或会话内容</div>
              <div className={styles.inboxTabs}><button className={styles.tabActive}>全部</button><button>待接待 3</button><button>我的 5</button></div>
              {conversations.map(([name, text, time, mode, tone, avatar], index) => <article className={index === 0 ? styles.activeConversation : ""} key={name}>
                <img src={avatar} alt={`${name} 真人头像`}/>
                <section><b>{name}</b><p>{text}</p><small>{index === 0 ? "官网 /pricing" : index === 1 ? "官网 /docs/widget" : index === 2 ? "官网 /knowledge" : "官网 /settings"} · {time}</small></section>
                <span className={tone === "orange" ? styles.tagOrange : styles.tagBlue}>{mode === "AI" ? "AI接待" : "人工跟进"}</span>
              </article>)}
              <footer>查看全部 32 条活跃会话 <b>→</b></footer>
            </aside>

            <section className={styles.liveChat}>
              <header>
                <div><img src="/brand/visitor-male-v3.jpg" alt="访客真人头像"/><section><b>王先生 · 北京</b><small>官网 /pricing · 第 3 次访问 · 停留 6m 42s</small></section></div>
                <div><span>AI 服务中</span><button><UiIcon name="handoff" size={11}/> 转人工</button><button><UiIcon name="more" size={13}/></button></div>
              </header>
              <div className={styles.chatBody}>
                <div className={styles.timeDivider}><span/>今天 18:42<span/></div>
                <div className={styles.botMessage}><span className={styles.botAvatar}><UiIcon name="sparkles" size={13}/></span><section><small>KnowFlow AI · 18:42:03</small><p>你好，我可以帮你确认部署方式、套餐与知识库能力。你们目前是公有云还是计划私有化部署？</p></section></div>
                <div className={styles.userMessage}>我们团队 12 人，日均大概 300 条咨询，想部署在自己服务器，数据会不会离开内网？</div>
                <div className={styles.botMessage}><span className={styles.botAvatar}><UiIcon name="sparkles" size={13}/></span><section><small>KnowFlow AI · 18:42:11</small><p>支持 Docker 私有化部署。业务数据、知识库和向量库都可以保留在你自己的服务器；模型也可以按合规要求接企业自有接口或内网模型。</p><em><UiIcon name="check" size={10}/> 命中《私有化部署说明》 · 置信度 0.96 · 2 个来源</em></section></div>
                <div style={{alignSelf:"flex-start",marginLeft:37,display:"flex",gap:6,flexWrap:"wrap"}}><span style={{padding:"5px 7px",border:"1px solid #e4e8f0",borderRadius:7,background:"#fff",fontSize:7.5,color:"#606a7d",display:"inline-flex",alignItems:"center",gap:4}}><UiIcon name="file" size={10}/> 私有化部署说明.pdf</span><span style={{padding:"5px 7px",border:"1px solid #e4e8f0",borderRadius:7,background:"#fff",fontSize:7.5,color:"#606a7d",display:"inline-flex",alignItems:"center",gap:4}}><UiIcon name="link" size={10}/> /docs/private-deploy</span></div>
                <div className={styles.userMessage}>可以安排技术同事和我聊下具体服务器配置吗？</div>
                <div className={styles.handoff}><span/>识别为高意向部署咨询 · 建议转人工<span/></div>
              </div>
              <footer className={styles.composer}><button aria-label="添加附件"><UiIcon name="plus" size={14}/></button><div>输入回复，Enter 发送…</div><span><UiIcon name="send" size={11}/> 发送</span></footer>
            </section>

            <aside className={styles.insights}>
              <section className={styles.visitorCard}>
                <header><b>访客信息</b><span>高意向</span></header>
                <div className={styles.visitorMain}><img src="/brand/visitor-male-v3.jpg" alt="访客真人头像"/><div><b>网页访客 #A318</b><small>北京 · 18:36 首次进入</small></div></div>
                <dl>
                  <div><dt>当前页面</dt><dd>/pricing</dd></div>
                  <div><dt>来源</dt><dd>百度自然搜索</dd></div>
                  <div><dt>设备</dt><dd>macOS · Chrome</dd></div>
                  <div><dt>历史会话</dt><dd>3 次 / 14 条消息</dd></div>
                </dl>
                <div style={{display:"flex",gap:5,flexWrap:"wrap",marginTop:10}}><span style={{padding:"4px 6px",borderRadius:6,background:"#eef2ff",color:"#5545d8",fontSize:7,fontWeight:800}}>私有化</span><span style={{padding:"4px 6px",borderRadius:6,background:"#ecfdf5",color:"#208463",fontSize:7,fontWeight:800}}>12 人团队</span><span style={{padding:"4px 6px",borderRadius:6,background:"#fff7ed",color:"#b96724",fontSize:7,fontWeight:800}}>技术评估</span></div>
              </section>
              <section className={styles.statGrid}>{stats.map(([label,value,delta]) => <article key={label}><small>{label}</small><b>{value}</b><span>{delta}</span></article>)}</section>
              <section className={styles.miniAnalytics}><div><small>知识库命中率</small><b>91.6%</b><span>↑ 3.4%</span></div><div className={styles.sparkline}><i/><i/><i/><i/><i/><i/></div></section>
              <section className={styles.traceMini}><header><b>本轮处理轨迹</b><a href="/platform">完整 Trace <UiIcon name="external" size={9}/></a></header><div><span>01</span><p><b>RAG 检索 · 82ms</b><small>命中 2 个知识来源</small></p></div><div><span>02</span><p><b>模型生成 · 1.7s</b><small>置信度 0.96</small></p></div><div><span>03</span><p><b>意图识别</b><small>高意向 · 建议人工跟进</small></p></div></section>
            </aside>
          </div>
        </div>
      </section>

      <section className={styles.trustBar}><div><p><b>围绕真实客服流程设计</b><small>不是一张聊天 Demo，而是从接待到人工跟进、再到数据复盘的完整链路</small></p><div className={styles.trustNames}><span>官网咨询</span><span>售前转化</span><span>售后服务</span><span>技术支持</span><span>内部知识</span></div></div></section>

      <section className={styles.section} id="solutions">
        <div className={styles.sectionHeading}><div><span>WHY KNOWFLOW</span><h2>不是多一个聊天框，<br/>而是一套完整的客户服务系统。</h2></div><p>从 AI 自动回答到人工接管，从会话轨迹到数据复盘，核心能力围绕同一个访客、同一条会话链路协同工作。</p></div>
        <div className={styles.featureGrid}>{features.map(([title,desc,no]) => <article key={title}><div><span>{no}</span><i><UiIcon name="arrow-right" size={15}/></i></div><h3>{title}</h3><p>{desc}</p></article>)}</div>
      </section>

      <section className={styles.flowSection} id="operations">
        <div className={styles.flowInner}><div className={styles.flowCopy}><span>SERVICE FLOW</span><h2>让每一次咨询都有清晰的处理链路。</h2><p>先检索，再回答；低置信度就转人工；服务结束后，所有关键节点都可以复盘。</p><Link href={primaryHref} className={styles.lightButton}>开始配置 <b><UiIcon name="arrow-right" size={14}/></b></Link></div><div className={styles.flowSteps}><article><span>01</span><b>访客提问</b><small>官网 Widget</small></article><i>→</i><article><span>02</span><b>知识检索</b><small>FAQ + RAG</small></article><i>→</i><article><span>03</span><b>AI 回答</b><small>来源可追溯</small></article><i>→</i><article><span>04</span><b>人工接管</b><small>上下文保留</small></article></div></div>
      </section>

      <section className={styles.section} id="scenarios">
        <div className={styles.sectionHeading}><div><span>SCENARIOS</span><h2>适合真正需要“服务闭环”的业务。</h2></div><p>不是只做问答演示，而是让 AI、人工客服、知识库和运营数据真正进入业务流程。</p></div>
        <div className={styles.scenarioGrid}>{scenarios.map(([title,desc],index) => <article key={title}><span>0{index+1}</span><h3>{title}</h3><p>{desc}</p><b>了解场景 <UiIcon name="arrow-right" size={12}/></b></article>)}</div>
      </section>

      <section className={styles.security} id="security"><div><span>SECURITY & DEPLOYMENT</span><h2>企业数据，按你的方式部署。</h2><p>支持 Docker 私有化部署、租户隔离、权限控制与审计追踪。模型、向量数据库与业务服务可以按资源独立拆分。</p><div className={styles.securityPills}><span><UiIcon name="monitor" size={12}/> Docker 私有化</span><span><UiIcon name="database" size={12}/> 数据隔离</span><span><UiIcon name="shield" size={12}/> 权限控制</span><span><UiIcon name="trace" size={12}/> Trace 审计</span></div></div><Link href={primaryHref} className={styles.primaryButton}>进入控制台 <b><UiIcon name="arrow-right" size={14}/></b></Link></section>

      <footer className={styles.footer}><div><div className={styles.footerBrand}><span className={styles.brandMark}><i/><i/><i/></span><section><b>KnowFlow</b><small>AI CUSTOMER SERVICE</small></section></div><p>让 AI 真正进入客户服务，而不是停留在演示聊天框。</p></div><span>© 2026 KnowFlow · AI 客服与知识运营平台</span></footer>
    </main>
  );
}