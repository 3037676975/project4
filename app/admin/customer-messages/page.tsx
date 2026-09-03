"use client";

import { useEffect, useState } from "react";

interface Conversation {
  id: string;
  lastQuestion: string;
  mode: string;
  status: string;
  messageCount: number;
  lastMessageAt: string;
}

export default function CustomerMessagesPage() {
  const [items, setItems] = useState<Conversation[]>([]);
  const [selected, setSelected] = useState<Conversation | null>(null);

  async function load() {
    const response = await fetch("/api/commercial/conversations");
    const data = await response.json();
    setItems(data.conversations || []);
  }

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 5000);
    return () => clearInterval(timer);
  }, []);

  return (
    <main style={{padding:32,background:'#f8fafc',minHeight:'100vh'}}>
      <h1>客户消息中心</h1>
      <p>统一处理官网 Widget、AI客服、人工转接产生的客户会话。</p>
      <div style={{display:'grid',gridTemplateColumns:'360px 1fr',gap:20}}>
        <section style={{background:'#fff',padding:20,borderRadius:20}}>
          <h2>会话列表</h2>
          {items.map((item)=>(
            <button key={item.id} onClick={()=>setSelected(item)} style={{display:'block',width:'100%',textAlign:'left',padding:12,marginBottom:10,borderRadius:12,border:'1px solid #e2e8f0',background:'#fff'}}>
              <b>{item.lastQuestion || '新访客咨询'}</b>
              <div>{item.mode === 'human' ? '人工客服' : 'AI客服'} · {item.status}</div>
            </button>
          ))}
        </section>
        <section style={{background:'#fff',padding:20,borderRadius:20}}>
          <h2>消息处理</h2>
          {selected ? <>
            <p>会话ID：{selected.id}</p>
            <p>最近问题：{selected.lastQuestion}</p>
            <p>消息数量：{selected.messageCount}</p>
            <p>这里作为后续客服回复、转人工、Trace查看入口。</p>
          </> : <p>请选择左侧客户会话。</p>}
        </section>
      </div>
    </main>
  );
}
