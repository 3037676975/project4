# Widget SaaS Architecture

## Current

Admin Widget Settings

```
Admin
  |
  v
API
  |
  v
Service
  |
  v
Repository
  |
  v
Adapter
```

## Tenant Isolation

Every widget configuration belongs to a tenant.

Example:

- tenant-a: sales assistant
- tenant-b: support assistant

## Database Migration Plan

Future table:

```
widget_settings

id
tenant_id
enabled
title
welcome_message
avatar
theme_color
position
mode
quick_questions
created_at
updated_at
```

Migration should only replace Adapter implementation.
