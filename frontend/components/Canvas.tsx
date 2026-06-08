import React, { useState, useRef, useEffect, useCallback } from 'react';
import { NodeData, NodeType, Connection, CanvasTransform, Point, DragMode } from '../types';
import BaseNode from './Nodes/BaseNode';
import { NodeContent } from './Nodes/NodeContent';
import { Icons } from './Icons';
import { generateCreativeDescription, generateImage } from '../services/geminiService';

const DEFAULT_NODE_WIDTH = 360; // Slightly wider for 16:9 look
const DEFAULT_NODE_HEIGHT = 200; // Visual height, actual DOM height is flex

const Canvas: React.FC = () => {
  // --- State ---
  const [nodes, setNodes] = useState<NodeData[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [transform, setTransform] = useState<CanvasTransform>({ x: 0, y: 0, k: 1 });
  const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(new Set());
  const [dragMode, setDragMode] = useState<DragMode>('NONE');
  
  // Interaction Refs
  const containerRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef<Point>({ x: 0, y: 0 });
  const initialTransformRef = useRef<CanvasTransform>({ x: 0, y: 0, k: 1 });
  const initialNodePositionsRef = useRef<{id: string, x: number, y: number}[]>([]);
  
  // Connection Refs
  const connectionStartRef = useRef<{ nodeId: string, type: 'source' | 'target' } | null>(null);
  const [tempConnection, setTempConnection] = useState<Point | null>(null);
  
  const spacePressed = useRef(false);

  // --- Helpers ---
  const screenToWorld = (x: number, y: number) => ({
    x: (x - transform.x) / transform.k,
    y: (y - transform.y) / transform.k,
  });

  const generateId = () => Math.random().toString(36).substr(2, 9);

  // --- Actions ---

  const addNode = (type: NodeType, x?: number, y?: number) => {
    // Center if no coords provided
    if (x === undefined || y === undefined) {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const center = screenToWorld(rect.width / 2, rect.height / 2);
        x = center.x - DEFAULT_NODE_WIDTH / 2;
        y = center.y - DEFAULT_NODE_HEIGHT / 2;
      } else {
        x = 0; y = 0;
      }
    }

    const newNode: NodeData = {
      id: generateId(),
      type,
      x,
      y,
      width: DEFAULT_NODE_WIDTH,
      height: type === NodeType.ORIGINAL_IMAGE ? 200 : DEFAULT_NODE_HEIGHT,
      title: type === NodeType.TEXT_TO_IMAGE ? 'Text to Image' :
             type === NodeType.CREATIVE_DESC ? 'Creative Description' : 'Original Image',
      aspectRatio: '16:9',
      model: type === NodeType.TEXT_TO_IMAGE ? 'gemini-3-pro-image-preview' : 'IMAGE',
      prompt: '',
    };
    setNodes(prev => [...prev, newNode]);
  };

  const handlePaste = useCallback(async (e: ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (const item of items) {
      if (item.type.indexOf('image') !== -1) {
        const file = item.getAsFile();
        if (file) {
          const reader = new FileReader();
          reader.onload = (event) => {
             const img = new Image();
             img.onload = () => {
                 // Calculate size maintaining aspect ratio, max 300px width
                 const ratio = img.width / img.height;
                 const width = Math.min(300, img.width);
                 const height = width / ratio;
                 
                 // Paste at mouse center or center screen
                 const center = screenToWorld(window.innerWidth/2, window.innerHeight/2);
                 
                 const newNode: NodeData = {
                     id: generateId(),
                     type: NodeType.ORIGINAL_IMAGE,
                     x: center.x - width/2,
                     y: center.y - height/2,
                     width,
                     height,
                     title: `Image ${new Date().toLocaleTimeString()}`,
                     imageSrc: event.target?.result as string
                 };
                 setNodes(prev => [...prev, newNode]);
             };
             img.src = event.target?.result as string;
          };
          reader.readAsDataURL(file);
        }
      }
    }
  }, [transform]);

  useEffect(() => {
    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [handlePaste]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        if (e.code === 'Space') spacePressed.current = true;
    };
    const handleKeyUp = (e: KeyboardEvent) => {
        if (e.code === 'Space') spacePressed.current = false;
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
        window.removeEventListener('keydown', handleKeyDown);
        window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  const updateNodeData = (id: string, updates: Partial<NodeData>) => {
    setNodes(prev => prev.map(n => n.id === id ? { ...n, ...updates } : n));
  };

  // --- Gemini Generation ---
  const handleGenerate = async (nodeId: string) => {
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return;

    updateNodeData(nodeId, { isLoading: true });

    try {
      if (node.type === NodeType.CREATIVE_DESC) {
        const res = await generateCreativeDescription(node.prompt || '');
        updateNodeData(nodeId, { optimizedPrompt: res, isLoading: false });
      } else if (node.type === NodeType.TEXT_TO_IMAGE) {
        const res = await generateImage(node.prompt || '', node.aspectRatio);
        // Set result as imageSrc
        updateNodeData(nodeId, { imageSrc: res[0], isLoading: false });
      }
    } catch (e) {
      alert("Generation failed. See console.");
      updateNodeData(nodeId, { isLoading: false });
    }
  };

  // --- Interaction Handlers ---

  const handleWheel = (e: React.WheelEvent) => {
    if (!e.shiftKey) return;
    if (e.ctrlKey || e.metaKey) {
        e.preventDefault(); // Browser zoom
    }
    const zoomIntensity = 0.1;
    const direction = e.deltaY > 0 ? -1 : 1;
    let newK = transform.k + direction * zoomIntensity;
    newK = Math.min(Math.max(0.5, newK), 2); // Clamp 50% - 200%

    // Zoom towards mouse
    const rect = containerRef.current!.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    const worldX = (mouseX - transform.x) / transform.k;
    const worldY = (mouseY - transform.y) / transform.k;

    const newX = mouseX - worldX * newK;
    const newY = mouseY - worldY * newK;

    setTransform({ x: newX, y: newY, k: newK });
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    // Right click or Space+Left for Pan
    if (e.button === 2 || (e.button === 0 && spacePressed.current)) {
      setDragMode('PAN');
      dragStartRef.current = { x: e.clientX, y: e.clientY };
      initialTransformRef.current = { ...transform };
      e.preventDefault(); // Prevent text select
      return;
    }

    // Canvas Click (Deselect)
    if (e.target === containerRef.current) {
        setSelectedNodeIds(new Set());
    }
  };

  const handleNodeMouseDown = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setDragMode('DRAG_NODE');
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    
    // Selection Logic
    const newSelection = new Set(selectedNodeIds);
    if (!e.shiftKey && !newSelection.has(id)) {
        newSelection.clear();
        newSelection.add(id);
    } else {
        newSelection.add(id);
    }
    setSelectedNodeIds(newSelection);

    // Snapshot positions for dragging
    initialNodePositionsRef.current = nodes.map(n => ({ id: n.id, x: n.x, y: n.y }));
  };

  const handleConnectStart = (e: React.MouseEvent, nodeId: string, type: 'source' | 'target') => {
    e.stopPropagation();
    e.preventDefault();
    connectionStartRef.current = { nodeId, type };
    setDragMode('CONNECT');
    const worldPos = screenToWorld(e.clientX, e.clientY);
    setTempConnection(worldPos);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (dragMode === 'PAN') {
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      setTransform({
        ...initialTransformRef.current,
        x: initialTransformRef.current.x + dx,
        y: initialTransformRef.current.y + dy,
      });
    } else if (dragMode === 'DRAG_NODE') {
      const dx = (e.clientX - dragStartRef.current.x) / transform.k;
      const dy = (e.clientY - dragStartRef.current.y) / transform.k;

      setNodes(prev => prev.map(n => {
        if (selectedNodeIds.has(n.id)) {
            const initial = initialNodePositionsRef.current.find(init => init.id === n.id);
            if (initial) {
                return { ...n, x: initial.x + dx, y: initial.y + dy };
            }
        }
        return n;
      }));
    } else if (dragMode === 'CONNECT') {
        const worldPos = screenToWorld(e.clientX, e.clientY);
        setTempConnection(worldPos);
    }
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (dragMode === 'CONNECT' && connectionStartRef.current) {
        // Check if dropped on a port
    }
    setDragMode('NONE');
    setTempConnection(null);
    connectionStartRef.current = null;
  };

  const handlePortMouseUp = (e: React.MouseEvent, nodeId: string, type: 'source' | 'target') => {
      e.stopPropagation();
      if (dragMode === 'CONNECT' && connectionStartRef.current) {
          const start = connectionStartRef.current;
          // Validate: Output -> Input only
          if (start.type === 'source' && type === 'target' && start.nodeId !== nodeId) {
              setConnections(prev => [...prev, {
                  id: generateId(),
                  sourceId: start.nodeId,
                  targetId: nodeId
              }]);
          }
      }
  };

  const deleteNode = (id: string) => {
      setNodes(prev => prev.filter(n => n.id !== id));
      setConnections(prev => prev.filter(c => c.sourceId !== id && c.targetId !== id));
  };

  const removeConnection = (id: string) => {
      setConnections(prev => prev.filter(c => c.id !== id));
  };

  // --- Rendering ---

  // SVG Paths
  const renderConnections = () => {
    return (
        <svg className="absolute top-0 left-0 w-full h-full pointer-events-none overflow-visible">
            {connections.map(conn => {
                const source = nodes.find(n => n.id === conn.sourceId);
                const target = nodes.find(n => n.id === conn.targetId);
                if (!source || !target) return null;

                // Adjust connection start/end points to better align with new visual structure
                // Assume ports are at approx top:100px relative to nodeY
                const portYOffset = 110; 

                const sx = source.x + source.width;
                const sy = source.y + portYOffset; // source.height / 2 in old logic
                const tx = target.x;
                const ty = target.y + portYOffset;
                
                // Bezier Curve
                const d = `M ${sx} ${sy} C ${sx + 80} ${sy}, ${tx - 80} ${ty}, ${tx} ${ty}`;

                return (
                    <g key={conn.id} className="pointer-events-auto cursor-pointer group" onClick={() => removeConnection(conn.id)}>
                        <path d={d} stroke="#71717a" strokeWidth={2 * transform.k} fill="none" className="group-hover:stroke-cyan-500 transition-colors"/>
                        <path d={d} stroke="transparent" strokeWidth={15 * transform.k} fill="none" /> {/* Hit area */}
                        <foreignObject x={(sx+tx)/2 - 10} y={(sy+ty)/2 - 10} width={20} height={20} className="opacity-0 group-hover:opacity-100 transition-opacity">
                             <div className="w-5 h-5 bg-zinc-800 rounded-full shadow flex items-center justify-center text-red-500 border border-zinc-600">
                                 <Icons.Scissors size={12}/>
                             </div>
                        </foreignObject>
                    </g>
                );
            })}
            {dragMode === 'CONNECT' && connectionStartRef.current && tempConnection && (
                <path 
                    d={`M ${
                        nodes.find(n => n.id === connectionStartRef.current?.nodeId)!.x + nodes.find(n => n.id === connectionStartRef.current?.nodeId)!.width 
                    } ${
                        nodes.find(n => n.id === connectionStartRef.current?.nodeId)!.y + 110
                    } L ${tempConnection.x} ${tempConnection.y}`}
                    stroke="#06b6d4" 
                    strokeWidth={2} 
                    strokeDasharray="5,5"
                    fill="none"
                />
            )}
        </svg>
    );
  };

  return (
    <div className="w-full h-screen overflow-hidden flex relative">
        <div 
            ref={containerRef}
            className="flex-1 w-full h-full relative grid-pattern cursor-grab active:cursor-grabbing"
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onDoubleClick={(e) => addNode(NodeType.TEXT_TO_IMAGE, screenToWorld(e.clientX, e.clientY).x, screenToWorld(e.clientX, e.clientY).y)}
        >
            {/* World Container */}
            <div 
                className="absolute origin-top-left"
                style={{ transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.k})` }}
            >
                {renderConnections()}
                
                {nodes.map(node => (
                    <BaseNode
                        key={node.id}
                        data={node}
                        selected={selectedNodeIds.has(node.id)}
                        onMouseDown={(e) => handleNodeMouseDown(e, node.id)}
                        scale={transform.k}
                        onConnectStart={(e, type) => handleConnectStart(e, node.id, type)}
                        onContextMenu={(e) => e.preventDefault()}
                    >
                        {/* Port Hit Areas for Drop are now inside BaseNode */}
                        <NodeContent 
                            data={node} 
                            updateData={updateNodeData} 
                            onGenerate={handleGenerate}
                        />
                    </BaseNode>
                ))}
            </div>

            {/* Sticky Zoom Indicator / Reset */}
            <div className="absolute bottom-6 right-6 bg-[#1A1D21] border border-zinc-700 px-3 py-1 rounded-full shadow-md text-xs text-gray-400 font-mono select-none">
                {Math.round(transform.k * 100)}%
            </div>
        </div>
    </div>
  );
};

export default Canvas;