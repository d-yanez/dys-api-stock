# dys-api-stock

Microservicio para consulta y actualización de stock, con notificaciones automáticas a Telegram.

## Requisitos

- Node.js 20
- MongoDB (URI en variable de entorno)
- Bot de Telegram (TOKEN y CHAT_ID en variables de entorno)

## Instalación y uso en local

1. Clonar el repositorio:
   ```bash
   git clone <url-repo> dys-api-stock
   cd dys-api-stock

2. Instalar dependencias:
   ```bash 
   npm install
3. Ejecutar en modo desarrollo:
   ```bash 
   npm run start-dev

4. Probar endpoints:
   ```bash 
   GET /api/stock/:sku
   GET /api/batch/sku?skus=111,222,333
   POST /api/sku con JSON { sku, stock, location }

## Environment variables

Placeholders only; never commit real credential values.

| Variable | Required | Purpose |
| --- | --- | --- |
| `PORT` | no | HTTP port, defaults to `8080`. |
| `MONGODB_URI` | yes | MongoDB connection string. |
| `API_KEY` | yes | Primary API key accepted on `/api` routes. |
| `API_KEY_SECONDARY` | no | Temporary second API key accepted on `/api` routes during credential rotation only. |
| `TELEGRAM_BOT_TOKEN` | yes | Telegram bot token for stock notifications. |
| `TELEGRAM_CHAT_ID` | yes | Telegram chat that receives stock notifications. |

```text
MONGODB_URI=<mongodb-connection-string>
API_KEY=<primary-api-key>
API_KEY_SECONDARY=<previous-api-key>
TELEGRAM_BOT_TOKEN=<telegram-bot-token>
TELEGRAM_CHAT_ID=<telegram-chat-id>
```

## API authentication

Every `/api` route requires the `x-api-key` header.

- A missing header returns `401 {"error":"API key missing"}`.
- A key that is not currently accepted returns `403 {"error":"API key invalid"}`.

### Dual-key rotation window

To rotate the inbound key without downtime, the service temporarily accepts
both `API_KEY` (new key) and `API_KEY_SECONDARY` (previous key). Set
`API_KEY_SECONDARY` only while consumers migrate, then remove it and delete the
value from the runtime environment. `API_KEY` is authoritative: if it is missing
or blank, every request is rejected even when `API_KEY_SECONDARY` is set. When
`API_KEY` is configured, a secondary key that is unset, empty, or whitespace is
ignored, so only `API_KEY` is accepted.

Logs record only the event, `location`, `ip`, and `path`. The middleware never
logs the presented `x-api-key`, the configured keys, or any other credential
material, including on rejection. Keys are compared with a timing-safe
comparison: byte lengths are checked first so a length-mismatched key is
rejected without reading or echoing its value, and matching-length keys are
compared in constant time.

### Delivery
The running service receives both keys as Secret Manager references, never as
inline values. Use `scripts/gcp/configure-api-key-secrets.sh` (dry run first)
for the rotation window, rollback swap, and secondary retirement; it passes only
non-secret resource names to gcloud and leaves unrelated mappings untouched.
The normal image deploy passes no environment or secret flags, so existing
mappings survive a redeploy. See
[docs/api-key-rotation.md](docs/api-key-rotation.md#delivery-mechanism).

See [docs/api-key-rotation.md](docs/api-key-rotation.md) for the runbook and
rollback steps.
