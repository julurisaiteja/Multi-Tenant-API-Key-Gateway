# 🛡️ Multi-Tenant API Key Gateway

A production-ready, secure API key management service with sliding-window rate limiting and key rotation — built with **Node.js + Express**, **PostgreSQL**, **Redis**, and a **React** dashboard.

## ✨ Features

| Feature | Implementation |
|---------|---------------|
| **API Key Issuance** | Cryptographically secure (32 bytes), Base64 URL-safe encoded (RFC 4648 §5), prefixed with `sk_live_` |
| **Secure Storage** | SHA-256 hashed — plaintext never stored |
| **Authentication** | Bearer token middleware with hash comparison |
| **Rate Limiting** | Sliding-window algorithm using Redis Sorted Sets (no library — from first principles) |
| **Key Rotation** | Atomic rotation with 1-minute grace period via `expires_at` timestamp |
| **Key Revocation** | Immediate deactivation with Redis cleanup |
| **Audit Logging** | Every authenticated request logged (200s and 429s) |
| **Admin Console** | React dashboard with Chart.js usage visualization |
| **Containerization** | Full Docker Compose with health checks |

---

## 🏗️ Architecture

```
┌──────────────┐    ┌─────────────────────────────────────────┐
│    Client    │───▶│              API Gateway                 │
│  (Browser /  │    │  ┌────────────┐  ┌──────────────────┐   │
│   cURL)      │    │  │   Auth     │  │  Sliding-Window  │   │
└──────────────┘    │  │ Middleware │─▶│  Rate Limiter    │   │
                    │  └────────────┘  └──────────────────┘   │
                    │        │                  │              │
                    └────────┼──────────────────┼─────────────┘
                             │                  │
                    ┌────────▼────────┐  ┌──────▼──────┐
                    │   PostgreSQL    │  │    Redis     │
                    │  tenants        │  │ rate_limit   │
                    │  api_keys       │  │ sorted sets  │
                    │  audit_logs     │  └─────────────┘
                    └────────────────┘
```

---

## 🚀 Quick Start

### Prerequisites
- [Docker](https://docker.com) & [Docker Compose](https://docs.docker.com/compose/)

### 1. Clone the repository
```bash
git clone https://github.com/lohithadamisetti123/Multi-Tenant-API-Key-Gateway.git
cd Multi-Tenant-API-Key-Gateway
```

### 2. Configure environment (optional — defaults work out of the box)
```bash
cp .env.example .env
```

### 3. Start all services
```bash
docker-compose up --build
```

All three services (`db`, `redis`, `api`) will start with health checks. The API server waits for both DB and Redis to be healthy before accepting connections.

### 4. Access the console
- **Admin UI**: http://localhost:5173
- **API**: http://localhost:3000
- **Health**: http://localhost:3000/health

---

## 📡 API Reference

### Tenant Management

#### List all tenants
```http
GET /api/tenants
```

### Key Issuance & Listing

#### Issue a new API key
```http
POST /api/tenants/:tenantId/keys
Content-Type: application/json

{
  "rateLimitPerMinute": 100
}
```
**Response (201):**
```json
{
  "apiKey": "sk_live_abc123...",
  "keyRecord": { "id": 1, "lastFour": "a1b2", "rateLimitPerMinute": 100 }
}
```
> ⚠️ The `apiKey` value is shown **once only** — store it securely.

#### List keys (masked)
```http
GET /api/tenants/:tenantId/keys
```

### Key Actions

#### Revoke a key (immediate)
```http
DELETE /api/keys/:keyId
```
**Response: 204 No Content**

#### Rotate a key (1-minute grace period)
```http
POST /api/keys/:keyId/rotate
```
**Response (200):**
```json
{
  "newApiKey": "sk_live_xyz...",
  "oldKeyExpiresAt": "2026-08-18T10:01:00.000Z"
}
```

### Protected Endpoint

```http
GET /api/protected
Authorization: Bearer sk_live_...
```
- ✅ **200 OK** — valid key, within rate limit
- ❌ **401 Unauthorized** — invalid or missing key
- ⚠️ **429 Too Many Requests** — rate limit exceeded (includes `Retry-After` header)

### Audit & Analytics

```http
GET /api/tenants/:tenantId/audit-logs?page=1&limit=20
GET /api/tenants/:tenantId/usage
```

---

## 🔐 Security Design

### API Key Generation
```
crypto.randomBytes(32)           → 256 bits of entropy
  → Base64 URL-safe (RFC 4648)   → removes +, /, = characters
  → prepend "sk_live_"           → prefix for identification
  → SHA-256 hash                 → stored in DB (not the key itself)
```

### Rate Limiter Algorithm — Sliding Window with Redis Sorted Sets

```
For each authenticated request:

  MULTI
    ZREMRANGEBYSCORE rate_limit:{keyId} 0 {now - 60000}  ← evict stale
    ZADD rate_limit:{keyId} {now} {unique_member}         ← record request
    ZCARD rate_limit:{keyId}                              ← count in window
    PEXPIRE rate_limit:{keyId} 120000                     ← auto-cleanup
  EXEC

  if ZCARD > rate_limit_per_minute:
    → 429 Too Many Requests
    → Retry-After: (oldest_timestamp + 60s - now) / 1000
```

### Key Rotation Grace Period
The `expires_at` column enables zero-downtime key rotation:
```sql
-- Auth query handles all cases atomically:
WHERE key_hash = $1
  AND is_active = TRUE
  AND (expires_at IS NULL OR expires_at > NOW())
```

---

## 🗄️ Database Schema

```sql
tenants       (id, name, created_at)
api_keys      (id, tenant_id→, key_hash UNIQUE, key_prefix, last_four,
               rate_limit_per_minute, is_active, expires_at, created_at)
audit_logs    (id, api_key_id→, endpoint, status_code, timestamp)
```

**Seed data** (auto-created on startup):
- `Demo Tenant` (id: 1)
- `Acme Corporation` (id: 2)
- `TechStartup Inc` (id: 3)

---

## 🧪 Testing the Requirements

### Requirement 6 — Rate Limiting (limit=5)
```bash
# Issue a key with limit of 5
KEY=$(curl -s -X POST http://localhost:3000/api/tenants/1/keys \
  -H "Content-Type: application/json" \
  -d '{"rateLimitPerMinute": 5}' | jq -r '.apiKey')

# Fire 6 requests — 5th should be 200, 6th should be 429
for i in {1..6}; do
  echo "Request $i: $(curl -s -o /dev/null -w "%{http_code}" \
    -H "Authorization: Bearer $KEY" http://localhost:3000/api/protected)"
done
```

### Requirement 8 — Key Rotation with Grace Period
```bash
KEY_ID=1  # from issuance response
NEW_KEY=$(curl -s -X POST http://localhost:3000/api/keys/$KEY_ID/rotate | jq -r '.newApiKey')

# Both old and new key should return 200 immediately
curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $OLD_KEY" http://localhost:3000/api/protected
curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $NEW_KEY" http://localhost:3000/api/protected

# After 65 seconds, old key should return 401
sleep 65
curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $OLD_KEY" http://localhost:3000/api/protected
# → 401
```

---

## 📁 Project Structure

```
Multi-Tenant-API-Key-Gateway/
├── docker-compose.yml           # Orchestrates api, db, redis
├── init.sql                     # DB schema + seed data
├── .env.example                 # Environment variable template
├── backend/
│   ├── Dockerfile
│   ├── package.json
│   └── src/
│       ├── index.js             # Express app entrypoint
│       ├── db.js                # PostgreSQL pool
│       ├── redis.js             # Redis client (ioredis)
│       ├── middleware/
│       │   ├── auth.js          # Bearer token + SHA-256 validation
│       │   ├── rateLimiter.js   # Sliding-window (Redis sorted sets)
│       │   └── auditLogger.js   # Request logging to audit_logs
│       ├── routes/
│       │   ├── tenants.js       # Key issuance, listing, analytics
│       │   ├── keys.js          # Revoke + rotate
│       │   └── protected.js     # Protected test endpoint
│       └── utils/
│           └── keyGen.js        # Crypto key generation + SHA-256
└── frontend/
    ├── Dockerfile               # Multi-stage: Vite build + nginx
    ├── vite.config.js
    ├── index.html
    └── src/
        ├── App.jsx              # Layout, navigation, tenant selector
        ├── api.js               # Axios API client
        ├── index.css            # Design system (dark mode)
        └── components/
            ├── KeyList.jsx      # Key management with actions
            ├── AuditLog.jsx     # Paginated request log table
            ├── UsageChart.jsx   # Chart.js bar chart
            └── Modals.jsx       # Confirm, issue, new key modals
```

---

## 🛠️ Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `POSTGRES_USER` | `gateway_user` | PostgreSQL username |
| `POSTGRES_PASSWORD` | `gateway_pass` | PostgreSQL password |
| `POSTGRES_DB` | `gateway_db` | PostgreSQL database name |
| `REDIS_PASSWORD` | `redis_pass` | Redis auth password |
| `PORT` | `3000` | API server port |
| `CORS_ORIGIN` | `http://localhost:5173` | Allowed CORS origin |
| `VITE_API_URL` | `http://localhost:3000` | Frontend API URL |

---

## 🏆 Core Requirements Coverage

| # | Requirement | Status |
|---|-------------|--------|
| 1 | Docker Compose with health checks | ✅ |
| 2 | PostgreSQL schema (tenants, api_keys, audit_logs) | ✅ |
| 3 | POST /api/tenants/:id/keys — SHA-256 hashed storage | ✅ |
| 4 | GET /api/tenants/:id/keys — masked key display | ✅ |
| 5 | GET /api/protected — 200 valid / 401 invalid | ✅ |
| 6 | Sliding-window rate limiting with 429 + Retry-After | ✅ |
| 7 | DELETE /api/keys/:id — immediate revocation | ✅ |
| 8 | POST /api/keys/:id/rotate — 1-minute grace period | ✅ |
| 9 | Audit log for every authenticated request | ✅ |

---

## 📚 Resources

- [Redis Sorted Sets Documentation](https://redis.io/docs/data-types/sorted-sets/)
- [RFC 4648 §5 — Base64 URL-safe Encoding](https://datatracker.ietf.org/doc/html/rfc4648#section-5)
- [Sliding Window Rate Limiting](https://redis.io/commands/zadd/)

---

*Built as part of the Partnr Backend Development challenge.*
