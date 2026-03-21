# server/api

> **Tier 5** — Can be developed independently. Uses `document-model` schema.

## What This Is

Cloud REST + WebSocket API. User accounts, authentication, patch storage, community features.

## Tech Stack
- Rust (Axum) or Node.js (Express/Fastify)
- PostgreSQL for relational data
- S3-compatible storage for blobs (audio, patches)
- JWT authentication + OAuth (Google, GitHub, Apple)

## Endpoints (core)
- POST /auth/register, /auth/login, /auth/oauth
- GET/POST /patches — CRUD for patches
- GET /patches/search — community search
- POST /patches/:id/fork — fork a patch
- GET/POST /presets — preset sharing
- POST /export — cloud compilation trigger
- WebSocket /sync — Yjs document sync relay

## Definition of Done
- [ ] User registration and login works
- [ ] Patch upload/download works
- [ ] Community search returns relevant results
- [ ] OAuth with at least Google works
