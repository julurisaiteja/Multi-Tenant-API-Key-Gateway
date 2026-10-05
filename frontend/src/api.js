import axios from 'axios'

const API_URL = import.meta.env.VITE_API_URL || ''
const DEMO_STORAGE_KEY = 'api-key-gateway-demo-v1'

export const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === 'true' || (
  typeof window !== 'undefined' &&
  (window.location.hostname.endsWith('.workers.dev') || window.location.hostname.endsWith('.pages.dev'))
)

const api = axios.create({
  baseURL: API_URL,
  timeout: 10000,
  headers: { 'Content-Type': 'application/json' }
})

const demoTenants = [
  { id: 1, name: 'Northstar Commerce' },
  { id: 2, name: 'Meridian Health' },
]

function createDemoState() {
  const now = Date.now()
  const timestamp = (hoursAgo) => new Date(now - hoursAgo * 60 * 60 * 1000).toISOString()
  return {
    keys: {
      1: [
        { id: 'demo-key-101', maskedKey: 'sk_demo_••••8EA1', rateLimitPerMinute: 1200, createdAt: timestamp(72), isActive: true },
        { id: 'demo-key-102', maskedKey: 'sk_demo_••••41C2', rateLimitPerMinute: 600, createdAt: timestamp(168), isActive: true },
        { id: 'demo-key-103', maskedKey: 'sk_demo_••••E390', rateLimitPerMinute: 300, createdAt: timestamp(240), isActive: false },
      ],
      2: [
        { id: 'demo-key-201', maskedKey: 'sk_demo_••••7B15', rateLimitPerMinute: 900, createdAt: timestamp(36), isActive: true },
      ],
    },
    logs: {
      1: [
        { id: 'req-1048', masked_key: 'sk_demo_••••8EA1', endpoint: 'POST /v1/orders', status_code: 200, timestamp: timestamp(0.1) },
        { id: 'req-1047', masked_key: 'sk_demo_••••41C2', endpoint: 'GET /v1/inventory', status_code: 200, timestamp: timestamp(0.3) },
        { id: 'req-1046', masked_key: 'sk_demo_••••8EA1', endpoint: 'POST /v1/checkout', status_code: 429, timestamp: timestamp(0.7) },
        { id: 'req-1045', masked_key: 'sk_demo_••••41C2', endpoint: 'GET /v1/customers', status_code: 200, timestamp: timestamp(1.2) },
        { id: 'req-1044', masked_key: 'sk_demo_••••8EA1', endpoint: 'POST /v1/orders', status_code: 401, timestamp: timestamp(2.1) },
        { id: 'req-1043', masked_key: 'sk_demo_••••8EA1', endpoint: 'GET /v1/catalog', status_code: 200, timestamp: timestamp(3.4) },
      ],
      2: [
        { id: 'req-2048', masked_key: 'sk_demo_••••7B15', endpoint: 'GET /v1/patients', status_code: 200, timestamp: timestamp(0.2) },
        { id: 'req-2047', masked_key: 'sk_demo_••••7B15', endpoint: 'POST /v1/appointments', status_code: 200, timestamp: timestamp(0.8) },
      ],
    },
  }
}

function readDemoState() {
  try {
    const saved = window.localStorage.getItem(DEMO_STORAGE_KEY)
    if (saved) return JSON.parse(saved)
  } catch {
    // Fall back to fresh demo data when browser storage is unavailable.
  }
  const initial = createDemoState()
  writeDemoState(initial)
  return initial
}

function writeDemoState(state) {
  try {
    window.localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(state))
  } catch {
    // The preview remains usable for the current page session without storage.
  }
}

function demoResponse(data) {
  return Promise.resolve({ data })
}

function demoKeyValue() {
  return `sk_demo_${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 6)}`
}

function demoLog(state, tenantId, key, endpoint, statusCode) {
  const logs = state.logs[tenantId] || (state.logs[tenantId] = [])
  logs.unshift({
    id: `demo-req-${Date.now()}`,
    masked_key: key,
    endpoint,
    status_code: statusCode,
    timestamp: new Date().toISOString(),
  })
  state.logs[tenantId] = logs.slice(0, 40)
}

const demoTenantsApi = {
  list: () => demoResponse(demoTenants),
  getKeys: (tenantId) => demoResponse(readDemoState().keys[tenantId] || []),
  issueKey: (tenantId, rateLimitPerMinute) => {
    const state = readDemoState()
    const apiKey = demoKeyValue()
    const key = {
      id: `demo-key-${Date.now()}`,
      maskedKey: `${apiKey.slice(0, 11)}••••${apiKey.slice(-4)}`,
      rateLimitPerMinute: Number(rateLimitPerMinute),
      createdAt: new Date().toISOString(),
      isActive: true,
    }
    const keys = state.keys[tenantId] || (state.keys[tenantId] = [])
    keys.unshift(key)
    demoLog(state, tenantId, key.maskedKey, 'POST /keys', 201)
    writeDemoState(state)
    return demoResponse({ ...key, apiKey })
  },
  getAuditLogs: (tenantId, page = 1, limit = 20) => {
    const logs = readDemoState().logs[tenantId] || []
    const start = (page - 1) * limit
    return demoResponse({
      logs: logs.slice(start, start + limit),
      pagination: { page, limit, total: logs.length, totalPages: Math.max(1, Math.ceil(logs.length / limit)) },
    })
  },
  getUsage: () => {
    const now = Date.now()
    const usage = Array.from({ length: 12 }, (_, index) => {
      const hour = new Date(now - (11 - index) * 60 * 60 * 1000)
      return {
        hour: hour.toISOString(),
        success_count: 42 + ((index * 37 + 13) % 126),
        rate_limited_count: index % 4 === 1 ? 2 + (index % 5) : 0,
      }
    })
    return demoResponse(usage)
  },
}

const demoKeysApi = {
  revoke: (keyId) => {
    const state = readDemoState()
    for (const [tenantId, keys] of Object.entries(state.keys)) {
      const key = keys.find((item) => item.id === keyId)
      if (key) {
        key.isActive = false
        demoLog(state, tenantId, key.maskedKey, 'DELETE /keys', 200)
      }
    }
    writeDemoState(state)
    return demoResponse({ success: true })
  },
  rotate: (keyId) => {
    const state = readDemoState()
    let newApiKey = demoKeyValue()
    for (const [tenantId, keys] of Object.entries(state.keys)) {
      const key = keys.find((item) => item.id === keyId)
      if (key) {
        key.isActive = false
        const replacement = {
          id: `demo-key-${Date.now()}`,
          maskedKey: `${newApiKey.slice(0, 11)}••••${newApiKey.slice(-4)}`,
          rateLimitPerMinute: key.rateLimitPerMinute,
          createdAt: new Date().toISOString(),
          isActive: true,
        }
        keys.unshift(replacement)
        demoLog(state, tenantId, replacement.maskedKey, 'POST /keys/rotate', 200)
      }
    }
    writeDemoState(state)
    return demoResponse({ newApiKey })
  },
}

const networkTenantsApi = {
  list: () => api.get('/api/tenants'),
  getKeys: (tenantId) => api.get(`/api/tenants/${tenantId}/keys`),
  issueKey: (tenantId, rateLimitPerMinute) =>
    api.post(`/api/tenants/${tenantId}/keys`, { rateLimitPerMinute }),
  getAuditLogs: (tenantId, page = 1, limit = 20) =>
    api.get(`/api/tenants/${tenantId}/audit-logs?page=${page}&limit=${limit}`),
  getUsage: (tenantId) => api.get(`/api/tenants/${tenantId}/usage`)
}

const networkKeysApi = {
  revoke: (keyId) => api.delete(`/api/keys/${keyId}`),
  rotate: (keyId) => api.post(`/api/keys/${keyId}/rotate`)
}

export const tenantsApi = DEMO_MODE ? demoTenantsApi : networkTenantsApi
export const keysApi = DEMO_MODE ? demoKeysApi : networkKeysApi

export default api
