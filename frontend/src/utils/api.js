import axios from 'axios'
import { createClient } from '@supabase/supabase-js'

// ── Supabase Client ──
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL || 'https://placeholder.supabase.co',
  import.meta.env.VITE_SUPABASE_ANON_KEY || 'placeholder'
)

// ── Axios API Client ──
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:4000/api',
  timeout: 300000,
})

// Auto-attach Supabase JWT
api.interceptors.request.use(async (config) => {
  const { data: { session } } = await supabase.auth.getSession()
  if (session?.access_token) {
    config.headers.Authorization = `Bearer ${session.access_token}`
  }
  return config
})

api.interceptors.response.use(
  res => res,
  err => {
    const msg = err.response?.data?.error || err.message || 'Network error'
    return Promise.reject(new Error(msg))
  }
)

// ── API Methods ──
export const authAPI = {
  login:    (email, password) => api.post('/auth/login', { email, password }),
  register: (email, password, role) => api.post('/auth/register', { email, password, role }),
  logout:   () => api.post('/auth/logout'),
}

export const uploadAPI = {
  uploadFile: (formData, onProgress) => api.post('/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: e => onProgress?.(Math.round(e.loaded / e.total * 100))
  }),
  getJobs:      () => api.get('/upload/jobs'),
  getJobStatus: (jobId) => api.get(`/upload/jobs/${jobId}`),
}

export const analysisAPI = {
  getJobTransactions: (jobId, params) => api.get(`/analysis/job/${jobId}`, { params }),
  getTransaction:     (txId) => api.get(`/analysis/transaction/${txId}`),
}

export const graphAPI = {
  getTransactionGraph: (txId, depth = 3) => api.get(`/graph/transaction/${txId}`, { params: { depth } }),
  getJobNetworks:      (jobId) => api.get(`/graph/job/${jobId}/networks`),
}

export const reportAPI = {
  generateReport: (jobId) => api.get(`/reports/generate/${jobId}`, { responseType: 'blob' }),
}

export const dashboardAPI = {
  getOverview: () => api.get('/dashboard/overview'),
}

export const adminAPI = {
  getAllJobs: () => api.get('/admin/jobs'),
  getStats:  () => api.get('/admin/stats'),
}

export default api
