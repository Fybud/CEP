# CEP tenant stacks (FiberAI Deploy)

Image-only Compose. **No Postgres here** — use the shared VPS Postgres (`fiberai-postgres` on `fiberai-net`).

| Folder | Domains | DB role / DBs |
|---|---|---|
| `demo/` | `cep.fybud.com`, `api.cep.fybud.com`, admin pair | `cep-demo`, `cep-demo-admin` |
| `svasthyaa/` | `cep-svasthyaa.fybud.com`, … | `cep-svasthyaa`, `cep-svasthyaa-admin` |

Deploy writes `.env` at runtime (never commit secrets).

GitHub Actions: `.github/workflows/build-push.yml` → Docker Hub `fiberai/cep-*` → Deploy webhook.
