# Shared Library Layer

This directory contains cross-feature capabilities.

Recommended responsibilities:

- api: typed API clients
- ai: model providers and prompts
- auth: authentication helpers
- database: shared database utilities
- validation: common validation rules

Business rules should stay inside feature modules instead of growing this layer.
