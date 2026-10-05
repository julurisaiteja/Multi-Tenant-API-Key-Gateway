import { useState, useEffect, useRef, useCallback } from 'react'
import {
  LayoutDashboard, KeyRound, Activity, BarChart3,
  Building2, CheckCircle2, XCircle, Zap
} from 'lucide-react'
import KeyList from './components/KeyList'
import AuditLog from './components/AuditLog'
import UsageChart from './components/UsageChart'
import { tenantsApi, DEMO_MODE } from './api'

// ── Toast System ──────────────────────────────────────────────────────────
function ToastContainer({ toasts }) {
  return (
    <div className="toast-container">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.type}`}>
          {t.type === 'success' && <CheckCircle2 size={16} color="var(--success)" />}
          {t.type === 'error' && <XCircle size={16} color="var(--danger)" />}
          {t.type === 'info' && <Zap size={16} color="var(--accent)" />}
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  )
}

// ── Dashboard Stats ───────────────────────────────────────────────────────
function DashboardStats({ tenantId }) {
  const [stats, setStats] = useState({ total: 0, active: 0, requests: 0, rateLimited: 0 })

  useEffect(() => {
    if (!tenantId) return
    Promise.all([
      tenantsApi.getKeys(tenantId),
      tenantsApi.getAuditLogs(tenantId, 1, 1)
    ]).then(([keysResp, logsResp]) => {
      const keys = keysResp.data
      setStats({
        total: keys.length,
        active: keys.filter(k => k.isActive).length,
        requests: logsResp.data.pagination.total,
        rateLimited: 0
      })
    }).catch(() => {})
  }, [tenantId])

  return (
    <div className="stats-grid">
      <div className="stat-card">
        <div className="stat-label">Total Keys</div>
        <div className="stat-value">{stats.total}</div>
        <div className="stat-change">{stats.active} active</div>
      </div>
      <div className="stat-card">
        <div className="stat-label">Active Keys</div>
        <div className="stat-value" style={{ color: 'var(--success)' }}>{stats.active}</div>
        <div className="stat-change positive">Running</div>
      </div>
      <div className="stat-card">
        <div className="stat-label">Total Requests</div>
        <div className="stat-value" style={{ color: 'var(--accent)' }}>{stats.requests}</div>
        <div className="stat-change">All time</div>
      </div>
      <div className="stat-card">
        <div className="stat-label">{DEMO_MODE ? 'Environment' : 'Security Status'}</div>
        <div className="stat-value" style={{ color: 'var(--success)', fontSize: '1.2rem', marginTop: 10 }}>
          {DEMO_MODE ? 'Demo Preview' : '🔒 Secured'}
        </div>
        <div className="stat-change positive">{DEMO_MODE ? 'Sample keys only' : 'SHA-256 Hashed'}</div>
      </div>
    </div>
  )
}

// ── App ───────────────────────────────────────────────────────────────────
export default function App() {
  const [tenants, setTenants] = useState([])
  const [selectedTenant, setSelectedTenant] = useState(null)
  const [activeTab, setActiveTab] = useState('dashboard')
  const [toasts, setToasts] = useState([])
  const refreshRef = useRef(null)

  const addToast = useCallback((message, type = 'info') => {
    const id = Date.now()
    setToasts((prev) => [...prev, { id, message, type }])
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000)
  }, [])

  useEffect(() => {
    tenantsApi.list()
      .then(({ data }) => {
        setTenants(data)
        if (data.length > 0) setSelectedTenant(data[0].id)
      })
      .catch(() => addToast('Could not connect to API', 'error'))
  }, [])

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={17} /> },
    { id: 'keys', label: 'API Keys', icon: <KeyRound size={17} /> },
    { id: 'chart', label: 'Usage Analytics', icon: <BarChart3 size={17} /> },
    { id: 'audit', label: 'Audit Log', icon: <Activity size={17} /> }
  ]

  return (
    <div className="app-layout">
      {/* ── Sidebar ─────────────────────────────────────────────── */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <h1>🛡️ API Gateway</h1>
          <p>Multi-Tenant Console</p>
        </div>

        <div className="sidebar-section">
          <div className="sidebar-label">Navigation</div>
          {navItems.map((item) => (
            <button
              key={item.id}
              className={`sidebar-nav-item ${activeTab === item.id ? 'active' : ''}`}
              onClick={() => setActiveTab(item.id)}
              id={`nav-${item.id}`}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>

        <div className="tenant-selector">
          <label>Active Tenant</label>
          <select
            className="select-input"
            value={selectedTenant || ''}
            onChange={(e) => setSelectedTenant(parseInt(e.target.value))}
            id="tenant-selector"
          >
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
      </aside>

      {/* ── Main Content ─────────────────────────────────────────── */}
      <main className="main-content">
        {DEMO_MODE && (
          <div className="demo-banner" role="status">
            <strong>Demo data</strong>
            <span>Keys, usage, and audit activity are simulated in this browser and are not production credentials.</span>
          </div>
        )}
        {activeTab === 'dashboard' && (
          <>
            <div className="page-header">
              <h2 className="page-title">Dashboard</h2>
              <p className="page-subtitle">
                Overview of your API key gateway — tenant {tenants.find(t => t.id === selectedTenant)?.name || '…'}
              </p>
            </div>
            <div className="page-content">
              <DashboardStats tenantId={selectedTenant} />
              <div className="grid-2" style={{ marginBottom: 20 }}>
                <UsageChart tenantId={selectedTenant} />
                <KeyList tenantId={selectedTenant} onRefresh={refreshRef} addToast={addToast} />
              </div>
            </div>
          </>
        )}

        {activeTab === 'keys' && (
          <>
            <div className="page-header">
              <h2 className="page-title">API Keys</h2>
              <p className="page-subtitle">Manage, rotate, and revoke API keys for this tenant.</p>
            </div>
            <div className="page-content">
              <KeyList tenantId={selectedTenant} onRefresh={refreshRef} addToast={addToast} />
            </div>
          </>
        )}

        {activeTab === 'chart' && (
          <>
            <div className="page-header">
              <h2 className="page-title">Usage Analytics</h2>
              <p className="page-subtitle">Hourly request volume and rate limiting statistics.</p>
            </div>
            <div className="page-content">
              <UsageChart tenantId={selectedTenant} />
            </div>
          </>
        )}

        {activeTab === 'audit' && (
          <>
            <div className="page-header">
              <h2 className="page-title">Audit Log</h2>
              <p className="page-subtitle">Complete record of all authenticated API requests.</p>
            </div>
            <div className="page-content">
              <AuditLog tenantId={selectedTenant} addToast={addToast} />
            </div>
          </>
        )}
      </main>

      <ToastContainer toasts={toasts} />
    </div>
  )
}
