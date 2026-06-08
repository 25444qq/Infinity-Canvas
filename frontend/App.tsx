
import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import Sidebar from './components/Sidebar';
import { NodeData, Connection, CanvasTransform, Point, DragMode, NodeType } from './types';
import BaseNode from './components/Nodes/BaseNode';
import { NodeContent } from './components/Nodes/NodeContent';
import { Icons } from './components/Icons';
import { generateCreativeDescription, generateImage, generateAudio, generateTextAnalyze, generateNovelLines, generateMergeAudio, loadModelRegistry, getAllModelConfigs, setModelConfigCache, upscaleImage } from './services/geminiService';
import { storageService } from './services/storageService';
import { ThemeSwitcher } from './components/ThemeSwitcher';
import { NovelLineItem, CharacterConfig } from './types';


function extractCharacterConfigs(lines: NovelLineItem[]): CharacterConfig[] {
    const speakers = [...new Set(
        lines
            .filter(l => l.speaker)
            .map(l => l.speaker!)
    )];
    return speakers.map(s => ({ character: s }));
}
import { SettingsModal } from './components/Settings/SettingsModal';
import { StorageModal } from './components/Settings/StorageModal';
import { ExportImportModal } from './components/Settings/ExportImportModal';

const DEFAULT_NODE_WIDTH = 320;
const DEFAULT_NODE_HEIGHT = 240; 
const EMPTY_ARRAY: string[] = [];

// Helper for resizing imported media constraints
export const calculateImportDimensions = (naturalWidth: number, naturalHeight: number) => {
    const ratio = naturalWidth / naturalHeight;
    const maxSide = 750;
    let width = naturalWidth;
    let height = naturalHeight;

    if (width > height) {
        if (width > maxSide) {
            width = maxSide;
            height = width / ratio;
        }
    } else {
        if (height > maxSide) {
            height = maxSide;
            width = height * ratio;
        }
    }
    return { width, height, ratio };
};

const App: React.FC = () => {
  return (
      <CanvasWithSidebar />
  );
};

const CanvasWithSidebar: React.FC = () => {
  const [nodes, setNodes] = useState<NodeData[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [transform, setTransform] = useState<CanvasTransform>({ x: 0, y: 0, k: 1 });
  const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(new Set());
  const [dragMode, setDragMode] = useState<DragMode | 'RESIZE_NODE' | 'SELECT'>('NONE');
  const dragModeRef = useRef(dragMode);
  
  // New Workflow Dialog State
  const [showNewWorkflowDialog, setShowNewWorkflowDialog] = useState(false);
  
  // Project Name State
  const [projectName, setProjectName] = useState('未命名项目');
  const [isEditingProjectName, setIsEditingProjectName] = useState(false);
  
  // Settings Modal State
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isStorageOpen, setIsStorageOpen] = useState(false);
  const [isExportImportOpen, setIsExportImportOpen] = useState(false);
  const [storageDirName, setStorageDirName] = useState<string | null>(null);

  // History State (Persist deleted nodes that have content)
  const [deletedNodes, setDeletedNodes] = useState<NodeData[]>([]);

  useEffect(() => {
      dragModeRef.current = dragMode;
  }, [dragMode]);

  // 清除 Sora 2 的旧配置（修复 endpoint 问题）
  useEffect(() => {
      if (typeof window !== 'undefined') {
          try {
              const sora2Key = `API_CONFIG_MODEL_Sora 2`;
              const stored = localStorage.getItem(sora2Key);
              if (stored) {
                  const parsed = JSON.parse(stored);
                  // 如果 endpoint 是旧的 chat completions，清除配置
                  if (parsed.endpoint === '/v1/chat/completions') {
                      localStorage.removeItem(sora2Key);
                      console.log('[App] Cleared old Sora 2 config with old endpoint');
                  }
              }
          } catch(e) {
              // 忽略错误
          }
      }
  }, []);

  // Default to light theme (white)
  const [canvasBg, setCanvasBg] = useState('#F5F7FA');
  const isDark = canvasBg === '#0B0C0E';
  
  // Sync body class for CSS variables
  useEffect(() => {
    if (isDark) {
      document.body.classList.add('dark');
    } else {
      document.body.classList.remove('dark');
    }
  }, [isDark]);

  // 从 Tornado 后端加载模型注册表和配置
  useEffect(() => {
    const initModels = async () => {
      try {
        await loadModelRegistry();
        const configs = await getAllModelConfigs();
        setModelConfigCache(configs);
        console.log('[App] Model registry and configs loaded from Tornado backend');
      } catch (e) {
        console.warn('[App] Failed to load model configs from backend:', e);
      }
    };
    initModels();
  }, []);

  const [selectionBox, setSelectionBox] = useState<{ x: number, y: number, w: number, h: number } | null>(null);
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);
  const [suggestedNodes, setSuggestedNodes] = useState<NodeData[]>([]);
  const [previewMedia, setPreviewMedia] = useState<{ url: string, type: 'image' } | null>(null);
  
  // Quick Add Menu State
  const [quickAddMenu, setQuickAddMenu] = useState<{ sourceId: string, x: number, y: number, worldX: number, worldY: number } | null>(null);

  const [contextMenu, setContextMenu] = useState<{ 
      type: 'CANVAS' | 'NODE', 
      nodeId?: string, 
      nodeType?: NodeType, 
      x: number, 
      y: number, 
      worldX: number, 
      worldY: number 
  } | null>(null);

  const [internalClipboard, setInternalClipboard] = useState<{ nodes: NodeData[], connections: Connection[] } | null>(null);

  // Workflow List Modal State
  const [showWorkflowListModal, setShowWorkflowListModal] = useState(false);
  const [workflowListItems, setWorkflowListItems] = useState<{ name: string; timestamp: number; filename: string }[]>([]);

  const containerRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef<{ x: number, y: number, w?: number, h?: number, nodeId?: string }>({ x: 0, y: 0 });
  const initialTransformRef = useRef<CanvasTransform>({ x: 0, y: 0, k: 1 });
  const initialNodePositionsRef = useRef<{id: string, x: number, y: number}[]>([]);
  const connectionStartRef = useRef<{ nodeId: string, type: 'source' | 'target' } | null>(null);
  const [tempConnection, setTempConnection] = useState<Point | null>(null);
  const lastMousePosRef = useRef<Point>({ x: 0, y: 0 }); 
  
  const workflowInputRef = useRef<HTMLInputElement>(null);
  const assetInputRef = useRef<HTMLInputElement>(null);
  const replaceImageRef = useRef<HTMLInputElement>(null);
  const nodeToReplaceRef = useRef<string | null>(null);
  const saveWorkflowDirRef = useRef<FileSystemDirectoryHandle | null>(null);
  const loadWorkflowDirRef = useRef<FileSystemDirectoryHandle | null>(null);
  const projectDirHandleRef = useRef<FileSystemDirectoryHandle | null>(null);

  const spacePressed = useRef(false);

  const screenToWorld = (x: number, y: number) => ({
    x: (x - transform.x) / transform.k,
    y: (y - transform.y) / transform.k,
  });

  const generateId = () => Math.random().toString(36).substr(2, 9);

  // Memoize inputs map to prevent array recreation on every render
  const inputsMap = useMemo(() => {
    const map: Record<string, string[]> = {};
    nodes.forEach(node => {
        map[node.id] = connections
            .filter(c => c.targetId === node.id)
            .map(c => nodes.find(n => n.id === c.sourceId))
            .filter(n => n && (n.imageSrc || n.audioSrc || n.prompt || n.decodedResult))
            .map(n => n!.decodedResult || n!.imageSrc || n!.audioSrc || n!.prompt || '');
    });
    return map;
  }, [nodes, connections]);

  const getInputImages = useCallback((nodeId: string) => {
    return inputsMap[nodeId] || EMPTY_ARRAY;
  }, [inputsMap]);
  
  const performCopy = () => {
      if (selectedNodeIds.size === 0) return;
      
      const selectedNodes = nodes.filter(n => selectedNodeIds.has(n.id));
      const selectedConnections = connections.filter(c => 
          selectedNodeIds.has(c.sourceId) && selectedNodeIds.has(c.targetId)
      );
      
      setInternalClipboard({ nodes: selectedNodes, connections: selectedConnections });
  };

  const performCut = () => {
      if (selectedNodeIds.size === 0) return;
      
      const selectedNodes = nodes.filter(n => selectedNodeIds.has(n.id));
      const selectedConnections = connections.filter(c => 
          selectedNodeIds.has(c.sourceId) && selectedNodeIds.has(c.targetId)
      );
      
      setInternalClipboard({ nodes: selectedNodes, connections: selectedConnections });
      selectedNodeIds.forEach(id => deleteNode(id));
  };

  const performPaste = (targetPos: Point) => {
      if (!internalClipboard || internalClipboard.nodes.length === 0) return;

      const { nodes: clipboardNodes, connections: clipboardConnections } = internalClipboard;
      
      let minX = Infinity, minY = Infinity;
      clipboardNodes.forEach(n => {
          if (n.x < minX) minX = n.x;
          if (n.y < minY) minY = n.y;
      });

      const idMap = new Map<string, string>();
      const newNodes: NodeData[] = [];

      clipboardNodes.forEach(node => {
          const newId = generateId();
          idMap.set(node.id, newId);
          const offsetX = node.x - minX;
          const offsetY = node.y - minY;
          newNodes.push({
              ...node,
              id: newId,
              x: targetPos.x + offsetX,
              y: targetPos.y + offsetY,
              title: node.title.endsWith('(Copy)') ? node.title : `${node.title} (Copy)`,
              isLoading: false,
          });
      });

      const newConnections: Connection[] = clipboardConnections.map(c => ({
          id: generateId(),
          sourceId: idMap.get(c.sourceId)!,
          targetId: idMap.get(c.targetId)!
      }));

      setNodes(prev => [...prev, ...newNodes]);
      setConnections(prev => [...prev, ...newConnections]);
      setSelectedNodeIds(new Set(newNodes.map(n => n.id)));
  };

  const handleAlign = useCallback((direction: 'UP' | 'DOWN' | 'LEFT' | 'RIGHT') => {
      if (selectedNodeIds.size < 2) return;

      setNodes(prevNodes => {
          const selected = prevNodes.filter(n => selectedNodeIds.has(n.id));
          const unselected = prevNodes.filter(n => !selectedNodeIds.has(n.id));
          const updatedNodes = selected.map(n => ({ ...n })); // Shallow clone to mutate

          const isVerticalAlign = direction === 'UP' || direction === 'DOWN';
          
          // Check overlap logic with Threshold to avoid accidental grouping
          const OVERLAP_THRESHOLD = 10;
          const isOverlap = (a: NodeData, b: NodeData) => {
              if (isVerticalAlign) {
                  const overlap = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
                  return overlap > OVERLAP_THRESHOLD;
              } else {
                  const overlap = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
                  return overlap > OVERLAP_THRESHOLD;
              }
          };

          const clusters: NodeData[][] = [];
          const visited = new Set<string>();

          for (const node of updatedNodes) {
              if (visited.has(node.id)) continue;
              const cluster = [node];
              visited.add(node.id);
              const queue = [node];

              while (queue.length > 0) {
                  const current = queue.shift()!;
                  for (const other of updatedNodes) {
                      if (!visited.has(other.id) && isOverlap(current, other)) {
                          visited.add(other.id);
                          cluster.push(other);
                          queue.push(other);
                      }
                  }
              }
              clusters.push(cluster);
          }

          const minTop = Math.min(...updatedNodes.map(n => n.y));
          const maxBottom = Math.max(...updatedNodes.map(n => n.y + n.height));
          const minLeft = Math.min(...updatedNodes.map(n => n.x));
          const maxRight = Math.max(...updatedNodes.map(n => n.x + n.width));

          const HORIZONTAL_GAP = 20; 
          const VERTICAL_GAP = 60;   

          clusters.forEach(cluster => {
              if (direction === 'UP') {
                  cluster.sort((a, b) => (a.y - b.y) || a.id.localeCompare(b.id));
                  let currentY = minTop;
                  cluster.forEach((node) => {
                      node.y = currentY;
                      currentY += node.height + VERTICAL_GAP;
                  });
              } else if (direction === 'DOWN') {
                  cluster.sort((a, b) => (b.y - a.y) || a.id.localeCompare(b.id)); 
                  let currentBottom = maxBottom;
                  cluster.forEach((node) => {
                      node.y = currentBottom - node.height;
                      currentBottom -= (node.height + VERTICAL_GAP);
                  });
              } else if (direction === 'LEFT') {
                  cluster.sort((a, b) => (a.x - b.x) || a.id.localeCompare(b.id));
                  let currentX = minLeft;
                  cluster.forEach((node) => {
                      node.x = currentX;
                      currentX += node.width + HORIZONTAL_GAP;
                  });
              } else if (direction === 'RIGHT') {
                  cluster.sort((a, b) => (b.x - a.x) || a.id.localeCompare(b.id)); 
                  let currentRight = maxRight;
                  cluster.forEach((node) => {
                      node.x = currentRight - node.width;
                      currentRight -= (node.width + HORIZONTAL_GAP);
                  });
              }
          });

          return [...unselected, ...updatedNodes];
      });
  }, [selectedNodeIds]);

  const addNode = (type: NodeType, x?: number, y?: number, dataOverride?: Partial<NodeData>) => {
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

    let w = dataOverride?.width || DEFAULT_NODE_WIDTH;
    let h = dataOverride?.height || DEFAULT_NODE_HEIGHT;

    if (type === NodeType.ORIGINAL_IMAGE) {
        h = dataOverride?.height || 240;
    } else if (type === NodeType.TEXT_TO_IMAGE || type === NodeType.IMAGE_TO_IMAGE) {
        if (!dataOverride?.width) w = 400;
        if (!dataOverride?.height) h = 400;
    } else if (type === NodeType.IMAGE_LOADER) {
        if (!dataOverride?.width) w = 256;
        if (!dataOverride?.height) h = 256;
    } else if (type === NodeType.TEXT_LOADER) {
        if (!dataOverride?.width) w = 400;
        if (!dataOverride?.height) h = 300;
    } else if (type === NodeType.AUDIO_LOADER) {
        if (!dataOverride?.width) w = 320;
        if (!dataOverride?.height) h = 200;
    } else if (type === NodeType.AUDIO_GEN) {
        if (!dataOverride?.width) w = 400;
        if (!dataOverride?.height) h = 300;
    } else if (type === NodeType.AUDIO_MERGE) {
        if (!dataOverride?.width) w = 400;
        if (!dataOverride?.height) h = 360;
    } else if (type === NodeType.TEXT_ANALYZE) {
        if (!dataOverride?.width) w = 400;
        if (!dataOverride?.height) h = 320;
    } else if (type === NodeType.CHARACTER_DISPLAY) {
        if (!dataOverride?.width) w = 400;
        if (!dataOverride?.height) h = 520;
    } else if (type === NodeType.SCENE_DISPLAY) {
        if (!dataOverride?.width) w = 400;
        if (!dataOverride?.height) h = 400;
    } else if (type === NodeType.NOVEL_LINES) {
        if (!dataOverride?.width) w = 580;
        if (!dataOverride?.height) h = 360;
    } else if (type === NodeType.IMAGE_UPSCALE) {
        if (!dataOverride?.width) w = 400;
        if (!dataOverride?.height) h = 400;
    }

    const getDefaultTitle = (t: NodeType) => {
        switch (t) {
            case NodeType.TEXT_TO_IMAGE: return '生图';
            case NodeType.CREATIVE_DESC: return '创意描述';
            case NodeType.IMAGE_LOADER: return '图片素材';
            case NodeType.TEXT_LOADER: return '文本素材';
            case NodeType.AUDIO_LOADER: return '音频素材';
            case NodeType.AUDIO_GEN: return '音频生成';
            case NodeType.AUDIO_MERGE: return '音频合并';
            case NodeType.TEXT_ANALYZE: return '文本格式化';
            case NodeType.CHARACTER_DISPLAY: return '角色展示';
            case NodeType.SCENE_DISPLAY: return '场景展示';
            case NodeType.NOVEL_LINES: return '多角色配音';
            case NodeType.IMAGE_UPSCALE: return '图片放大';
            default: return `原始图片_${Date.now()}`;
        }
    };

    const getDefaultModel = (t: NodeType) => {
        switch (t) {
            case NodeType.TEXT_TO_IMAGE:
                return 'Flux2';
            case NodeType.AUDIO_GEN:
                return 'Qwen3-TTS';
            case NodeType.TEXT_ANALYZE:
                return 'Qwen3.5-27B';
            case NodeType.IMAGE_UPSCALE:
                return 'RealESRGAN_x4plus';
            default:
                return '';
        }
    };
    
    const newNode: NodeData = {
      id: generateId(),
      type,
      x,
      y,
      width: w,
      height: h, 
      title: dataOverride?.title || getDefaultTitle(type),
      aspectRatio: dataOverride?.aspectRatio || '1:1',
      model: dataOverride?.model || getDefaultModel(type),
      resolution: dataOverride?.resolution || '1k',
      count: 1,
      prompt: dataOverride?.prompt || (type === NodeType.TEXT_ANALYZE ? '你是一个专业的文本处理专家，根据提示词处理文本。\n** 按语义自动拆分、重组小说段落，合理另起一行分段；\n** 统一修正、规范全文标点符号，修正错用漏用；\n** 所有人物对话统一用标准双引号（如："你好"）包裹，禁止使用「」；\n** 根据上下文剧情，自动补全每句对话对应的说话人，标注在对话前方；\n仅输出处理完成后的小说正文，不额外加说明、不保留原格式备注。' : ''),
      imageSrc: dataOverride?.imageSrc,
      outputArtifacts: dataOverride?.outputArtifacts || (dataOverride?.imageSrc ? [dataOverride.imageSrc] : [])
    };
    
    setNodes(prev => [...prev, newNode]);
    setSelectedNodeIds(new Set([newNode.id]));
  };

  const handleQuickAddNode = (type: NodeType) => {
      if (!quickAddMenu) return;

      const newId = generateId();
      let w = DEFAULT_NODE_WIDTH;
      let h = DEFAULT_NODE_HEIGHT;

      const isImageGenType = type === NodeType.TEXT_TO_IMAGE;

      if (type === NodeType.ORIGINAL_IMAGE) {
          h = 240;
      } else if (isImageGenType) {
          w = 400; h = 400;
      } else if (type === NodeType.IMAGE_LOADER) {
          w = 256; h = 256;
      } else if (type === NodeType.TEXT_LOADER) {
          w = 400; h = 300;
      } else if (type === NodeType.AUDIO_LOADER) {
          w = 320; h = 200;
      } else if (type === NodeType.AUDIO_GEN) {
          w = 400; h = 300;
      } else if (type === NodeType.AUDIO_MERGE) {
          w = 400; h = 360;
      } else if (type === NodeType.TEXT_ANALYZE) {
          w = 400; h = 320;
      } else if (type === NodeType.CHARACTER_DISPLAY) {
          w = 400; h = 700;
      } else if (type === NodeType.SCENE_DISPLAY) {
          w = 400; h = 400;
      } else if (type === NodeType.NOVEL_LINES) {
          w = 580; h = 360;
      }

      const getDefaultTitle = (t: NodeType) => {
          switch (t) {
              case NodeType.TEXT_TO_IMAGE: return '生图';
              case NodeType.CREATIVE_DESC: return '创意描述';
              case NodeType.IMAGE_LOADER: return '图片素材';
              case NodeType.TEXT_LOADER: return '文本素材';
              case NodeType.AUDIO_LOADER: return '音频素材';
              case NodeType.AUDIO_GEN: return '音频生成';
              case NodeType.AUDIO_MERGE: return '音频合并';
              case NodeType.TEXT_ANALYZE: return '文本格式化';
              case NodeType.CHARACTER_DISPLAY: return '角色展示';
              case NodeType.SCENE_DISPLAY: return '场景展示';
              case NodeType.NOVEL_LINES: return '多角色配音';
              default: return `原始图片_${Date.now()}`;
          }
      };

      const getDefaultModel = (t: NodeType) => {
          switch (t) {
              case NodeType.TEXT_TO_IMAGE:
                  return 'Flux2';
              case NodeType.AUDIO_GEN:
                  return 'Qwen3-TTS';
              case NodeType.TEXT_ANALYZE:
                  return 'Qwen3.5-27B';
              default:
                  return '';
          }
      };

      const newNode: NodeData = {
          id: newId,
          type,
          x: quickAddMenu.worldX,
          y: quickAddMenu.worldY - h / 2,
          width: w,
          height: h,
          title: getDefaultTitle(type),
          aspectRatio: '1:1',
          model: getDefaultModel(type),
          resolution: '1k',
          count: 1,
          prompt: type === NodeType.TEXT_ANALYZE ? '你是一个专业的文本处理专家，根据提示词处理文本。\n** 按语义自动拆分、重组小说段落，合理另起一行分段；\n** 统一修正、规范全文标点符号，修正错用漏用；\n** 所有人物对话统一用标准双引号（如："你好"）包裹，禁止使用「」，对话内容另起一行；\n** 说话动作（如“告诉他”、“说道”、“回答”等）及其所在句子应自成一段；\n** 根据上下文剧情，自动补全每句对话对应的说话人，标注在对话前方；\n** 每个自然段保持在100字以内，以句号分割长文本。\n仅输出处理完成后的小说正文，不额外加说明、不保留原格式备注。' : '',
          outputArtifacts: []
      };

      setNodes(prev => [...prev, newNode]);
      setConnections(prev => [...prev, { id: generateId(), sourceId: quickAddMenu.sourceId, targetId: newId }]);
      setQuickAddMenu(null);
  };

  const handlePaste = useCallback(async (e: ClipboardEvent) => {
    const activeElement = document.activeElement;
    const isInputFocused = activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement;
    if (isInputFocused) return;

    const items = e.clipboardData?.items;
    let hasSystemMedia = false;
    const mousePos = lastMousePosRef.current;
    const worldPos = screenToWorld(mousePos.x, mousePos.y);

    if (items) {
        for (let i = 0; i < items.length; i++) {
            const item = items[i] as DataTransferItem;
            if (item.type.indexOf('image') !== -1) {
                hasSystemMedia = true;
                const file = item.getAsFile();
                if (file) {
                    const reader = new FileReader();
                    reader.onload = (event) => {
                        const img = new Image();
                        img.onload = () => {
                            const { width, height, ratio } = calculateImportDimensions(img.width, img.height);
                            const src = event.target?.result as string;
                            addNode(NodeType.ORIGINAL_IMAGE, worldPos.x, worldPos.y, {
                                width, height, imageSrc: src, aspectRatio: `${ratio}:1`, outputArtifacts: [src]
                            });
                        };
                        img.src = event.target?.result as string;
                    };
                    reader.readAsDataURL(file);
                }
            }
        }
    }
    if (!hasSystemMedia && internalClipboard) performPaste(worldPos);
  }, [transform, internalClipboard]); 

  useEffect(() => {
    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [handlePaste]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        const target = e.target as HTMLElement;
        const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';
        if (!isInput) {
            if (e.key === 'Delete' || e.key === 'Backspace') {
                 if (selectedNodeIds.size > 0) {
                     const nodesToDelete = nodes.filter(n => selectedNodeIds.has(n.id));
                     const withContent = nodesToDelete.filter(n => n.imageSrc || n.audioSrc || n.decodedResult);
                     if (withContent.length > 0) {
                         setDeletedNodes(prev => [...prev, ...withContent]);
                     }
                     setNodes(prev => prev.filter(n => !selectedNodeIds.has(n.id)));
                     setConnections(prev => prev.filter(c => !selectedNodeIds.has(c.sourceId) && !selectedNodeIds.has(c.targetId)));
                     setSelectedNodeIds(new Set());
                 }
                 if (selectedConnectionId) {
                     setConnections(prev => prev.filter(c => c.id !== selectedConnectionId));
                     setSelectedConnectionId(null);
                 }
            }
            if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
                e.preventDefault();
                performCopy();
            }
            if ((e.ctrlKey || e.metaKey) && !e.shiftKey) {
                if (e.key === 'ArrowUp') { e.preventDefault(); handleAlign('UP'); }
                if (e.key === 'ArrowDown') { e.preventDefault(); handleAlign('DOWN'); }
                if (e.key === 'ArrowLeft') { e.preventDefault(); handleAlign('LEFT'); }
                if (e.key === 'ArrowRight') { e.preventDefault(); handleAlign('RIGHT'); }
            }
        }
        
        if (e.key === 'Escape') {
            if (previewMedia) setPreviewMedia(null);
            if (contextMenu) setContextMenu(null);
            if (quickAddMenu) setQuickAddMenu(null);
            if (showNewWorkflowDialog) setShowNewWorkflowDialog(false);
            if (isSettingsOpen) setIsSettingsOpen(false);
            if (isStorageOpen) setIsStorageOpen(false);
            if (isExportImportOpen) setIsExportImportOpen(false);
        }
        if (e.code === 'Space') spacePressed.current = true;
    };
    const handleKeyUp = (e: KeyboardEvent) => { if (e.code === 'Space') spacePressed.current = false; };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
        window.removeEventListener('keydown', handleKeyDown);
        window.removeEventListener('keyup', handleKeyUp);
    };
  }, [selectedNodeIds, selectedConnectionId, previewMedia, contextMenu, nodes, connections, quickAddMenu, showNewWorkflowDialog, isSettingsOpen, isStorageOpen, isExportImportOpen, handleAlign]);

  useEffect(() => {
    // Load storage directory name for the top-right indicator
    const loadStorageInfo = async () => {
        const name = await storageService.getDownloadDirectoryName();
        setStorageDirName(name);
    };
    if (isStorageOpen === false) {
        // Refresh when modal closes
        loadStorageInfo();
    }
    loadStorageInfo();
    
    const handleGlobalMouseUp = () => {
        if (dragModeRef.current !== 'NONE') {
            setDragMode('NONE');
            setTempConnection(null);
            connectionStartRef.current = null;
            dragStartRef.current = { x: 0, y: 0 };
            setSuggestedNodes([]);
            setSelectionBox(null);
        }
    };
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
  }, [isStorageOpen]);

  const handleOpenStorageSettings = () => {
      setIsStorageOpen(true);
  };

  const handleImportWorkflow = (data: { nodes: NodeData[], connections: Connection[], transform?: CanvasTransform, projectName?: string }) => {
      // 保存当前有内容的节点到历史
      const withContent = nodes.filter(n => n.imageSrc || n.audioSrc || n.decodedResult);
      if (withContent.length > 0) setDeletedNodes(prev => [...prev, ...withContent]);
      
      setNodes(data.nodes);
      setConnections(data.connections);
      if (data.transform) setTransform(data.transform);
      if (data.projectName) setProjectName(data.projectName);
      setSelectedNodeIds(new Set());
  };

  const updateNodeData = useCallback((id: string, updates: Partial<NodeData>) => {
    setNodes(prev => prev.map(n => n.id === id ? { ...n, ...updates } : n));
  }, []);

  const handleGenerate = async (nodeId: string, promptOverride?: string) => {
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return;
    updateNodeData(nodeId, { isLoading: true });
    
    const inputs = getInputImages(node.id);
    
    const promptToUse = promptOverride || node.prompt || '';
    
    console.log(`[Generation] Node: ${node.title} (${node.type}), Prompt:`, promptToUse.substring(0, 100) + '...');
    console.log(`[Generation] Input Images:`, inputs.length > 0 ? inputs.map(i => i.substring(0, 50) + '...') : 'None');

    try {
      if (node.type === NodeType.CREATIVE_DESC) {
        const res = await generateCreativeDescription(promptToUse);
        updateNodeData(nodeId, { optimizedPrompt: res, isLoading: false });
      } else {
          let results: string[] = [];
          
          // Image generation
          if (node.type === NodeType.TEXT_TO_IMAGE || node.type === NodeType.IMAGE_TO_IMAGE || node.type === NodeType.CHARACTER_DISPLAY || node.type === NodeType.SCENE_DISPLAY) {
            results = await generateImage(
                promptToUse, node.aspectRatio, node.model, node.resolution, node.count || 1, inputs, node.promptOptimize 
            );
          }
          // Image upscale (Real-ESRGAN)
          else if (node.type === NodeType.IMAGE_UPSCALE) {
            if (inputs.length === 0) throw new Error("缺少输入图片");
            const scale = node.upscaleScale || 4;
            const model = scale === 2 ? 'RealESRGAN_x2plus' : 'RealESRGAN_x4plus';
            const result = await upscaleImage(inputs[0], model, scale);
            results = [result.image];
          }
          // Audio generation
          else if (node.type === NodeType.AUDIO_GEN) {
            const textFromInputs = inputs.find(i => !i.startsWith('data:')) || '';
            const audioFromInputs = inputs.find(i => i.startsWith('data:audio/'));
            const textPrompt = node.prompt || textFromInputs || '';
            const result = await generateAudio(
                textPrompt,
                node.model || 'Qwen3-TTS',
                node.emotion,
                audioFromInputs,
                node.language,
                node.presetVoice,
                node.instruction
            );
            results = [result];
          }
          // Text format
          else if (node.type === NodeType.TEXT_ANALYZE) {
            const textFromInputs = inputs.find(i => i && !i.startsWith('data:')) || '';
            const result = await generateTextAnalyze(
                textFromInputs || node.prompt || '',
                node.model || 'Qwen3.5-27B'
            );
            results = [result];
          }
          // Novel lines processing
          else if (node.type === NodeType.NOVEL_LINES) {
            const textFromInputs = inputs.find(i => i && !i.startsWith('data:')) || '';
            const res = await generateNovelLines(
                textFromInputs || node.prompt || '',
                node.model || 'Qwen3.5-27B'
            );
            updateNodeData(nodeId, {
                isLoading: false,
                lineData: res.data || [],
                characterConfigs: extractCharacterConfigs(res.data || []),
            });
            return;
          }

          if (results.length > 0) {
              const currentArtifacts = node.outputArtifacts || [];
              if (node.imageSrc && !currentArtifacts.includes(node.imageSrc)) currentArtifacts.push(node.imageSrc);
              const newArtifacts = [...results, ...currentArtifacts];
              
              const updates: Partial<NodeData> = { isLoading: false, outputArtifacts: newArtifacts };
              
              // Set output based on node type
              if (node.type === NodeType.TEXT_TO_IMAGE || node.type === NodeType.IMAGE_TO_IMAGE || node.type === NodeType.CHARACTER_DISPLAY || node.type === NodeType.SCENE_DISPLAY || node.type === NodeType.IMAGE_UPSCALE) {
                  updates.imageSrc = results[0];
              } else if (node.type === NodeType.AUDIO_GEN) {
                  updates.audioSrc = results[0];
              } else if (node.type === NodeType.TEXT_ANALYZE) {
                  updates.decodedResult = results[0];
              }
              
              updateNodeData(nodeId, updates);
          } else {
              throw new Error("未返回结果");
          }
      }
    } catch (e) {
      console.error(e);
      alert(`生成失败: ${(e as Error).message}`);
      updateNodeData(nodeId, { isLoading: false });
    }
  };

  const handleMerge = async (nodeId: string) => {
    const node = nodes.find(n => n.id === nodeId);
    if (!node || !node._audioFiles || node._audioFiles.length < 2) return;

    updateNodeData(nodeId, { isMerging: true });

    try {
      const audioDataList = node._audioFiles.map(f => f.data);
      const result = await generateMergeAudio(audioDataList, 0.3);
      updateNodeData(nodeId, { 
        isMerging: false, 
        mergeAudioUrl: result.url 
      });
    } catch (e) {
      console.error(e);
      alert(`音频合并失败: ${(e as Error).message}`);
      updateNodeData(nodeId, { isMerging: false });
    }
  };

  const handleMaximize = (nodeId: string) => {
      const node = nodes.find(n => n.id === nodeId);
      if (!node) return;
      if (node.imageSrc) setPreviewMedia({ url: node.imageSrc, type: 'image' });
      else alert("没有可预览的内容");
  };
  
  const handleHistoryPreview = (url: string, type: 'image') => setPreviewMedia({ url, type });

  const copyImageToClipboard = async (nodeId: string) => {
      const node = nodes.find(n => n.id === nodeId);
      if (node && node.imageSrc) {
          try {
              const res = await fetch(node.imageSrc);
              const blob = await res.blob();
              await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob as Blob })]);
              alert("图片已复制到剪贴板");
          } catch (e) { console.error(e); alert("复制图片失败"); }
      }
  };

  const triggerReplaceImage = (nodeId: string) => {
      nodeToReplaceRef.current = nodeId;
      replaceImageRef.current?.click();
  };

  const handleReplaceImage = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      const nodeId = nodeToReplaceRef.current;
      if (file && nodeId) {
           const reader = new FileReader();
           reader.onload = (event) => {
               const img = new Image();
               img.onload = () => {
                   const node = nodes.find(n => n.id === nodeId);
                   if (node) {
                        const { width, height, ratio } = calculateImportDimensions(img.width, img.height);
                        const src = event.target?.result as string;
                        const currentArtifacts = node.outputArtifacts || [];
                        const newArtifacts = [src, ...currentArtifacts];
                        updateNodeData(nodeId, { 
                            imageSrc: src, 
                            width, height,
                            aspectRatio: `${ratio}:1`, 
                            outputArtifacts: newArtifacts
                        });
                   }
               };
               img.src = event.target?.result as string;
           };
           reader.readAsDataURL(file);
      }
      if (replaceImageRef.current) replaceImageRef.current.value = '';
      nodeToReplaceRef.current = null;
  };

  const handleSaveWorkflow = async () => {
    if (!projectName || projectName === '未命名项目') {
      alert('请先设置项目名称');
      return;
    }

    try {
      // Request or use existing workflow directory
      let workflowDir: FileSystemDirectoryHandle;
      
      if (saveWorkflowDirRef.current) {
        const permission = await saveWorkflowDirRef.current.queryPermission({ mode: 'readwrite' });
        if (permission === 'granted') {
          workflowDir = saveWorkflowDirRef.current;
        } else {
          const requested = await saveWorkflowDirRef.current.requestPermission({ mode: 'readwrite' });
          if (requested !== 'granted') throw new Error('Permission denied');
          workflowDir = saveWorkflowDirRef.current;
        }
      } else {
        workflowDir = await window.showDirectoryPicker({
          mode: 'readwrite',
          id: 'workflow'
        });
        saveWorkflowDirRef.current = workflowDir;
      }

      // Ensure workflow subdirectory exists
      let workflowSubdir: FileSystemDirectoryHandle;
      try {
        workflowSubdir = await workflowDir.getDirectoryHandle('workflow', { create: true });
      } catch (e) {
        throw new Error('Failed to create workflow directory');
      }

      // Save JSON file
      const workflowData = { nodes, connections, transform, projectName, version: "1.0", savedAt: new Date().toISOString() };
      const jsonBlob = new Blob([JSON.stringify(workflowData, null, 2)], { type: "application/json" });
      const jsonFileHandle = await workflowSubdir.getFileHandle(`${projectName}.json`, { create: true });
      const writable = await jsonFileHandle.createWritable();
      await writable.write(jsonBlob);
      await writable.close();

      // Read existing CSV or create new
      let csvContent = 'name,timestamp,filename\n';
      try {
        const csvFileHandle = await workflowSubdir.getFileHandle('workflows.csv');
        const csvFile = await csvFileHandle.getFile();
        csvContent = await csvFile.text();
      } catch (e) {
        // CSV doesn't exist yet, will create new one
      }

      // Check if project name already exists in CSV and remove old entry
      const lines = csvContent.split('\n').filter(line => line.trim());
      const existingEntries = lines.slice(1).filter(line => !line.startsWith(`${projectName},`));
      
      // Add new entry with timestamp
      const timestamp = Date.now();
      const newEntry = `${projectName},${timestamp},${projectName}.json`;
      csvContent = [...existingEntries, newEntry].join('\n') + '\n';

      // Write updated CSV
      const csvFileHandle = await workflowSubdir.getFileHandle('workflows.csv', { create: true });
      const csvWritable = await csvFileHandle.createWritable();
      await csvWritable.write(csvContent);
      await csvWritable.close();

      alert(`工作流 "${projectName}" 已保存到 workflow 文件夹！`);
    } catch (error) {
      if (error instanceof Error && error.message === 'Permission denied') {
        alert('权限被拒绝，无法保存文件');
      } else {
        console.error('Failed to save workflow:', error);
        alert('保存工作流失败，请重试');
      }
    }
  };

  const handleSaveProject = async () => {
    if (!projectName || projectName === '未命名项目') {
      alert('请先设置项目名称');
      return;
    }

    try {
      // 复用已有权限或让用户选择目录
      let dirHandle: FileSystemDirectoryHandle;
      if (projectDirHandleRef.current) {
        const perm = await projectDirHandleRef.current.queryPermission({ mode: 'readwrite' });
        if (perm === 'granted') {
          dirHandle = projectDirHandleRef.current;
        } else {
          const req = await projectDirHandleRef.current.requestPermission({ mode: 'readwrite' });
          if (req !== 'granted') {
            projectDirHandleRef.current = null;
            dirHandle = await window.showDirectoryPicker({ mode: 'readwrite', id: 'project' });
          } else {
            dirHandle = projectDirHandleRef.current;
          }
        }
      } else {
        dirHandle = await window.showDirectoryPicker({ mode: 'readwrite', id: 'project' });
      }
      projectDirHandleRef.current = dirHandle;
      
      const safeName = projectName.replace(/[<>:"/\\|?*]/g, '_').trim();
      
      // 创建项目文件夹
      const projectDir = await dirHandle.getDirectoryHandle(safeName, { create: true });
      
      // 创建子文件夹
      const imagesDir = await projectDir.getDirectoryHandle('images', { create: true });
      const audioDir = await projectDir.getDirectoryHandle('audio', { create: true });
      try { await projectDir.getDirectoryHandle('text', { create: true }); } catch {} // keep text dir for compatibility
      
      let imageIdx = 0;
      let audioIdx = 0;
      
      // 保存 blob 到目录的辅助函数
      const saveBlobToDir = async (dir: FileSystemDirectoryHandle, prefix: string, idx: number, dataUrl: string, defaultExt: string) => {
        let ext = defaultExt;
        if (dataUrl.startsWith('data:image/')) {
          const match = dataUrl.match(/data:image\/(\w+);/);
          if (match) ext = '.' + match[1];
        } else if (dataUrl.startsWith('data:audio/')) {
          const match = dataUrl.match(/data:audio\/(\w+);/);
          if (match) ext = '.' + match[1];
        }
        const filename = `${prefix}_${idx}${ext}`;
        try {
          const fileHandle = await dir.getFileHandle(filename, { create: true });
          const writable = await fileHandle.createWritable();
          const response = await fetch(dataUrl);
          const blob = await response.blob();
          await writable.write(blob);
          await writable.close();
        } catch (e) {
          console.warn(`Failed to save resource ${filename}:`, e);
        }
        return filename;
      };
      
      // 处理节点并保存资源
      const exportNodes = [];
      for (const node of nodes) {
        const newNode = { ...node };
        
        // 保存图片资源 (imageSrc)
        if (node.imageSrc && (node.imageSrc.startsWith('data:') || node.imageSrc.startsWith('blob:'))) {
          imageIdx++;
          const filename = await saveBlobToDir(imagesDir, 'image', imageIdx, node.imageSrc, '.png');
          newNode.imageSrc = `images/${filename}`;
        }
        
        // 保存生成的角色参考图 (generatedImage)
        if (node.generatedImage && (node.generatedImage.startsWith('data:') || node.generatedImage.startsWith('blob:'))) {
          imageIdx++;
          const filename = await saveBlobToDir(imagesDir, 'image', imageIdx, node.generatedImage, '.png');
          newNode.generatedImage = `images/${filename}`;
        }
        
        // 保存输出图集 (outputArtifacts)
        if (node.outputArtifacts && node.outputArtifacts.length > 0) {
          const newArtifacts: string[] = [];
          for (const artifact of node.outputArtifacts) {
            if (artifact.startsWith('data:') || artifact.startsWith('blob:')) {
              imageIdx++;
              const filename = await saveBlobToDir(imagesDir, 'image', imageIdx, artifact, '.png');
              newArtifacts.push(`images/${filename}`);
            } else {
              newArtifacts.push(artifact);
            }
          }
          newNode.outputArtifacts = newArtifacts;
        }
        
        // 保存音频资源 (audioSrc)
        if (node.audioSrc && (node.audioSrc.startsWith('data:') || node.audioSrc.startsWith('blob:'))) {
          audioIdx++;
          const filename = await saveBlobToDir(audioDir, 'audio', audioIdx, node.audioSrc, '.wav');
          newNode.audioSrc = `audio/${filename}`;
        }
        
        // 保存合成音频 (mergeAudioUrl)
        if (node.mergeAudioUrl && (node.mergeAudioUrl.startsWith('data:') || node.mergeAudioUrl.startsWith('blob:'))) {
          audioIdx++;
          const filename = await saveBlobToDir(audioDir, 'audio', audioIdx, node.mergeAudioUrl, '.wav');
          newNode.mergeAudioUrl = `audio/${filename}`;
        }
        
        // 保存音频文件集合 (_audioFiles)
        if (node._audioFiles && node._audioFiles.length > 0) {
          const newAudioFiles = [];
          for (const af of node._audioFiles) {
            if (af.data && (af.data.startsWith('data:') || af.data.startsWith('blob:'))) {
              audioIdx++;
              const filename = await saveBlobToDir(audioDir, 'audio', audioIdx, af.data, '.wav');
              newAudioFiles.push({ ...af, data: `audio/${filename}` });
            } else {
              newAudioFiles.push(af);
            }
          }
          newNode._audioFiles = newAudioFiles;
        }
        
        // 保存台词音频 (lineData[].audioUrl)
        if (node.lineData && node.lineData.length > 0) {
          const newLineData = [];
          for (const line of node.lineData) {
            const newLine = { ...line };
            if (line.audioUrl && (line.audioUrl.startsWith('data:') || line.audioUrl.startsWith('blob:'))) {
              audioIdx++;
              const filename = await saveBlobToDir(audioDir, 'audio', audioIdx, line.audioUrl, '.wav');
              newLine.audioUrl = `audio/${filename}`;
            }
            newLineData.push(newLine);
          }
          newNode.lineData = newLineData;
        }
        
        // 保存角色参考音频 (characterConfigs[].refAudio)
        if (node.characterConfigs && node.characterConfigs.length > 0) {
          const newConfigs = [];
          for (const cc of node.characterConfigs) {
            const newCC = { ...cc };
            if (cc.refAudio && (cc.refAudio.startsWith('data:') || cc.refAudio.startsWith('blob:'))) {
              audioIdx++;
              const filename = await saveBlobToDir(audioDir, 'audio', audioIdx, cc.refAudio, '.wav');
              newCC.refAudio = `audio/${filename}`;
            }
            newConfigs.push(newCC);
          }
          newNode.characterConfigs = newConfigs;
        }
        
        // 保存文本内容 (decodedResult) - 保持内联在 JSON 中
        // 仅二进制资源（图片/音频）才提取到文件
        
        exportNodes.push(newNode);
      }
      
      // 保存项目 JSON
      const projectData = {
        version: "2.0",
        projectName,
        savedAt: new Date().toISOString(),
        nodes: exportNodes,
        connections,
        transform
      };
      
      const projectFile = await projectDir.getFileHandle('project.json', { create: true });
      const projectWritable = await projectFile.createWritable();
      await projectWritable.write(JSON.stringify(projectData, null, 2));
      await projectWritable.close();
      
      alert(`项目 "${projectName}" 已保存到文件夹 "${safeName}"！`);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return;
      console.error('Failed to save project:', error);
      alert('保存项目失败，请重试');
    }
  };

  const handleLoadProject = async () => {
    try {
      // 复用已授权的目录句柄
      let dirHandle: FileSystemDirectoryHandle;
      if (projectDirHandleRef.current) {
        const perm = await projectDirHandleRef.current.queryPermission({ mode: 'read' });
        if (perm === 'granted') {
          dirHandle = projectDirHandleRef.current;
        } else {
          const req = await projectDirHandleRef.current.requestPermission({ mode: 'read' });
          if (req !== 'granted') {
            projectDirHandleRef.current = null;
            dirHandle = await window.showDirectoryPicker({ mode: 'read', id: 'project' });
          } else {
            dirHandle = projectDirHandleRef.current;
          }
        }
      } else {
        dirHandle = await window.showDirectoryPicker({ mode: 'read', id: 'project' });
      }
      projectDirHandleRef.current = dirHandle;
      
      // Find project.json
      let projectData: any = null;
      let projectDir = dirHandle;
      
      // Check if the selected folder itself contains project.json
      try {
        const fileHandle = await dirHandle.getFileHandle('project.json');
        const file = await fileHandle.getFile();
        const text = await file.text();
        projectData = JSON.parse(text);
      } catch {
        // Maybe the user selected a parent folder, try looking for subfolders with project.json
        const entries = dirHandle as any;
        for await (const [name, handle] of (dirHandle as any).entries?.() || []) {
          if (handle.kind === 'directory') {
            try {
              const subFileHandle = await handle.getFileHandle('project.json');
              const subFile = await subFileHandle.getFile();
              const text = await subFile.text();
              projectData = JSON.parse(text);
              projectDir = handle;
              break;
            } catch { continue; }
          }
        }
      }
      
      if (!projectData || !projectData.nodes) {
        alert('未找到有效的项目文件 (project.json)，请确保选择了正确的项目文件夹');
        return;
      }
      
      // Resolve relative asset paths back to data URLs
      const resolveAsset = async (assetDir: FileSystemDirectoryHandle, path: string): Promise<string> => {
        try {
          // Extract filename from path like "images/image_1.png"
          const filename = path.split('/').pop() || path;
          const fileHandle = await assetDir.getFileHandle(filename);
          const file = await fileHandle.getFile();
          const reader = new FileReader();
          return new Promise((resolve) => {
            reader.onload = () => resolve(reader.result as string);
            reader.readAsDataURL(file);
          });
        } catch (e) {
          console.warn(`Failed to resolve asset: ${path}`, e);
          return path; // return original path if not found
        }
      };
      
      // Get subdirectories if they exist
      let imagesDir: FileSystemDirectoryHandle | null = null;
      let audioDir: FileSystemDirectoryHandle | null = null;
      
      try { imagesDir = await projectDir.getDirectoryHandle('images'); } catch {}
      try { audioDir = await projectDir.getDirectoryHandle('audio'); } catch {}
      
      // Resolve all node assets
      const loadedNodes: NodeData[] = [];
      for (const node of projectData.nodes) {
        const newNode = { ...node };
        
        // Resolve images (paths like "images/image_1.png")
        if (imagesDir) {
          if (node.imageSrc && node.imageSrc.startsWith('images/')) {
            newNode.imageSrc = await resolveAsset(imagesDir, node.imageSrc);
          }
          if (node.generatedImage && node.generatedImage.startsWith('images/')) {
            newNode.generatedImage = await resolveAsset(imagesDir, node.generatedImage);
          }
          if (node.outputArtifacts && node.outputArtifacts.length > 0) {
            const artifacts: string[] = [];
            for (const a of node.outputArtifacts) {
              artifacts.push(a.startsWith('images/') ? await resolveAsset(imagesDir, a) : a);
            }
            newNode.outputArtifacts = artifacts;
          }
        }
        
        // Resolve audio
        if (audioDir) {
          if (node.audioSrc && (node.audioSrc.startsWith('audio/'))) {
            newNode.audioSrc = await resolveAsset(audioDir, node.audioSrc);
          }
          if (node.mergeAudioUrl && (node.mergeAudioUrl.startsWith('audio/'))) {
            newNode.mergeAudioUrl = await resolveAsset(audioDir, node.mergeAudioUrl);
          }
          if (node._audioFiles && node._audioFiles.length > 0) {
            const newFiles = [];
            for (const af of node._audioFiles) {
              if (af.data && (af.data.startsWith('audio/'))) {
                newFiles.push({ ...af, data: await resolveAsset(audioDir, af.data) });
              } else {
                newFiles.push(af);
              }
            }
            newNode._audioFiles = newFiles;
          }
          if (node.lineData && node.lineData.length > 0) {
            const newLines = [];
            for (const line of node.lineData) {
              if (line.audioUrl && (line.audioUrl.startsWith('audio/'))) {
                newLines.push({ ...line, audioUrl: await resolveAsset(audioDir, line.audioUrl) });
              } else {
                newLines.push(line);
              }
            }
            newNode.lineData = newLines;
          }
          if (node.characterConfigs && node.characterConfigs.length > 0) {
            const newConfigs = [];
            for (const cc of node.characterConfigs) {
              if (cc.refAudio && (cc.refAudio.startsWith('audio/'))) {
                newConfigs.push({ ...cc, refAudio: await resolveAsset(audioDir, cc.refAudio) });
              } else {
                newConfigs.push(cc);
              }
            }
            newNode.characterConfigs = newConfigs;
          }
        }
        
        loadedNodes.push(newNode);
      }
      
      // Load onto canvas
      setNodes([]);
      setConnections([]);
      setTransform({ x: 0, y: 0, k: 1 });
      
      setNodes(loadedNodes);
      setConnections(projectData.connections || []);
      if (projectData.transform) setTransform(projectData.transform);
      setProjectName(projectData.projectName || '未命名项目');
      
      alert(`项目 "${projectData.projectName}" 加载成功！`);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return;
      console.error('Failed to load project:', error);
      alert('加载项目失败，请重试');
    }
  };

  const handleLoadWorkflow = async () => {
    try {
      let workflowDir: FileSystemDirectoryHandle;
      
      if (loadWorkflowDirRef.current) {
        const permission = await loadWorkflowDirRef.current.queryPermission({ mode: 'read' });
        if (permission === 'granted') {
          workflowDir = loadWorkflowDirRef.current;
        } else {
          const requested = await loadWorkflowDirRef.current.requestPermission({ mode: 'read' });
          if (requested !== 'granted') throw new Error('Permission denied');
          workflowDir = loadWorkflowDirRef.current;
        }
      } else {
        workflowDir = await window.showDirectoryPicker({
          mode: 'read',
          id: 'workflow'
        });
        loadWorkflowDirRef.current = workflowDir;
      }

      // Get workflow subdirectory
      let workflowSubdir: FileSystemDirectoryHandle;
      try {
        workflowSubdir = await workflowDir.getDirectoryHandle('workflow', { create: true });
      } catch (e) {
        alert('未找到 workflow 文件夹');
        return;
      }

      // Read CSV file from workflow subdirectory
      let csvFileHandle: FileSystemFileHandle;
      try {
        csvFileHandle = await workflowSubdir.getFileHandle('workflows.csv');
      } catch (e) {
        alert('未找到 workflows.csv 文件');
        return;
      }

      const csvFile = await csvFileHandle.getFile();
      const csvText = await csvFile.text();
      
      // Parse CSV
      const lines = csvText.split('\n').filter(line => line.trim() && !line.startsWith('name,timestamp,filename'));
      if (lines.length === 0) {
        alert('CSV 文件中没有工作流记录');
        return;
      }

      const items: Array<{ name: string; timestamp: number; filename: string }> = lines.map(line => {
        const [name, timestampStr, filename] = line.split(',');
        return { name: name.trim(), timestamp: parseInt(timestampStr.trim()), filename: filename.trim() };
      }).sort((a, b) => b.timestamp - a.timestamp);

      setWorkflowListItems(items);
      setShowWorkflowListModal(true);
    } catch (error) {
      if (error instanceof Error && error.message === 'Permission denied') {
        alert('权限被拒绝，无法读取文件');
      } else {
        console.error('Failed to load workflow list:', error);
        alert('加载工作流列表失败，请重试');
      }
    }
  };

  const handleLoadWorkflowItem = async (filename: string, name: string) => {
    try {
      if (!loadWorkflowDirRef.current) return;

      let workflowSubdir: FileSystemDirectoryHandle;
      try {
        workflowSubdir = await loadWorkflowDirRef.current.getDirectoryHandle('workflow', { create: true });
      } catch (e) {
        console.error('Failed to get workflow directory:', e);
        alert('未找到 workflow 文件夹，请确保在正确的目录中');
        return;
      }

      const fileHandle = await workflowSubdir.getFileHandle(filename);
      const file = await fileHandle.getFile();
      const text = await file.text();
      
      const data = JSON.parse(text);
      if (data.nodes && data.connections) {
        // Clear current canvas
        setNodes([]);
        setConnections([]);
        setTransform({ x: 0, y: 0, k: 1 });
        
        // Load saved workflow
        setNodes(data.nodes);
        setConnections(data.connections);
        if (data.transform) setTransform(data.transform);
        setProjectName(name);
      }
      
      setShowWorkflowListModal(false);
    } catch (error) {
      console.error('Failed to load workflow:', error);
      alert('加载工作流失败，请重试');
    }
  };

  const handleNewWorkflow = () => setShowNewWorkflowDialog(true);
  
  const handleConfirmNew = (shouldSave: boolean) => {
    if (shouldSave) handleSaveWorkflow();
    const withContent = nodes.filter(n => n.imageSrc || n.audioSrc || n.decodedResult);
    if (withContent.length > 0) setDeletedNodes(prev => [...prev, ...withContent]);
    setNodes([]);
    setConnections([]);
    setTransform({ x: 0, y: 0, k: 1 });
    setProjectName('未命名项目');
    setShowNewWorkflowDialog(false);
    setSelectedNodeIds(new Set());
    setSelectionBox(null);
  };

  const handleDownload = async (nodeId: string) => {
      const node = nodes.find(n => n.id === nodeId);
      if (!node) return;
      const url = node.imageSrc || node.audioSrc;
      if (!url) { 
          alert("没有可下载的内容"); 
          return; 
      }
      
      // Determine extension based on content type
      let ext = 'png';
      if (node.audioSrc) {
          // Check audio format from URL or default to wav
          if (url.includes('.mp3') || url.includes('mp3')) ext = 'mp3';
          else ext = 'wav';
      }
      
      const filename = `${node.title.replace(/\s+/g, '_')}_${Date.now()}.${ext}`;

      try {
          const response = await fetch(url);
          const blob = await response.blob();
          
          // 直接使用浏览器下载
          const blobUrl = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = blobUrl;
          link.download = filename;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(blobUrl);
      } catch (e) {
          console.error('Download failed:', e);
          // 备用方案：直接打开链接
          const link = document.createElement('a');
          link.href = url;
          link.download = filename;
          link.target = "_blank"; 
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
      }
  };

  const handleImportAsset = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const rect = containerRef.current?.getBoundingClientRect();
    const center = rect ? screenToWorld(rect.width / 2, rect.height / 2) : { x: 0, y: 0 };
    
    if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                 const { width, height, ratio } = calculateImportDimensions(img.width, img.height);
                 const src = event.target?.result as string;
                 addNode(NodeType.ORIGINAL_IMAGE, center.x - width/2, center.y - height/2, {
                     width, height, imageSrc: src, aspectRatio: `${ratio}:1`, outputArtifacts: [src]
                 });
            };
            img.src = event.target?.result as string;
        };
        reader.readAsDataURL(file);
    }
    e.target.value = '';
  };

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); };

  const handleDrop = (e: React.DragEvent) => {
      e.preventDefault(); e.stopPropagation();
      const files: File[] = Array.from(e.dataTransfer.files); 
      if (files.length === 0) return;
      const worldPos = screenToWorld(e.clientX, e.clientY);
      files.forEach((file, index) => {
          const offsetX = index * 20; const offsetY = index * 20;
          if (file.type.startsWith('image/')) {
              const reader = new FileReader();
              reader.onload = (event) => {
                  const src = event.target?.result as string;
                  const img = new Image();
                  img.onload = () => {
                       const { width, height, ratio } = calculateImportDimensions(img.width, img.height);
                       addNode(NodeType.ORIGINAL_IMAGE, worldPos.x - width/2 + offsetX, worldPos.y - height/2 + offsetY, {
                           width, height, imageSrc: src, aspectRatio: `${ratio}:1`, outputArtifacts: [src]
                       });
                  };
                  img.src = src;
              };
              reader.readAsDataURL(file);
          }
      });
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (!e.shiftKey) return;
    if (e.ctrlKey || e.metaKey) e.preventDefault();
    const zoomIntensity = 0.1;
    const direction = e.deltaY > 0 ? -1 : 1;
    let newK = transform.k + direction * zoomIntensity;
    newK = Math.min(Math.max(0.4, newK), 2); 
    const rect = containerRef.current!.getBoundingClientRect();
    const worldX = (e.clientX - rect.left - transform.x) / transform.k;
    const worldY = (e.clientY - rect.top - transform.y) / transform.k;
    setTransform({ x: (e.clientX - rect.left) - worldX * newK, y: (e.clientY - rect.top) - worldY * newK, k: newK });
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (contextMenu) setContextMenu(null);
    if (quickAddMenu) setQuickAddMenu(null);
    if (selectedConnectionId) setSelectedConnectionId(null);
    if (e.button === 1 || (e.button === 0 && spacePressed.current)) {
      setDragMode('PAN');
      dragStartRef.current = { x: e.clientX, y: e.clientY };
      initialTransformRef.current = { ...transform };
      e.preventDefault(); return;
    }
    if (e.target === containerRef.current && e.button === 0) {
        setDragMode('SELECT');
        dragStartRef.current = { x: e.clientX, y: e.clientY };
        setSelectionBox({ x: 0, y: 0, w: 0, h: 0 }); 
        if (!e.shiftKey) setSelectedNodeIds(new Set());
    }
  };

  const handleNodeMouseDown = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (contextMenu) setContextMenu(null);
    if (quickAddMenu) setQuickAddMenu(null);
    if (selectedConnectionId) setSelectedConnectionId(null);
    if (e.button === 0) {
        setDragMode('DRAG_NODE');
        dragStartRef.current = { x: e.clientX, y: e.clientY };
        const isAlreadySelected = selectedNodeIds.has(id);
        let newSelection = new Set(selectedNodeIds);
        if (e.shiftKey) { isAlreadySelected ? newSelection.delete(id) : newSelection.add(id); } else { if (!isAlreadySelected) { newSelection.clear(); newSelection.add(id); } }
        setSelectedNodeIds(newSelection);
        initialNodePositionsRef.current = nodes.map(n => ({ id: n.id, x: n.x, y: n.y }));
    }
  };

  const handleNodeContextMenu = (e: React.MouseEvent, id: string, type: NodeType) => {
      e.stopPropagation(); e.preventDefault();
      const worldPos = screenToWorld(e.clientX, e.clientY);
      setContextMenu({ type: 'NODE', nodeId: id, nodeType: type, x: e.clientX, y: e.clientY, worldX: worldPos.x, worldY: worldPos.y });
      if (!selectedNodeIds.has(id)) setSelectedNodeIds(new Set([id]));
  };

  const handleCanvasContextMenu = (e: React.MouseEvent) => {
      e.preventDefault();
      const worldPos = screenToWorld(e.clientX, e.clientY);
      setContextMenu({ type: 'CANVAS', x: e.clientX, y: e.clientY, worldX: worldPos.x, worldY: worldPos.y });
  };

  const handleResizeStart = (e: React.MouseEvent, nodeId: string) => {
      e.stopPropagation(); e.preventDefault();
      const node = nodes.find(n => n.id === nodeId);
      if (!node) return;
      setDragMode('RESIZE_NODE');
      dragStartRef.current = { x: e.clientX, y: e.clientY, w: node.width, h: node.height, nodeId: nodeId };
      setSelectedNodeIds(new Set([nodeId]));
  };

  const handleConnectStart = (e: React.MouseEvent, nodeId: string, type: 'source' | 'target') => {
    e.stopPropagation(); e.preventDefault();
    connectionStartRef.current = { nodeId, type };
    setDragMode('CONNECT');
    setTempConnection(screenToWorld(e.clientX, e.clientY));
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    lastMousePosRef.current = { x: e.clientX, y: e.clientY };
    const worldPos = screenToWorld(e.clientX, e.clientY);
    if (dragMode !== 'NONE' && e.buttons === 0) { setDragMode('NONE'); dragStartRef.current = { x: 0, y: 0 }; return; }
    if (dragMode === 'PAN') {
      setTransform({ ...initialTransformRef.current, x: initialTransformRef.current.x + (e.clientX - dragStartRef.current.x), y: initialTransformRef.current.y + (e.clientY - dragStartRef.current.y) });
    } else if (dragMode === 'DRAG_NODE') {
      const dx = (e.clientX - dragStartRef.current.x) / transform.k;
      const dy = (e.clientY - dragStartRef.current.y) / transform.k;
      setNodes(prev => prev.map(n => { if (selectedNodeIds.has(n.id)) { const initial = initialNodePositionsRef.current.find(init => init.id === n.id); if (initial) return { ...n, x: initial.x + dx, y: initial.y + dy }; } return n; }));
    } else if (dragMode === 'SELECT') {
        const x = Math.min(dragStartRef.current.x, e.clientX);
        const y = Math.min(dragStartRef.current.y, e.clientY);
        const w = Math.abs(e.clientX - dragStartRef.current.x);
        const h = Math.abs(e.clientY - dragStartRef.current.y);
        setSelectionBox({ x: x - containerRef.current!.getBoundingClientRect().left, y: y - containerRef.current!.getBoundingClientRect().top, w, h });
        const worldStartX = (x - containerRef.current!.getBoundingClientRect().left - transform.x) / transform.k;
        const worldStartY = (y - containerRef.current!.getBoundingClientRect().top - transform.y) / transform.k;
        const worldWidth = w / transform.k; const worldHeight = h / transform.k;
        const newSelection = new Set<string>();
        nodes.forEach(n => { if (n.x < worldStartX + worldWidth && n.x + n.width > worldStartX && n.y < worldStartY + worldHeight && n.y + n.height > worldStartY) newSelection.add(n.id); });
        setSelectedNodeIds(newSelection);
    } else if (dragMode === 'CONNECT') {
        setTempConnection(worldPos);
        if (connectionStartRef.current?.type === 'source') {
            const candidates = nodes.filter(n => n.id !== connectionStartRef.current?.nodeId).filter(n => n.type !== NodeType.ORIGINAL_IMAGE)
                .map(n => ({ node: n, dist: Math.sqrt(Math.pow(worldPos.x - (n.x + n.width/2), 2) + Math.pow(worldPos.y - (n.y + n.height/2), 2)) }))
                .filter(item => item.dist < 500).sort((a, b) => a.dist - b.dist).slice(0, 3).map(item => item.node);
            setSuggestedNodes(candidates);
        }
    } else if (dragMode === 'RESIZE_NODE') {
        const nodeId = dragStartRef.current.nodeId;
        const node = nodes.find(n => n.id === nodeId);
        if (node) {
            const dx = (e.clientX - dragStartRef.current.x) / transform.k;
            const dy = (e.clientY - dragStartRef.current.y) / transform.k;
            
            // 对于CharacterDisplayNode和SceneDisplayNode，允许自由调整大小，不受比例限制
            if (node.type === NodeType.CHARACTER_DISPLAY || node.type === NodeType.SCENE_DISPLAY) {
                let newWidth = Math.max(300, (dragStartRef.current.w || 0) + dx);
                let newHeight = Math.max(400, (dragStartRef.current.h || 0) + dy);
                setNodes(prev => prev.map(n => n.id === nodeId ? { ...n, width: newWidth, height: newHeight } : n));
            } else {
                // 其他节点保持原来的比例调整逻辑
                let ratio = 1.33; 
                if (node.aspectRatio) { const [w, h] = node.aspectRatio.split(':').map(Number); if (!isNaN(w) && !isNaN(h) && h !== 0) ratio = w / h; } 
                else if (node.type === NodeType.ORIGINAL_IMAGE) { ratio = (dragStartRef.current.w || 1) / (dragStartRef.current.h || 1); }
                let minWidth = 150;
                if (node.type === NodeType.IMAGE_LOADER || node.type === NodeType.AUDIO_LOADER) {
                    const limit1 = ratio >= 1 ? 128 * ratio : 128;
                    minWidth = Math.max(limit1, 128);
                } else if (node.type !== NodeType.CREATIVE_DESC) {
                    const limit1 = ratio >= 1 ? 400 * ratio : 400;
                    minWidth = Math.max(limit1, 400); 
                } else minWidth = 280;
                let newWidth = Math.max(minWidth, (dragStartRef.current.w || 0) + dx);
                setNodes(prev => prev.map(n => n.id === nodeId ? { ...n, width: newWidth, height: newWidth / ratio } : n));
            }
        }
    }
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (dragMode === 'CONNECT' && connectionStartRef.current?.type === 'source') {
         setQuickAddMenu({ sourceId: connectionStartRef.current.nodeId, x: e.clientX, y: e.clientY, worldX: screenToWorld(e.clientX, e.clientY).x, worldY: screenToWorld(e.clientX, e.clientY).y });
    }
    if (dragMode !== 'NONE') { setDragMode('NONE'); setTempConnection(null); connectionStartRef.current = null; setSuggestedNodes([]); setSelectionBox(null); }
  };

  const createConnection = (sourceId: string, targetId: string, targetPortIndex?: number) => {
      if (!connections.some(c => c.sourceId === sourceId && c.targetId === targetId)) setConnections(prev => [...prev, { id: generateId(), sourceId, targetId, targetPortIndex }]);
      setDragMode('NONE'); setTempConnection(null); connectionStartRef.current = null; setSuggestedNodes([]);
  };

  const handlePortMouseUp = (e: React.MouseEvent, nodeId: string, type: 'source' | 'target', portIndex?: number) => {
      e.stopPropagation(); e.preventDefault();
      if (dragMode === 'CONNECT' && connectionStartRef.current && connectionStartRef.current.type === 'source' && type === 'target' && connectionStartRef.current.nodeId !== nodeId) createConnection(connectionStartRef.current.nodeId, nodeId, portIndex);
  };

  const deleteNode = (id: string) => {
      const node = nodes.find(n => n.id === id);
      if (node && (node.imageSrc || node.audioSrc || node.decodedResult)) setDeletedNodes(prev => [...prev, node]);
      setNodes(prev => prev.filter(n => n.id !== id));
      setConnections(prev => prev.filter(c => c.sourceId !== id && c.targetId !== id));
  };

  const removeConnection = (id: string) => { setConnections(prev => prev.filter(c => c.id !== id)); setSelectedConnectionId(null); };

  const renderNewWorkflowDialog = () => {
      if (!showNewWorkflowDialog) return null;
      return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setShowNewWorkflowDialog(false)}>
            <div className={`w-[400px] p-6 rounded-2xl shadow-2xl border flex flex-col gap-4 transform transition-all scale-100 ${isDark ? 'bg-[#1A1D21] border-zinc-700 text-gray-200' : 'bg-white border-gray-200 text-gray-800'}`} onClick={(e) => e.stopPropagation()}>
                <div>
                    <h3 className="text-lg font-bold flex items-center gap-2"><Icons.FilePlus size={20} className="text-blue-500"/>新建工作流</h3>
                    <p className={`text-xs mt-2 leading-relaxed ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>是否在创建新工作流之前保存当前工作流？<br/>任何未保存的更改将永久丢失。</p>
                </div>
                <div className={`flex justify-end gap-2 mt-2 pt-4 border-t ${isDark ? 'border-zinc-800' : 'border-gray-100'}`}>
                    <button onClick={() => setShowNewWorkflowDialog(false)} className={`px-4 py-2 rounded-lg text-xs font-medium transition-colors ${isDark ? 'hover:bg-zinc-800 text-gray-400' : 'hover:bg-gray-100 text-gray-600'}`}>取消</button>
                    <button onClick={() => handleConfirmNew(false)} className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors ${isDark ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20' : 'bg-red-50 text-red-600 hover:bg-red-100 border border-red-200'}`}>不保存</button>
                    <button onClick={() => handleConfirmNew(true)} className={`px-4 py-2 rounded-lg text-xs font-bold text-white transition-colors shadow-lg shadow-blue-500/20 flex items-center gap-1.5 ${isDark ? 'bg-blue-600 hover:bg-blue-500' : 'bg-blue-500 hover:bg-blue-400'}`}><Icons.Save size={14}/>保存并新建</button>
                </div>
            </div>
        </div>
      );
  };

  const renderContextMenu = () => {
    if (!contextMenu) return null;
    return (
        <div className={`fixed z-50 border rounded-xl shadow-2xl py-2 min-w-[180px] flex flex-col backdrop-blur-xl animate-in fade-in zoom-in-95 duration-100 ${isDark ? 'bg-zinc-900/95 border-zinc-700/80' : 'bg-white/95 border-gray-200'}`} style={{ left: contextMenu.x, top: contextMenu.y }} onMouseDown={(e) => e.stopPropagation()}>
            {contextMenu.type === 'NODE' && contextMenu.nodeId && (() => {
                const menuItemClass = `text-left px-3 py-2 text-xs transition-all duration-150 flex items-center gap-2.5 rounded-md mx-1 ${isDark ? 'text-gray-300 hover:bg-zinc-800/80 hover:text-white' : 'text-gray-700 hover:bg-gray-100 hover:text-black'}`;
                const node = nodes.find(n => n.id === contextMenu.nodeId);
                
                return (
                    <>
                        <button className={menuItemClass} onClick={() => { performCopy(); setContextMenu(null); }}>
                            <Icons.Copy size={14}/> 复制
                        </button>
                        <button className={menuItemClass} onClick={() => { performCut(); setContextMenu(null); }}>
                            <Icons.Scissors size={14}/> 剪切
                        </button>
                        {contextMenu.nodeType === NodeType.ORIGINAL_IMAGE && (
                            <button className={menuItemClass} onClick={() => { triggerReplaceImage(contextMenu.nodeId!); setContextMenu(null); }}>
                                <Icons.Upload size={14}/> 替换图片
                            </button>
                        )}
                        <button className={menuItemClass} onClick={() => { if (contextMenu.nodeId) copyImageToClipboard(contextMenu.nodeId); setContextMenu(null); }}>
                            <Icons.Image size={14}/> 复制图片数据
                        </button>
                        <div className={`h-px my-1.5 mx-2 ${isDark ? 'bg-zinc-700' : 'bg-gray-200'}`}></div>
                        <button className={`text-left px-3 py-2 text-xs transition-all duration-150 flex items-center gap-2.5 rounded-md mx-1 text-red-400 ${isDark ? 'hover:bg-red-500/10 hover:text-red-300' : 'hover:bg-red-50 hover:text-red-600'}`} onClick={() => { if (contextMenu.nodeId) deleteNode(contextMenu.nodeId); setContextMenu(null); }}>
                            <Icons.Trash2 size={14}/> 删除
                        </button>
                    </>
                );
            })()}
            {contextMenu.type === 'CANVAS' && (() => {
                const menuItemClass = `text-left px-3 py-2 text-xs transition-all duration-150 flex items-center gap-2.5 rounded-md mx-1 ${isDark ? 'text-gray-300 hover:bg-zinc-800/80 hover:text-white' : 'text-gray-700 hover:bg-gray-100 hover:text-black'}`;
                return (
                    <>
                        <button className={`${menuItemClass} ${!internalClipboard ? 'opacity-40 cursor-not-allowed' : ''}`} onClick={() => { performPaste({ x: contextMenu.worldX, y: contextMenu.worldY }); setContextMenu(null); }} disabled={!internalClipboard}>
                            <Icons.Copy size={14}/> 粘贴
                        </button>
                    </>
                );
            })()}
        </div>
    );
  };

  const renderQuickAddMenu = () => {
    if (!quickAddMenu) return null;
    
    const menuItemClass = `text-left px-3 py-2 text-xs transition-all duration-150 flex items-center gap-2.5 rounded-lg mx-1 ${isDark ? 'text-gray-300 hover:bg-zinc-800/80 hover:text-white' : 'text-gray-700 hover:bg-gray-100 hover:text-black'}`;
    const groupLabelClass = `px-3 py-1.5 text-[9px] font-semibold uppercase tracking-wider ${isDark ? 'text-zinc-500' : 'text-gray-400'}`;
    
    return (
        <div 
            className={`fixed z-50 border rounded-xl shadow-2xl py-2 min-w-[200px] flex flex-col animate-in fade-in zoom-in-95 duration-150 backdrop-blur-xl ${isDark ? 'bg-zinc-900/95 border-zinc-700/80' : 'bg-white/95 border-gray-200'}`} 
            style={{ left: quickAddMenu.x, top: quickAddMenu.y }} 
            onMouseDown={(e) => e.stopPropagation()}
        >
            <div className={`px-3 pb-2 mb-1 text-[11px] font-semibold border-b ${isDark ? 'text-gray-200 border-zinc-800' : 'text-gray-800 border-gray-100'}`}>
                连接到节点
            </div>
            
            <div className={groupLabelClass}>生成</div>
            <button className={menuItemClass} onClick={() => handleQuickAddNode(NodeType.TEXT_TO_IMAGE)}>
                <div className="w-6 h-6 rounded-md bg-cyan-500/10 flex items-center justify-center"><Icons.Image size={14} className="text-cyan-400"/></div>
                <span>生图</span>
            </button>
            
            <div className={`${groupLabelClass} mt-1`}>处理</div>
            <button className={menuItemClass} onClick={() => handleQuickAddNode(NodeType.IMAGE_UPSCALE)}>
                <div className="w-6 h-6 rounded-md bg-cyan-500/10 flex items-center justify-center"><Icons.ZoomIn size={14} className="text-cyan-400"/></div>
                <span>图片放大</span>
            </button>
            
        </div>
    );
  };

  const toggleTheme = (dark: boolean) => {
      setCanvasBg(dark ? '#0B0C0E' : '#F5F7FA');
  };

  return (
    <div className="w-full h-screen overflow-hidden flex relative font-sans text-gray-800">
        <SettingsModal 
            isOpen={isSettingsOpen} 
            onClose={() => setIsSettingsOpen(false)} 
            isDark={isDark} 
        />
        <StorageModal
            isOpen={isStorageOpen}
            onClose={() => setIsStorageOpen(false)}
            isDark={isDark}
        />
        <ExportImportModal
            isOpen={isExportImportOpen}
            onClose={() => setIsExportImportOpen(false)}
            isDark={isDark}
            projectName={projectName}
            onProjectNameChange={setProjectName}
            nodes={nodes}
            connections={connections}
            transform={transform}
            onImport={handleImportWorkflow}
        />

        {/* Workflow List Modal */}
        {showWorkflowListModal && (
            <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setShowWorkflowListModal(false)}>
                <div className={`${isDark ? 'bg-zinc-900 border-zinc-700' : 'bg-white border-gray-200'} border rounded-2xl shadow-2xl w-[480px] max-h-[600px] flex flex-col animate-in fade-in zoom-in-95 duration-200`} onClick={(e) => e.stopPropagation()}>
                    <div className={`px-6 py-4 border-b ${isDark ? 'border-zinc-700' : 'border-gray-200'} flex items-center justify-between`}>
                        <h3 className={`text-lg font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>加载工作流</h3>
                        <button 
                            onClick={() => setShowWorkflowListModal(false)}
                            className={`p-2 rounded-lg ${isDark ? 'hover:bg-zinc-800 text-zinc-400' : 'hover:bg-gray-100 text-gray-500'} transition-colors`}
                        >
                            <Icons.X size={18} />
                        </button>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto p-4">
                        {workflowListItems.length === 0 ? (
                            <div className={`text-center py-12 ${isDark ? 'text-zinc-500' : 'text-gray-400'}`}>
                                <p className="text-sm font-medium">暂无工作流记录</p>
                                <p className="text-xs mt-2">保存的工作流将显示在这里</p>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {workflowListItems.map((item) => (
                                    <button
                                        key={item.filename}
                                        onClick={() => handleLoadWorkflowItem(item.filename, item.name)}
                                        className={`w-full text-left p-4 rounded-xl border transition-all group ${
                                            isDark 
                                                ? 'border-zinc-800 hover:border-blue-500/50 hover:bg-zinc-800/50' 
                                                : 'border-gray-200 hover:border-blue-400/50 hover:bg-blue-50/50'
                                        }`}
                                    >
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <div className={`font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>{item.name}</div>
                                                <div className={`text-xs mt-1 ${isDark ? 'text-zinc-500' : 'text-gray-400'}`}>
                                                    {new Date(item.timestamp).toLocaleString('zh-CN')}
                                                </div>
                                            </div>
                                            <Icons.ChevronRight size={16} className={`${isDark ? 'text-zinc-600 group-hover:text-blue-400' : 'text-gray-300 group-hover:text-blue-500'} transition-colors`} />
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        )}

        <Sidebar 
          onAddNode={addNode} 
          onNewWorkflow={handleNewWorkflow}
          onImportAsset={() => assetInputRef.current?.click()}
          onSaveProject={handleSaveProject}
          onLoadProject={handleLoadProject}
          nodes={[...nodes, ...deletedNodes]}
          onPreviewMedia={handleHistoryPreview}
          isDark={isDark}
        />
        <input type="file" ref={workflowInputRef} hidden accept=".aistudio-flow,.json" onChange={handleLoadWorkflow} />
        <input type="file" ref={assetInputRef} hidden accept="image/*" onChange={handleImportAsset} />
        <input type="file" ref={replaceImageRef} hidden accept="image/*" onChange={handleReplaceImage} />
        <div 
            ref={containerRef}
            className={`flex-1 w-full h-full relative grid-pattern select-none ${dragMode === 'PAN' ? 'cursor-grabbing' : dragMode === 'NONE' ? 'cursor-default' : 'cursor-grab'}`}
            style={{ 
                backgroundColor: canvasBg,
                '--grid-color': isDark ? '#27272a' : '#E4E4E7'
            } as React.CSSProperties}
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onAuxClick={(e) => e.preventDefault()}
            onContextMenu={handleCanvasContextMenu}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
        >
            <div className="absolute origin-top-left will-change-transform" style={{ transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.k})` }}>
                {/* Connection Lines - Rendered as absolute positioned divs with SVG */}
                {connections.map(conn => {
                    const source = nodes.find(n => n.id === conn.sourceId);
                    const target = nodes.find(n => n.id === conn.targetId);
                    if (!source || !target) return null;
                    
                    // 源节点右侧输出端口位置
                    const sx = source.x + source.width;
                    const sy = source.y + source.height / 2;
                    // 目标节点左侧输入端口位置
                    const tx = target.x;
                    let ty = target.y + target.height / 2;
                    if (target.type === NodeType.AUDIO_GEN && conn.targetPortIndex !== undefined) {
                        const portYPercent = conn.targetPortIndex === 0 ? 0.3 : 0.7;
                        ty = target.y + target.height * portYPercent;
                    }
                    
                    // 计算贝塞尔曲线控制点
                    const dist = Math.abs(tx - sx);
                    const cp = Math.max(50, dist * 0.4);
                    
                    // 计算SVG边界
                    const minX = Math.min(sx, tx) - cp - 20;
                    const minY = Math.min(sy, ty) - 20;
                    const maxX = Math.max(sx, tx) + cp + 20;
                    const maxY = Math.max(sy, ty) + 20;
                    const svgWidth = maxX - minX;
                    const svgHeight = maxY - minY;
                    
                    // 相对于SVG的坐标
                    const relSx = sx - minX;
                    const relSy = sy - minY;
                    const relTx = tx - minX;
                    const relTy = ty - minY;
                    
                    const d = `M ${relSx} ${relSy} C ${relSx + cp} ${relSy}, ${relTx - cp} ${relTy}, ${relTx} ${relTy}`;
                    const isSelected = selectedConnectionId === conn.id;
                    
                    // 连接线颜色
                    const lineColor = isSelected ? "#3b82f6" : (isDark ? "#6b7280" : "#9ca3af");
                    
                    // 计算贝塞尔曲线上 t=0.5 的实际中点位置
                    const t = 0.5;
                    const p0x = relSx, p0y = relSy;
                    const p1x = relSx + cp, p1y = relSy;
                    const p2x = relTx - cp, p2y = relTy;
                    const p3x = relTx, p3y = relTy;
                    const midX = Math.pow(1-t,3)*p0x + 3*Math.pow(1-t,2)*t*p1x + 3*(1-t)*Math.pow(t,2)*p2x + Math.pow(t,3)*p3x;
                    const midY = Math.pow(1-t,3)*p0y + 3*Math.pow(1-t,2)*t*p1y + 3*(1-t)*Math.pow(t,2)*p2y + Math.pow(t,3)*p3y;
                    
                    return (
                        <svg 
                            key={conn.id}
                            className="absolute"
                            style={{ 
                                left: minX, 
                                top: minY, 
                                width: svgWidth, 
                                height: svgHeight,
                                zIndex: isSelected ? 20 : 5,
                                overflow: 'visible',
                                pointerEvents: 'none'
                            }}
                        >
                            {/* 点击区域 */}
                            <path 
                                d={d} 
                                stroke="transparent" 
                                strokeWidth={16} 
                                fill="none" 
                                style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
                                onClick={(e) => { e.stopPropagation(); setSelectedConnectionId(conn.id); }}
                            />
                            {/* 主连接线 - 实线 */}
                            <path 
                                d={d} 
                                stroke={lineColor}
                                strokeWidth={isSelected ? 3 : 2} 
                                fill="none" 
                                strokeLinecap="round"
                                style={{ pointerEvents: 'none' }}
                            />
                            {/* 选中时的发光效果 */}
                            {isSelected && (
                                <path 
                                    d={d} 
                                    stroke="#3b82f6"
                                    strokeWidth={6} 
                                    fill="none" 
                                    strokeLinecap="round"
                                    opacity={0.3}
                                    style={{ pointerEvents: 'none' }}
                                />
                            )}
                            {/* 删除按钮 - 使用纯 SVG 实现 */}
                            {isSelected && (
                                <g 
                                    style={{ pointerEvents: 'auto', cursor: 'pointer' }}
                                    onClick={(e) => { e.stopPropagation(); removeConnection(conn.id); }}
                                    onMouseDown={(e) => e.stopPropagation()}
                                >
                                    {/* 按钮背景 */}
                                    <circle 
                                        cx={midX} 
                                        cy={midY} 
                                        r={10}
                                        fill={isDark ? "#27272a" : "#ffffff"}
                                        stroke={isDark ? "#52525b" : "#d1d5db"}
                                        strokeWidth={1}
                                        className="hover:stroke-red-500"
                                    />
                                    {/* X 图标 */}
                                    <line 
                                        x1={midX - 4} y1={midY - 4} 
                                        x2={midX + 4} y2={midY + 4} 
                                        stroke={isDark ? "#a1a1aa" : "#6b7280"}
                                        strokeWidth={2}
                                        strokeLinecap="round"
                                        className="hover:stroke-red-500"
                                    />
                                    <line 
                                        x1={midX + 4} y1={midY - 4} 
                                        x2={midX - 4} y2={midY + 4} 
                                        stroke={isDark ? "#a1a1aa" : "#6b7280"}
                                        strokeWidth={2}
                                        strokeLinecap="round"
                                        className="hover:stroke-red-500"
                                    />
                                </g>
                            )}
                        </svg>
                    );
                })}
                
                {/* 拖拽连接预览线 */}
                {dragMode === 'CONNECT' && connectionStartRef.current && tempConnection && (() => {
                    const sourceNode = nodes.find(n => n.id === connectionStartRef.current?.nodeId);
                    if (!sourceNode) return null;
                    
                    const sx = sourceNode.x + sourceNode.width;
                    const sy = sourceNode.y + sourceNode.height / 2;
                    const tx = tempConnection.x;
                    const ty = tempConnection.y;
                    
                    const dist = Math.abs(tx - sx);
                    const cp = Math.max(30, dist * 0.3);
                    
                    const minX = Math.min(sx, tx) - cp - 20;
                    const minY = Math.min(sy, ty) - 20;
                    const maxX = Math.max(sx, tx) + cp + 20;
                    const maxY = Math.max(sy, ty) + 20;
                    
                    const relSx = sx - minX;
                    const relSy = sy - minY;
                    const relTx = tx - minX;
                    const relTy = ty - minY;
                    
                    const d = `M ${relSx} ${relSy} C ${relSx + cp} ${relSy}, ${relTx - cp} ${relTy}, ${relTx} ${relTy}`;
                    
                    return (
                        <svg 
                            className="absolute pointer-events-none"
                            style={{ 
                                left: minX, 
                                top: minY, 
                                width: maxX - minX, 
                                height: maxY - minY,
                                zIndex: 100,
                                overflow: 'visible'
                            }}
                        >
                            {/* 虚线预览 */}
                            <path 
                                d={d} 
                                stroke="#3b82f6" 
                                strokeWidth={2} 
                                fill="none" 
                                strokeDasharray="6,4" 
                                strokeLinecap="round"
                            />
                            {/* 目标点指示器 */}
                            <circle 
                                cx={relTx} 
                                cy={relTy} 
                                r={5} 
                                fill="#3b82f6"
                            />
                        </svg>
                    );
                })()}
                {nodes.map(node => (
                    <BaseNode
                        key={node.id}
                        data={node}
                        selected={selectedNodeIds.has(node.id)}
                        onMouseDown={(e) => handleNodeMouseDown(e, node.id)}
                        onContextMenu={(e) => handleNodeContextMenu(e, node.id, node.type)}
                        onConnectStart={(e, type) => handleConnectStart(e, node.id, type)}
                        onPortMouseUp={handlePortMouseUp}
                        onResizeStart={(e) => handleResizeStart(e, node.id)}
                        scale={transform.k}
                        isDark={isDark}
                    >
                        <NodeContent 
                            data={node} 
                            updateData={updateNodeData} 
                            onGenerate={handleGenerate}
                            onMerge={handleMerge}
                            selected={selectedNodeIds.has(node.id)}
                            showControls={selectedNodeIds.size === 1}
                            inputs={getInputImages(node.id)}
                            onMaximize={handleMaximize}
                            onDownload={handleDownload}
                            onUpload={triggerReplaceImage}
                            isSelecting={dragMode === 'SELECT'}
                            onDelete={deleteNode}
                            isDark={isDark}
                        />
                    </BaseNode>
                ))}
            </div>
            {dragMode === 'CONNECT' && suggestedNodes.length > 0 && lastMousePosRef.current && (
                <div className={`fixed z-50 border rounded-xl shadow-2xl p-2 flex flex-col gap-1 w-48 pointer-events-auto ${isDark ? 'bg-[#1A1D21] border-zinc-700' : 'bg-white border-gray-200'}`} style={{ left: lastMousePosRef.current.x + 20, top: lastMousePosRef.current.y }}>
                    <div className={`text-[10px] uppercase font-bold px-2 py-1 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Quick Connect</div>
                    {suggestedNodes.map(node => (
                        <button key={node.id} className={`flex items-center gap-2 px-2 py-1.5 rounded text-left text-xs transition-colors ${isDark ? 'hover:bg-zinc-800 text-gray-300 hover:text-cyan-400' : 'hover:bg-gray-100 text-gray-700 hover:text-cyan-600'}`} onClick={(e) => { e.stopPropagation(); createConnection(connectionStartRef.current!.nodeId, node.id); }}>
                            <Icons.Image size={12} /><span className="truncate">{node.title}</span>
                        </button>
                    ))}
                </div>
            )}
            {dragMode === 'SELECT' && selectionBox && (
                <div className="fixed border border-cyan-500/50 bg-cyan-500/10 pointer-events-none z-50" style={{ left: containerRef.current!.getBoundingClientRect().left + selectionBox.x, top: containerRef.current!.getBoundingClientRect().top + selectionBox.y, width: selectionBox.w, height: selectionBox.h }}/>
            )}
            
            {/* Top Left Project Name */}
            <div className="absolute top-4 left-4 z-50">
                <div className={`flex items-center gap-2.5 px-2 py-1.5 rounded-2xl backdrop-blur-xl border transition-all duration-300 ${
                    isDark 
                        ? 'bg-[#18181b]/90 border-zinc-800 shadow-xl' 
                        : 'bg-white/90 border-gray-200 shadow-lg'
                }`}>
                    {/* Logo */}
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                        isDark ? 'bg-blue-500/20 text-blue-400' : 'bg-blue-100 text-blue-600'
                    }`}>
                        <Icons.Sparkles size={16} />
                    </div>
                    
                    {/* Project Name */}
                    {isEditingProjectName ? (
                        <input
                            type="text"
                            value={projectName}
                            onChange={(e) => setProjectName(e.target.value)}
                            onBlur={() => setIsEditingProjectName(false)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') setIsEditingProjectName(false);
                                if (e.key === 'Escape') setIsEditingProjectName(false);
                            }}
                            autoFocus
                            className={`w-36 px-2 py-1 rounded-lg text-sm font-medium border-0 outline-none bg-transparent ${
                                isDark ? 'text-white' : 'text-gray-900'
                            }`}
                            placeholder="项目名称..."
                        />
                    ) : (
                        <button
                            onClick={() => setIsEditingProjectName(true)}
                            className={`text-sm font-medium max-w-[140px] truncate transition-colors ${
                                isDark ? 'text-gray-200 hover:text-white' : 'text-gray-800 hover:text-black'
                            }`}
                        >
                            {projectName}
                        </button>
                    )}
                    
                    {/* Save Button */}
                    <button
                        onClick={handleSaveProject}
                        title="保存项目"
                        className={`p-1.5 rounded-lg transition-colors ${
                            isDark ? 'hover:bg-white/10 text-gray-400 hover:text-emerald-400' : 'hover:bg-gray-100 text-gray-500 hover:text-emerald-600'
                        }`}
                    >
                        <Icons.Save size={14} />
                    </button>
                </div>
            </div>

            {/* Top Right Toolbar */}
            <div className="absolute top-4 right-4 z-50">
                <div className={`flex items-center gap-1 px-2 py-1.5 rounded-2xl backdrop-blur-xl border transition-all ${
                    isDark 
                        ? 'bg-[#18181b]/90 border-zinc-800 shadow-xl' 
                        : 'bg-white/90 border-gray-200 shadow-lg'
                }`}>
                    {/* Zoom */}
                    <span className={`px-3 py-1.5 text-sm font-medium tabular-nums ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                        {Math.round(transform.k * 100)}%
                    </span>
                    
                    <div className={`w-px h-5 ${isDark ? 'bg-zinc-700' : 'bg-gray-200'}`} />
                    
                    {/* Theme */}
                    <button
                        onClick={() => toggleTheme(!isDark)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium transition-all ${
                            isDark ? 'text-gray-400 hover:text-white hover:bg-white/5' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                        }`}
                    >
                        {isDark ? <Icons.Moon size={15} /> : <Icons.Sun size={15} />}
                        <span>{isDark ? '暗色' : '亮色'}</span>
                    </button>
                    
                    {/* API Settings */}
                    <button
                        onClick={() => setIsSettingsOpen(true)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium transition-all ${
                            isDark ? 'text-gray-400 hover:text-white hover:bg-white/5' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                        }`}
                    >
                        <Icons.Settings size={15} />
                        <span>API 设置</span>
                    </button>
                </div>
            </div>
            {renderContextMenu()}
            {renderQuickAddMenu()}
            {renderNewWorkflowDialog()}
            {previewMedia && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md animate-in fade-in duration-200" onClick={() => setPreviewMedia(null)}>
                    <div className="relative max-w-[90vw] max-h-[90vh] bg-black rounded-lg shadow-2xl overflow-hidden border border-zinc-700" onClick={(e) => e.stopPropagation()}>
                         <button className="absolute top-2 right-2 bg-black/50 text-white p-2 rounded-full hover:bg-red-500 transition-colors z-10" onClick={() => setPreviewMedia(null)}><Icons.X size={20} /></button>
                         <img src={previewMedia.url} alt="Preview" className="max-w-full max-h-[90vh] object-contain" />
                    </div>
                </div>
            )}
        </div>
    </div>
  );
};

export default App;
