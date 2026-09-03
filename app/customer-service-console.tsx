"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import styles from "./customer-service.module.css";

type Notice = { kind: "ok" | "error"; text: string };
type Member = { id: string; email: string; displayName: string; role: string; status: string };
type Faq = { id: string; question: string; answer: string; keywords: string[]; enabled: boolean; priority: number; hitCount: number };
type AgentPresence = { memberId: string; displayName: string; email: string; role: string; status: string; updatedAt: string | null };
type InboxSummary = { total: number; waiting: number; unread: number; mine: number; onlineAgents: number };
type Conversation = {
  id: string; status: string; mode: string; firstQuestion: string; lastQuestion: string; messageCount: number;
  assignedMemberId: string | null; assignedMemberName: string; startedAt: string; lastMessageAt: string;
  visitorMaskedIp: string; visitorCountry: string; visitorRegion: string; visitorCity: string; visitorReferer: string;
  visitorUserAgent: string; visitorEmail: string; lastVisitorSeenAt: string | null; offlineEmailSentAt: string | null;
  unreadCount: number; waiting: boolean; waitingSince: string | null; slaDueAt: string | null; firstResponseAt: string | null;
  ticketPriority: string; ticketStatus: string; leadName: string; leadCompany: string; leadNeed: string; leadStatus: string; leadValueCents: number;
};
type ChatMessage = { id: string; role: string; content: string; traceId?: string | null; messageType: string; attachmentName?: string | null; attachmentMime?: string | null; attachmentSize?: number | null; createdAt: string };
type View = "conversations" | "faq" | "all";
type QueueFilter = "all" | "waiting" | "unread" | "mine" | "ai";

type InboxResponse = { conversations: Conversation[]; currentMemberId: string; agents: AgentPresence[]; summary: InboxSummary };

async function api<T>(url: string, init?: RequestInit) {
  const headers = new Headers(init?.headers);
  const tenantId = localStorage.getItem("knowflow_tenant_id");
  if (tenantId) headers.set("x-tenant-id", tenantId);
  const response = await fetch(url, { ...init, headers });
  const data = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(data.error || `请求失败（${response.status}）`);
  return data;
}
function online(value: string | null) { return Boolean(value && Date.now() - Date.parse(value) < 90_000); }
function host(value: string) { try { return new URL(value).hostname; } catch { return value || "直接访问"; } }
function size(value?: number | null) { if (!value) return ""; return value > 1048576 ? `${(value / 1048576).toFixed(1)} MB` : `${Math.ceil(value / 1024)} KB`; }
function time(value?: string | null) { return value ? new Date(value).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—"; }
function relative(value?: string | null) {
  if (!value) return "—";
  const seconds = Math.max(0, Math.round((Date.now() - Date.parse(value)) / 1000));
  if (seconds < 60) return `${seconds} 秒前`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} 分钟前`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} 小时前`;
  return `${Math.floor(seconds / 86400)} 天前`;
}
function duration(value?: string | null) {
  if (!value) return "";
  const minutes = Math.max(0, Math.floor((Date.now() - Date.parse(value)) / 60000));
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟`;
  const hours = Math.floor(minutes / 60); const rest = minutes % 60;
  return `${hours} 小时${rest ? ` ${rest} 分` : ""}`;
}
function initials(value: string) { return (value.trim() || "访").slice(0, 2).toUpperCase(); }
function money(cents: number) { return new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY", maximumFractionDigits: 0 }).format((cents || 0) / 100); }
function browser(value: string) {
  const ua = value.toLowerCase();
  if (!ua) return "未知设备";
  const client = ua.includes("edg/") ? "Edge" : ua.includes("chrome/") ? "Chrome" : ua.includes("firefox/") ? "Firefox" : ua.includes("safari/") ? "Safari" : "浏览器";
  const os = ua.includes("windows") ? "Windows" : ua.includes("iphone") || ua.includes("ipad") ? "iOS" : ua.includes("android") ? "Android" : ua.includes("mac os") ? "macOS" : ua.includes("linux") ? "Linux" : "";
  return `${client}${os ? ` · ${os}` : ""}`;
}
function priorityLabel(value: string) { return value === "urgent" ? "紧急" : value === "high" ? "高" : value === "low" ? "低" : "普通"; }

export default function CustomerServiceConsole({ canAdmin, members, onNotice, view = "all", onOpenTrace }: {
  canAdmin: boolean; members: Member[]; onNotice: (notice: Notice) => void; view?: View; onOpenTrace?: (traceId: string) => void;
}) {
  const [faqs, setFaqs] = useState<Faq[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [agents, setAgents] = useState<AgentPresence[]>([]);
  const [summary, setSummary] = useState<InboxSummary>({ total: 0, waiting: 0, unread: 0, mine: 0, onlineAgents: 0 });
  const [currentMemberId, setCurrentMemberId] = useState("");
  const [selected, setSelected] = useState("");
  const [selectedInfo, setSelectedInfo] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [reply, setReply] = useState("");
  const [faqForm, setFaqForm] = useState({ id: "", question: "", answer: "", keywords: "", priority: 100, enabled: true });
  const [busy, setBusy] = useState(false);
  const [queue, setQueue] = useState<QueueFilter>("all");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("active");
  const [assigneeFilter, setAssigneeFilter] = useState("all");
  const [faqSearch, setFaqSearch] = useState("");
  const [agentStatus, setAgentStatus] = useState("online");
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const tasks: Promise<unknown>[] = [];
    if (view !== "faq") tasks.push(api<InboxResponse>("/api/commercial/conversations").then((data) => {
      setConversations(data.conversations); setCurrentMemberId(data.currentMemberId || ""); setAgents(data.agents || []); setSummary(data.summary);
      const mine = data.agents.find((item) => item.memberId === data.currentMemberId);
      if (mine && ["online", "busy", "away"].includes(mine.status)) setAgentStatus(mine.status);
    }));
    if (view !== "conversations") tasks.push(api<{ faqs: Faq[] }>("/api/commercial/faqs").then((data) => setFaqs(data.faqs)));
    await Promise.all(tasks);
  }, [view]);

  const openConversation = useCallback(async (id: string) => {
    setSelected(id);
    const data = await api<{ conversation: Conversation; messages: ChatMessage[] }>(`/api/commercial/conversations?id=${encodeURIComponent(id)}`);
    setSelectedInfo(data.conversation); setMessages(data.messages);
    await api("/api/commercial/conversations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "read", conversationId: id }) }).catch(() => undefined);
    setConversations((items) => items.map((item) => item.id === id ? { ...item, unreadCount: 0 } : item));
  }, []);

  useEffect(() => {
    const first = window.setTimeout(() => void load().catch((error) => onNotice({ kind: "error", text: error instanceof Error ? error.message : "客服数据加载失败" })), 0);
    const timer = window.setInterval(() => { void load(); if (selected) void openConversation(selected); }, 4000);
    return () => { window.clearTimeout(first); window.clearInterval(timer); };
  }, [load, onNotice, openConversation, selected]);

  useEffect(() => {
    if (view === "faq") return;
    const ping = () => void api("/api/commercial/conversations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "presence", status: agentStatus }) }).catch(() => undefined);
    const first = window.setTimeout(ping, 250);
    const timer = window.setInterval(ping, 30000);
    return () => { window.clearTimeout(first); window.clearInterval(timer); };
  }, [agentStatus, view]);

  const filteredConversations = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return conversations.filter((item) => {
      if (queue === "waiting" && !item.waiting) return false;
      if (queue === "unread" && item.unreadCount <= 0) return false;
      if (queue === "mine" && item.assignedMemberId !== currentMemberId) return false;
      if (queue === "ai" && item.mode !== "ai") return false;
      if (statusFilter === "active" && item.status === "resolved") return false;
      if (statusFilter !== "all" && statusFilter !== "active" && item.status !== statusFilter) return false;
      if (assigneeFilter === "unassigned" && item.assignedMemberId) return false;
      if (assigneeFilter !== "all" && assigneeFilter !== "unassigned" && item.assignedMemberId !== assigneeFilter) return false;
      if (!needle) return true;
      return [item.lastQuestion, item.firstQuestion, item.visitorEmail, item.leadName, item.leadCompany, item.visitorCountry, item.visitorCity, item.assignedMemberName]
        .some((value) => String(value || "").toLowerCase().includes(needle));
    });
  }, [assigneeFilter, conversations, currentMemberId, queue, search, statusFilter]);

  const filteredFaqs = useMemo(() => {
    const needle = faqSearch.trim().toLowerCase();
    return !needle ? faqs : faqs.filter((item) => [item.question, item.answer, ...item.keywords].some((value) => value.toLowerCase().includes(needle)));
  }, [faqSearch, faqs]);

  const memberOptions = useMemo(() => {
    const map = new Map<string, { id: string; name: string }>();
    for (const item of members.filter((member) => member.status === "active")) map.set(item.id, { id: item.id, name: item.displayName || item.email });
    for (const item of agents) map.set(item.memberId, { id: item.memberId, name: item.displayName || item.email });
    return [...map.values()];
  }, [agents, members]);

  async function saveFaq(event: FormEvent) {
    event.preventDefault(); if (!canAdmin) return; setBusy(true);
    try {
      const payload = { id: faqForm.id || undefined, question: faqForm.question, answer: faqForm.answer, keywords: faqForm.keywords, priority: faqForm.priority, enabled: faqForm.enabled };
      await api("/api/commercial/faqs", { method: faqForm.id ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      setFaqForm({ id: "", question: "", answer: "", keywords: "", priority: 100, enabled: true }); await load();
      onNotice({ kind: "ok", text: faqForm.id ? "FAQ 已更新。" : "FAQ 已保存；高置信度命中时会优先直答，不调用大模型。" });
    } catch (error) { onNotice({ kind: "error", text: error instanceof Error ? error.message : "FAQ 保存失败" }); } finally { setBusy(false); }
  }
  function editFaq(item: Faq) { setFaqForm({ id: item.id, question: item.question, answer: item.answer, keywords: item.keywords.join("，"), priority: item.priority, enabled: item.enabled }); }
  async function removeFaq(id: string) { if (!canAdmin || !confirm("确认删除这条 FAQ？")) return; setBusy(true); try { await api(`/api/commercial/faqs?id=${encodeURIComponent(id)}`, { method: "DELETE" }); await load(); } finally { setBusy(false); } }
  async function sendReply(event: FormEvent) {
    event.preventDefault(); if (!selected || !reply.trim()) return; setBusy(true);
    try {
      const result = await api<{ offlineEmail?: { sent: boolean; reason: string } }>("/api/commercial/conversations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conversationId: selected, message: reply }) });
      setReply(""); await openConversation(selected); await load();
      const extra = result.offlineEmail?.sent ? "；访客当前离线，已发送邮箱提醒。" : result.offlineEmail?.reason === "no_email" ? "；访客未留邮箱，仅在网页窗口同步。" : "";
      onNotice({ kind: "ok", text: `人工回复已发送${extra}` });
    } catch (error) { onNotice({ kind: "error", text: error instanceof Error ? error.message : "回复失败" }); } finally { setBusy(false); }
  }
  async function resolve() { if (!selected) return; setBusy(true); try { await api("/api/commercial/conversations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "resolve", conversationId: selected }) }); await openConversation(selected); await load(); onNotice({ kind: "ok", text: "会话已标记解决。" }); } finally { setBusy(false); } }
  async function reopen() { if (!selected) return; setBusy(true); try { await api("/api/commercial/conversations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "reopen", conversationId: selected }) }); await openConversation(selected); await load(); } finally { setBusy(false); } }
  async function assign(memberId: string) { if (!selected) return; setBusy(true); try { await api("/api/commercial/conversations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "assign", conversationId: selected, memberId }) }); await openConversation(selected); await load(); onNotice({ kind: "ok", text: memberId ? "会话已分配客服。" : "会话已取消分配。" }); } catch (error) { onNotice({ kind: "error", text: error instanceof Error ? error.message : "分配失败" }); } finally { setBusy(false); } }
  async function upload(file: File) {
    if (!selected) return; setBusy(true);
    try {
      const form = new FormData(); form.set("conversationId", selected); form.set("file", file);
      const headers = new Headers(); const tenantId = localStorage.getItem("knowflow_tenant_id"); if (tenantId) headers.set("x-tenant-id", tenantId);
      const response = await fetch("/api/commercial/attachments", { method: "POST", headers, body: form });
      const data = await response.json() as { error?: string; offlineEmail?: { sent: boolean } }; if (!response.ok) throw new Error(data.error || "附件发送失败");
      await openConversation(selected); await load(); onNotice({ kind: "ok", text: data.offlineEmail?.sent ? "附件已发送，并已邮件提醒离线访客。" : "附件已发送。" });
    } catch (error) { onNotice({ kind: "error", text: error instanceof Error ? error.message : "附件发送失败" }); } finally { setBusy(false); if (fileRef.current) fileRef.current.value = ""; }
  }
  async function download(message: ChatMessage) {
    const headers = new Headers({ "Content-Type": "application/json" }); const tenantId = localStorage.getItem("knowflow_tenant_id"); if (tenantId) headers.set("x-tenant-id", tenantId);
    const response = await fetch("/api/commercial/attachments", { method: "POST", headers, body: JSON.stringify({ messageId: message.id }) });
    if (!response.ok) { const data = await response.json().catch(() => ({})) as { error?: string }; throw new Error(data.error || "附件读取失败"); }
    const blob = await response.blob(); const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.target = "_blank"; anchor.download = message.messageType === "image" ? "" : (message.attachmentName || "附件"); anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  const queueItems: Array<{ key: QueueFilter; label: string; count?: number }> = [
    { key: "all", label: "全部", count: summary.total }, { key: "waiting", label: "待接待", count: summary.waiting }, { key: "unread", label: "未读", count: summary.unread }, { key: "mine", label: "我的", count: summary.mine }, { key: "ai", label: "AI 会话" },
  ];

  const conversationSection = <section className={`${styles.panel} ${styles.inboxPanel}`}>
    <div className={styles.inboxHeader}>
      <div><p className="section-kicker">Live inbox</p><h2>客服实时会话工作台</h2><p>像成熟客服系统一样处理队列：先看未读和等待，再接待、分配、回复、解决。</p></div>
      <div className={styles.headerActions}><span className={styles.syncPill}>● 4 秒同步</span><label className={styles.presenceControl}><span>我的状态</span><select value={agentStatus} onChange={(event) => setAgentStatus(event.target.value)}><option value="online">在线</option><option value="busy">忙碌</option><option value="away">暂离</option></select></label><span className={styles.agentCount}>{summary.onlineAgents} 位客服在线</span></div>
    </div>
    <div className={styles.inboxLayout}>
      <aside className={styles.queuePane}>
        <div className={styles.searchBox}><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索访客、公司、问题、邮箱…"/></div>
        <div className={styles.queueTabs}>{queueItems.map((item) => <button type="button" key={item.key} className={queue === item.key ? styles.queueTabActive : styles.queueTab} onClick={() => setQueue(item.key)}><span>{item.label}</span>{typeof item.count === "number" && item.count > 0 ? <b className={item.key === "unread" || item.key === "waiting" ? styles.redCount : styles.softCount}>{item.count > 99 ? "99+" : item.count}</b> : null}</button>)}</div>
        <div className={styles.filterRow}><select aria-label="会话状态" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="active">进行中</option><option value="all">全部状态</option><option value="open">开放</option><option value="handoff">人工中</option><option value="resolved">已解决</option></select><select aria-label="客服筛选" value={assigneeFilter} onChange={(event) => setAssigneeFilter(event.target.value)}><option value="all">全部客服</option><option value="unassigned">未分配</option>{memberOptions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
        <div className={styles.queueMeta}><span>{filteredConversations.length} 个会话</span><span>待接待 {summary.waiting}</span></div>
        <div className={styles.conversationList}>{filteredConversations.length ? filteredConversations.map((item) => {
          const person = item.leadName || item.visitorEmail || `网页访客 ${item.id.slice(-4)}`;
          return <button type="button" key={item.id} className={`${styles.conversationCard} ${selected === item.id ? styles.conversationCardActive : ""} ${item.unreadCount ? styles.conversationCardUnread : ""}`} onClick={() => void openConversation(item.id)}>
            <span className={`${styles.personAvatar} ${online(item.lastVisitorSeenAt) ? styles.personOnline : ""}`}>{initials(person)}</span>
            <span className={styles.conversationBody}><span className={styles.conversationTop}><b>{person}</b><small>{relative(item.lastMessageAt)}</small></span><span className={styles.preview}>{item.lastQuestion || item.firstQuestion || "附件消息"}</span><span className={styles.conversationMeta}>{item.waiting ? <em className={styles.waitBadge}>等待 {duration(item.waitingSince)}</em> : <em className={item.mode === "human" ? styles.humanBadge : styles.aiBadge}>{item.mode === "human" ? "人工" : "AI"}</em>}<span>{[item.visitorCountry, item.visitorCity].filter(Boolean).join(" · ") || "地区未知"}</span>{item.assignedMemberName ? <span>· {item.assignedMemberName}</span> : <span>· 未分配</span>}</span></span>
            {item.unreadCount > 0 ? <span className={styles.unreadBubble}>{item.unreadCount > 99 ? "99+" : item.unreadCount}</span> : null}
          </button>;
        }) : <div className={styles.emptyQueue}><b>当前筛选没有会话</b><span>换一个队列或搜索条件试试。</span></div>}</div>
      </aside>

      <main className={styles.chatPane}>{selectedInfo ? <>
        <header className={styles.chatHeader}><div className={styles.chatIdentity}><span className={`${styles.personAvatar} ${online(selectedInfo.lastVisitorSeenAt) ? styles.personOnline : ""}`}>{initials(selectedInfo.leadName || selectedInfo.visitorEmail || "访客")}</span><div><h3>{selectedInfo.leadName || selectedInfo.visitorEmail || `网页访客 ${selectedInfo.id.slice(-6)}`}</h3><p>{online(selectedInfo.lastVisitorSeenAt) ? "在线" : `离线 · ${relative(selectedInfo.lastVisitorSeenAt)}`} · {selectedInfo.mode === "human" ? "人工接待" : "AI 接待"}{selectedInfo.waiting ? ` · 已等待 ${duration(selectedInfo.waitingSince)}` : ""}</p></div></div><div className={styles.chatActions}><select aria-label="分配客服" value={selectedInfo.assignedMemberId || ""} onChange={(event) => void assign(event.target.value)} disabled={busy}><option value="">未分配</option>{memberOptions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>{selectedInfo.status === "resolved" ? <button type="button" className="secondary-button fit" onClick={() => void reopen()} disabled={busy}>重新打开</button> : <button type="button" className="secondary-button fit" onClick={() => void resolve()} disabled={busy}>✓ 解决</button>}</div></header>
        <div className={styles.messageStream}>{messages.map((item) => <div key={item.id} className={`${styles.messageRow} ${item.role === "user" ? styles.incoming : styles.outgoing}`}><div className={styles.messageWrap}><div className={styles.messageLabel}><span>{item.role === "agent" ? "人工客服" : item.role === "assistant" ? "AI" : "访客"}</span><time>{time(item.createdAt)}</time></div><div className={styles.messageBubble}>{item.messageType !== "text" ? <button className={styles.attachmentButton} type="button" onClick={() => void download(item).catch((error) => onNotice({ kind: "error", text: error.message }))}><span>{item.messageType === "image" ? "▧" : "↗"}</span><b>{item.attachmentName || item.content}</b><small>{size(item.attachmentSize)}</small></button> : <span>{item.content}</span>}</div>{item.role === "assistant" && item.traceId ? <button type="button" className={styles.traceLink} onClick={() => onOpenTrace?.(item.traceId || "")}>查看 Trace · {item.traceId.slice(-8)} →</button> : null}</div></div>)}</div>
        <form onSubmit={sendReply} className={styles.composer}><textarea rows={3} value={reply} onChange={(event) => setReply(event.target.value)} placeholder="输入人工回复… Shift + Enter 换行" maxLength={3000}/><div className={styles.composerFooter}><div><button type="button" className="secondary-button fit" onClick={() => fileRef.current?.click()} disabled={busy}>＋ 文件 / 图片</button><span>{reply.length}/3000</span></div><button className="primary-button fit" disabled={busy || !reply.trim()}>{busy ? "发送中…" : "发送回复"}</button></div></form>
        <input ref={fileRef} type="file" hidden accept="image/*,.pdf,.txt,.md,.csv,.doc,.docx,.xls,.xlsx,.ppt,.pptx" onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); }}/>
        <div className={styles.followupNote}>{selectedInfo.visitorEmail ? <><span>✉</span><p><b>离线跟进已就绪</b>访客离线超过 90 秒后，人工回复会发送邮件提醒；5 分钟内会自动合并提醒。</p></> : <><span>○</span><p><b>尚无离线联系方式</b>访客离开网页后，需要重新打开客服窗口才能看到回复。</p></>}</div>
      </> : <div className={styles.chatEmpty}><span>⌁</span><h3>从左侧选择一个会话</h3><p>优先处理“待接待”和“未读”队列，进入后会自动标记为已读。</p></div>}</main>

      <aside className={styles.profilePane}>{selectedInfo ? <>
        <div className={styles.profileHero}><span className={`${styles.profileAvatar} ${online(selectedInfo.lastVisitorSeenAt) ? styles.personOnline : ""}`}>{initials(selectedInfo.leadName || selectedInfo.visitorEmail || "访客")}</span><div><h3>{selectedInfo.leadName || "网页访客"}</h3><p>{selectedInfo.leadCompany || "未识别企业"}</p></div></div>
        <section className={styles.profileSection}><div className={styles.profileTitle}><b>访客画像</b><span>{online(selectedInfo.lastVisitorSeenAt) ? "在线" : "离线"}</span></div><dl><div><dt>邮箱</dt><dd>{selectedInfo.visitorEmail || "未留"}</dd></div><div><dt>地区</dt><dd>{[selectedInfo.visitorCountry, selectedInfo.visitorRegion, selectedInfo.visitorCity].filter(Boolean).join(" / ") || "未知"}</dd></div><div><dt>IP</dt><dd>{selectedInfo.visitorMaskedIp || "未取得"}</dd></div><div><dt>来源</dt><dd>{host(selectedInfo.visitorReferer)}</dd></div><div><dt>设备</dt><dd>{browser(selectedInfo.visitorUserAgent)}</dd></div><div><dt>首次会话</dt><dd>{time(selectedInfo.startedAt)}</dd></div></dl></section>
        <section className={styles.profileSection}><div className={styles.profileTitle}><b>客服处理</b>{selectedInfo.ticketPriority ? <span className={styles.priorityPill}>{priorityLabel(selectedInfo.ticketPriority)}</span> : null}</div><dl><div><dt>负责人</dt><dd>{selectedInfo.assignedMemberName || "未分配"}</dd></div><div><dt>状态</dt><dd>{selectedInfo.status}</dd></div><div><dt>首次响应</dt><dd>{selectedInfo.firstResponseAt ? time(selectedInfo.firstResponseAt) : selectedInfo.waiting ? "等待中" : "—"}</dd></div><div><dt>SLA</dt><dd>{selectedInfo.slaDueAt ? time(selectedInfo.slaDueAt) : "—"}</dd></div></dl>{selectedInfo.waiting ? <div className={styles.waitCallout}><b>等待 {duration(selectedInfo.waitingSince)}</b><span>建议优先接待，避免超过 SLA。</span></div> : null}</section>
        <section className={styles.profileSection}><div className={styles.profileTitle}><b>商机信息</b>{selectedInfo.leadStatus ? <span>{selectedInfo.leadStatus}</span> : null}</div>{selectedInfo.leadName || selectedInfo.leadCompany || selectedInfo.leadNeed ? <><dl><div><dt>联系人</dt><dd>{selectedInfo.leadName || "—"}</dd></div><div><dt>公司</dt><dd>{selectedInfo.leadCompany || "—"}</dd></div><div><dt>预计价值</dt><dd>{selectedInfo.leadValueCents ? money(selectedInfo.leadValueCents) : "未评估"}</dd></div></dl>{selectedInfo.leadNeed ? <p className={styles.needText}>{selectedInfo.leadNeed}</p> : null}</> : <p className={styles.profileEmpty}>这个访客还没有转成销售线索。</p>}</section>
        <section className={styles.profileSection}><div className={styles.profileTitle}><b>客服在线状态</b><span>{agents.filter((item) => item.status !== "offline").length} 在线</span></div><div className={styles.agentMiniList}>{agents.slice(0, 8).map((item) => <div key={item.memberId}><i className={`${styles.presenceDot} ${styles[`presence_${item.status}`] || ""}`}/><span>{item.displayName || item.email}</span><small>{item.status === "online" ? "在线" : item.status === "busy" ? "忙碌" : item.status === "away" ? "暂离" : "离线"}</small></div>)}</div></section>
      </> : <div className={styles.profileEmptyState}><b>访客画像</b><p>选择会话后，这里会固定显示来源、地区、联系方式、SLA、负责人和商机信息。</p></div>}</aside>
    </div>
  </section>;

  const faqSection = <section className={`${styles.panel} ${styles.faqPanel}`}><div className={styles.inboxHeader}><div><p className="section-kicker">FAQ first</p><h2>FAQ 优先命中</h2><p>固定问题先直答，既稳定答案，也直接减少 RAG / LLM 成本。</p></div><div className={styles.headerActions}><span className={styles.agentCount}>{faqs.filter((item) => item.enabled).length} 条启用</span><span className={styles.agentCount}>累计节省 {faqs.reduce((sum, item) => sum + item.hitCount, 0)} 次模型调用</span></div></div>
    <div className={styles.faqLayout}>{canAdmin && <form onSubmit={saveFaq} className={styles.faqEditor}><div className={styles.editorTitle}><div><b>{faqForm.id ? "编辑 FAQ" : "新增 FAQ"}</b><span>{faqForm.id ? "修改后立即影响下一次命中" : "高频、固定政策问题最适合 FAQ"}</span></div>{faqForm.id ? <button type="button" className="secondary-button fit" onClick={() => setFaqForm({ id: "", question: "", answer: "", keywords: "", priority: 100, enabled: true })}>取消编辑</button> : null}</div><label>问题<input required value={faqForm.question} onChange={(event) => setFaqForm({ ...faqForm, question: event.target.value })} placeholder="例如：怎么退款？"/></label><label>固定答案<textarea required rows={5} value={faqForm.answer} onChange={(event) => setFaqForm({ ...faqForm, answer: event.target.value })} placeholder="这条答案会直接返回给访客"/></label><label>关键词<input value={faqForm.keywords} onChange={(event) => setFaqForm({ ...faqForm, keywords: event.target.value })} placeholder="退款，退货，售后（可选）"/></label><div className={styles.editorOptions}><label>优先级<input type="number" min="0" max="1000" value={faqForm.priority} onChange={(event) => setFaqForm({ ...faqForm, priority: Number(event.target.value) })}/></label><label className={styles.switchLabel}><input type="checkbox" checked={faqForm.enabled} onChange={(event) => setFaqForm({ ...faqForm, enabled: event.target.checked })}/><span>启用</span></label></div><button className="primary-button" disabled={busy}>{faqForm.id ? "保存修改" : "新增 FAQ"}</button></form>}
      <div className={styles.faqListPane}><div className={styles.searchBox}><span>⌕</span><input value={faqSearch} onChange={(event) => setFaqSearch(event.target.value)} placeholder="搜索问题、答案或关键词…"/></div><div className={styles.faqList}>{filteredFaqs.length ? filteredFaqs.map((item) => <article key={item.id} className={`${styles.faqCard} ${!item.enabled ? styles.faqDisabled : ""}`}><div className={styles.faqCardTop}><div><span className={item.enabled ? styles.enabledPill : styles.disabledPill}>{item.enabled ? "启用" : "停用"}</span><span className={styles.prioritySoft}>P{item.priority}</span></div><b>已命中 {item.hitCount} 次</b></div><h3>{item.question}</h3><p>{item.answer}</p>{item.keywords.length ? <div className={styles.keywordRow}>{item.keywords.map((keyword) => <span key={keyword}>{keyword}</span>)}</div> : null}{canAdmin ? <div className={styles.faqActions}><button type="button" className="secondary-button fit" onClick={() => editFaq(item)}>编辑</button><button type="button" className="secondary-button fit" disabled={busy} onClick={() => void removeFaq(item.id)}>删除</button></div> : null}</article>) : <div className={styles.emptyQueue}><b>没有匹配的 FAQ</b><span>可以新增第一条，或调整搜索关键词。</span></div>}</div></div>
    </div>
  </section>;

  return <div className={styles.consoleStack}>{view !== "faq" && conversationSection}{view !== "conversations" && faqSection}</div>;
}
