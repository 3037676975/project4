# Project4 Architecture

## Design Goal

Project4 follows a modular SaaS architecture. Business modules should be isolated so teams can maintain and extend the system safely.

## Module Layers

```
app
 └─ routing and pages

components
 └─ reusable UI components

features
 ├─ ai-chat
 ├─ knowledge
 ├─ customer-service
 ├─ billing
 └─ tenant

lib
 ├─ api
 ├─ auth
 └─ ai
```

## AI Flow

```
Visitor
  ↓
Customer Widget
  ↓
Conversation API
  ↓
Knowledge Retrieval
  ↓
LLM Generation
  ↓
Answer / Human Transfer
```

## Development Rules

1. Keep business logic away from UI components.
2. Add new capabilities as independent modules.
3. Keep deployment scripts backward compatible.
