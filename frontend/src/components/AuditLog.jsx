import { useState, useEffect, useCallback } from 'react'
import { Activity, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react'
import { tenantsApi } from '../api'

function formatDate(dateStr) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleString('en-US', {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  })
}

function StatusBadge({ code }) {
  if (code === 200) return <span className="badge badge-success">200 OK</span>
  if (code === 429) return <span className="badge badge-warning">429 Too Many</span>
  if (code === 401) return <span className="badge badge-danger">401 Unauth</span>
  return <span className="badge badge-info">{code}</span>
}

export default function AuditLog({ tenantId, addToast }) {
  const [logs, setLogs] = useState([])
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 1 })
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const fetchLogs = useCallback(async (page = 1) => {
    if (!tenantId) return
    setLoading(true)
    try {
      const { data } = await tenantsApi.getAuditLogs(tenantId, page, 20)
      setLogs(data.logs)
      setPagination(data.pagination)
    } catch {
      addToast('Failed to load audit logs', 'error')
    } finally {
      setLoading(false)
    }
  }, [tenantId])

  useEffect(() => { fetchLogs(1) }, [fetchLogs])

  const handleRefresh = async () => {
    setRefreshing(true)
    await fetchLogs(pagination.page)
    setRefreshing(false)
  }

  return (
    <div className="card">
      <div className="card-header">
        <div>
          <div className="card-title">
            <Activity size={17} />
            Audit Log
          </div>
          <div className="card-subtitle">
            {pagination.total} total request{pagination.total !== 1 ? 's' : ''} logged
          </div>
        </div>
        <button
          className="btn btn-secondary btn-sm"
          onClick={handleRefresh}
          disabled={refreshing}
          id="refresh-audit-btn"
        >
          <RefreshCw size={14} className={refreshing ? 'spin' : ''} />
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="loading-state">
          <span className="spinner" />
          Loading logs...
        </div>
      ) : logs.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📋</div>
          <p>No audit logs yet. Make a request to the protected endpoint.</p>
        </div>
      ) : (
        <>
          <div className="table-wrapper">
            <table id="audit-logs-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>API Key</th>
                  <th>Endpoint</th>
                  <th>Status</th>
                  <th>Timestamp</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id}>
                    <td className="mono" style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                      {log.id}
                    </td>
                    <td className="mono">{log.masked_key}</td>
                    <td className="mono" style={{ color: 'var(--info)' }}>{log.endpoint}</td>
                    <td><StatusBadge code={log.status_code} /></td>
                    <td style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                      {formatDate(log.timestamp)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="pagination">
            <span>
              Page {pagination.page} of {pagination.totalPages} — {pagination.total} records
            </span>
            <div className="pagination-controls">
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => fetchLogs(pagination.page - 1)}
                disabled={pagination.page <= 1}
                id="prev-page-btn"
              >
                <ChevronLeft size={15} />
              </button>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => fetchLogs(pagination.page + 1)}
                disabled={pagination.page >= pagination.totalPages}
                id="next-page-btn"
              >
                <ChevronRight size={15} />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
