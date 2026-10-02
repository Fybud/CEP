# CEP — Customer Engagement Platform

Fybud's customer-engagement product: a public client (platform-api + platform-web) plus a
private intent-classification sidecar. Admin lives in the sibling repo **CEP-Admin**
(tool `cep-admin`).

Deploy: root [`docker-compose.deploy.yml`](./docker-compose.deploy.yml) + [`DEPLOY.md`](./DEPLOY.md)
(playbook). Agent rules: [`AGENTS.md`](./AGENTS.md).

## Images

| Image | Built from | Purpose |
|---|---|---|
| `fybud/cep-api` | `client/platform-api/Dockerfile` | public API (`:4100`) |
| `fybud/cep-web` | `client/platform-web/Dockerfile` | public SPA (`:5173`, nginx) |
| `fybud/cep-intent-classifier` | `intent-classifier/Dockerfile` | private Python sidecar (`:8091`) |

`.github/workflows/build-push.yml` builds all three and notifies Fybud Deploy.

## Deployed stack (`docker-compose.deploy.yml`)

| Service | Domain | Labels |
|---|---|---|
| `platform-api` | `api.cep.fybud.com` | `fybud.health: "/health"` |
| `platform-web` | `cep.fybud.com` | `fybud.health: "/"` |
| `intent-classifier` | — | private: no `ports:`, no labels, `internal` network only |

Host ports are never hardcoded — Deploy picks free ones and writes `API_HOST_PORT` /
`WEB_HOST_PORT` into the runtime `.env`.

`platform-api` writes uploads to `/app/uploads`, so the compose declares the **`uploads:`**
named volume (containers are recreated on every deploy).

## Env — paste every empty key once (Deploy UI → Settings → Tool specs)

Paste (empty in compose): `JWT_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
`SUPER_ADMIN_EMAIL`, `AWS_REGION`, `AWS_S3_BUCKET`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`,
`MOCK`, `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `WHATSAPP_PHONE_NUMBER_ID`,
`WHATSAPP_ACCESS_TOKEN`, `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET`, `SHOPIFY_SHOP`,
`SHOPIFY_CLIENT_ID`, `SHOPIFY_CLIENT_SECRET`.

Literal in compose: `INTENT_CLASSIFIER_URL: http://intent-classifier:8091`.

Deploy injects (never paste): `PLATFORM_API_BASE_URL`, `PLATFORM_WEB_BASE_URL`,
`PLATFORM_DATABASE_URL`, `PLATFORM_MIGRATE_DATABASE_URL`, `IMAGE_TAG`, `*_HOST_PORT`.

## Local development

The app-level dev stack lives under `client/` (npm workspaces, `.env.*` per environment) and the
classifier alone can be run from `intent-classifier/` (`python server.py`, `:8091`).
