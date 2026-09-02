from pathlib import Path

path = Path('app/dashboard.tsx')
text = path.read_text()

anchor = '''function bytes(value: number) { if (value >= 1073741824) return `${(value / 1073741824).toFixed(1)} GB`; if (value >= 1048576) return `${(value / 1048576).toFixed(1)} MB`; return `${Math.round(value / 1024)} KB`; }\n'''
helper = anchor + '''function createClientRequestId() {\n  return `web_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}_${Math.random().toString(36).slice(2)}`.slice(0, 100);\n}\n'''
if text.count(anchor) != 1:
    raise SystemExit(f'bytes anchor count: {text.count(anchor)}')
text = text.replace(anchor, helper, 1)

old = 'clientRequestId: crypto.randomUUID()'
new = 'clientRequestId: createClientRequestId()'
if text.count(old) != 1:
    raise SystemExit(f'crypto.randomUUID checkout occurrence count: {text.count(old)}')
text = text.replace(old, new, 1)

path.write_text(text)
