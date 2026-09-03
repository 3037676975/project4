"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import CommercialPanel from "./commercial-panel";
import CustomerServiceConsole from "./customer-service-console";
import styles from "./customer-service-center.module.css";

type Member = { id: string; email: string; displayName: string; role: string; status: string };
type Notice = { kind: "ok" | "error"; text: string };
type Stage = { name: string; status: string; detail: string; metric: string };
type TraceSource = { document?: string; excerpt?: string; vectorScore?: number; rerankScore?: number; score?: number; confidenceScore?: number; documentId?: string; chunkId?: string };
type Trace = { id: string; requestId: string; model: string; question: string; answer: string; totalTokens: number; latencyMs: number; costMicros: number; grounded: boolean; qualityScore: number; status: string; createdAt: string; sources: TraceSource[]; stages: Stage[]; evidence: { bestVector: number; bestRerank: number; avgConfidence: number } };
type Visitor = { id: string; mode: string; status: string; firstQuestion: string; lastQuestion: string; visitorMaskedIp: string; visitorCountry: string; visitorRegion: string; visitorCity: string; visitorReferer: string; visitorEmail: string; lastVisitorSeenAt: string | null; offlineEmailSentAt: string | null; lastMessageAt: string; leadName: string; leadCompany: string; leadStatus: string };
type Trend = { day: string; label: string; conversations: number; aiResolved: number; handoff: number; resolved: number };
type AgentMetric = { memberId: string; name: string; assigned: number; resolved: number; avgFirstResponseSeconds: number };
type DashboardData = {
  rangeDays: number;
  summary: { conversations: number; aiResolved: number; automationRate: number; handoff: number; handoffRate: number; resolved: number; verifiedResolved: number; resolutionRate: number; faqCount: number; faqHits: number; modelCallsSaved: number; leads: number; pipelineCents: number; wonCents: number; openTickets: number; modelRequests: number; modelCostCents: number; avgLatencyMs: number; costPerConversationCents: number; avgFirstResponseSeconds: number; avgResolutionSeconds: number; slaBreached: number; ticketResolutionRate: number; unread: number; waiting: number; mine: number; onlineAgents: number };
  trend: Trend[]; countries: Array<{ country: string; count: number }>; agentPerformance: AgentMetric[]; traces: Trace[]; visitors: Visitor[];
};
type Tab = "总览" | "实时会话" | "FAQ" | "数据报表" | "Trace 日志" | "访客与跟进" | "网站 Widget";
type RangeDays = 7 | 30 | 90;

const tabs: Array<{ key: Tab; desc: string }> = [
  { key: "总览", desc: "运营总览" }, { key: "实时会话", desc: "接待访客" }, { key: "FAQ", desc: "固定直答" },
  { key: "数据报表", desc: "价值与效率" }, { key: "Trace 日志", desc: "AI 诊断" }, { key: "访客与跟进", desc: "客户画像" }, { key: "网站 Widget", desc: "官网接入" },
];
async function api<T>(url: string) {
  const headers = new Headers(); const tenantId = localStorage.getItem("knowflow_tenant_id"); if (tenantId) headers.set("x-tenant-id", tenantId);
  const response = await fetch(url, { headers }); const data = await response.json() as T & { error?: string }; if (!response.ok) throw new Error(data.error || "客服中心加载失败"); return data;
}
function money(cents: number) { return new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY", maximumFractionDigits: 0 }).format((cents || 0) / 100); }
function microMoney(micros: number) { return `¥${((micros || 0) / 1_000_000).toFixed(4)}`; }
function time(value?: string | null) { return value ? new Date(value).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—"; }
function host(value: string) { try { return new URL(value).hostname; } catch { return value || "直接访问"; } }
function online(value: string | null) { return Boolean(value && Date.now() - Date.parse(value) < 90_000); }
function duration(seconds: number) { if (!seconds) return "—"; if (seconds < 60) return `${seconds} 秒`; if (seconds < 3600) return `${Math.round(seconds / 60)} 分钟`; const hours = seconds / 3600; return hours < 24 ? `${hours.toFixed(hours < 10 ? 1 : 0)} 小时` : `${(hours / 24).toFixed(1)} 天`; }
function score(value?: number) { return typeof value === "number" && value > 0 ? value.toFixed(3) : "—"; }
function sourceScore(source: TraceSource, kind: "vector" | "rerank" | "confidence") { if (kind === "vector") return Number(source.vectorScore || 0); if (kind === "rerank") return Number(source.rerankScore || source.score || 0); return Number(source.confidenceScore || 0); }
function statusText(value: string) { return value === "success" ? "成功" : value === "fallback" ? "安全拒答" : value === "error" ? "错误" : value || "未知"; }

export default function CustomerServiceCenter({ canAdmin, members, onNotice }: { canAdmin: boolean; members: Member[]; onNotice: (notice: Notice) => void }) {
  const [tab, setTab] = useState<Tab>("总览"); const [data, setData] = useState<DashboardData | null>(null); const [range, setRange] = useState<RangeDays>(30);
  const [selectedTrace, setSelectedTrace] = useState(""); const [traceSearch, setTraceSearch] = useState(""); const [traceStatus, setTraceStatus] = useState("all"); const [traceModel, setTraceModel] = useState("all"); const [visitorSearch, setVisitorSearch] = useState("");
  const load = useCallback(async () => {
    const next = await api<DashboardData>(`/api/commercial/service-dashboard?days=${range}`); setData(next);
    setSelectedTrace((current) => current && next.traces.some((item) => item.id === current) ? current : (next.traces[0]?.id || ""));
  }, [range]);
  useEffect(() => { const first = window.setTimeout(() => void load().catch((error) => onNotice({ kind: "error", text: error instanceof Error ? error.message : "客服中心加载失败" })), 0); const timer = window.setInterval(() => void load(), 15000); return () => { window.clearTimeout(first); window.clearInterval(timer); }; }, [load, onNotice]);

  const trace = useMemo(() => data?.traces.find((item) => item.id === selectedTrace) || null, [data, selectedTrace]);
  const models = useMemo(() => [...new Set(data?.traces.map((item) => item.model).filter(Boolean) || [])], [data]);
  const filteredTraces = useMemo(() => {
    const needle = traceSearch.trim().toLowerCase();
    return (data?.traces || []).filter((item) => (traceStatus === "all" || item.status === traceStatus) && (traceModel === "all" || item.model === traceModel) && (!needle || [item.question, item.answer, item.requestId, item.model].some((value) => String(value || "").toLowerCase().includes(needle))));
  }, [data, traceModel, traceSearch, traceStatus]);
  const filteredVisitors = useMemo(() => {
    const needle = visitorSearch.trim().toLowerCase();
    return (data?.visitors || []).filter((item) => !needle || [item.leadName, item.leadCompany, item.visitorEmail, item.lastQuestion, item.firstQuestion, item.visitorCountry, item.visitorCity, item.visitorReferer].some((value) => String(value || "").toLowerCase().includes(needle)));
  }, [data, visitorSearch]);
  const maxTrend = Math.max(1, ...(data?.trend.map((item) => item.conversations) || [1]));
  const maxCountry = Math.max(1, ...(data?.countries.map((item) => item.count) || [1]));

  function openTrace(traceId: string) { setSelectedTrace(traceId); setTab("Trace 日志"); }
  function tabBadge(key: Tab) {
    if (!data) return 0;
    if (key === "实时会话") return data.summary.unread || data.summary.waiting;
    if (key === "Trace 日志") return data.traces.filter((item) => item.status === "error").length;
    return 0;
  }

  return <div className={styles.center}>
    <section className={styles.centerHeader}><div className={styles.centerHeading}><p className="section-kicker">Customer service operations</p><h2>客服中心</h2><p>会话、客服、FAQ、报表、Trace、访客和网站 Widget 全部集中在一个运营工作台。</p></div><div className={styles.opsStrip}><article><span className={styles.redDot}/><div><b>{data?.summary.unread || 0}</b><small>未读消息</small></div></article><article><span className={styles.orangeDot}/><div><b>{data?.summary.waiting || 0}</b><small>待接待</small></div></article><article><span className={styles.greenDot}/><div><b>{data?.summary.onlineAgents || 0}</b><small>客服在线</small></div></article><article><span className={styles.purpleDot}/><div><b>{data?.summary.automationRate || 0}%</b><small>AI 自动解决</small></div></article></div></section>

    <nav className={styles.tabs}>{tabs.map((item) => { const badge = tabBadge(item.key); return <button type="button" key={item.key} className={tab === item.key ? styles.tabActive : styles.tab} onClick={() => setTab(item.key)}><span>{item.key}</span><small>{item.desc}</small>{badge > 0 ? <b className={item.key === "实时会话" ? styles.tabAlert : styles.tabWarn}>{badge > 99 ? "99+" : badge}</b> : null}</button>; })}</nav>

    {!data ? <section className={styles.loading}><span className="spinner dark"/> 正在加载客服运营数据…</section> : null}

    {data && tab === "总览" && <>
      <section className={styles.overviewGrid}><article><span>当前待接待</span><strong className={data.summary.waiting ? styles.warnValue : styles.goodValue}>{data.summary.waiting}</strong><small>转人工且尚未首次响应</small><button type="button" onClick={() => setTab("实时会话")}>打开等待队列 →</button></article><article><span>当前未读</span><strong className={data.summary.unread ? styles.dangerValue : styles.goodValue}>{data.summary.unread}</strong><small>按当前客服独立统计</small><button type="button" onClick={() => setTab("实时会话")}>处理未读 →</button></article><article><span>AI 自动解决率</span><strong>{data.summary.automationRate}%</strong><small>{range} 天内 {data.summary.aiResolved}/{data.summary.conversations} 个会话</small><button type="button" onClick={() => setTab("数据报表")}>查看口径 →</button></article><article><span>FAQ 节省调用</span><strong>{data.summary.modelCallsSaved}</strong><small>累计 FAQ 命中次数</small><button type="button" onClick={() => setTab("FAQ")}>优化 FAQ →</button></article></section>
      <section className={styles.twoColumn}><article className={styles.valuePanel}><div className={styles.panelHead}><div><p className="section-kicker">Business value</p><h3>AI 客服是否真正产生价值</h3></div><button type="button" onClick={() => setTab("数据报表")}>完整报表</button></div><div className={styles.valueMetrics}><div><span>销售线索</span><b>{data.summary.leads}</b></div><div><span>预计商机</span><b>{money(data.summary.pipelineCents)}</b></div><div><span>已成交</span><b>{money(data.summary.wonCents)}</b></div><div><span>模型成本</span><b>{money(data.summary.modelCostCents)}</b></div><div><span>平均首次响应</span><b>{duration(data.summary.avgFirstResponseSeconds)}</b></div><div><span>人工工单解决率</span><b>{data.summary.ticketResolutionRate}%</b></div></div></article><article className={styles.actionPanel}><div className={styles.panelHead}><div><p className="section-kicker">Work queue</p><h3>今天先处理什么</h3></div></div><button type="button" onClick={() => setTab("实时会话")}><span className={styles.orangeDot}/><div><b>{data.summary.waiting} 个访客正在等人工</b><small>优先处理尚未首次响应的工单</small></div><em>→</em></button><button type="button" onClick={() => setTab("Trace 日志")}><span className={styles.redDot}/><div><b>{data.traces.filter((item) => item.status === "error").length} 条 Trace 错误</b><small>检查检索、Embedding、Rerank 与模型</small></div><em>→</em></button><button type="button" onClick={() => setTab("访客与跟进")}><span className={styles.greenDot}/><div><b>{data.visitors.filter((item) => item.visitorEmail).length} 位访客可离线跟进</b><small>查看来源、地区、邮箱和线索状态</small></div><em>→</em></button></article></section>
    </>}

    {tab === "实时会话" && <CustomerServiceConsole canAdmin={canAdmin} members={members} onNotice={onNotice} view="conversations" onOpenTrace={openTrace}/>}
    {tab === "FAQ" && <CustomerServiceConsole canAdmin={canAdmin} members={members} onNotice={onNotice} view="faq" onOpenTrace={openTrace}/>}

    {data && tab === "数据报表" && <section className={styles.reportPage}>
      <div className={styles.reportToolbar}><div><p className="section-kicker">Service analytics</p><h3>客服数据报表</h3><p>先统一口径，再看趋势；避免只展示“漂亮数字”却解释不了业务价值。</p></div><div className={styles.rangeSwitch}>{([7, 30, 90] as RangeDays[]).map((item) => <button type="button" key={item} className={range === item ? styles.rangeActive : ""} onClick={() => setRange(item)}>近 {item} 天</button>)}</div></div>
      <div className={styles.reportMetrics}><article><span>总会话</span><strong>{data.summary.conversations}</strong><small>期间新建网页客服会话</small></article><article><span>AI 自动解决率</span><strong>{data.summary.automationRate}%</strong><small>ai_resolved ÷ 总会话</small></article><article><span>人工转接率</span><strong>{data.summary.handoffRate}%</strong><small>进入 human 模式的会话占比</small></article><article><span>平均首次响应</span><strong>{duration(data.summary.avgFirstResponseSeconds)}</strong><small>工单创建 → 第一条人工回复</small></article><article><span>平均解决时长</span><strong>{duration(data.summary.avgResolutionSeconds)}</strong><small>工单创建 → resolved</small></article><article><span>SLA 超时</span><strong className={data.summary.slaBreached ? styles.dangerValue : styles.goodValue}>{data.summary.slaBreached}</strong><small>当前仍开放且已超过 SLA</small></article><article><span>FAQ 节省调用</span><strong>{data.summary.modelCallsSaved}</strong><small>FAQ hit_count，命中不调用 LLM</small></article><article><span>单会话模型成本</span><strong>{money(data.summary.costPerConversationCents)}</strong><small>期间模型成本 ÷ 总会话</small></article></div>
      <div className={styles.reportColumns}><article className={styles.chartPanel}><div className={styles.panelHead}><div><p className="section-kicker">Conversation trend</p><h3>{range === 90 ? "周" : "日"}会话趋势</h3></div><div className={styles.legend}><span><i className={styles.seriesTotal}/>总会话</span><span><i className={styles.seriesAi}/>AI 解决</span><span><i className={styles.seriesHuman}/>转人工</span></div></div><div className={styles.barChart}>{data.trend.map((item) => <div className={styles.barGroup} key={item.day} title={`${item.label} · 总会话 ${item.conversations} · AI解决 ${item.aiResolved} · 转人工 ${item.handoff}`}><div className={styles.bars}><i className={styles.totalBar} style={{ height: `${Math.max(item.conversations ? 6 : 2, item.conversations / maxTrend * 100)}%` }}/><i className={styles.aiBar} style={{ height: `${Math.max(item.aiResolved ? 4 : 1, item.aiResolved / maxTrend * 100)}%` }}/><i className={styles.humanBar} style={{ height: `${Math.max(item.handoff ? 4 : 1, item.handoff / maxTrend * 100)}%` }}/></div><small>{item.label}</small></div>)}</div></article>
        <article className={styles.countryPanel}><div className={styles.panelHead}><div><p className="section-kicker">Visitor regions</p><h3>访客国家 / 地区</h3></div></div><div className={styles.countryList}>{data.countries.map((item) => <div key={String(item.country)}><span>{String(item.country)}</span><i><em style={{ width: `${item.count / maxCountry * 100}%` }}/></i><b>{item.count}</b></div>)}</div></article></div>
      <article className={styles.agentTable}><div className={styles.panelHead}><div><p className="section-kicker">Agent performance</p><h3>客服处理效率</h3></div><span>只统计期间被分配的人工工单</span></div><div className={styles.tableWrap}><table><thead><tr><th>客服</th><th>分配工单</th><th>已解决</th><th>解决率</th><th>平均首次响应</th></tr></thead><tbody>{data.agentPerformance.map((item) => <tr key={String(item.memberId)}><td>{String(item.name)}</td><td>{item.assigned}</td><td>{item.resolved}</td><td>{item.assigned ? Math.round(item.resolved / item.assigned * 100) : 0}%</td><td>{duration(item.avgFirstResponseSeconds)}</td></tr>)}</tbody></table></div></article>
      <details className={styles.metricGuide}><summary>报表口径说明</summary><div><p><b>AI 自动解决：</b>会话被业务链路标记为 ai_resolved=1，不等于“AI 发过消息”。</p><p><b>人工转接：</b>会话进入 human 模式；可能已经由人工处理，也可能仍在等待。</p><p><b>首次响应：</b>support_ticket.created_at 到 first_response_at，只计算已经有人第一次回复的工单。</p><p><b>FAQ 节省调用：</b>等于启用 FAQ 的 hit_count 累计值；一次高置信 FAQ 命中至少避免一次生成模型调用。</p><p><b>模型成本：</b>来自 usage_records.cost_micros，只表示模型侧成本，不包含服务器、短信、邮件等基础设施费用。</p></div></details>
    </section>}

    {data && tab === "Trace 日志" && <section className={styles.tracePage}><div className={styles.traceToolbar}><div><p className="section-kicker">AI diagnostics</p><h3>对话 Trace / 日志中心</h3><p>不要再看一坨 JSON：按检索 → Embedding → Rerank → 大模型逐阶段判断问题。</p></div><div className={styles.traceFilters}><input value={traceSearch} onChange={(event) => setTraceSearch(event.target.value)} placeholder="搜索问题、Request ID、模型…"/><select value={traceStatus} onChange={(event) => setTraceStatus(event.target.value)}><option value="all">全部状态</option><option value="success">成功</option><option value="fallback">安全拒答</option><option value="error">错误</option></select><select value={traceModel} onChange={(event) => setTraceModel(event.target.value)}><option value="all">全部模型</option>{models.map((model) => <option value={model} key={model}>{model}</option>)}</select></div></div>
      <div className={styles.traceLayout}><aside className={styles.traceList}>{filteredTraces.length ? filteredTraces.map((item) => <button type="button" key={item.id} className={selectedTrace === item.id ? styles.traceItemActive : styles.traceItem} onClick={() => setSelectedTrace(item.id)}><span className={`${styles.traceStatus} ${styles[`trace_${item.status}`] || ""}`}>{statusText(item.status)}</span><b>{item.question || "无问题文本"}</b><small>{item.model} · {item.latencyMs} ms · {time(item.createdAt)}</small><em>{item.requestId?.slice(-12)}</em></button>) : <div className={styles.traceEmpty}>当前筛选没有 Trace。</div>}</aside><main className={styles.traceDetail}>{trace ? <>
        <header className={styles.traceDetailHead}><div><span className={`${styles.traceStatus} ${styles[`trace_${trace.status}`] || ""}`}>{statusText(trace.status)}</span><h3>{trace.question}</h3><p>Request ID · <code>{trace.requestId}</code></p></div><div className={styles.traceFacts}><span><small>模型</small><b>{trace.model}</b></span><span><small>总延迟</small><b>{trace.latencyMs} ms</b></span><span><small>Token</small><b>{trace.totalTokens}</b></span><span><small>本次成本</small><b>{microMoney(trace.costMicros)}</b></span><span><small>可靠度</small><b>{trace.qualityScore.toFixed(3)}</b></span></div></header>
        <div className={styles.stageGrid}>{trace.stages.map((stage, index) => <article key={stage.name} className={styles.stageCard}><div><span>{index + 1}</span><b>{stage.name}</b></div><strong>{stage.metric}</strong><p>{stage.detail}</p><em className={`${styles.stageState} ${styles[`stage_${stage.status}`] || ""}`}>{stage.status}</em></article>)}</div>
        <section className={styles.traceAnswer}><div><p className="section-kicker">Final answer</p><h4>最终回答</h4></div><p>{trace.answer || "这条 Trace 没有生成回答。"}</p></section>
        <section className={styles.sourcesSection}><div className={styles.panelHead}><div><p className="section-kicker">Grounding evidence</p><h3>知识来源</h3></div><span>{trace.sources.length} 个片段</span></div>{trace.sources.length ? <div className={styles.sourceCards}>{trace.sources.map((source, index) => <article key={`${source.chunkId || source.documentId || index}`}><header><span>{index + 1}</span><b>{source.document || "知识片段"}</b></header><p>{source.excerpt || "该 Trace 没有保存片段摘要。"}</p><footer><span>Vector <b>{score(sourceScore(source, "vector"))}</b></span><span>Rerank <b>{score(sourceScore(source, "rerank"))}</b></span><span>Confidence <b>{score(sourceScore(source, "confidence"))}</b></span></footer></article>)}</div> : <div className={styles.noSources}><b>没有知识来源</b><span>{trace.status === "fallback" ? "这通常意味着检索结果低于可靠度门槛，因此系统选择安全拒答。" : "检查知识库索引、Embedding 和检索配置。"}</span></div>}</section>
      </> : <div className={styles.traceEmpty}>请选择一条 Trace。</div>}</main></div>
    </section>}

    {data && tab === "访客与跟进" && <section className={styles.visitorPage}><div className={styles.visitorToolbar}><div><p className="section-kicker">Visitor intelligence</p><h3>访客画像与离线跟进</h3><p>客服在一个地方判断“谁、从哪里来、问什么、是否能继续联系”。IP 只显示脱敏值。</p></div><input value={visitorSearch} onChange={(event) => setVisitorSearch(event.target.value)} placeholder="搜索访客、公司、邮箱、来源…"/></div><div className={styles.visitorGrid}>{filteredVisitors.map((item) => <article key={item.id} className={styles.visitorCard}><header><span className={online(item.lastVisitorSeenAt) ? styles.visitorOnline : styles.visitorOffline}>{online(item.lastVisitorSeenAt) ? "在线" : "离线"}</span><small>{time(item.lastMessageAt)}</small></header><h3>{item.leadName || item.visitorEmail || `网页访客 ${item.id.slice(-5)}`}</h3><p>{item.lastQuestion || item.firstQuestion || "暂无问题摘要"}</p><dl><div><dt>企业</dt><dd>{item.leadCompany || "未识别"}</dd></div><div><dt>地区</dt><dd>{[item.visitorCountry, item.visitorRegion, item.visitorCity].filter(Boolean).join(" / ") || "未知"}</dd></div><div><dt>IP</dt><dd>{item.visitorMaskedIp || "未取得"}</dd></div><div><dt>来源</dt><dd>{host(item.visitorReferer)}</dd></div><div><dt>邮箱</dt><dd>{item.visitorEmail || "未留"}</dd></div><div><dt>跟进状态</dt><dd>{item.offlineEmailSentAt ? `已提醒 ${time(item.offlineEmailSentAt)}` : item.visitorEmail ? "可离线跟进" : "仅网页会话"}</dd></div></dl></article>)}</div>{!filteredVisitors.length ? <div className={styles.traceEmpty}>没有匹配的访客。</div> : null}</section>}

    {tab === "网站 Widget" && <CommercialPanel canAdmin={canAdmin} members={members} onNotice={onNotice}/>}
  </div>;
}
