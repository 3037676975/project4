import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geist = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://ai-kb-saas-guide-2026.drewlaurence4549.chatgpt.site"),
  title: "KnowFlow · 企业级 AI 客服与知识库平台",
  description: "让企业知识成为可靠的服务能力：可信回答、来源可追溯、全渠道客服与私有化部署。",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
  openGraph: {
    title: "KnowFlow · 企业 AI 客服与知识运营平台",
    description: "把企业资料变成有依据、可管理、能获客、会转人工的 AI 员工。",
    type: "website",
    images: [{ url: "/og.png", width: 1568, height: 1003, alt: "KnowFlow 企业级 AI 客服与知识库平台" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "KnowFlow · 企业 AI 客服与知识运营平台",
    description: "从企业资料到 AI 客服、线索、工单和收入闭环。",
    images: ["/og.png"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body className={`${geist.variable} ${geistMono.variable}`}>{children}</body>
    </html>
  );
}
