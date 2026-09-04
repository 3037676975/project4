import type { StoredProviderConfig } from "./provider";

export type OcrRecognitionMode = "text" | "table";

function removedProviderError(provider: string) {
  return new Error(`${provider} OCR 已从 Project4 移除。私有化部署统一使用服务器内置 PaddleOCR。`);
}

/**
 * Compatibility exports only. The cloud implementations and credential/API
 * call code were intentionally removed so legacy configuration can never send
 * enterprise documents to Baidu or Tencent by mistake.
 */
export async function parseWithBaiduOcr(_config: StoredProviderConfig, _file: File, _mode: OcrRecognitionMode = "text") {
  throw removedProviderError("百度云");
}

export async function parseWithTencentOcr(_config: StoredProviderConfig, _file: File, _mode: OcrRecognitionMode = "text") {
  throw removedProviderError("腾讯云");
}

export async function testBaiduOcr(_config: StoredProviderConfig) {
  throw removedProviderError("百度云");
}

export async function testTencentOcr(_config: StoredProviderConfig) {
  throw removedProviderError("腾讯云");
}
