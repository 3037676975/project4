import { PublicApiError } from "./api-keys";
import { getRuntime } from "./runtime";

export const MAX_CUSTOMER_ATTACHMENT_BYTES = 8 * 1024 * 1024;
const SAFE_EXTENSIONS = new Set(["png","jpg","jpeg","webp","gif","pdf","txt","md","csv","doc","docx","xls","xlsx","ppt","pptx"]);
const SAFE_MIME_PREFIX = ["image/"];
const SAFE_MIMES = new Set([
  "application/pdf", "text/plain", "text/markdown", "text/csv",
  "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint", "application/vnd.openxmlformats-officedocument.presentationml.presentation",
]);

export function cleanCustomerAttachmentName(value: string) {
  return value.trim().replace(/[\\/\u0000-\u001f]+/g, "-").slice(0, 160) || "附件";
}

export function customerAttachmentKind(file: File) {
  const name = cleanCustomerAttachmentName(file.name); const extension = name.toLowerCase().split(".").pop() || "";
  const mime = (file.type || "application/octet-stream").toLowerCase();
  if (!SAFE_EXTENSIONS.has(extension)) throw new PublicApiError(415, "暂不支持该文件类型。可发送图片、PDF、Office 文档和文本文件。");
  if (!(SAFE_MIMES.has(mime) || SAFE_MIME_PREFIX.some((prefix) => mime.startsWith(prefix)) || mime === "application/octet-stream"))
    throw new PublicApiError(415, "该附件 MIME 类型不允许发送。");
  if (file.size <= 0) throw new PublicApiError(400, "附件为空。");
  if (file.size > MAX_CUSTOMER_ATTACHMENT_BYTES) throw new PublicApiError(413, "单个客服附件不能超过 8 MB。");
  return { name, mime, messageType: mime.startsWith("image/") ? "image" : "file" as "image" | "file" };
}

export async function storeCustomerAttachment(input: { tenantId: string; conversationId: string; messageId: string; file: File }) {
  const meta = customerAttachmentKind(input.file);
  const key = `tenant/${input.tenantId}/customer-service/${input.conversationId}/${input.messageId}/${encodeURIComponent(meta.name)}`;
  await getRuntime().BUCKET.put(key, await input.file.arrayBuffer(), { httpMetadata: { contentType: meta.mime } });
  return { ...meta, key, size: input.file.size };
}

export async function attachmentResponse(key: string, mime: string, name: string, inline = false) {
  const object = await getRuntime().BUCKET.get(key); if (!object) throw new PublicApiError(404, "附件不存在或已被清理。");
  const safe = cleanCustomerAttachmentName(name).replace(/["\r\n]/g, "-");
  return new Response(object.body, { headers: {
    "Content-Type": mime || "application/octet-stream", "Content-Length": String(object.size),
    "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(safe)}`,
    "Cache-Control": "private, max-age=60", "X-Content-Type-Options": "nosniff",
  } });
}
