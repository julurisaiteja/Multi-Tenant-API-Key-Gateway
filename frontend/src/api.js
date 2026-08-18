import axios from 'axios'

const API_URL = import.meta.env.VITE_API_URL || ''

const api = axios.create({
  baseURL: API_URL,
  timeout: 10000,
  headers: { 'Content-Type': 'application/json' }
})

export const tenantsApi = {
  list: () => api.get('/api/tenants'),
  getKeys: (tenantId) => api.get(`/api/tenants/${tenantId}/keys`),
  issueKey: (tenantId, rateLimitPerMinute) =>
    api.post(`/api/tenants/${tenantId}/keys`, { rateLimitPerMinute }),
  getAuditLogs: (tenantId, page = 1, limit = 20) =>
    api.get(`/api/tenants/${tenantId}/audit-logs?page=${page}&limit=${limit}`),
  getUsage: (tenantId) => api.get(`/api/tenants/${tenantId}/usage`)
}

export const keysApi = {
  revoke: (keyId) => api.delete(`/api/keys/${keyId}`),
  rotate: (keyId) => api.post(`/api/keys/${keyId}/rotate`)
}

export default api
