# AMAS Backend

Backend service for the AMAS voice room. Provides three things the frontend
can't safely do by itself:

1. **Gemini Live WebSocket proxy** (`/api/gemini/live`) — keeps `GEMINI_API_KEY`
   off the client.
2. **LiveKit token issuer** (`POST /api/voice/token`) — signs JWTs with the
   server-only `LIVEKIT_API_SECRET`.
3. **Room password storage + timing-safe validation** (`POST /api/rooms`,
   `POST /api/rooms/validate`) — passwords are scrypt-hashed and never sent
   back to the client.

The frontend talks to all three via `VITE_API_BASE_URL`. If that env var is
**unset**, the app falls back to local-only behavior (direct Gemini with
bundled key, MockTransport for voice, client-side password compare). That
fallback is fine for development and local-only demos — it must not be the
production configuration.

## Quick start (local)

```bash
cd backend
cp .env.example .env          # fill in GEMINI_API_KEY + LIVEKIT_* fields
npm install
npm run dev                   # tsx watch — restarts on edits
```

Then in another shell from the project root:

```bash
echo 'VITE_API_BASE_URL=http://localhost:8787' >> .env.local
echo 'VITE_VOICE_TRANSPORT=livekit' >> .env.local
npm run dev                   # vite dev server
```

The frontend will now route Gemini through the proxy and use a real
LiveKit room.

> **Frontend integration note** — when the backend has `APP_SECRET` set,
> the frontend must include `Authorization: Bearer <APP_SECRET>` on every
> HTTP request and append `?token=<APP_SECRET>` to the Gemini WS URL
> (e.g. `wss://<host>/api/gemini/live?token=...`). Ship the value through a
> build-time env var such as `VITE_APP_SECRET` — do not hardcode it.

## Endpoints

### `GET /api/health`

Returns service status + which features are configured.

### `POST /api/voice/token`

Body: `{ roomName: string, identity: string, name?: string }`

Returns: `{ url, token, identity, expiresAt }`. Token is a 1-hour LiveKit JWT
with `roomJoin`, `canPublish`, `canSubscribe`, `canPublishData` grants.

### `POST /api/rooms`

Body: `{ roomId, hostId, password? }`

Creates (or updates if same `hostId`) a room record. Password is scrypt-hashed
with a per-room salt. Omit `password` for a public room.

### `POST /api/rooms/validate`

Body: `{ roomId, password? }`

Returns `{ ok: true, public: boolean }` on success. Returns `401` on wrong
password, `404` if the room isn't registered (so the client can decide its
fallback path).

### `DELETE /api/rooms/:roomId`

Header: `X-Host-Id: <userId>`. Only the original host can delete.

### `WS /api/gemini/live`

WebSocket protocol (JSON):

- `client -> { "type": "start" }` — also accepts `{ model?, systemInstruction?, voice? }`
- `client -> { "type": "audio", "data": "<base64 PCM16 16kHz mono>" }`
- `client -> { "type": "stop" }`
- `server -> { "type": "open" | "audio" | "interrupted" | "closed" | "error" }`

The server holds the only copy of `GEMINI_API_KEY`. Audio frames travel
through the proxy untouched (base64-encoded PCM16).

**Auth (when `APP_SECRET` is set):** the WS handshake must include the
bearer token in the query string — browsers cannot set arbitrary headers on
a WebSocket upgrade. The frontend should connect to:

```
wss://<host>/api/gemini/live?token=<APP_SECRET>
```

Requests without (or with the wrong) `token` are rejected with HTTP `401`
before the upgrade completes.

## 推送通知 (Push Notifications)

The backend can deliver Apple Push Notifications (APNs) to registered iOS
devices. Real delivery is wired in `src/push/apnsClient.ts` and used by:

- `POST /api/push/test` — send a test push to the caller's first registered
  iOS device.
- `POST /api/posts` — fire-and-forget broadcast to every registered iOS
  device on every new community post.
- `POST /api/announcements` — fire-and-forget broadcast on every new
  school-wide announcement.

Broadcasts are **best-effort**: a push failure can never block the HTTP
response, and tokens that APNs reports as `BadDeviceToken` or `Unregistered`
are automatically removed from the in-memory registry.

### Required env vars

| Var               | What it is                                              |
| ----------------- | ------------------------------------------------------- |
| `APNS_KEY_PATH`   | Absolute path to the `.p8` auth key file on disk        |
| `APNS_KEY_ID`     | 10-character Key ID shown next to the key in Apple Dev |
| `APNS_TEAM_ID`    | 10-character Team ID (top of Account → Membership)      |
| `APNS_BUNDLE_ID`  | App bundle ID, e.g. `com.amas.seminary`                 |
| `APNS_PRODUCTION` | `true` for App Store / TestFlight, omit for Xcode debug |

**Download the `.p8` key** from
[developer.apple.com → Certificates, IDs & Profiles → Keys](https://developer.apple.com/account/resources/authkeys/list).
Create a new key with "Apple Push Notifications service (APNs)" enabled,
download the `.p8` exactly once (Apple won't let you redownload), and
copy its absolute path into `APNS_KEY_PATH`.

If **any** of the four required vars is unset (or the `.p8` file is not
readable), the backend silently degrades to dev mode: `/api/push/test`
returns a stub response, broadcast pushes become a no-op, and nothing is
logged above debug level. This is the intended behavior for local dev,
CI, and unit tests.

### Verifying

```bash
# 1) Log in as a normal user and grab the access token.
ACCESS=$(curl -s -X POST http://localhost:8787/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","password":"..."}' | jq -r .accessToken)

# 2) Register a device token (use a real APNs token from the iOS app).
curl -X POST http://localhost:8787/api/push/register \
  -H "Authorization: Bearer $ACCESS" -H 'Content-Type: application/json' \
  -d '{"token":"<APNS-DEVICE-TOKEN>","platform":"ios"}'

# 3) Send a test push (will hit APNs if the four env vars are set).
curl -X POST http://localhost:8787/api/push/test \
  -H "Authorization: Bearer $ACCESS"
# -> { "ok": true, "sentTo": "abcd1234…", "platform": "ios" }
```

A successful real send returns `ok: true` and your device buzzes within
~1 second. An error (token wrong, wrong gateway, wrong bundle) returns
`ok: false` with an APNs `reason` such as `BadDeviceToken` or
`DeviceTokenNotForTopic`.

## Deployment

The backend is a plain Node.js Express server with one WebSocket endpoint —
it runs anywhere Node 20+ runs.

### Fly.io (recommended)

```bash
fly launch --no-deploy
fly secrets set GEMINI_API_KEY=... LIVEKIT_API_KEY=... LIVEKIT_API_SECRET=... LIVEKIT_URL=...
fly secrets set CORS_ORIGINS=https://your-frontend.app,capacitor://localhost
fly deploy
```

Fly handles WebSocket upgrades and gives you a wss:// URL out of the box.

### Render / Railway / Heroku

```
Build command:  cd backend && npm install && npm run build
Start command:  cd backend && npm start
Health check:   GET /api/health
```

Set all the env vars in the platform's secret store. Confirm the platform
supports long-lived WebSocket connections (most do; serverless platforms
like Vercel Functions or Cloudflare Pages Functions **do not** — use Fly,
Render, Railway, or a Cloudflare Worker with Durable Objects).

### Docker

The repo ships a multi-stage `Dockerfile` (alpine, runs as the non-root
`node` user, with a built-in `HEALTHCHECK`):

```bash
cd backend
docker build -t amas-backend .

docker run --rm -p 8787:8787 \
  -e APP_SECRET="$(openssl rand -hex 32)" \
  -e GEMINI_API_KEY=... \
  -e LIVEKIT_URL=wss://your-project.livekit.cloud \
  -e LIVEKIT_API_KEY=... \
  -e LIVEKIT_API_SECRET=... \
  -e CORS_ORIGINS=https://your-frontend.app \
  amas-backend
```

Stage 1 (`node:20-alpine`) installs all deps and runs `npm run build`.
Stage 2 (`node:20-alpine`) copies `dist/` and only the production
`node_modules`, drops to the `node` user, and exposes `8787`.

## Security

### Bearer-token auth (`APP_SECRET`)

Every privileged endpoint (everything except `GET /api/health`) requires
`Authorization: Bearer <APP_SECRET>`. The WS endpoint reads the token from
`?token=<APP_SECRET>` because browsers cannot set headers on a WebSocket
upgrade.

```bash
# Token-issuing endpoint
curl -X POST https://api.example.com/api/voice/token \
  -H "Authorization: Bearer $APP_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"roomName":"sanctuary","identity":"alice"}'

# Gemini Live WebSocket
wss://api.example.com/api/gemini/live?token=$APP_SECRET
```

The token is compared with a constant-time hash comparison
(`crypto.timingSafeEqual` over SHA-256 digests) to defeat timing attacks.
If `APP_SECRET` is unset on the server, auth is skipped (dev mode) and a
warning is logged at startup. Generate a strong secret for production:

```bash
openssl rand -hex 32
```

### Rate limits

- All `/api/*` routes (except `/api/health`): **60 requests / minute / IP**.
- Token endpoints (`/api/voice/token`, `/api/voice/agora-token`):
  **10 requests / minute / IP** (stricter, on top of the general limit).
- WS `/api/gemini/live`: **5 concurrent connections per IP** — additional
  upgrade attempts are rejected with HTTP `429`.

Rate-limit responses use the standard `RateLimit-*` headers.

### Reverse proxy / DDoS

These limits stop casual abuse but are not a substitute for a real edge.
In production, sit this service behind **Cloudflare** (or a similar
CDN / WAF / reverse proxy) for L3/L4 DDoS protection, TLS termination,
and an IP allow-list / bot challenge before traffic reaches the Node
process. Make sure the proxy sets `X-Forwarded-For` so the per-IP limits
target real client IPs rather than the proxy itself.

### Other notes

- **Never commit `.env`.** The example file is `.env.example` only.
- The in-memory room store (`routes/rooms.ts`) resets on every restart. For
  production, swap it for Redis or Postgres — the interface is one Map and
  three functions; about 30 lines to replace.
- LiveKit tokens are issued with a 1h TTL. If your sessions can run longer,
  bump `ttlSeconds` in `routes/voice.ts` or add a token-refresh flow.
- For real role enforcement (host vs listener), embed the role in the
  LiveKit JWT's `metadata` field — `LiveKitTransport.inferRole()` already
  reads from `participant.metadata` JSON.
