# Project4 本地 PaddleOCR 架构

Project4 私有化部署默认使用内置 PaddleOCR 处理图片和扫描 PDF，同时使用 PaddleOCR 官方 `doc2md` 可选依赖直接解析原生 Office 文档，从而避免为文档识别持续调用付费云 OCR。

## 路由策略

- 图片 / 扫描 PDF：`knowflow -> paddleocr:8002 -> PP-OCRv6-small (CPU)`。
- DOCX / XLSX / PPTX：`knowflow -> paddleocr:8002 -> PaddleOCR doc2md -> Markdown`。
- 普通可复制文字 PDF：KnowFlow 先直接抽取 PDF 文本，只有文本不足时才进入 PaddleOCR。
- TXT / Markdown / CSV / JSON：应用直接解析，不进入 OCR。
- 旧版 DOC / XLS / PPT：请先另存为 DOCX / XLSX / PPTX。

## 为什么 Office 不需要 OCR 模型

`doc2md` 是 PaddleOCR 3.7.0 官方提供的可选依赖组，依赖 `python-docx`、`python-pptx`、`openpyxl`、`pylatexenc` 等常规解析库。它直接读取 Office 文档内部结构并输出 Markdown，不需要视觉 OCR 推理，因此不会为每份 Word / Excel / PPT 加载额外的大模型。

## 健康检查

PaddleOCR 容器启动时会执行一次真实的检测 + 识别推理自检，平台后台的服务健康状态只有在推理引擎真正可用时才会显示正常。上传图片时服务先使用 Pillow 标准化解码，再交给 PaddleOCR，避免某些合法 PNG/JPEG 被底层路径读取器误判为 `Image read Error`。

## 安全

PaddleOCR 只绑定服务器 `127.0.0.1:8002`，容器间使用 `PARSER_API_KEY` Bearer Token，不向公网暴露 OCR API。

## 成本

本地 PaddleOCR / doc2md 的识别成本按本地服务处理，不产生百度、腾讯等云 OCR 按次调用费用。服务器自身 CPU、内存和磁盘属于基础设施成本。
