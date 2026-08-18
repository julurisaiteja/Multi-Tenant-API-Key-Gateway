import { useState, useEffect, useCallback } from 'react'
import { BarChart3 } from 'lucide-react'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js'
import { Bar } from 'react-chartjs-2'
import { tenantsApi } from '../api'

ChartJS.register(
  CategoryScale, LinearScale, BarElement, LineElement,
  PointElement, Title, Tooltip, Legend, Filler
)

function formatHour(dateStr) {
  return new Date(dateStr).toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit', hour12: false
  })
}

export default function UsageChart({ tenantId }) {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(false)

  const fetchUsage = useCallback(async () => {
    if (!tenantId) return
    setLoading(true)
    try {
      const { data: usageData } = await tenantsApi.getUsage(tenantId)
      setData(usageData)
    } catch {
      // silent fail
    } finally {
      setLoading(false)
    }
  }, [tenantId])

  useEffect(() => { fetchUsage() }, [fetchUsage])

  const labels = data.map((d) => formatHour(d.hour))
  const successData = data.map((d) => parseInt(d.success_count) || 0)
  const rateLimitedData = data.map((d) => parseInt(d.rate_limited_count) || 0)

  const chartData = {
    labels,
    datasets: [
      {
        label: 'Successful (200)',
        data: successData,
        backgroundColor: 'rgba(99, 102, 241, 0.7)',
        borderColor: '#6366f1',
        borderWidth: 1,
        borderRadius: 4,
        borderSkipped: false
      },
      {
        label: 'Rate Limited (429)',
        data: rateLimitedData,
        backgroundColor: 'rgba(245, 158, 11, 0.7)',
        borderColor: '#f59e0b',
        borderWidth: 1,
        borderRadius: 4,
        borderSkipped: false
      }
    ]
  }

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top',
        labels: {
          color: '#94a3b8',
          font: { family: 'Inter', size: 12 },
          boxWidth: 12,
          padding: 16
        }
      },
      tooltip: {
        backgroundColor: '#161b27',
        borderColor: '#2a3244',
        borderWidth: 1,
        titleColor: '#f1f5f9',
        bodyColor: '#94a3b8',
        padding: 12,
        cornerRadius: 8
      }
    },
    scales: {
      x: {
        stacked: false,
        grid: { color: 'rgba(42, 50, 68, 0.5)', drawBorder: false },
        ticks: { color: '#64748b', font: { family: 'Inter', size: 11 } }
      },
      y: {
        stacked: false,
        grid: { color: 'rgba(42, 50, 68, 0.5)', drawBorder: false },
        ticks: {
          color: '#64748b',
          font: { family: 'Inter', size: 11 },
          stepSize: 1
        },
        beginAtZero: true
      }
    }
  }

  return (
    <div className="card">
      <div className="card-header">
        <div>
          <div className="card-title">
            <BarChart3 size={17} />
            Request Volume (Last 24h)
          </div>
          <div className="card-subtitle">Hourly breakdown of API requests</div>
        </div>
      </div>

      {loading ? (
        <div className="loading-state">
          <span className="spinner" />
          Loading chart...
        </div>
      ) : data.length === 0 ? (
        <div className="empty-state" style={{ height: 180, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <div className="empty-state-icon">📊</div>
          <p>No usage data yet. Make some API requests to see the chart.</p>
        </div>
      ) : (
        <div className="chart-container">
          <Bar data={chartData} options={options} />
        </div>
      )}
    </div>
  )
}
