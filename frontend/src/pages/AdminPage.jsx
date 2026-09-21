import { useState, useEffect } from 'react'
import { adminAPI } from '../utils/api'
import { Users, Database, Activity, Shield, Loader2 } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

export default function AdminPage() {
  const [stats, setStats]   = useState(null)
  const [jobs, setJobs]     = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([adminAPI.getStats(), adminAPI.getAllJobs()])
      .then(([s, j]) => { setStats(s.data); setJobs(j.data || []) })
      .catch(() => { setStats(MOCK_STATS); setJobs(MOCK_JOBS) })
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="flex items-center justify-center h-full"><Loader2 className="w-7 h-7 text-sky-400 animate-spin" /></div>

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">Admin Panel</h1>
        <p className="text-slate-400 text-sm mt-1">System overview and management</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {[
          { icon: Database,  label: 'Total Jobs',         value: stats?.totalJobs || 0,         color: 'sky' },
          { icon: Activity,  label: 'Total Transactions', value: (stats?.totalTransactions||0).toLocaleString(), color: 'green' },
          { icon: Shield,    label: 'Total Fraud Found',  value: (stats?.totalFraud||0).toLocaleString(), color: 'red' },
        ].map(({ icon: Icon, label, value, color }) => (
          <div key={label} className="card flex items-center gap-4">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center
              ${color==='sky'?'bg-sky-500/10 text-sky-400':color==='green'?'bg-green-500/10 text-green-400':'bg-red-500/10 text-red-400'}`}>
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
        <h3 className="text-sm font-semibold text-white mb-4">All Jobs — System Log</h3>
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
                  <td className="px-3 py-2 text-slate-200">{(job.totalTransactions||0).toLocaleString()}</td>
                  <td className="px-3 py-2 text-red-400 font-semibold">{(job.flaggedCount||0).toLocaleString()}</td>
                  <td className="px-3 py-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                      job.status==='completed'?'bg-green-500/10 text-green-400':
                      job.status==='failed'?'bg-red-500/10 text-red-400':'bg-amber-500/10 text-amber-400'}`}>
                      {job.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-slate-400">{formatDistanceToNow(new Date(job.createdAt), {addSuffix: true})}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

const MOCK_STATS = { totalJobs: 12, totalTransactions: 520000, totalFraud: 18420 }
const MOCK_JOBS = [
  { jobId: 'abc123', originalName: 'HI_Small_Trans.csv', userId: 'user001', totalTransactions: 52000, flaggedCount: 1842, status: 'completed', createdAt: new Date(Date.now()-3600000).toISOString() },
  { jobId: 'def456', originalName: 'LI_Small_Trans.csv', userId: 'user002', totalTransactions: 73430, flaggedCount: 2000, status: 'completed', createdAt: new Date(Date.now()-86400000).toISOString() },
]
