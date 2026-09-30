# CEP Platform — Architecture

Customer Engagement Platform (CEP) is an omnichannel agent inbox for **WhatsApp Cloud API**, **Instagram Messaging**, and **Gmail**. Stack: Fastify + Prisma API, React agent UI, PostgreSQL.

Vendor-facing credential steps live in [`CHANNEL_SETUP_GUIDE.md`](./CHANNEL_SETUP_GUIDE.md). That guide (and the PDF in Settings) has **no client hostnames** — operators copy live URLs from **Settings → Callback URLs** on each site.

---

## 1. System map

```text
┌─────────────────┐     HTTPS REST      ┌──────────────────────┐
│  platform-web   │ ◄─────────────────► │   platform-api       │
│  (agent UI)     │   JWT Bearer auth   │   Fastify + Prisma   │
└─────────────────┘                     └──────────┬───────────┘
                                                   │
                    ┌──────────────────────────────┼──────────────────────────────┐
                    ▼                              ▼                              ▼
            WhatsApp Graph                 Instagram Graph                   Gmail API
            + Meta webhooks                + Meta webhooks                   + Pub/Sub push
```

| App | Path | Role |
|-----|------|------|
| API | `apps/platform-api` | Auth, accounts, inboxes, contacts, conversations, messages, webhooks, OAuth |
| Web | `apps/platform-web` | Login, Inbox, Contacts, Dashboard, **Settings (channel setup)** |

Public hosting (pattern `cep-<company>.fybud.com`). Examples below use **demo** — replace `demo` with the company slug:

| Surface | Example |
|---------|---------|
| Agent UI | `https://cep-demo.fybud.com` |
| API + webhooks + OAuth callbacks | `https://api.cep-demo.fybud.com` |

Public URLs are set in the **compose file for that site**, not in `.env`:

| Compose file | API | UI |
|--------------|-----|-----|
| `docker-compose.demo.yml` | `https://api.cep-demo.fybud.com` | `https://cep-demo.fybud.com` |
| `docker-compose.svasthyaa.yml` | `https://api.cep-svasthyaa.fybud.com` | `https://cep-svasthyaa.fybud.com` |

Public URLs, DB URLs, and secrets live in per-site env files (not duplicated in compose `environment`):

| Compose file | API env | Web env |
| --- | --- | --- |
| `docker-compose.demo.yml` | `apps/platform-api/.env.demo` | `apps/platform-web/.env.demo` |
| `docker-compose.svasthyaa.yml` | `apps/platform-api/.env.svasthyaa` | `apps/platform-web/.env.svasthyaa` |

Compose still sets Postgres service vars and `VITE_API_BASE_URL` as a **web build arg**. Local `npm run` falls back to localhost if URL vars are unset.

- `PLATFORM_API_BASE_URL` — API origin (webhooks, OAuth callbacks)
- `PLATFORM_WEB_BASE_URL` — agent UI origin (OAuth Connect returns here → `/settings`)
- Web `VITE_API_BASE_URL` — must match the API origin (baked in at image build)

---

## 2. Domain model

Chatwoot-style hierarchy, one conversation **per channel** per contact:

```text
Account
  └── Inbox (whatsapp | instagram | email)
        └── Conversation (status: open | pending | resolved)
              └── Message (incoming | outgoing)

Contact
  ├── emails[] / email / emailId
  ├── whatsappIds[] / whatsappId
  └── instagramId
```

Important behaviours:

| Concern | Behaviour |
|---------|-----------|
| Contact match | Inbound looks up **any** stored id for that channel (`whatsappIds`, `emails`, primary fields). Soft-merge across channels when email/WA overlap. Else create contact. |
| Status | Stored on **Conversation** (per channel), never on Contact. UI “Active” = any channel open/pending. |
| Channel config | Per-inbox `channelConfig` JSON. Settings UI merges patches; secrets redacted as `***` on read. Env defaults fill empty fields via `resolveChannelConfig`. |
| Outbound | Always on the **same inbox/channel** as the open conversation. |

---

## 3. Request & message flows

### 3.1 Inbound (receive)

```text
Customer → Provider → POST /webhooks/{channel}
                   → resolve first enabled inbox for that channel
                   → normalize adapter payload
                   → findOrCreateContact
                   → findOrCreateConversation
                   → persist Message
                   → Agent UI polls GET /conversations + /messages
```

| Channel | Webhook (stable, no inbox id) |
|---------|-------------------------------|
| WhatsApp | `POST /webhooks/whatsapp` |
| Instagram | `POST /webhooks/instagram` |
| Gmail | Pub/Sub push → `POST /webhooks/email/pubsub` |

Engineering examples use the demo host. Operators never copy these — they use **Settings → Callback URLs** on their own site:

```text
https://api.cep-demo.fybud.com/webhooks/whatsapp
https://api.cep-demo.fybud.com/webhooks/instagram
https://api.cep-demo.fybud.com/webhooks/email/pubsub
```

There are **no** `/webhooks/whatsapp/:inboxId` or `/webhooks/instagram/:inboxId` routes. Meta callbacks use the channel-only URLs above; the API routes traffic to the first enabled inbox for that channel.

Meta **GET** verify uses `hub.verify_token` matched against inbox/env `verifyToken`.

### 3.2 Outbound (send)

```text
Agent UI → POST /api/v1/conversations/:id/messages
        → MessagingService → channel adapter
        → Graph / Gmail send API
        → Message status sent | failed
```

### 3.3 Vendor OAuth (no CLI)

Developers historically ran local OAuth CLIs. **Vendors only have the hosted UI**, so OAuth is browser-native:

```text
Settings → Channels: Connect WhatsApp | Instagram | Gmail
        → Instagram: save App ID/Secret/Verify → OAuth → CEP auto-stores Access Token + Username
        → Gmail: Connect → Google authorization → CEP auto-stores Refresh + Access Token
        → (Gmail) watch starts after Connect and is renewed while the API is up
        → Shopify: save shop / Client ID / Secret → OAuth (merchant stores) or client credentials (same-org shop)
        → POST /api/v1/oauth/{gmail|instagram|shopify}/start   (JWT)
        → Redirect to Google / Meta / Shopify consent
        → GET /oauth/{gmail|instagram|shopify}/callback          (public)
        → Exchange code → write tokens (server only; redacted to UI)
        → Redirect → PLATFORM_WEB_BASE_URL/settings?oauth=…&status=success
Settings → Disconnect clears that channel’s credentials
Settings → Callback URLs includes Shopify **Login redirect** (`/oauth/shopify/callback`)
```

Gmail's OAuth client ID, client secret, and Pub/Sub topic are configured in the
platform API environment (`GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, and
`GMAIL_PUBSUB_TOPIC`). Settings → Gmail → Connect only opens Google authorization;
these values are never entered or exposed in the browser.

After a successful Connect, the browser lands on (demo example):

```text
https://cep-demo.fybud.com/settings?oauth=gmail|instagram|shopify&status=success
```

| Endpoint | Auth | Purpose |
|----------|------|---------|
| `GET /api/v1/oauth/hints` | JWT | Redirect URIs + webhook bases to paste in consoles |
| `POST /api/v1/oauth/gmail/start` | JWT | Returns Google consent URL |
| `POST /api/v1/oauth/instagram/start` | JWT | Returns Instagram consent URL |
| `POST /api/v1/oauth/shopify/start` | JWT | Client credentials if allowed; otherwise Shopify consent URL |
| `GET /oauth/gmail/callback` | Public | Code exchange → save refresh/access tokens |
| `GET /oauth/instagram/callback` | Public | Code exchange → save long-lived token + subscribe apps |
| `GET /oauth/shopify/callback` | Public | Code exchange → save shop access token |

Signed JWT `state` binds the callback to the correct inbox (20 min TTL).

CLI scripts remain for engineers debugging locally; they are **not** required for vendor setup.

---

## 4. API surface (high level)

| Area | Paths |
|------|--------|
| Health | `GET /health` |
| Auth | `POST /api/v1/auth/login` |
| Accounts / inboxes | `/api/v1/accounts…`, `PATCH /api/v1/inboxes/:id` |
| Conversations / messages | `/api/v1/conversations…` · `POST /:id/suppress` (clear chat) · `POST /:id/messages/delete` (selected messages) |
| Contacts | `/api/v1/contacts…` |
| Dashboard | `/api/v1/dashboard…` |
| Gmail watch | `POST /api/v1/gmail/watch`, `POST /api/v1/gmail/renew-watch` |
| OAuth connect | `/api/v1/oauth…`, `/oauth…` |
| Webhooks | `GET/POST /webhooks/whatsapp`, `GET/POST /webhooks/instagram`, `POST /webhooks/email/pubsub` |

All `/api/v1/*` except auth require `Authorization: Bearer <jwt>`. Webhooks and `/oauth/*` callbacks stay public.

---

## 5. Channel adapters

Located under `apps/platform-api/src/adapters/`:

| Adapter | Send | Receive |
|---------|------|---------|
| `whatsapp` | Graph `/{phoneNumberId}/messages` | Meta webhook `messages` |
| `instagram` | Instagram Graph `me/messages` (or Page path) | Meta webhook `messages` |
| `email` | Gmail API `users.messages.send` | Pub/Sub → History → `messages.get` |

Shared types: `NormalizedInboundMessage`, per-channel config interfaces in `adapters/shared/types.ts`.

---

## 6. Frontend structure

| Route | Page |
|-------|------|
| `/login` | Admin login |
| `/inbox` | Omnichannel thread UI (list + channel tabs + customer panel). **Clear chat** removes a whole channel thread; **Select → Delete** removes chosen messages. Both tombstone provider ids so sync cannot resurrect them. |
| `/contacts` | Contact directory (multi email / WhatsApp) |
| `/dashboard` | Lightweight metrics |
| `/settings` | Channel + Shopify credentials, Callback URLs (WhatsApp, Instagram, Gmail, Shopify). **Connect** opens a modal (disabled until required fields are filled); OAuth for Gmail, Instagram, and Shopify runs after Connect. **Disconnect** clears that channel’s credentials. |

API client: `apps/platform-web/src/api/index.ts` (React Query + Zustand auth token).

---

## 7. Data & ops

| Concern | Notes |
|---------|--------|
| Schema | `apps/platform-api/prisma/schema.prisma` |
| Migrations | Run automatically on API boot (`server.ts` → `migrate.ts`). Optional CLI: `npm run db:deploy` |
| Workspace | Boot `ensureWorkspace()` creates account + 3 inboxes and merges non-empty `.env` channel creds into `channelConfig` |
| Docker | `docker-compose.demo.yml` / `docker-compose.svasthyaa.yml` — URLs + DB baked in; secrets in `.env.demo` / `.env.svasthyaa` |

Secrets:

- Server `.env` channel vars are synced into inbox `channelConfig` on every boot (empty env keys do not wipe DB/OAuth values).  
- Settings / OAuth Connect can also write tokens into the same `channelConfig`.

---

## 8. Security notes

- JWT secret: `JWT_SECRET`.  
- Channel secrets redacted in API responses (`***`); merge ignores `***` patches so accidental save does not wipe tokens.  
- OAuth `state` is HMAC/JWT-signed; callbacks without valid state cannot target an arbitrary inbox when state is required (Gmail always; Instagram prefers state from Settings Connect).  
- Webhook signature verification can use App Secret fields (channel-dependent hardening).

---

## 9. Local vs hosted

| Mode | Public URL | OAuth |
|------|------------|--------|
| Local eng | Tunnel (`cloudflared` / ngrok) → `PLATFORM_API_BASE_URL` | Settings Connect **or** CLI scripts |
| Hosted vendor | `api.cep-<company>.fybud.com` API + `cep-<company>.fybud.com` UI | **Settings Connect only** (recommended) |

Meta and Google **cannot** call `localhost`. Always point webhooks and OAuth redirects at the public API host.

---

## Related

- Step-by-step credentials: [`CHANNEL_SETUP_GUIDE.md`](./CHANNEL_SETUP_GUIDE.md)  
- Env template: [`apps/platform-api/.env.example`](../apps/platform-api/.env.example)  
- Privacy HTML: [`docs/privacy-policy.html`](./privacy-policy.html)
