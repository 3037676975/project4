import WidgetLoader from "./widget-loader";
import { createEmbedToken, loadPublicWidgetAssistant } from "../../../lib/public-widget";

export default async function PublicChatPage({ params, searchParams }: { params: Promise<{ publicId: string }>; searchParams: Promise<{ token?: string }> }) {
  const { publicId } = await params; const query = await searchParams; const assistant = await loadPublicWidgetAssistant(publicId);
  const embedToken = query.token || (assistant ? await createEmbedToken(assistant, "direct") : "");
  return <WidgetLoader publicId={publicId} embedToken={embedToken}/>;
}
