import Link from "next/link";
import { accountAccess } from "../lib/app-auth";
import { optionalAccount } from "../lib/page-auth";

export const dynamic = "force-dynamic";

const capabilities = [
  ["可信回答", "检索、Rerank 与最低可靠度共同把关；资料不足时明确拒答。", "98%"],
  ["来源可追溯", "每个结论都能回到原始文档、页码与知识片段。", "可审计"],
  ["私有化部署", "支持企业 Linux 服务器与内网环境，数据边界清晰。", "可控"],
] as const;

const workflow = [
  ["01", "导入企业资料", "PDF、Word、Excel、图片与扫描件"],
  ["02", "形成可靠知识", "解析、切片、向量化与精排"],
  ["03", "发布 AI 客服", "官网、企微、公众号、钉钉与飞书"],
  ["04", "经营服务结果", "质量、线索、工单、成本与毛利"],
] as const;

const roles = [
  ["平台经营", "超级管理员", "租户、套餐、支付商户、平台权限与审计。", "/platform/login"],
  ["企业业务", "企业专属工作台", "知识库、助手、质量测试、成员、账单与渠道。", "/workspace/login"],
  ["内部运营", "运营管理台", "企业服务、退款、工单、客服与风险队列。", "/admin/login"],
] as const;

export default async function Page() {
  const account = await optionalAccount();
  const access = account ? await accountAccess(account) : null;
  const consoleHref = access?.destination || "/login";
  const primaryHref = account ? consoleHref : "/register";
  const primaryLabel = account ? "进入我的控制台" : "免费试用";

  return <main className="gf-site">
    <header className="gf-header">
      <Link className="gf-brand" href="/" aria-label="KnowFlow 首页"><span>◆</span><b>KnowFlow</b></Link>
      <nav aria-label="官网导航"><a href="#product">产品</a><a href="#workflow">解决方案</a><a href="#roles">后台角色</a><a href="#security">私有化部署</a></nav>
      <div><Link className="gf-login" href={consoleHref}>{account ? "返回后台" : "登录"}</Link><Link className="gf-button small" href={primaryHref}>{primaryLabel}</Link></div>
    </header>

    <section className="gf-hero" id="product">
      <div className="gf-glow gf-glow-violet"/><div className="gf-glow gf-glow-mint"/>
      <div className="gf-hero-copy">
        <p className="gf-eyebrow"><i/> ENTERPRISE AI SERVICE PLATFORM</p>
        <h1>让企业知识，<br/><span>成为可靠的服务能力</span></h1>
        <p>把产品资料、业务制度与服务经验，变成一个有依据、可管理、能获客、会转人工的企业 AI 客服。</p>
        <div><Link className="gf-button" href={primaryHref}>{primaryLabel}<span>→</span></Link><a className="gf-button ghost" href="#workflow">预约演示</a></div>
      </div>

      <div className="gf-product-stage" aria-label="KnowFlow 产品界面示意">
        <div className="gf-back-glass"/>
        <section className="gf-product-glass">
          <aside className="gf-product-rail"><span>✦</span><i className="active">⌂</i><i>◇</i><i>▤</i><i>↗</i></aside>
          <div className="gf-answer-panel">
            <header><span>✦</span><b>可信回答</b><em>运行中</em></header>
            <div className="gf-question">产品是否支持私有化部署？</div>
            <article><span>AI</span><p><b>支持。</b>数据与模型均可部署在企业环境中，满足内网运行与合规要求。</p></article>
            <footer><div><span>置信度</span><b>98%</b></div><i><em/></i></footer>
          </div>
          <div className="gf-source-panel">
            <header><span>⌁</span><b>来源可追溯</b><em>3 项依据</em></header>
            <article><span>PDF</span><div><b>私有化部署方案白皮书</b><small>部署架构 · P.03</small></div></article>
            <article><span>PDF</span><div><b>数据安全与合规实践指南</b><small>安全边界 · P.07</small></div></article>
            <article><span>DOC</span><div><b>企业版功能说明文档</b><small>服务能力 · P.12</small></div></article>
            <footer><span><i/> 私有化部署</span><b>运行正常</b></footer>
          </div>
        </section>
      </div>

      <div className="gf-capability-strip">{capabilities.map(([title,description,value])=><article key={title}><span>{title === "可信回答" ? "✓" : title === "来源可追溯" ? "⌁" : "▣"}</span><div><b>{title}</b><small>{description}</small></div><strong>{value}</strong></article>)}</div>
    </section>

    <section className="gf-value">
      <header><p>不只是一个聊天框</p><h2>从知识到服务，<br/>从服务到生意</h2><small>已有的知识库、质量门槛、客户运营、真实支付和成本核算被放进同一条商业闭环。</small></header>
      <div><article><span>01</span><h3>企业知识空间</h3><p>按租户、知识库与分类隔离资料，支持拖拽整理和多格式解析。</p></article><article><span>02</span><h3>可验证的 AI 回答</h3><p>向量召回、关键词、重排与引用共同证明回答质量。</p></article><article><span>03</span><h3>可经营的客户服务</h3><p>从一次咨询继续沉淀为线索、工单、负责人、SLA 与收入。</p></article></div>
    </section>

    <section className="gf-workflow" id="workflow">
      <header><p>HOW IT WORKS</p><h2>四步发布企业 AI 客服</h2><small>新企业开通向导会准备行业模板、演示知识、标准测试题与官网客服配置。</small></header>
      <div>{workflow.map(([number,title,description])=><article key={number}><span>{number}</span><div><h3>{title}</h3><p>{description}</p></div><em>↗</em></article>)}</div>
    </section>

    <section className="gf-roles" id="roles">
      <header><p>ROLE BOUNDARIES</p><h2>三套后台，清楚分开</h2><small>同一账号可以拥有多个角色，但平台经营、内部运营与企业数据每次都由服务端重新校验。</small></header>
      <div>{roles.map(([kicker,title,description,href],index)=><article key={title} className={index === 1 ? "featured" : ""}><span>0{index + 1} · {kicker}</span><div className="gf-mini-ui"><i/><i/><i/><i/></div><h3>{title}</h3><p>{description}</p><Link href={href}>进入对应后台 <b>→</b></Link></article>)}</div>
    </section>

    <section className="gf-security" id="security">
      <div><p>DEPLOYMENT & SECURITY</p><h2>数据留在自己的边界里</h2><small>云端 SaaS 可以快速开通，也可以部署到企业 Linux 服务器。账号、租户、知识库与服务凭证分别隔离。</small><ul><li><span>01</span>租户与知识库强制隔离</li><li><span>02</span>成员独立账号和角色权限</li><li><span>03</span>备份、恢复与数据导出</li><li><span>04</span>Linux Docker 私有化部署</li></ul></div>
      <aside><header><i/><i/><i/><span>KnowFlow · private deployment</span></header><code><em>$</em> docker compose up -d</code><code><b>✓</b> enterprise-app&nbsp;&nbsp; healthy</code><code><b>✓</b> tenant-data&nbsp;&nbsp;&nbsp;&nbsp; isolated</code><code><b>✓</b> vector-service&nbsp; ready</code><footer><span>LINUX</span><span>WINDOWS TEST</span><span>CLOUDFLARE</span></footer></aside>
    </section>

    <section className="gf-final"><div><p>START WITH ONE DOCUMENT</p><h2>把企业资料，变成一个<br/>可以销售的 AI 员工。</h2></div><Link className="gf-button dark" href={primaryHref}>{primaryLabel}<span>→</span></Link></section>
    <footer className="gf-footer"><Link className="gf-brand" href="/"><span>◆</span><b>KnowFlow</b></Link><p>企业知识库与 AI 客服商业化平台</p><nav><Link href="/workspace/login">企业后台</Link><Link href="/admin/login">内部管理员</Link><Link href="/platform/login">超级管理员</Link></nav><small>© 2026 KNOWFLOW</small></footer>
  </main>;
}
