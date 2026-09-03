# Widget Database Migration Plan

## Goal

Move Widget configuration from runtime memory storage to persistent tenant-level storage.

## Current

```
Admin
 ↓
API
 ↓
Service
 ↓
Repository
 ↓
Memory Adapter
```

## Target

```
Admin
 ↓
API
 ↓
Service
 ↓
Repository
 ↓
PostgreSQL Adapter
 ↓
widget_settings
```

## Table

```sql
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

## Acceptance

- Restart container does not lose configuration.
- Tenant A cannot read Tenant B settings.
- Admin changes appear in public widget.
