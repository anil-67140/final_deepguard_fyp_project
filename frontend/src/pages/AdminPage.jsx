import { useState, useEffect } from 'react'
import { adminAPI } from '../utils/api'
import toast from 'react-hot-toast'
import {
  Users, Database, Activity, Shield, Loader2, Trash2, Save,
  Sliders, ScrollText, LayoutGrid, UserPlus
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

const TABS = [
  { id: 'overview', label: 'Overview',   icon: LayoutGrid },
  { id: 'users',    label: 'Users',      icon: Users },
  { id: 'models',   label: 'AI Models',  icon: Sliders },
  { id: 'logs',     label: 'System Logs', icon: ScrollText },
]

export default function AdminPage() {
  const [tab, setTab] = useState('overview')

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">Admin Panel</h1>
        <p className="text-slate-400 text-sm mt-1">System overview and management</p>
      </div>

      <div className="flex items-center gap-1 border-b border-slate-800">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors
              ${tab === id ? 'border-sky-400 text-sky-400' : 'border-transparent text-slate-400 hover:text-slate-200'}`}>
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {tab === 'overview' && <OverviewTab />}
      {tab === 'users'    && <UsersTab />}
      {tab === 'models'   && <ModelsTab />}
      {tab === 'logs'     && <LogsTab />}
    </div>
  )
}

// ─────────────────────────────────────────────
// Overview
// ─────────────────────────────────────────────
function OverviewTab() {
  const [stats, setStats] = useState(null)
  const [jobs, setJobs]   = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([adminAPI.getStats(), adminAPI.getAllJobs()])
      .then(([s, j]) => { setStats(s.data); setJobs(j.data || []) })
      .catch(() => { setStats(MOCK_STATS); setJobs(MOCK_JOBS) })
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="flex items-center justify-center h-40"><Loader2 className="w-7 h-7 text-sky-400 animate-spin" /></div>

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {[
          { icon: Database, label: 'Total Jobs',         value: stats?.totalJobs || 0,                         color: 'sky' },
          { icon: Activity, label: 'Total Transactions', value: (stats?.totalTransactions || 0).toLocaleString(), color: 'green' },
          { icon: Shield,   label: 'Total Fraud Found',  value: (stats?.totalFraud || 0).toLocaleString(),        color: 'red' },
        ].map(({ icon: Icon, label, value, color }) => (
          <div key={label} className="card flex items-center gap-4">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center
              ${color === 'sky' ? 'bg-sky-500/10 text-sky-400' : color === 'green' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
              <Icon className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-slate-400">{label}</p>
              <p className="text-xl font-bold text-white">{value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="card">
        <h3 className="text-sm font-semibold text-white mb-4">All Jobs</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-700">
                {['Job ID', 'File', 'User', 'Total', 'Flagged', 'Status', 'Created'].map(h => (
                  <th key={h} className="text-left px-3 py-2 text-slate-400 font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {jobs.map(job => (
                <tr key={job.jobId} className="border-b border-slate-800/50 hover:bg-slate-800/40">
                  <td className="px-3 py-2 font-mono text-slate-300">{job.jobId?.slice(0, 8)}…</td>
                  <td className="px-3 py-2 text-slate-200 max-w-36 truncate">{job.originalName}</td>
                  <td className="px-3 py-2 font-mono text-slate-400">{job.userId?.slice(0, 8)}…</td>
                  <td className="px-3 py-2 text-slate-200">{(job.totalTransactions || 0).toLocaleString()}</td>
                  <td className="px-3 py-2 text-red-400 font-semibold">{(job.flaggedCount || 0).toLocaleString()}</td>
                  <td className="px-3 py-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                      job.status === 'completed' ? 'bg-green-500/10 text-green-400' :
                      job.status === 'failed' ? 'bg-red-500/10 text-red-400' : 'bg-amber-500/10 text-amber-400'}`}>
                      {job.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-slate-400">{formatDistanceToNow(new Date(job.createdAt), { addSuffix: true })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// FR-13: Manage Users
// ─────────────────────────────────────────────
function UsersTab() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState(null)
  const [error, setError] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ email: '', password: '', role: 'auditor' })

  const load = () => {
    setLoading(true)
    adminAPI.getUsers()
      .then(r => { setUsers(r.data || []); setError(null) })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  const handleCreate = async (e) => {
    e.preventDefault()
    if (!form.email || !form.password) {
      toast.error('Email and password are required')
      return
    }
    if (form.password.length < 6) {
      toast.error('Password must be at least 6 characters')
      return
    }
    setCreating(true)
    try {
      await adminAPI.createUser(form)
      toast.success(`User ${form.email} created`)
      setForm({ email: '', password: '', role: 'auditor' })
      setShowForm(false)
      load()
    } catch (err) {
      toast.error('Failed to create user: ' + (err.response?.data?.error || err.message))
    } finally {
      setCreating(false)
    }
  }

  const handleRoleChange = async (userId, role) => {
    setSavingId(userId)
    try {
      await adminAPI.updateUserRole(userId, role)
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, role } : u))
      toast.success('Role updated')
    } catch (err) {
      toast.error('Failed to update role: ' + err.message)
    } finally {
      setSavingId(null)
    }
  }

  const handleDelete = async (userId, email) => {
    if (!window.confirm(`Remove user ${email}? This cannot be undone.`)) return
    try {
      await adminAPI.deleteUser(userId)
      setUsers(prev => prev.filter(u => u.id !== userId))
      toast.success('User removed')
    } catch (err) {
      toast.error('Failed to remove user: ' + err.message)
    }
  }

  if (loading) return <div className="flex items-center justify-center h-40"><Loader2 className="w-7 h-7 text-sky-400 animate-spin" /></div>

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white">User Accounts</h3>
          <div className="flex items-center gap-3">
            <p className="text-xs text-slate-500">{users.length} user{users.length !== 1 ? 's' : ''}</p>
            <button onClick={() => setShowForm(s => !s)}
              className="btn-primary text-xs flex items-center gap-1.5">
              <UserPlus className="w-3.5 h-3.5" />
              Add User
            </button>
          </div>
        </div>

        {showForm && (
          <form onSubmit={handleCreate} className="mt-4 p-4 bg-slate-800/50 rounded-lg flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Email</label>
              <input type="email" required value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                placeholder="user@example.com" className="input text-xs h-8 w-56" />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Password</label>
              <input type="text" required value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                placeholder="min. 6 characters" className="input text-xs h-8 w-40" />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Role</label>
              <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                className="bg-slate-700 border border-slate-600 rounded-lg text-xs px-2 py-1.5 h-8 text-white">
                <option value="admin">admin</option>
                <option value="auditor">auditor</option>
                <option value="analyst">analyst</option>
              </select>
            </div>
            <button type="submit" disabled={creating}
              className="btn-primary text-xs flex items-center gap-1.5 h-8">
              {creating ? <Loader2 className="w-3 h-3 animate-spin" /> : <UserPlus className="w-3 h-3" />}
              Create
            </button>
            <button type="button" onClick={() => setShowForm(false)}
              className="btn-secondary text-xs h-8">Cancel</button>
          </form>
        )}
      </div>

      <div className="card">
        {error && (
          <div className="bg-amber-950/30 border border-amber-800/40 rounded-lg p-3 mb-4">
            <p className="text-xs text-amber-300">
              Could not reach Supabase admin API: {error}. Make sure <code className="font-mono">SUPABASE_SERVICE_KEY</code> in
              the backend's <code className="font-mono">.env</code> is the <strong>service_role</strong> key, not the anon key.
            </p>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-700">
                {['Email', 'Role', 'Confirmed', 'Last Sign-in', 'Created', ''].map(h => (
                  <th key={h} className="text-left px-3 py-2 text-slate-400 font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} className="border-b border-slate-800/50 hover:bg-slate-800/40">
                  <td className="px-3 py-2 text-slate-200">{u.email}</td>
                  <td className="px-3 py-2">
                    <select
                      value={u.role}
                      disabled={savingId === u.id}
                      onChange={(e) => handleRoleChange(u.id, e.target.value)}
                      className="bg-slate-700 border border-slate-600 rounded-lg text-xs px-2 py-1 text-white"
                    >
                      <option value="admin">admin</option>
                      <option value="auditor">auditor</option>
                      <option value="analyst">analyst</option>
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    {u.confirmed
                      ? <span className="text-green-400">✓ Confirmed</span>
                      : <span className="text-slate-500">Pending</span>}
                  </td>
                  <td className="px-3 py-2 text-slate-400">
                    {u.lastSignInAt ? formatDistanceToNow(new Date(u.lastSignInAt), { addSuffix: true }) : '—'}
                  </td>
                  <td className="px-3 py-2 text-slate-400">
                    {u.createdAt ? formatDistanceToNow(new Date(u.createdAt), { addSuffix: true }) : '—'}
                  </td>
                  <td className="px-3 py-2">
                    <button onClick={() => handleDelete(u.id, u.email)}
                      className="p-1.5 rounded-lg hover:bg-red-500/10 text-slate-400 hover:text-red-400 transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
              {users.length === 0 && !error && (
                <tr><td colSpan={6} className="px-3 py-8 text-center text-slate-500">No users found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// FR-14: Manage AI Models
// ─────────────────────────────────────────────
function ModelsTab() {
  const [config, setConfig] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [threshold, setThreshold] = useState(0.3)
  const [weights, setWeights] = useState({ xgboost: 0.85, autoencoder: 0.15, isolation_forest: 0 })

  useEffect(() => {
    adminAPI.getModelConfig()
      .then(r => {
        setConfig(r.data)
        setThreshold(r.data.ensemble_threshold)
        setWeights(r.data.ensemble_weights)
        setError(null)
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  const weightSum = Object.values(weights).reduce((a, b) => a + Number(b || 0), 0)

  const handleSaveThreshold = async () => {
    setSaving(true)
    try {
      const res = await adminAPI.updateModelConfig({ ensemble_threshold: parseFloat(threshold) })
      setConfig(c => ({ ...c, ...res.data }))
      toast.success('Threshold updated')
    } catch (err) {
      toast.error('Failed: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleSaveWeights = async () => {
    if (Math.abs(weightSum - 1) > 0.01) {
      toast.error(`Weights must sum to 1.0 (currently ${weightSum.toFixed(2)})`)
      return
    }
    setSaving(true)
    try {
      const res = await adminAPI.updateModelConfig({ ensemble_weights: weights })
      setConfig(c => ({ ...c, ...res.data }))
      toast.success('Ensemble weights updated')
    } catch (err) {
      toast.error('Failed: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="flex items-center justify-center h-40"><Loader2 className="w-7 h-7 text-sky-400 animate-spin" /></div>

  if (error) {
    return (
      <div className="card">
        <p className="text-xs text-amber-300">
          Could not reach the AI Engine config endpoint: {error}. Make sure the AI Engine
          (FastAPI, port 8000) is running.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="card">
        <h3 className="text-sm font-semibold text-white mb-1">Fraud Threshold</h3>
        <p className="text-xs text-slate-400 mb-4">
          A transaction is flagged as fraud when its ensemble risk score is at or above this value.
          Lower = more sensitive (more flags, more false positives). Higher = stricter.
        </p>
        <div className="flex items-center gap-4 max-w-lg">
          <input type="range" min="0.05" max="0.9" step="0.01" value={threshold}
            onChange={(e) => setThreshold(e.target.value)}
            className="flex-1" />
          <span className="text-sm font-bold text-white w-16 text-right">{Number(threshold).toFixed(2)}</span>
          <button onClick={handleSaveThreshold} disabled={saving}
            className="btn-primary text-xs flex items-center gap-1.5 flex-shrink-0">
            {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
            Save
          </button>
        </div>
      </div>

      <div className="card">
        <h3 className="text-sm font-semibold text-white mb-1">Ensemble Weights</h3>
        <p className="text-xs text-slate-400 mb-4">
          How much each model contributes to the final risk score. Must sum to 1.0.
          Current sum: <span className={Math.abs(weightSum - 1) > 0.01 ? 'text-red-400 font-bold' : 'text-green-400 font-bold'}>{weightSum.toFixed(2)}</span>
        </p>
        <div className="space-y-3 max-w-lg">
          {Object.entries(weights).map(([model, val]) => (
            <div key={model} className="flex items-center gap-3">
              <span className="text-xs text-slate-300 w-32 capitalize">{model.replace('_', ' ')}</span>
              <input type="number" min="0" max="1" step="0.01" value={val}
                onChange={(e) => setWeights(w => ({ ...w, [model]: e.target.value }))}
                className="input text-xs h-8 w-24" />
            </div>
          ))}
        </div>
        <button onClick={handleSaveWeights} disabled={saving}
          className="btn-primary text-xs flex items-center gap-1.5 mt-4">
          {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
          Save Weights
        </button>
      </div>

      {config?.model_performance && (
        <div className="card">
          <h3 className="text-sm font-semibold text-white mb-3">Model Performance (from training)</h3>
          <p className="text-xs text-slate-500">See saved_models/model_metadata.json for full evaluation metrics.</p>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────
// FR-15: System Logs
// ─────────────────────────────────────────────
function LogsTab() {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('')

  useEffect(() => {
    setLoading(true)
    adminAPI.getLogs({ status: statusFilter || undefined })
      .then(r => setLogs(r.data.logs || []))
      .catch(() => setLogs([]))
      .finally(() => setLoading(false))
  }, [statusFilter])

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-white">System Logs — Upload & Processing Audit Trail</h3>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
          className="bg-slate-700 border border-slate-600 rounded-lg text-xs px-2 py-1 text-white">
          <option value="">All statuses</option>
          <option value="completed">Completed</option>
          <option value="failed">Failed</option>
          <option value="analyzing">Analyzing</option>
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-32"><Loader2 className="w-6 h-6 text-sky-400 animate-spin" /></div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-700">
                {['Job ID', 'File', 'User', 'Status', 'Total', 'Flagged', 'Error', 'Created'].map(h => (
                  <th key={h} className="text-left px-3 py-2 text-slate-400 font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {logs.map(log => (
                <tr key={log.jobId} className="border-b border-slate-800/50 hover:bg-slate-800/40">
                  <td className="px-3 py-2 font-mono text-slate-300">{log.jobId?.slice(0, 8)}…</td>
                  <td className="px-3 py-2 text-slate-200 max-w-36 truncate">{log.originalName}</td>
                  <td className="px-3 py-2 font-mono text-slate-400">{log.userId?.slice(0, 8)}…</td>
                  <td className="px-3 py-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                      log.status === 'completed' ? 'bg-green-500/10 text-green-400' :
                      log.status === 'failed' ? 'bg-red-500/10 text-red-400' : 'bg-amber-500/10 text-amber-400'}`}>
                      {log.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-slate-200">{(log.totalTransactions || 0).toLocaleString()}</td>
                  <td className="px-3 py-2 text-red-400">{(log.flaggedCount || 0).toLocaleString()}</td>
                  <td className="px-3 py-2 text-red-400 max-w-48 truncate">{log.errorMessage || '—'}</td>
                  <td className="px-3 py-2 text-slate-400">{formatDistanceToNow(new Date(log.createdAt), { addSuffix: true })}</td>
                </tr>
              ))}
              {logs.length === 0 && (
                <tr><td colSpan={8} className="px-3 py-8 text-center text-slate-500">No logs found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

const MOCK_STATS = { totalJobs: 12, totalTransactions: 520000, totalFraud: 18420 }
const MOCK_JOBS = [
  { jobId: 'abc123', originalName: 'HI_Small_Trans.csv', userId: 'user001', totalTransactions: 52000, flaggedCount: 1842, status: 'completed', createdAt: new Date(Date.now() - 3600000).toISOString() },
  { jobId: 'def456', originalName: 'LI_Small_Trans.csv', userId: 'user002', totalTransactions: 73430, flaggedCount: 2000, status: 'completed', createdAt: new Date(Date.now() - 86400000).toISOString() },
]
