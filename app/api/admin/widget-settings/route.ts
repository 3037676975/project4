import { NextResponse } from "next/server";

/**
 * Widget settings API foundation.
 *
 * Phase 2.8 will connect this layer to the tenant/platform persistence layer.
 * For now it provides a stable contract for the admin UI and public widget.
 */

const defaultSettings = {
  enabled: true,
  title: "KnowFlow AI 客服",
  welcomeMessage: "你好，我可以帮助你查询产品、价格和技术方案。",
  avatar: "🤖",
  themeColor: "#2563eb",
  position: "right",
  mode: "hybrid",
  quickQuestions: ["产品介绍", "价格咨询", "联系客服"],
};

export async function GET() {
  return NextResponse.json({
    success: true,
    data: defaultSettings,
  });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));

  return NextResponse.json({
    success: true,
    data: {
      ...defaultSettings,
      ...body,
    },
    message: "Widget settings accepted",
  });
}
