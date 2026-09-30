# CEP CI — build / push / notify

Triggers: push to `main`, or manual `workflow_dispatch`.

## Required GitHub Actions secrets

| Name                    | Value                                              |
| ----------------------- | -------------------------------------------------- |
| `DOCKERHUB_USERNAME`    | Docker Hub username                                |
| `DOCKERHUB_TOKEN`       | Docker Hub access token (read+write)               |
| `DEPLOY_WEBHOOK_URL`    | `https://deploy.fybud.com/webhooks/github-actions` |
| `DEPLOY_WEBHOOK_SECRET` | Same as fybud Deploy `WEBHOOK_SECRET`              |

Images: `fybud/cep-api`, `cep-web`, `cep-admin-api`, `cep-admin` (`:sha-XXXXXXX` + `:latest`).
