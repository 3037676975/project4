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
  const avatarUrl = `${url.origin}/brand/support-agent-v3.jpg`;

  return javascript(`(()=>{
    if(document.getElementById('knowflow-widget-root'))return;
    const root=document.createElement('div');
    root.id='knowflow-widget-root';
    root.style.cssText='position:fixed;right:18px;bottom:18px;z-index:2147483000;font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif';

    const frame=document.createElement('iframe');
    frame.src=${JSON.stringify(frameUrl)};
    frame.title=${JSON.stringify(assistant.brandName)};
    frame.allow='clipboard-write';
    frame.style.cssText='display:block;width:min(380px,calc(100vw - 28px));height:min(600px,calc(100vh - 36px));max-height:calc(100vh - 36px);border:1px solid rgba(148,163,184,.25);border-radius:26px;box-shadow:0 28px 90px rgba(15,23,42,.22),0 8px 24px rgba(79,70,229,.08);background:#fff;overflow:hidden';

    const button=document.createElement('button');
    button.type='button';
    button.setAttribute('aria-label','关闭客服');
    button.style.cssText='position:absolute;right:12px;top:12px;width:34px;height:34px;padding:0;border:1px solid rgba(255,255,255,.18);border-radius:12px;display:grid;place-items:center;background:rgba(15,23,42,.28);color:#fff;font-size:20px;line-height:1;cursor:pointer;box-shadow:none;backdrop-filter:blur(12px)';

    let open=true;
    function sync(){
      if(open){
        frame.style.display='block';
        button.innerHTML='×';
        button.setAttribute('aria-label','关闭客服');
        button.style.position='absolute';
        button.style.right='12px';
        button.style.top='12px';
        button.style.bottom='auto';
        button.style.width='34px';
        button.style.height='34px';
        button.style.borderRadius='12px';
        button.style.border='1px solid rgba(255,255,255,.18)';
        button.style.background='rgba(15,23,42,.28)';
        button.style.boxShadow='none';
        button.style.overflow='visible';
      }else{
        frame.style.display='none';
        button.innerHTML='<img src=${JSON.stringify(avatarUrl)} alt="客服" style="width:100%;height:100%;object-fit:cover;object-position:center 20%;display:block">';
        button.setAttribute('aria-label','打开智能客服');
        button.style.position='relative';
        button.style.right='auto';
        button.style.top='auto';
        button.style.bottom='auto';
        button.style.width='50px';
        button.style.height='50px';
        button.style.borderRadius='999px';
        button.style.border='2px solid #fff';
        button.style.background='#fff';
        button.style.boxShadow='0 14px 38px rgba(15,23,42,.18)';
        button.style.overflow='hidden';
      }
    }
    button.onclick=()=>{open=!open;sync()};
    root.append(frame,button);
    document.body.append(root);
    sync();
  })();`);
}
