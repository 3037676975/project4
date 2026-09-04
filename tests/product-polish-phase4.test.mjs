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

test('homepage presents the current customer-service product instead of a demo landing page', () => {
  const page = read('app/page.tsx');
  for (const copy of ['人工客服 Inbox', '网站客服 Widget', '人工接管', 'Trace 与服务分析', '行业场景', '运营价值']) {
    assert.ok(page.includes(copy), `missing ${copy}`);
  }
  assert.match(page, /support-agent\.jpg/);
  assert.match(page, /visitor-male-v3\.jpg/);
  assert.match(page, /visitor-female-v3\.jpg/);
  assert.match(page, /homepage\.module\.css/);
  assert.doesNotMatch(page, /className="kf-|客户案例.*某某|已有\s*10000|99\.9%\s*客户/);
});

test('homepage styles are isolated from legacy global kf selectors and responsive', () => {
  const css = read('app/homepage.module.css');
  for (const selector of ['.heroCopy', '.dashboard', '.workspace', '.inbox', '.liveChat', '.traceMini', '@media']) {
    assert.ok(css.includes(selector), `missing ${selector}`);
  }
  assert.match(css, /width:min\(1450px,calc\(100% - 48px\)\)/);
  assert.match(css, /grid-template-columns:250px minmax\(0,1fr\) 310px/);
  assert.doesNotMatch(css, /\.kf-/);
});

test('slider has a branded verification surface while retaining server verification', () => {
  const slider = read('app/auth-slider.tsx');
  assert.match(slider, /auth-slider-caption/);
  assert.match(slider, /安全验证/);
  assert.match(slider, /verify\(Number\(event\.currentTarget\.value\)\)/);
});

test('phase4 visual system still styles widget and slider', () => {
  const css = read('app/globals.css');
  for (const selector of ['.widget-modebar', '.auth-slider-caption']) assert.ok(css.includes(selector), `missing ${selector}`);
});
