import { StoredProviderConfig } from "./provider";

const OCR_TEST_IMAGE_URL = "https://ocr-demo-1254418846.cos.ap-guangzhou.myqcloud.com/general/GeneralBasicOCR/GeneralBasicOCR1.jpg";
const baiduTokenCache = new Map<string, { token: string; expiresAt: number }>();
export type OcrRecognitionMode = "text" | "table";

function bufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer); let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 32768) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + 32768, bytes.length)));
  }
  return btoa(binary);
}

function isPdf(file: File) { return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf"); }
function isImage(file: File) { return file.type.startsWith("image/") || /\.(png|jpe?g|bmp|webp|tiff?)$/i.test(file.name); }

type GridCell = { rowStart: number; rowEnd: number; colStart: number; colEnd: number; text: string };

function markdownGrid(cells: GridCell[], title: string) {
  if (!cells.length) return "";
  const rowCount = Math.min(200, Math.max(...cells.map((cell) => cell.rowEnd), 1));
  const colCount = Math.min(50, Math.max(...cells.map((cell) => cell.colEnd), 1));
  const grid = Array.from({ length: rowCount }, () => Array.from({ length: colCount }, () => ""));
  for (const cell of cells) {
    if (cell.rowStart < 0 || cell.colStart < 0 || cell.rowStart >= rowCount || cell.colStart >= colCount) continue;
    grid[cell.rowStart][cell.colStart] = cell.text.replace(/\|/g, "\\|").replace(/\s*\n\s*/g, " / ").trim();
  }
  const header = grid[0].map((value, index) => value || `列${index + 1}`);
  return [`### ${title}`, `| ${header.join(" | ")} |`, `| ${header.map(() => "---").join(" | ")} |`,
    ...grid.slice(1).map((row) => `| ${row.join(" | ")} |`)].join("\n");
}

async function baiduAccessToken(config: StoredProviderConfig) {
  if (!config.credentialId) throw new Error("百度云 API Key 尚未配置");
  const cached = baiduTokenCache.get(config.id);
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;
  const url = new URL("/oauth/2.0/token", config.baseUrl);
  url.searchParams.set("grant_type", "client_credentials");
  url.searchParams.set("client_id", config.credentialId);
  url.searchParams.set("client_secret", config.apiKey);
  const response = await fetch(url, { method: "POST", signal: AbortSignal.timeout(20000) });
  const data = await response.json() as { access_token?: string; expires_in?: number; error?: string; error_description?: string };
  if (!response.ok || !data.access_token) throw new Error(data.error_description || data.error || "百度云鉴权失败");
  const expiresIn = Math.max(300, Number(data.expires_in || 2_592_000));
  baiduTokenCache.set(config.id, { token: data.access_token, expiresAt: Date.now() + expiresIn * 1000 });
  return data.access_token;
}

type BaiduOcrResponse = {
  words_result?: Array<{ words?: string }>;
  words_result_num?: number;
  tables_result?: Array<{
    header?: Array<{ words?: string }>;
    body?: Array<{ row_start?: number; row_end?: number; col_start?: number; col_end?: number; words?: string }>;
    footer?: Array<{ words?: string }>;
  }>;
  table_num?: number;
  pdf_file_size?: string | number;
  error_code?: number;
  error_msg?: string;
};

async function callBaidu(config: StoredProviderConfig, fields: Record<string, string>, requestedEngine?: string) {
  const token = await baiduAccessToken(config);
  const engine = requestedEngine === "table" ? "table" : config.model === "accurate_basic" ? "accurate_basic" : "general_basic";
  const body = new URLSearchParams(engine === "table"
    ? { ...fields, return_excel: "false", cell_contents: "false" }
    : { ...fields, language_type: "CHN_ENG", detect_direction: "true", paragraph: "true" });
  if (body.toString().length > 8 * 1024 * 1024) throw new Error("百度云 OCR 要求编码后的文件不超过 8 MB，请压缩或拆分文件");
  const url = new URL(`/rest/2.0/ocr/v1/${engine}`, config.baseUrl); url.searchParams.set("access_token", token);
  const response = await fetch(url, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body,
    signal: AbortSignal.timeout(60000),
  });
  const data = await response.json() as BaiduOcrResponse;
  if (!response.ok || data.error_code) throw new Error(data.error_msg || `百度云 OCR 返回错误 ${data.error_code || response.status}`);
  return data;
}

function baiduText(data: BaiduOcrResponse) {
  return (data.words_result || []).map((item) => item.words?.trim() || "").filter(Boolean).join("\n");
}

function baiduTableText(data: BaiduOcrResponse) {
  return (data.tables_result || []).map((table, index) => {
    const heading = (table.header || []).map((item) => item.words?.trim()).filter(Boolean).join(" · ");
    const cells = (table.body || []).map((cell) => ({
      rowStart: Number(cell.row_start || 0), rowEnd: Number(cell.row_end || Number(cell.row_start || 0) + 1),
      colStart: Number(cell.col_start || 0), colEnd: Number(cell.col_end || Number(cell.col_start || 0) + 1), text: cell.words || "",
    }));
    const footer = (table.footer || []).map((item) => item.words?.trim()).filter(Boolean).join(" · ");
    return [markdownGrid(cells, heading || `表格 ${index + 1}`), footer ? `表尾：${footer}` : ""].filter(Boolean).join("\n\n");
  }).filter(Boolean).join("\n\n");
}

export async function parseWithBaiduOcr(config: StoredProviderConfig, file: File, mode: OcrRecognitionMode = "text") {
  if (!isPdf(file) && !isImage(file)) throw new Error("百度云通用 OCR 仅处理图片和 PDF；Office 文件请使用 Docling 兼容服务");
  const encoded = bufferToBase64(await file.arrayBuffer());
  const table = mode === "table"; const engine = table ? (config.secondaryModel || "table") : config.model;
  if (!isPdf(file)) {
    const data = await callBaidu(config, { image: encoded }, table ? "table" : undefined); const text = table ? baiduTableText(data) : baiduText(data);
    if (!text) throw new Error("百度云 OCR 没有识别到文字");
    return { text, pageCount: 1, engine: `baidu:${engine}` };
  }
  const first = await callBaidu(config, { pdf_file: encoded, pdf_file_num: "1" }, table ? "table" : undefined);
  const total = Math.max(1, Number(first.pdf_file_size || 1));
  if (total > 100) throw new Error("扫描 PDF 超过 100 页，请拆分后上传以控制 OCR 调用次数");
  const pageText = (value: BaiduOcrResponse) => table ? baiduTableText(value) : baiduText(value);
  const pages = [pageText(first)];
  for (let page = 2; page <= total; page += 1) pages.push(pageText(await callBaidu(config, { pdf_file: encoded, pdf_file_num: String(page) }, table ? "table" : undefined)));
  const text = pages.map((value, index) => `## 第 ${index + 1} 页\n\n${value}`).join("\n\n").trim();
  if (!text.replace(/^## 第 \d+ 页/gm, "").trim()) throw new Error("百度云 OCR 没有识别到文字");
  return { text, pageCount: total, engine: `baidu:${engine}` };
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function hmac(key: string | ArrayBuffer, value: string) {
  const raw = typeof key === "string" ? new TextEncoder().encode(key) : key;
  const cryptoKey = await crypto.subtle.importKey("raw", raw, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(value));
}

function hex(value: ArrayBuffer) { return [...new Uint8Array(value)].map((byte) => byte.toString(16).padStart(2, "0")).join(""); }

type TencentOcrResponse = {
  Response?: {
    TextDetections?: Array<{ DetectedText?: string }>;
    TableDetections?: Array<{ Cells?: Array<{ RowTl?: number; RowBr?: number; ColTl?: number; ColBr?: number; Text?: string }> }>;
    Data?: string;
    PdfPageSize?: number;
    Error?: { Code?: string; Message?: string };
    RequestId?: string;
  };
};

const TENCENT_TEXT_ACTIONS = new Set(["GeneralBasicOCR", "GeneralAccurateOCR", "GeneralFastOCR", "GeneralHandwritingOCR"]);

function tencentTextPayload(action: string, source: Record<string, unknown>) {
  if (action === "GeneralBasicOCR") return { ...source, LanguageType: "zh", DetectDirection: true, Paragraph: true };
  if (action === "GeneralAccurateOCR") return { ...source, EnableDetectSplit: true, ConfigID: "OCR", WordsType: "0" };
  return source;
}

async function callTencent(config: StoredProviderConfig, payload: Record<string, unknown>, requestedAction?: string) {
  if (!config.credentialId) throw new Error("腾讯云 SecretId 尚未配置");
  const host = "ocr.tencentcloudapi.com"; const service = "ocr"; const timestamp = Math.floor(Date.now() / 1000);
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10); const body = JSON.stringify(payload);
  const canonicalHeaders = `content-type:application/json; charset=utf-8\nhost:${host}\n`;
  const signedHeaders = "content-type;host";
  const canonicalRequest = `POST\n/\n\n${canonicalHeaders}\n${signedHeaders}\n${await sha256Hex(body)}`;
  const credentialScope = `${date}/${service}/tc3_request`;
  const stringToSign = `TC3-HMAC-SHA256\n${timestamp}\n${credentialScope}\n${await sha256Hex(canonicalRequest)}`;
  const secretDate = await hmac(`TC3${config.apiKey}`, date);
  const secretService = await hmac(secretDate, service);
  const secretSigning = await hmac(secretService, "tc3_request");
  const signature = hex(await hmac(secretSigning, stringToSign));
  const authorization = `TC3-HMAC-SHA256 Credential=${config.credentialId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  const response = await fetch(`https://${host}`, {
    method: "POST",
    headers: {
      Authorization: authorization,
      "Content-Type": "application/json; charset=utf-8",
      "X-TC-Action": requestedAction || (TENCENT_TEXT_ACTIONS.has(config.model) ? config.model : "GeneralBasicOCR"),
      "X-TC-Timestamp": String(timestamp),
      "X-TC-Version": "2018-11-19",
      "X-TC-Region": config.region || "ap-guangzhou",
    },
    body,
    signal: AbortSignal.timeout(60000),
  });
  const data = await response.json() as TencentOcrResponse; const error = data.Response?.Error;
  if (!response.ok || error) throw new Error(error?.Message || error?.Code || `腾讯云 OCR 返回 HTTP ${response.status}`);
  return data.Response || {};
}

function tencentText(data: NonNullable<TencentOcrResponse["Response"]>) {
  return (data.TextDetections || []).map((item) => item.DetectedText?.trim() || "").filter(Boolean).join("\n");
}

function tencentTableText(data: NonNullable<TencentOcrResponse["Response"]>) {
  return (data.TableDetections || []).map((table, index) => markdownGrid((table.Cells || []).map((cell) => ({
    rowStart: Number(cell.RowTl || 0), rowEnd: Number(cell.RowBr || Number(cell.RowTl || 0) + 1),
    colStart: Number(cell.ColTl || 0), colEnd: Number(cell.ColBr || Number(cell.ColTl || 0) + 1), text: cell.Text || "",
  })), `表格 ${index + 1}`)).filter(Boolean).join("\n\n");
}

export async function parseWithTencentOcr(config: StoredProviderConfig, file: File, mode: OcrRecognitionMode = "text") {
  if (!isPdf(file) && !isImage(file)) throw new Error("腾讯云通用 OCR 仅处理图片和 PDF；Office 文件请使用 Docling 兼容服务");
  const encoded = bufferToBase64(await file.arrayBuffer());
  const table = mode === "table"; const action = table ? (config.secondaryModel || "RecognizeTableOCR") : undefined;
  if (isPdf(file) && config.model === "GeneralHandwritingOCR" && !table) throw new Error("腾讯云通用手写体接口仅支持图片；PDF 请切换通用高精度识别");
  if (encoded.length > 7 * 1024 * 1024) throw new Error("腾讯云 OCR 要求 Base64 文件不超过 7 MB，请压缩或拆分文件");
  if (!isPdf(file)) {
    const data = await callTencent(config, table ? { ImageBase64: encoded, TableLanguage: "zh" } : tencentTextPayload(config.model, { ImageBase64: encoded }), action);
    const text = table ? tencentTableText(data) : tencentText(data);
    if (!text) throw new Error("腾讯云 OCR 没有识别到文字");
    return { text, pageCount: 1, engine: `tencent:${table ? config.secondaryModel || "RecognizeTableOCR" : config.model}` };
  }
  const payload = (page: number) => table
    ? { ImageBase64: encoded, IsPdf: true, PdfPageNumber: page, TableLanguage: "zh" }
    : tencentTextPayload(config.model, { ImageBase64: encoded, IsPdf: true, PdfPageNumber: page });
  const first = await callTencent(config, payload(1), action);
  const total = Math.max(1, Number(first.PdfPageSize || 1));
  if (total > 100) throw new Error("扫描 PDF 超过 100 页，请拆分后上传以控制 OCR 调用次数");
  const pageText = (value: NonNullable<TencentOcrResponse["Response"]>) => table ? tencentTableText(value) : tencentText(value);
  const pages = [pageText(first)];
  for (let page = 2; page <= total; page += 1) pages.push(pageText(await callTencent(config, payload(page), action)));
  const text = pages.map((value, index) => `## 第 ${index + 1} 页\n\n${value}`).join("\n\n").trim();
  if (!text.replace(/^## 第 \d+ 页/gm, "").trim()) throw new Error("腾讯云 OCR 没有识别到文字");
  return { text, pageCount: total, engine: `tencent:${table ? config.secondaryModel || "RecognizeTableOCR" : config.model}` };
}

export async function testBaiduOcr(config: StoredProviderConfig) {
  const data = await callBaidu(config, { url: OCR_TEST_IMAGE_URL });
  if (!baiduText(data)) throw new Error("百度云鉴权成功，但测试图片没有返回文字");
  return { message: "百度智能云 OCR 连接成功", engine: config.model };
}

export async function testTencentOcr(config: StoredProviderConfig) {
  const data = await callTencent(config, tencentTextPayload(config.model, { ImageUrl: OCR_TEST_IMAGE_URL }));
  if (!tencentText(data)) throw new Error("腾讯云鉴权成功，但测试图片没有返回文字");
  return { message: "腾讯云 OCR 连接成功", engine: config.model };
}
