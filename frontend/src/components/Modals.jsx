import { useState } from 'react'
import { AlertTriangle, RefreshCw, Trash2, CheckCircle, X, Copy, Check } from 'lucide-react'

// ── Confirm Modal ─────────────────────────────────────────────────────────
export function ConfirmModal({ isOpen, onClose, onConfirm, title, message, confirmText, variant = 'danger', loading }) {
  if (!isOpen) return null

  const variantStyles = {
    danger:  { icon: <Trash2 size={22} />, iconBg: 'rgba(239,68,68,0.15)', iconColor: '#ef4444' },
    warning: { icon: <AlertTriangle size={22} />, iconBg: 'rgba(245,158,11,0.15)', iconColor: '#f59e0b' }
  }
  const v = variantStyles[variant]

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-icon" style={{ background: v.iconBg, color: v.iconColor }}>
          {v.icon}
        </div>
        <h3 className="modal-title">{title}</h3>
        <p className="modal-body">{message}</p>
        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onClose} disabled={loading}>
            Cancel
          </button>
          <button
            className={`btn ${variant === 'danger' ? 'btn-danger' : 'btn-warning'}`}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? <span className="spinner" style={{ width: 14, height: 14 }} /> : null}
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── New Key Modal ─────────────────────────────────────────────────────────
export function NewKeyModal({ isOpen, onClose, apiKey, title = 'API Key Generated' }) {
  const [copied, setCopied] = useState(false)

  if (!isOpen || !apiKey) return null

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(apiKey)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* fallback */
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-icon" style={{ background: 'rgba(34,197,94,0.12)', color: '#22c55e' }}>
          <CheckCircle size={22} />
        </div>
        <h3 className="modal-title">{title}</h3>
        <p className="modal-body">
          Copy your API key now — it will <strong>never be shown again</strong> for security reasons.
        </p>
        <div className="new-key-box">
          {apiKey}
          <button className="copy-btn" onClick={handleCopy}>
            {copied ? <><Check size={11} /> Copied!</> : <><Copy size={11} /> Copy</>}
          </button>
        </div>
        <div className="alert alert-warning" style={{ marginBottom: 0 }}>
          <AlertTriangle size={16} />
          <span>Store this key securely. It cannot be retrieved once this dialog is closed.</span>
        </div>
        <div className="modal-actions" style={{ marginTop: 20 }}>
          <button className="btn btn-primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Issue Key Modal ───────────────────────────────────────────────────────
export function IssueKeyModal({ isOpen, onClose, onConfirm, loading }) {
  const [rateLimit, setRateLimit] = useState(100)

  if (!isOpen) return null

  const handleSubmit = (e) => {
    e.preventDefault()
    onConfirm(rateLimit)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">Issue New API Key</h3>
        <p className="modal-body">Configure settings for your new API key.</p>
        <form onSubmit={handleSubmit}>
          <div className="input-group">
            <label className="input-label">Rate Limit (requests per minute)</label>
            <input
              type="number"
              className="text-input"
              value={rateLimit}
              min={1}
              max={10000}
              onChange={(e) => setRateLimit(parseInt(e.target.value) || 100)}
              id="rate-limit-input"
            />
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? <span className="spinner" style={{ width: 14, height: 14 }} /> : null}
              Generate Key
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
