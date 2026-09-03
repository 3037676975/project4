# Project4 Deployment Guide

## Production Flow

```
Developer
  ↓
GitHub main
  ↓
Baota Webhook
  ↓
Auto Deploy Script
  ↓
Docker Compose
  ↓
Production Service
```

## Server Services

- KnowFlow application
- Qdrant vector database
- Email relay
- Operations worker

## Verification

After deployment check:

```bash
docker ps
```

Expected:

- knowflow running
- qdrant healthy
- email relay healthy

## Logs

```bash
docker compose --env-file .env.private -f docker-compose.private.yml logs -f
```
