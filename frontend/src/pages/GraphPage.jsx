import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import CytoscapeComponent from 'react-cytoscapejs'
import { graphAPI } from '../utils/api'
import { ChevronLeft, Loader2, ZoomIn, ZoomOut, Maximize2, Info, AlertTriangle } from 'lucide-react'

const RISK_COLORS = {
  Critical: '#ef4444', High: '#f59e0b', Medium: '#3b82f6',
  Low: '#22c55e', origin: '#38bdf8', circular: '#a855f7'
}

function buildElements(nodes, edges) {
  const cyNodes = nodes.map(n => ({
    data: {
      id: n.id,
      label: n.label?.length > 12 ? n.label.slice(0, 12) + '…' : n.label,
      fullLabel: n.label,
      type: n.type,
      riskScore: n.riskScore,
      riskLevel: n.riskLevel,
      isFraud: n.isFraud,
      bank: n.bank,
      txCount: n.txCount,
      totalAmount: n.totalAmount,
    }
  }))

  const cyEdges = edges.slice(0, 500).map((e, i) => ({
    data: {
      id: e.id || `e-${i}`,
      source: e.source,
      target: e.target,
      amount: e.amount,
      format: e.format,
      isFraud: e.isFraud,
      riskScore: e.riskScore,
      label: `$${(e.amount || 0).toLocaleString()}`
    }
  }))

  return [...cyNodes, ...cyEdges]
}

const CY_STYLE = [
  {
    selector: 'node',
    style: {
      'background-color': '#334155',
      'border-color': '#475569',
      'border-width': 2,
      'label': 'data(label)',
      'color': '#e2e8f0',
      'font-size': 9,
      'text-valign': 'bottom',
      'text-margin-y': 4,
      'width': 28, 'height': 28,
    }
  },
  {
    selector: 'node[type="origin"]',
    style: { 'background-color': '#0ea5e9', 'border-color': '#38bdf8', 'border-width': 3, 'width': 36, 'height': 36 }
  },
  {
    selector: 'node[?isFraud]',
    style: { 'background-color': '#dc2626', 'border-color': '#ef4444', 'border-width': 2 }
  },
  {
    selector: 'node[riskLevel="Critical"]',
    style: { 'background-color': '#7f1d1d', 'border-color': '#ef4444', 'border-width': 3, 'width': 34, 'height': 34 }
  },
  {
    selector: 'node[type="circular"]',
    style: { 'background-color': '#6b21a8', 'border-color': '#a855f7', 'border-width': 3, 'shape': 'diamond' }
  },
  {
    selector: 'edge',
    style: {
      'width': 1.5,
      'line-color': '#475569',
      'target-arrow-color': '#475569',
      'target-arrow-shape': 'triangle',
      'curve-style': 'bezier',
      'arrow-scale': 0.8,
    }
  },
  {
    selector: 'edge[?isFraud]',
    style: { 'line-color': '#ef4444', 'target-arrow-color': '#ef4444', 'width': 2.5 }
  },
  {
    selector: ':selected',
    style: { 'border-color': '#38bdf8', 'border-width': 4, 'line-color': '#38bdf8' }
  }
]

export default function GraphPage() {
  const { transactionId } = useParams()
  const navigate = useNavigate()
  const cyRef = useRef(null)
  const [graphData, setGraphData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [depth, setDepth] = useState(3)
  const [selectedNode, setSelectedNode] = useState(null)
  const [elements, setElements] = useState([])

  useEffect(() => { loadGraph() }, [transactionId, depth])

  const loadGraph = async () => {
    setLoading(true)
    try {
      const res = await graphAPI.getTransactionGraph(transactionId, depth)
      const data = res.data
      setGraphData(data)
      setElements(buildElements(data.nodes || [], data.edges || []))
    } catch {
      // Demo mode — generate mock graph
      const mockData = generateMockGraph(transactionId)
      setGraphData(mockData)
      setElements(buildElements(mockData.nodes, mockData.edges))
    } finally {
      setLoading(false)
    }
  }

  const handleCyInit = (cy) => {
    cyRef.current = cy
    cy.on('tap', 'node', (evt) => {
      setSelectedNode(evt.target.data())
    })
    cy.on('tap', (evt) => {
      if (evt.target === cy) setSelectedNode(null)
    })
    cy.layout({ name: 'cose', animate: true, animationDuration: 800, randomize: false, nodeRepulsion: 4500 }).run()
  }

  return (
    <div className="flex flex-col h-full bg-slate-900">

      {/* Header */}
      <div className="p-4 border-b border-slate-800 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="font-bold text-white text-sm">Network Graph</h1>
            <p className="text-xs text-slate-400 font-mono">{transactionId}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Depth Selector */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">Depth:</span>
            {[2, 3, 4, 5].map(d => (
              <button key={d} onClick={() => setDepth(d)}
                className={`w-7 h-7 rounded-lg text-xs font-bold transition-colors
                  ${depth === d ? 'bg-sky-500 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}>
                {d}
              </button>
            ))}
          </div>

          {/* Zoom Controls */}
          <div className="flex items-center gap-1">
            <button onClick={() => cyRef.current?.zoom(cyRef.current.zoom() * 1.2)}
              className="p-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300">
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => cyRef.current?.zoom(cyRef.current.zoom() * 0.8)}
              className="p-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300">
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => cyRef.current?.fit(undefined, 40)}
              className="p-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300">
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Stats Bar */}
      {graphData && (
        <div className="px-4 py-2 border-b border-slate-800 flex items-center gap-5">
          {[
            { label: 'Nodes', value: graphData.nodeCount },
            { label: 'Edges', value: graphData.edgeCount },
            { label: 'Fraud Nodes', value: graphData.riskSummary?.fraudNodes || 0 },
            { label: 'Circular Flows', value: graphData.circularFlowCount || 0 },
            { label: 'Max Risk', value: `${graphData.riskSummary?.maxRisk?.toFixed(0) || 0}/100` },
          ].map(({ label, value }) => (
            <div key={label} className="flex items-center gap-2">
              <span className="text-xs text-slate-500">{label}:</span>
              <span className="text-xs font-bold text-white">{value}</span>
            </div>
          ))}
        </div>
      )}

      {/* Graph Canvas + Legend + Node Detail */}
      <div className="flex-1 flex overflow-hidden">

        {/* Cytoscape Canvas */}
        <div className="flex-1 relative">
          {loading ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <Loader2 className="w-10 h-10 text-sky-400 animate-spin mx-auto mb-3" />
                <p className="text-slate-400 text-sm">Building network graph…</p>
              </div>
            </div>
          ) : (
            <CytoscapeComponent
              elements={elements}
              style={{ width: '100%', height: '100%' }}
              stylesheet={CY_STYLE}
              cy={handleCyInit}
              userZoomingEnabled={true}
              userPanningEnabled={true}
              minZoom={0.1}
              maxZoom={4}
            />
          )}

          {/* Legend */}
          <div className="absolute bottom-4 left-4 bg-slate-800/90 backdrop-blur-sm border border-slate-700 rounded-xl p-3 space-y-1.5">
            <p className="text-xs font-semibold text-slate-300 mb-2">Legend</p>
            {[
              { color: '#0ea5e9', label: 'Origin Account' },
              { color: '#ef4444', label: 'Fraud Account' },
              { color: '#a855f7', label: 'Circular Flow' },
              { color: '#334155', label: 'Normal Account' },
            ].map(({ color, label }) => (
              <div key={label} className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: color }} />
                <span className="text-xs text-slate-400">{label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Node Detail Panel */}
        {selectedNode && (
          <div className="w-64 flex-shrink-0 border-l border-slate-800 bg-slate-900 p-4 space-y-4 overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">Account Detail</h3>
              <button onClick={() => setSelectedNode(null)} className="text-slate-400 hover:text-white text-xs">✕</button>
            </div>

            <div className={`w-12 h-12 rounded-xl flex items-center justify-center mx-auto
              ${selectedNode.isFraud ? 'bg-red-500/20 border-2 border-red-500' : 'bg-sky-500/20 border-2 border-sky-500'}`}>
              {selectedNode.isFraud
                ? <AlertTriangle className="w-6 h-6 text-red-400" />
                : <Info className="w-6 h-6 text-sky-400" />
              }
            </div>

            <div className="space-y-2">
              {[
                { label: 'Account ID', value: selectedNode.fullLabel || selectedNode.id, mono: true },
                { label: 'Type',       value: selectedNode.type },
                { label: 'Bank',       value: selectedNode.bank || '—' },
                { label: 'Risk Level', value: selectedNode.riskLevel || '—' },
                { label: 'Risk Score', value: `${selectedNode.riskScore?.toFixed(1) || 0}/100` },
                { label: 'Tx Count',   value: selectedNode.txCount || 0 },
                { label: 'Total Flow', value: `$${(selectedNode.totalAmount || 0).toLocaleString()}` },
              ].map(({ label, value, mono }) => (
                <div key={label} className="flex justify-between gap-2">
                  <span className="text-xs text-slate-400">{label}</span>
                  <span className={`text-xs font-medium text-slate-200 text-right ${mono ? 'font-mono' : ''}`}>{String(value)}</span>
                </div>
              ))}
            </div>

            {selectedNode.isFraud && (
              <div className="bg-red-950/40 border border-red-800/40 rounded-lg p-3">
                <p className="text-xs text-red-300 font-semibold mb-1">⚠ Fraud Detected</p>
                <p className="text-xs text-red-400">This account is linked to flagged transactions. Recommend immediate investigation.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// Generate realistic demo graph
function generateMockGraph(startTx) {
  const accounts = Array.from({ length: 18 }, (_, i) => `ACC${1000 + i}`)
  const nodes = [
    { id: accounts[0], label: accounts[0], type: 'origin', riskScore: 92, riskLevel: 'Critical', isFraud: true, bank: 'First Bank', txCount: 5, totalAmount: 450000 },
    ...accounts.slice(1, 7).map((a, i) => ({
      id: a, label: a, type: i < 3 ? 'suspicious' : 'normal',
      riskScore: i < 3 ? 70 + i * 10 : 20 - i * 2,
      riskLevel: i < 2 ? 'Critical' : i < 3 ? 'High' : 'Low',
      isFraud: i < 3, bank: 'Metro Bank', txCount: 2 + i, totalAmount: 100000 * (i + 1)
    })),
    ...accounts.slice(7).map((a, i) => ({
      id: a, label: a, type: 'normal', riskScore: 15 + i * 3, riskLevel: 'Low',
      isFraud: false, bank: 'City Bank', txCount: 1, totalAmount: 25000
    }))
  ]

  const edges = [
    { id: startTx, source: accounts[0], target: accounts[1], amount: 120000, format: 'Wire', isFraud: true, riskScore: 92 },
    { id: 'e2', source: accounts[1], target: accounts[2], amount: 115000, format: 'Wire', isFraud: true, riskScore: 85 },
    { id: 'e3', source: accounts[2], target: accounts[0], amount: 110000, format: 'Bitcoin', isFraud: true, riskScore: 90 },
    ...accounts.slice(3, 7).map((a, i) => ({
      id: `e${i + 4}`, source: accounts[0], target: a, amount: 30000 * (i + 1), format: 'ACH', isFraud: false, riskScore: 30
    })),
    ...accounts.slice(7).map((a, i) => ({
      id: `e${i + 8}`, source: accounts[i % 4 + 1], target: a, amount: 15000, format: 'Cheque', isFraud: false, riskScore: 20
    }))
  ]

  return {
    originAccount: accounts[0], originBank: 'First Bank',
    depth: 3, nodeCount: nodes.length, edgeCount: edges.length,
    circularFlowCount: 1,
    nodes, edges,
    riskSummary: { maxRisk: 92, fraudNodes: 3, totalAmount: 1200000 }
  }
}
