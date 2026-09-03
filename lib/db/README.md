# Database Layer

## Widget Settings

Phase 2.13 introduces persistent widget configuration storage.

Architecture:

```
Admin Panel
    |
Widget API
    |
Service
    |
Repository
    |
Drizzle ORM
    |
PostgreSQL
```

The schema is prepared for:

- multi tenant isolation
- widget enable/disable
- theme configuration
- welcome messages
- quick questions
- future billing plans
