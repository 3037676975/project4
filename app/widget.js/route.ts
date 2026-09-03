import { createEmbedToken, loadPublicWidgetAssistant } from "../../lib/public-widget";

function javascript(body: string, status = 200) {
  return new Response(body, { status, headers: { "Content-Type": "application/javascript; charset=utf-8", "Cache-Control": "public, max-age=60, stale-while-revalidate=300", "X-Content-Type-Options": "nosniff" } });
}

export async function GET(request: Request) {
  const url = new URL(request.url); const publicId = url.searchParams.get("publicId") || "";
  const assistant = await loadPublicWidgetAssistant(publicId);
  if (!assistant) return javascript("console.error('KnowFlow: 客服入口不存在或未启用');", 404);
  const referer = request.headers.get("referer"); let embedOrigin = "direct";
  if (referer) { try { embedOrigin = new URL(referer).origin; } catch { /* direct */ } }
  let token = "";
  try { token = await createEmbedToken(assistant, embedOrigin); }
  catch { return javascript("console.error('KnowFlow: 当前网站域名不在客服白名单中');", 403); }
  const frameUrl = `${url.origin}/chat/${assistant.publicId}?token=${encodeURIComponent(token)}`;
  const color = assistant.themeColor;
  return javascript(`(()=>{if(document.getElementById('knowflow-widget-root'))return;const root=document.createElement('div');root.id='knowflow-widget-root';root.style.cssText='position:fixed;right:22px;bottom:22px;z-index:2147483000;font-family:system-ui,sans-serif';const frame=document.createElement('iframe');frame.src=${JSON.stringify(frameUrl)};frame.title=${JSON.stringify(assistant.brandName)};frame.allow='clipboard-write';frame.style.cssText='display:none;width:min(420px,calc(100vw - 24px));height:min(680px,calc(100vh - 92px));border:0;border-radius:18px;box-shadow:0 18px 60px rgba(15,23,42,.25);background:#fff;margin-bottom:12px';const button=document.createElement('button');button.type='button';button.setAttribute('aria-label','打开智能客服');button.innerHTML='<span style="font-size:18px">✦</span><span style="display:grid;text-align:left;line-height:1.05"><b style="font-size:12px">在线客服</b><small style="margin-top:4px;font-size:9px;opacity:.78">AI + 人工</small></span>';button.style.cssText=${JSON.stringify(`float:right;min-width:132px;height:58px;padding:0 17px;border:1px solid rgba(255,255,255,.18);border-radius:18px;display:flex;align-items:center;justify-content:center;gap:10px;background:${color};color:#fff;font-size:24px;cursor:pointer;box-shadow:0 12px 30px ${color}66;transition:transform .2s ease`)};let open=false;button.onclick=()=>{open=!open;frame.style.display=open?'block':'none';button.innerHTML=open?'×':'<span style="font-size:18px">✦</span><span style="display:grid;text-align:left;line-height:1.05"><b style="font-size:12px">在线客服</b><small style="margin-top:4px;font-size:9px;opacity:.78">AI + 人工</small></span>';button.style.minWidth=open?'58px':'132px';button.style.width=open?'58px':'auto';button.style.transform='none'};root.append(frame,button);document.body.append(root)})();`);
}
