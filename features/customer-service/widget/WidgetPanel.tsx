"use client";

import React from "react";

export function WidgetPanel({ open }: { open: boolean }) {
  if (!open) return null;

  return (
    <section className="project4-widget-panel" aria-label="AI customer service panel">
      <div className="project4-widget-header">AI 客服助手</div>
      <div className="project4-widget-body">
        <p>您好，我可以帮助您查询产品、订单和常见问题。</p>
      </div>
    </section>
  );
}
