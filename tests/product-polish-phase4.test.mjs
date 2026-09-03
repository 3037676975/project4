import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');

test('widget persists AI/human mode server-side and allows return to AI', () => {
  const conversation = read('app/api/public/conversation/route.ts');
  const widget = read('app/chat/[publicId]/widget-client.tsx');
  assert.match(conversation, /action === "switch_mode"/);
  assert.match(conversation, /mode = 'ai', status = 'open'/);
  assert.match(conversation, /support_tickets SET status = 'resolved'/);
  assert.match(widget, /async function switchMode/);
  assert.match(widget, /恢复 AI/);
  assert.match(widget, /action: "switch_mode"/);
});

test('human handoff notice is not repeated for every visitor message', () => {
  const chat = read('app/api/public/chat/route.ts');
  const widget = read('app/chat/[publicId]/widget-client.tsx');
  assert.match(chat, /const firstHandoff = existing\?\.mode !== "human"/);
  assert.match(chat, /messageId: "", answer: ""/);
  assert.match(widget, /if \(data\.answer\) setMessages/);
});

test('homepage presents a real customer-service product instead of a demo landing page', () => {
  const page = read('app/page.tsx');
  for (const copy of ['实时客服 Inbox', '网站客服', '人工无缝接管', '报表与 Trace', '行业场景', '运营价值']) assert.ok(page.includes(copy), `missing ${copy}`);
  assert.match(page, /support-agent\.svg/);
  assert.match(page, /visitor-avatar\.svg/);
  assert.match(page, /ai-orb\.svg/);
  assert.doesNotMatch(page, /客户案例.*某某|已有\s*10000|99\.9%\s*客户/);
});

test('slider has a branded verification surface while retaining server verification', () => {
  const slider = read('app/auth-slider.tsx');
  assert.match(slider, /auth-slider-caption/);
  assert.match(slider, /安全验证/);
  assert.match(slider, /verify\(Number\(event\.currentTarget\.value\)\)/);
});

test('phase4 visual system styles homepage, widget, and slider', () => {
  const css = read('app/globals.css');
  for (const selector of ['.kf-inbox-preview', '.kf-mini-widget', '.kf-trace-demo', '.widget-modebar', '.auth-slider-caption']) assert.ok(css.includes(selector), `missing ${selector}`);
});
