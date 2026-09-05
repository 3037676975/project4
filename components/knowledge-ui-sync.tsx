"use client";

import { useEffect } from "react";

const LABELS: Record<string, string> = {
  auto: "智能解析（推荐：PDF 原文 / Office doc2md / 扫描件 OCR）",
  text: "图片 / 扫描 PDF：文字 OCR",
  table: "表格优先（Excel 原生结构；扫描表格提取文字）",
};

function applyKnowledgeLabels() {
  const selects = document.querySelectorAll<HTMLSelectElement>(".knowledge-layout select");
  for (const select of selects) {
    const values = new Set(Array.from(select.options).map((option) => option.value));
    if (!values.has("auto") || !values.has("text") || !values.has("table")) continue;
    for (const option of Array.from(select.options)) {
      const label = LABELS[option.value];
      if (label && option.textContent !== label) option.textContent = label;
    }
  }
}

export default function KnowledgeUiSync() {
  useEffect(() => {
    applyKnowledgeLabels();
    const observer = new MutationObserver(() => applyKnowledgeLabels());
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return null;
}
