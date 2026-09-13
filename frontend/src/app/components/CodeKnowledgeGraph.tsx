'use client';

import React, { useRef, useEffect, useState, useMemo } from 'react';

export interface GraphNode {
  id: string;
  label: string;
  kind: 'endpoint' | 'function' | 'class' | 'file' | 'variable';
  file_path: string;
  line_start?: number;
  line_end?: number;
  signature?: string;
  docstring?: string;
  language?: string;
  code_snippet?: string;
  method?: string;
  path?: string;
  // Simulation physics state
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  radius?: number;
  color?: string;
}

export interface GraphEdge {
  source: string; // node id
  target: string; // node id
  relationship: 'ROUTES_TO' | 'CALLS' | 'CONTAINS' | 'IMPORTS' | 'USES_TYPE';
}

export interface KnowledgeGraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  stats?: {
    files_scanned?: number;
    endpoints?: number;
    functions?: number;
    classes?: number;
    total_chunks?: number;
  };
  project?: string;
  last_indexed?: string;
}

interface Props {
  graphData: KnowledgeGraphData | null;
  onClose: () => void;
  onOpenFile?: (path: string, line?: number) => void;
  onTestQuery?: (query: string) => void;
}

const KIND_COLORS: Record<string, { fill: string; glow: string; label: string; icon: string }> = {
  endpoint: { fill: '#f59e0b', glow: 'rgba(245, 158, 11, 0.4)', label: 'API Endpoint', icon: '⚡' },
  function: { fill: '#38bdf8', glow: 'rgba(56, 189, 248, 0.4)', label: 'Function', icon: '𝑓' },
  class: { fill: '#10b981', glow: 'rgba(16, 185, 129, 0.4)', label: 'Class / Model', icon: '🏛️' },
  file: { fill: '#64748b', glow: 'rgba(100, 116, 139, 0.25)', label: 'Source File', icon: '📁' },
  variable: { fill: '#a855f7', glow: 'rgba(168, 85, 247, 0.35)', label: 'Config / Var', icon: '📦' }
};

export default function CodeKnowledgeGraph({ graphData, onClose, onOpenFile, onTestQuery }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterKinds, setFilterKinds] = useState<Record<string, boolean>>({
    endpoint: true,
    function: true,
    class: true,
    file: true,
    variable: true
  });
  const [isPhysicsActive, setIsPhysicsActive] = useState(true);

  // Camera transform state
  const cameraRef = useRef({ x: 0, y: 0, scale: 0.85 });
  const isDraggingCanvasRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const draggedNodeRef = useRef<GraphNode | null>(null);

  // Particles animation along edges
  const particlesRef = useRef<Array<{ edgeIdx: number; progress: number; speed: number }>>([]);

  // Build simulation nodes and links
  const { nodes, links, nodeMap } = useMemo(() => {
    if (!graphData || !graphData.nodes || graphData.nodes.length === 0) {
      return { nodes: [], links: [], nodeMap: new Map<string, GraphNode>() };
    }

    const nMap = new Map<string, GraphNode>();
    const filteredNodes: GraphNode[] = [];

    // Filter by kind
    for (const n of graphData.nodes) {
      if (filterKinds[n.kind]) {
        // Initial circular layout around center
        const angle = Math.random() * Math.PI * 2;
        const dist = 100 + Math.random() * 350;
        const r = n.kind === 'endpoint' ? 17 : n.kind === 'class' ? 14 : n.kind === 'function' ? 11 : 8;
        const simNode: GraphNode = {
          ...n,
          x: n.x ?? Math.cos(angle) * dist,
          y: n.y ?? Math.sin(angle) * dist,
          vx: 0,
          vy: 0,
          radius: r,
          color: KIND_COLORS[n.kind]?.fill || '#94a3b8'
        };
        filteredNodes.push(simNode);
        nMap.set(simNode.id, simNode);
      }
    }

    // Filter links
    const filteredLinks: Array<{ sourceNode: GraphNode; targetNode: GraphNode; relationship: string }> = [];
    if (graphData.edges) {
      for (const e of graphData.edges) {
        const s = nMap.get(e.source);
        const t = nMap.get(e.target);
        if (s && t) {
          filteredLinks.push({ sourceNode: s, targetNode: t, relationship: e.relationship });
        }
      }
    }

    // Initialize particles
    particlesRef.current = filteredLinks.slice(0, 40).map((_, i) => ({
      edgeIdx: i,
      progress: Math.random(),
      speed: 0.006 + Math.random() * 0.008
    }));

    return { nodes: filteredNodes, links: filteredLinks, nodeMap: nMap };
  }, [graphData, filterKinds]);

  // Main Canvas Render & Physics Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;

    const handleResize = () => {
      if (canvas.parentElement) {
        canvas.width = canvas.parentElement.clientWidth;
        canvas.height = canvas.parentElement.clientHeight;
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);

    const stepPhysics = () => {
      if (!isPhysicsActive || nodes.length === 0) return;

      const repulsion = 900;
      const springLength = 80;
      const springK = 0.04;
      const centerGravity = 0.008;

      // 1. Repulsion between all node pairs
      for (let i = 0; i < nodes.length; i++) {
        const n1 = nodes[i];
        for (let j = i + 1; j < nodes.length; j++) {
          const n2 = nodes[j];
          const dx = (n2.x || 0) - (n1.x || 0);
          const dy = (n2.y || 0) - (n1.y || 0);
          const distSq = dx * dx + dy * dy + 100;
          const dist = Math.sqrt(distSq);
          if (dist < 400) {
            const force = repulsion / distSq;
            const fx = (dx / dist) * force;
            const fy = (dy / dist) * force;
            n1.vx = (n1.vx || 0) - fx;
            n1.vy = (n1.vy || 0) - fy;
            n2.vx = (n2.vx || 0) + fx;
            n2.vy = (n2.vy || 0) + fy;
          }
        }
      }

      // 2. Spring attraction along links
      for (const link of links) {
        const n1 = link.sourceNode;
        const n2 = link.targetNode;
        const dx = (n2.x || 0) - (n1.x || 0);
        const dy = (n2.y || 0) - (n1.y || 0);
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const disp = dist - springLength;
        const force = disp * springK;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        n1.vx = (n1.vx || 0) + fx;
        n1.vy = (n1.vy || 0) + fy;
        n2.vx = (n2.vx || 0) - fx;
        n2.vy = (n2.vy || 0) - fy;
      }

      // 3. Center gravity and damping update
      for (const n of nodes) {
        if (n === draggedNodeRef.current) continue;
        n.vx = (n.vx || 0) - (n.x || 0) * centerGravity;
        n.vy = (n.vy || 0) - (n.y || 0) * centerGravity;
        // Damping
        n.vx = (n.vx || 0) * 0.88;
        n.vy = (n.vy || 0) * 0.88;
        n.x = (n.x || 0) + (n.vx || 0);
        n.y = (n.y || 0) + (n.vy || 0);
      }
    };

    const draw = () => {
      stepPhysics();

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save();

      // Apply camera pan & zoom centered on canvas
      ctx.translate(canvas.width / 2 + cameraRef.current.x, canvas.height / 2 + cameraRef.current.y);
      ctx.scale(cameraRef.current.scale, cameraRef.current.scale);

      // Draw subtle grid
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
      ctx.lineWidth = 1;
      const gridSize = 80;
      const range = 1200;
      ctx.beginPath();
      for (let x = -range; x <= range; x += gridSize) {
        ctx.moveTo(x, -range);
        ctx.lineTo(x, range);
      }
      for (let y = -range; y <= range; y += gridSize) {
        ctx.moveTo(-range, y);
        ctx.lineTo(range, y);
      }
      ctx.stroke();

      // Draw Links
      for (const link of links) {
        const s = link.sourceNode;
        const t = link.targetNode;
        if (!s || !t) continue;

        const isHighlighted = selectedNode && (selectedNode.id === s.id || selectedNode.id === t.id);

        ctx.beginPath();
        ctx.moveTo(s.x || 0, s.y || 0);
        ctx.lineTo(t.x || 0, t.y || 0);

        if (isHighlighted) {
          ctx.strokeStyle = '#38bdf8';
          ctx.lineWidth = 2.5;
        } else if (link.relationship === 'ROUTES_TO') {
          ctx.strokeStyle = 'rgba(245, 158, 11, 0.35)';
          ctx.lineWidth = 1.6;
        } else if (link.relationship === 'CALLS') {
          ctx.strokeStyle = 'rgba(56, 189, 248, 0.3)';
          ctx.lineWidth = 1.3;
        } else {
          ctx.strokeStyle = 'rgba(100, 116, 139, 0.2)';
          ctx.lineWidth = 0.9;
        }
        ctx.stroke();
      }

      // Draw animated particle pulses along links
      for (const p of particlesRef.current) {
        if (p.edgeIdx < links.length) {
          const l = links[p.edgeIdx];
          p.progress = (p.progress + p.speed) % 1.0;
          const px = (l.sourceNode.x || 0) + ((l.targetNode.x || 0) - (l.sourceNode.x || 0)) * p.progress;
          const py = (l.sourceNode.y || 0) + ((l.targetNode.y || 0) - (l.sourceNode.y || 0)) * p.progress;

          ctx.beginPath();
          ctx.arc(px, py, 2.5, 0, Math.PI * 2);
          ctx.fillStyle = '#60a5fa';
          ctx.shadowColor = '#60a5fa';
          ctx.shadowBlur = 6;
          ctx.fill();
          ctx.shadowBlur = 0;
        }
      }

      // Draw Nodes
      for (const n of nodes) {
        const isSelected = selectedNode?.id === n.id;
        const isMatch = searchQuery.trim() && n.label.toLowerCase().includes(searchQuery.toLowerCase());
        const radius = (n.radius || 10) * (isSelected || isMatch ? 1.3 : 1.0);
        const color = KIND_COLORS[n.kind]?.fill || '#94a3b8';
        const glowColor = KIND_COLORS[n.kind]?.glow || 'rgba(255,255,255,0.2)';

        ctx.save();
        ctx.beginPath();
        ctx.arc(n.x || 0, n.y || 0, radius, 0, Math.PI * 2);

        // Glow
        if (isSelected || isMatch) {
          ctx.shadowColor = color;
          ctx.shadowBlur = 18;
        } else {
          ctx.shadowColor = glowColor;
          ctx.shadowBlur = 8;
        }

        ctx.fillStyle = color;
        ctx.fill();
        ctx.shadowBlur = 0;

        // Border ring
        ctx.lineWidth = isSelected ? 3 : 1.5;
        ctx.strokeStyle = isSelected ? '#ffffff' : 'rgba(255, 255, 255, 0.6)';
        ctx.stroke();

        // Node Label
        ctx.font = isSelected ? 'bold 11px Inter, sans-serif' : '10px Inter, sans-serif';
        ctx.fillStyle = isSelected ? '#ffffff' : '#cbd5e1';
        ctx.textAlign = 'center';
        ctx.fillText(n.label, n.x || 0, (n.y || 0) + radius + 13);

        ctx.restore();
      }

      ctx.restore();
      animId = requestAnimationFrame(draw);
    };

    animId = requestAnimationFrame(draw);

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animId);
    };
  }, [nodes, links, selectedNode, searchQuery, isPhysicsActive]);

  // Screen coordinate to world transform
  const screenToWorld = (sx: number, sy: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const cx = sx - rect.left - canvas.width / 2 - cameraRef.current.x;
    const cy = sy - rect.top - canvas.height / 2 - cameraRef.current.y;
    return {
      x: cx / cameraRef.current.scale,
      y: cy / cameraRef.current.scale
    };
  };

  // Canvas Mouse / Drag Handlers
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const w = screenToWorld(e.clientX, e.clientY);

    // Check if a node was clicked
    let clicked: GraphNode | null = null;
    for (let i = nodes.length - 1; i >= 0; i--) {
      const n = nodes[i];
      const dx = (n.x || 0) - w.x;
      const dy = (n.y || 0) - w.y;
      if (Math.sqrt(dx * dx + dy * dy) <= (n.radius || 10) + 5) {
        clicked = n;
        break;
      }
    }

    if (clicked) {
      draggedNodeRef.current = clicked;
      setSelectedNode(clicked);
    } else {
      isDraggingCanvasRef.current = true;
      dragStartRef.current = { x: e.clientX, y: e.clientY };
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (draggedNodeRef.current) {
      const w = screenToWorld(e.clientX, e.clientY);
      draggedNodeRef.current.x = w.x;
      draggedNodeRef.current.y = w.y;
      draggedNodeRef.current.vx = 0;
      draggedNodeRef.current.vy = 0;
    } else if (isDraggingCanvasRef.current) {
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      cameraRef.current.x += dx;
      cameraRef.current.y += dy;
      dragStartRef.current = { x: e.clientX, y: e.clientY };
    }
  };

  const handleMouseUp = () => {
    draggedNodeRef.current = null;
    isDraggingCanvasRef.current = false;
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
    cameraRef.current.scale = Math.min(Math.max(cameraRef.current.scale * zoomFactor, 0.2), 3.5);
  };

  // Connected nodes calculation for selected node
  const connectedNodes = useMemo(() => {
    if (!selectedNode) return [];
    const conns: Array<{ node: GraphNode; rel: string; direction: 'outgoing' | 'incoming' }> = [];
    for (const l of links) {
      if (l.sourceNode.id === selectedNode.id) {
        conns.push({ node: l.targetNode, rel: l.relationship, direction: 'outgoing' });
      } else if (l.targetNode.id === selectedNode.id) {
        conns.push({ node: l.sourceNode, rel: l.relationship, direction: 'incoming' });
      }
    }
    return conns;
  }, [selectedNode, links]);

  // Center camera on search result if found
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    const match = nodes.find(n => n.label.toLowerCase().includes(searchQuery.toLowerCase()));
    if (match && match.x !== undefined && match.y !== undefined) {
      setSelectedNode(match);
      cameraRef.current = {
        x: -match.x * cameraRef.current.scale,
        y: -match.y * cameraRef.current.scale,
        scale: 1.2
      };
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#07080a]/95 backdrop-blur-md flex flex-col select-none text-[#e2e5ea]">
      {/* ── Top Header Toolbar ────────────────────────────────────────── */}
      <div className="h-[54px] border-b border-[#1b202c] px-5 flex items-center justify-between bg-[#0b0e14]">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[#121622] border border-[#252f44] flex items-center justify-center text-cyan-400 font-mono text-sm shadow-sm">
            🌐
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold tracking-tight text-[#f1f5f9]">
                Codebase Knowledge Graph
              </h2>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-950/60 border border-cyan-800/40 text-cyan-300">
                Sourcegraph SCIP Engine
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              {graphData?.project ? `Project: ${graphData.project}` : 'Multi-Language AST Symbol & API Graph'} • {nodes.length} Nodes • {links.length} Edges
            </p>
          </div>
        </div>

        {/* Search Bar & Kind Filter Pills */}
        <div className="flex items-center gap-3">
          <form onSubmit={handleSearchSubmit} className="relative">
            <input
              type="text"
              placeholder="Search symbol, function, API..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-56 h-8 bg-[#121622] border border-[#252f44] rounded-lg px-3 pl-8 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-all font-mono"
            />
            <span className="absolute left-2.5 top-2 text-xs text-slate-500">🔍</span>
          </form>

          {/* Kind Filters */}
          <div className="flex items-center gap-1 bg-[#10141e] p-1 rounded-lg border border-[#1e2638]">
            {(['endpoint', 'function', 'class', 'file'] as const).map((kind) => {
              const info = KIND_COLORS[kind];
              const active = filterKinds[kind];
              return (
                <button
                  key={kind}
                  onClick={() => setFilterKinds(prev => ({ ...prev, [kind]: !prev[kind] }))}
                  className={`px-2.5 py-1 rounded text-[10.5px] font-mono flex items-center gap-1.5 transition-all cursor-pointer ${
                    active ? 'bg-[#1e2638] text-white shadow-sm' : 'text-slate-500 opacity-50 hover:opacity-80'
                  }`}
                >
                  <span style={{ color: info.fill }}>{info.icon}</span>
                  <span>{info.label}</span>
                </button>
              );
            })}
          </div>

          {/* Physics Play/Pause & Center */}
          <button
            onClick={() => setIsPhysicsActive(prev => !prev)}
            title={isPhysicsActive ? 'Freeze physics' : 'Unfreeze physics'}
            className="h-8 px-3 rounded-lg bg-[#121622] border border-[#252f44] text-xs font-mono text-slate-300 hover:text-white transition-all cursor-pointer flex items-center gap-1.5"
          >
            <span>{isPhysicsActive ? '⏸️ Freeze' : '▶️ Resume'}</span>
          </button>

          <button
            onClick={() => { cameraRef.current = { x: 0, y: 0, scale: 0.85 }; }}
            title="Reset View"
            className="h-8 px-2.5 rounded-lg bg-[#121622] border border-[#252f44] text-xs text-slate-300 hover:text-white transition-all cursor-pointer"
          >
            🎯 Reset
          </button>

          {/* Close Button */}
          <button
            onClick={onClose}
            className="h-8 px-3 rounded-lg bg-rose-950/40 border border-rose-800/40 text-rose-300 hover:bg-rose-900/60 text-xs font-mono transition-all cursor-pointer"
          >
            ✕ Close
          </button>
        </div>
      </div>

      {/* ── Main Canvas Viewport ──────────────────────────────────────── */}
      <div className="flex-1 relative overflow-hidden bg-[#07080a]">
        <canvas
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onWheel={handleWheel}
          className="w-full h-full cursor-grab active:cursor-grabbing"
        />

        {/* Floating Legend */}
        <div className="absolute bottom-4 left-4 p-3 rounded-xl bg-[#0b0e14]/90 border border-[#1e2638] backdrop-blur-md shadow-2xl flex flex-col gap-1.5 pointer-events-none">
          <span className="text-[10px] font-mono text-slate-400 font-semibold tracking-wider uppercase">
            Graph Topology
          </span>
          <div className="flex items-center gap-3 text-[11px] font-mono">
            <span className="flex items-center gap-1 text-amber-400">⚡ API Route</span>
            <span className="flex items-center gap-1 text-cyan-400">𝑓 Function</span>
            <span className="flex items-center gap-1 text-emerald-400">🏛️ Class</span>
            <span className="flex items-center gap-1 text-slate-400">📁 File</span>
          </div>
          <span className="text-[9.5px] text-slate-500 font-sans">
            Scroll to zoom • Drag canvas to pan • Click node to inspect code
          </span>
        </div>

        {/* ── Node Detail Slide-Over Inspector ────────────────────────── */}
        {selectedNode && (
          <div className="absolute top-4 right-4 w-96 max-h-[calc(100%-32px)] overflow-y-auto bg-[#0d111a]/95 border border-[#222c3f] rounded-2xl p-5 shadow-2xl backdrop-blur-lg flex flex-col gap-4 text-xs font-sans animate-in slide-in-from-right-4 duration-200">
            {/* Header */}
            <div className="flex items-start justify-between border-b border-[#1b2332] pb-3">
              <div className="flex items-center gap-2">
                <span
                  className="w-7 h-7 rounded-lg flex items-center justify-center font-mono text-sm"
                  style={{ backgroundColor: `${KIND_COLORS[selectedNode.kind]?.fill}20`, color: KIND_COLORS[selectedNode.kind]?.fill }}
                >
                  {KIND_COLORS[selectedNode.kind]?.icon}
                </span>
                <div>
                  <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
                    {KIND_COLORS[selectedNode.kind]?.label}
                  </span>
                  <h3 className="text-sm font-semibold text-white truncate max-w-[220px]">
                    {selectedNode.label}
                  </h3>
                </div>
              </div>
              <button
                onClick={() => setSelectedNode(null)}
                className="text-slate-400 hover:text-white text-base p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* File & Line Info */}
            <div className="flex flex-col gap-1 font-mono text-[11px] bg-[#121622] p-2.5 rounded-lg border border-[#1b2332]">
              <div className="flex items-center justify-between text-slate-400">
                <span>File:</span>
                <span className="text-cyan-300 truncate max-w-[180px]">{selectedNode.file_path}</span>
              </div>
              {selectedNode.line_start && (
                <div className="flex items-center justify-between text-slate-400">
                  <span>Lines:</span>
                  <span className="text-slate-200">{selectedNode.line_start} - {selectedNode.line_end || '?'}</span>
                </div>
              )}
            </div>

            {/* Signature */}
            {selectedNode.signature && (
              <div className="flex flex-col gap-1.5">
                <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">Signature</span>
                <pre className="p-2.5 rounded-lg bg-[#07090e] border border-[#1b2332] text-emerald-300 font-mono text-[11px] overflow-x-auto whitespace-pre-wrap">
                  {selectedNode.signature}
                </pre>
              </div>
            )}

            {/* Docstring */}
            {selectedNode.docstring && (
              <div className="flex flex-col gap-1.5">
                <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">Documentation</span>
                <p className="text-slate-300 text-[11.5px] leading-relaxed bg-[#121622] p-2.5 rounded-lg border border-[#1b2332]">
                  {selectedNode.docstring}
                </p>
              </div>
            )}

            {/* Connected Relationships */}
            {connectedNodes.length > 0 && (
              <div className="flex flex-col gap-2">
                <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">
                  Connected Graph Hops ({connectedNodes.length})
                </span>
                <div className="flex flex-col gap-1.5 max-h-36 overflow-y-auto pr-1">
                  {connectedNodes.map((c, idx) => (
                    <button
                      key={idx}
                      onClick={() => setSelectedNode(c.node)}
                      className="flex items-center justify-between p-2 rounded-lg bg-[#121622] hover:bg-[#1a2030] border border-[#1e273a] text-[11px] font-mono transition-all text-left cursor-pointer"
                    >
                      <div className="flex items-center gap-1.5 truncate">
                        <span style={{ color: KIND_COLORS[c.node.kind]?.fill }}>
                          {KIND_COLORS[c.node.kind]?.icon}
                        </span>
                        <span className="text-slate-200 truncate max-w-[150px]">{c.node.label}</span>
                      </div>
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#1c2438] text-cyan-400 font-semibold">
                        {c.rel}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Code Snippet Preview */}
            {selectedNode.code_snippet && (
              <div className="flex flex-col gap-1.5">
                <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">Source Snippet</span>
                <pre className="p-3 rounded-lg bg-[#07090e] border border-[#1b2332] text-slate-300 font-mono text-[10.5px] max-h-40 overflow-auto whitespace-pre leading-snug">
                  {selectedNode.code_snippet}
                </pre>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex items-center gap-2 pt-2 border-t border-[#1b2332]">
              {onOpenFile && (
                <button
                  onClick={() => {
                    onOpenFile(selectedNode.file_path, selectedNode.line_start);
                    onClose();
                  }}
                  className="flex-1 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-mono text-xs font-semibold shadow-md transition-all cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <span>📝 Open in Editor</span>
                </button>
              )}
              {onTestQuery && (
                <button
                  onClick={() => {
                    onTestQuery(selectedNode.label);
                    onClose();
                  }}
                  className="py-2 px-3 rounded-lg bg-[#1a2130] hover:bg-[#252f44] border border-[#2b374e] text-slate-200 font-mono text-xs transition-all cursor-pointer flex items-center gap-1"
                  title="Test hybrid search in RAG"
                >
                  <span>⚡ Query RAG</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
