import { useState, useCallback } from 'react'
import { KeyRound, RotateCcw, Trash2, Plus, ShieldCheck, RefreshCw, Clock, Zap } from 'lucide-react'
import { ConfirmModal, NewKeyModal, IssueKeyModal } from './Modals'
import { tenantsApi, keysApi } from '../api'

function formatDate(dateStr) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  })
}

export default function KeyList({ tenantId, onRefresh, addToast }) {
  const [keys, setKeys] = useState([])
  const [loading, setLoading] = useState(false)
  const [actionLoading, setActionLoading] = useState(null)

  // Modals
  const [issueModal, setIssueModal] = useState(false)
  const [revokeModal, setRevokeModal] = useState(null)
  const [rotateModal, setRotateModal] = useState(null)
  const [newKeyModal, setNewKeyModal] = useState({ open: false, apiKey: null, title: '' })

  const fetchKeys = useCallback(async () => {
    if (!tenantId) return
    setLoading(true)
    try {
      const { data } = await tenantsApi.getKeys(tenantId)
      setKeys(data)
    } catch (err) {
      addToast('Failed to load API keys', 'error')
    } finally {
      setLoading(false)
    }
  }, [tenantId])

  // Load keys when tenantId changes
  useState(() => { fetchKeys() }, [tenantId])

  // Keep this for external refresh trigger
  if (onRefresh) onRefresh.current = fetchKeys

  const handleIssueKey = async (rateLimitPerMinute) => {
    setActionLoading('issue')
    try {
      const { data } = await tenantsApi.issueKey(tenantId, rateLimitPerMinute)
      setIssueModal(false)
      await fetchKeys()
      setNewKeyModal({ open: true, apiKey: data.apiKey, title: 'API Key Generated' })
      addToast('API key created successfully', 'success')
    } catch (err) {
      addToast('Failed to create API key', 'error')
    } finally {
      setActionLoading(null)
    }
  }

  const handleRevoke = async () => {
    if (!revokeModal) return
    setActionLoading('revoke-' + revokeModal.id)
    try {
      await keysApi.revoke(revokeModal.id)
      setRevokeModal(null)
      await fetchKeys()
      addToast('API key revoked', 'success')
    } catch (err) {
      addToast('Failed to revoke key', 'error')
    } finally {
      setActionLoading(null)
    }
  }

  const handleRotate = async () => {
    if (!rotateModal) return
    setActionLoading('rotate-' + rotateModal.id)
    try {
      const { data } = await keysApi.rotate(rotateModal.id)
      setRotateModal(null)
      await fetchKeys()
      setNewKeyModal({ open: true, apiKey: data.newApiKey, title: 'Key Rotated — New API Key' })
      addToast('Key rotated. Old key valid for 1 minute.', 'info')
    } catch (err) {
      addToast('Failed to rotate key', 'error')
    } finally {
      setActionLoading(null)
    }
  }

  const activeCount = keys.filter(k => k.isActive).length

  return (
    <div className="card">
      <div className="card-header">
        <div>
          <div className="card-title">
            <KeyRound size={17} />
            API Keys
          </div>
          <div className="card-subtitle">{activeCount} active key{activeCount !== 1 ? 's' : ''}</div>
        </div>
        <button
          className="btn btn-primary btn-sm"
          onClick={() => setIssueModal(true)}
          id="issue-key-btn"
        >
          <Plus size={15} /> Issue New Key
        </button>
      </div>

      {loading ? (
        <div className="loading-state">
          <span className="spinner" />
          Loading keys...
        </div>
      ) : keys.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">🔑</div>
          <p>No API keys yet. Issue your first key to get started.</p>
        </div>
      ) : (
        <div className="key-list">
          {keys.map((key) => (
            <div className="key-item" key={key.id} id={`key-item-${key.id}`}>
              <div className={`key-indicator ${key.isActive ? 'active' : 'inactive'}`} />
              <div className="key-info">
                <div className="key-value">{key.maskedKey}</div>
                <div className="key-meta">
                  <span className="key-meta-item">
                    <Zap size={11} />
                    {key.rateLimitPerMinute} req/min
                  </span>
                  <span className="key-meta-item">
                    <Clock size={11} />
                    {formatDate(key.createdAt)}
                  </span>
                  {key.expiresAt && (
                    <span className="key-meta-item" style={{ color: 'var(--warning)' }}>
                      <Clock size={11} />
                      Expires {formatDate(key.expiresAt)}
                    </span>
                  )}
                  <span className={`badge ${key.isActive ? 'badge-success' : 'badge-danger'}`}>
                    {key.isActive ? 'Active' : 'Revoked'}
                  </span>
                </div>
              </div>
              {key.isActive && (
                <div className="key-actions">
                  <button
                    className="btn btn-warning btn-sm"
                    onClick={() => setRotateModal({ id: key.id, maskedKey: key.maskedKey })}
                    id={`rotate-key-${key.id}`}
                    title="Rotate key"
                    disabled={actionLoading === `rotate-${key.id}`}
                  >
                    <RotateCcw size={14} />
                    Rotate
                  </button>
                  <button
                    className="btn btn-danger btn-sm"
                    onClick={() => setRevokeModal({ id: key.id, maskedKey: key.maskedKey })}
                    id={`revoke-key-${key.id}`}
                    title="Revoke key"
                    disabled={actionLoading === `revoke-${key.id}`}
                  >
                    <Trash2 size={14} />
                    Revoke
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Modals */}
      <IssueKeyModal
        isOpen={issueModal}
        onClose={() => setIssueModal(false)}
        onConfirm={handleIssueKey}
        loading={actionLoading === 'issue'}
      />

      <ConfirmModal
        isOpen={!!revokeModal}
        onClose={() => setRevokeModal(null)}
        onConfirm={handleRevoke}
        title="Revoke API Key"
        message={`Are you sure you want to immediately revoke ${revokeModal?.maskedKey}? This action cannot be undone and will instantly invalidate the key.`}
        confirmText="Revoke Key"
        variant="danger"
        loading={actionLoading === `revoke-${revokeModal?.id}`}
      />

      <ConfirmModal
        isOpen={!!rotateModal}
        onClose={() => setRotateModal(null)}
        onConfirm={handleRotate}
        title="Rotate API Key"
        message={`This will generate a new key for ${rotateModal?.maskedKey}. The old key will remain valid for 1 minute to allow for a graceful transition.`}
        confirmText="Rotate Key"
        variant="warning"
        loading={actionLoading === `rotate-${rotateModal?.id}`}
      />

      <NewKeyModal
        isOpen={newKeyModal.open}
        onClose={() => setNewKeyModal({ open: false, apiKey: null, title: '' })}
        apiKey={newKeyModal.apiKey}
        title={newKeyModal.title}
      />
    </div>
  )
}
