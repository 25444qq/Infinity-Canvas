import React, { useState, useRef, useEffect, memo, useMemo } from 'react';
import { Icons } from './Icons';
import { NodeType, NodeData } from '../types';

interface SidebarProps {
  onAddNode: (type: NodeType) => void;
  onNewWorkflow: () => void;
  onImportAsset: () => void;
  onSaveProject: () => void;
  onLoadProject: () => void;
  nodes: NodeData[];
  onPreviewMedia: (url: string, type: 'image') => void;
  isDark?: boolean;
}

type ActivePanel = 'ADD' | 'HISTORY' | 'PROJECT' | null;

const HistoryItem = memo(({ node, onClick, isDark }: { node: NodeData, onClick: () => void, isDark: boolean }) => {
    const stackCount = node.outputArtifacts?.length || 0;
    
    return (
        <div 
           className={`relative aspect-square rounded-xl overflow-hidden cursor-pointer group ${isDark ? 'bg-zinc-900' : 'bg-gray-100'}`}
           onClick={onClick}
        >
            <img src={node.imageSrc} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" loading="lazy" decoding="async"/>
            
            {stackCount > 1 && (
                <div className={`absolute top-1.5 right-1.5 text-[10px] px-1.5 py-0.5 rounded-md flex items-center gap-1 ${isDark ? 'bg-black/60 text-white' : 'bg-white/80 text-gray-700'} backdrop-blur-sm`}>
                    <Icons.Layers size={10} />
                    <span className="font-semibold">{stackCount}</span>
                </div>
            )}

            <div className={`absolute inset-x-0 bottom-0 p-2 ${isDark ? 'bg-gradient-to-t from-black/80 to-transparent' : 'bg-gradient-to-t from-white/90 to-transparent'}`}>
                <div className={`text-[11px] truncate font-medium ${isDark ? 'text-white' : 'text-gray-800'}`}>{node.title}</div>
            </div>
        </div>
    );
}, (prev, next) => {
    return prev.node.id === next.node.id && 
           prev.node.imageSrc === next.node.imageSrc && 
           prev.node.title === next.node.title &&
           prev.isDark === next.isDark &&
           (prev.node.outputArtifacts?.length || 0) === (next.node.outputArtifacts?.length || 0);
});

const Sidebar: React.FC<SidebarProps> = ({
  onAddNode,
  onNewWorkflow,
  onImportAsset,
  onSaveProject,
  onLoadProject,
  nodes,
  onPreviewMedia,
  isDark = true
}) => {
  const [activePanel, setActivePanel] = useState<ActivePanel>(null);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(['素材节点'])
  );
  const sidebarRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const toggleSection = (section: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(section)) {
        next.delete(section);
      } else {
        next.add(section);
      }
      return next;
    });
  };

  // Deduplicate nodes for history display
  const uniqueNodes = useMemo(() => {
      const map = new Map<string, NodeData>();
      nodes.forEach(n => {
          if (!map.has(n.id)) map.set(n.id, n);
      });
      return Array.from(map.values());
  }, [nodes]);

  const imageNodes = useMemo(() => 
      uniqueNodes.filter(n => n.imageSrc && !n.isLoading), 
  [uniqueNodes]);

  // Close panel when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        sidebarRef.current && 
        !sidebarRef.current.contains(target) &&
        panelRef.current &&
        !panelRef.current.contains(target)
      ) {
        setActivePanel(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const togglePanel = (panel: ActivePanel) => {
    setActivePanel(prev => prev === panel ? null : panel);
  };

  // 样式
  const bgMain = isDark ? 'bg-[#18181b]/95' : 'bg-white/95';
  const borderColor = isDark ? 'border-zinc-800' : 'border-gray-200';
  const textMain = isDark ? 'text-white' : 'text-gray-900';
  const textSub = isDark ? 'text-gray-400' : 'text-gray-500';
  const textMuted = isDark ? 'text-gray-600' : 'text-gray-400';
  const hoverBg = isDark ? 'hover:bg-white/5' : 'hover:bg-gray-100';
  const activeBg = isDark ? 'bg-blue-500/10 text-blue-400' : 'bg-blue-50 text-blue-600';

  // 侧边栏按钮
  const SidebarButton = ({ 
    icon: Icon, 
    panel, 
    tooltip,
    onClick
  }: { 
    icon: any, 
    panel?: ActivePanel, 
    tooltip: string,
    onClick?: () => void
  }) => {
    const isActive = panel && activePanel === panel;
    
    return (
      <button 
        className={`relative w-11 h-11 flex items-center justify-center rounded-xl transition-all duration-200 group ${
          isActive ? activeBg : `${textSub} ${hoverBg}`
        }`}
        onClick={() => {
          if (onClick) {
            onClick();
          } else if (panel) {
            togglePanel(panel);
          }
        }}
      >
        <Icon size={20} />
        <div className={`absolute left-full ml-3 px-2.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 transition-all pointer-events-none z-50 ${
          isDark ? 'bg-zinc-900 text-white border border-zinc-700' : 'bg-white text-gray-900 border border-gray-200 shadow-lg'
        }`}>
          {tooltip}
        </div>
      </button>
    );
  };

  // 渲染添加节点面板
  const renderAddPanel = () => {
    const NodeButton = ({ icon: Icon, label, description, type, color }: { icon: any, label: string, description: string, type: NodeType, color: string }) => (
      <button
        onClick={() => { onAddNode(type); setActivePanel(null); }}
        className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all group ${
          isDark 
            ? 'border-zinc-800 hover:border-zinc-700 hover:bg-zinc-800/50' 
            : 'border-gray-100 hover:border-gray-200 hover:bg-gray-50'
        }`}
      >
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${color}`}>
          <Icon size={20} />
        </div>
        <div className="flex-1 text-left">
          <div className={`text-sm font-semibold ${textMain}`}>{label}</div>
          <div className={`text-[11px] ${textMuted}`}>{description}</div>
        </div>
        <Icons.ChevronRight size={16} className={`${textMuted} group-hover:translate-x-0.5 transition-transform`} />
      </button>
    );

    return (
      <div className="space-y-2">
        <div className={`text-[10px] font-bold uppercase tracking-wider ${textMuted}`}>生成节点</div>

        <div className="space-y-1">
          <button
            onClick={() => toggleSection('图片')}
            className={`w-full flex items-center justify-between px-1 py-1 rounded ${hoverBg}`}
          >
            <span className={`text-[10px] font-medium ${textMuted}`}>图片</span>
            <Icons.ChevronRight
              size={12}
              className={`${textMuted} transition-transform ${expandedSections.has('图片') ? 'rotate-90' : ''}`}
            />
          </button>
          {expandedSections.has('图片') && (
            <>
              <NodeButton
                icon={Icons.Image}
                label="生图"
                description="文本/图片生成图片"
                type={NodeType.TEXT_TO_IMAGE}
                color={isDark ? 'bg-cyan-500/15 text-cyan-400' : 'bg-cyan-100 text-cyan-600'}
              />
              <NodeButton
                icon={Icons.ZoomIn}
                label="图片放大"
                description="Real-ESRGAN 超分辨率放大"
                type={NodeType.IMAGE_UPSCALE}
                color={isDark ? 'bg-cyan-500/15 text-cyan-400' : 'bg-cyan-100 text-cyan-600'}
              />
            </>
          )}
        </div>

        <div className="space-y-1">
          <button
            onClick={() => toggleSection('音频')}
            className={`w-full flex items-center justify-between px-1 py-1 rounded ${hoverBg}`}
          >
            <span className={`text-[10px] font-medium ${textMuted}`}>音频</span>
            <Icons.ChevronRight
              size={12}
              className={`${textMuted} transition-transform ${expandedSections.has('音频') ? 'rotate-90' : ''}`}
            />
          </button>
          {expandedSections.has('音频') && (
            <>
              <NodeButton
                icon={Icons.Music}
                label="音频生成"
                description="文本生成音频"
                type={NodeType.AUDIO_GEN}
                color={isDark ? 'bg-blue-500/15 text-blue-400' : 'bg-blue-100 text-blue-600'}
              />
              <NodeButton
                icon={Icons.Blend}
                label="音频合并"
                description="合并多个音频文件"
                type={NodeType.AUDIO_MERGE}
                color={isDark ? 'bg-violet-500/15 text-violet-400' : 'bg-violet-100 text-violet-600'}
              />
              <NodeButton
                icon={Icons.BookOpen}
                label="多角色配音"
                description="分行并标注对话人物"
                type={NodeType.NOVEL_LINES}
                color={isDark ? 'bg-violet-500/15 text-violet-400' : 'bg-violet-100 text-violet-600'}
              />
            </>
          )}
        </div>

        <div className="space-y-1">
          <button
            onClick={() => toggleSection('文本')}
            className={`w-full flex items-center justify-between px-1 py-1 rounded ${hoverBg}`}
          >
            <span className={`text-[10px] font-medium ${textMuted}`}>文本</span>
            <Icons.ChevronRight
              size={12}
              className={`${textMuted} transition-transform ${expandedSections.has('文本') ? 'rotate-90' : ''}`}
            />
          </button>
          {expandedSections.has('文本') && (
            <>
              <NodeButton
                icon={Icons.FileText}
                label="文本格式化"
                description="格式化处理小说文本"
                type={NodeType.TEXT_ANALYZE}
                color={isDark ? 'bg-amber-500/15 text-amber-400' : 'bg-amber-100 text-amber-600'}
              />
              <NodeButton
                icon={Icons.User}
                label="角色展示"
                description="加载JSON展示角色信息"
                type={NodeType.CHARACTER_DISPLAY}
                color={isDark ? 'bg-rose-500/15 text-rose-400' : 'bg-rose-100 text-rose-600'}
              />
              <NodeButton
                icon={Icons.Film}
                label="场景展示"
                description="加载JSON展示场景信息"
                type={NodeType.SCENE_DISPLAY}
                color={isDark ? 'bg-amber-500/15 text-amber-400' : 'bg-amber-100 text-amber-600'}
              />
            </>
          )}
        </div>

        <div className={`text-[10px] font-bold uppercase tracking-wider ${textMuted} pt-2`}>素材节点</div>

        <div className="space-y-1">
          <button
            onClick={() => toggleSection('素材节点')}
            className={`w-full flex items-center justify-between px-1 py-1 rounded ${hoverBg}`}
          >
            <span className={`text-[10px] font-medium ${textMuted}`}>展开</span>
            <Icons.ChevronRight
              size={12}
              className={`${textMuted} transition-transform ${expandedSections.has('素材节点') ? 'rotate-90' : ''}`}
            />
          </button>
          {expandedSections.has('素材节点') && (
            <>
              <NodeButton
                icon={Icons.ImagePlus}
                label="图片素材"
                description="加载图片并输出base64"
                type={NodeType.IMAGE_LOADER}
                color={isDark ? 'bg-emerald-500/15 text-emerald-400' : 'bg-emerald-100 text-emerald-600'}
              />
              <NodeButton
                icon={Icons.Music}
                label="音频素材"
                description="加载音频并输出base64"
                type={NodeType.AUDIO_LOADER}
                color={isDark ? 'bg-violet-500/15 text-violet-400' : 'bg-violet-100 text-violet-600'}
              />
              <NodeButton
                icon={Icons.FilePlus}
                label="文本素材"
                description="加载文本文件并输出字符串"
                type={NodeType.TEXT_LOADER}
                color={isDark ? 'bg-amber-500/15 text-amber-400' : 'bg-amber-100 text-amber-600'}
              />
            </>
          )}
        </div>
      </div>
    );
  };

  // 渲染项目面板
  const renderProjectPanel = () => (
    <div className="space-y-2">
      <button
        onClick={() => { onNewWorkflow(); setActivePanel(null); }}
        className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all ${hoverBg}`}
      >
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${isDark ? 'bg-blue-500/10 text-blue-400' : 'bg-blue-50 text-blue-600'}`}>
          <Icons.FilePlus size={18} />
        </div>
        <div className="text-left">
          <div className={`text-sm font-medium ${textMain}`}>新建项目</div>
          <div className={`text-[11px] ${textMuted}`}>创建空白画布</div>
        </div>
      </button>
      
      <button
        onClick={() => { onSaveProject(); setActivePanel(null); }}
        className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all ${hoverBg}`}
      >
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${isDark ? 'bg-emerald-500/10 text-emerald-400' : 'bg-emerald-50 text-emerald-600'}`}>
          <Icons.Save size={18} />
        </div>
        <div className="text-left">
          <div className={`text-sm font-medium ${textMain}`}>保存项目</div>
          <div className={`text-[11px] ${textMuted}`}>保存当前画布状态</div>
        </div>
      </button>

      <button
        onClick={() => { onLoadProject(); setActivePanel(null); }}
        className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all ${hoverBg}`}
      >
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${isDark ? 'bg-teal-500/10 text-teal-400' : 'bg-teal-50 text-teal-600'}`}>
          <Icons.FolderOpen size={18} />
        </div>
        <div className="text-left">
          <div className={`text-sm font-medium ${textMain}`}>加载项目</div>
          <div className={`text-[11px] ${textMuted}`}>从项目文件夹加载（含资源）</div>
        </div>
      </button>
    </div>
  );

  // 渲染面板内容
  const renderPanel = () => {
    if (!activePanel) return null;

    // 生成历史面板 - 独立的大面板
    if (activePanel === 'HISTORY') {
      return (
        <div 
          ref={panelRef}
          className={`fixed left-[76px] top-4 bottom-4 w-80 ${bgMain} backdrop-blur-xl border ${borderColor} rounded-2xl z-[190] flex flex-col shadow-2xl animate-in slide-in-from-left-2 duration-200`}
        >
          {/* Header */}
          <div className={`px-5 py-4 border-b ${borderColor} flex items-center justify-between shrink-0`}>
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${isDark ? 'bg-blue-500/10' : 'bg-blue-50'}`}>
                <Icons.Clock size={18} className={isDark ? 'text-blue-400' : 'text-blue-600'} />
              </div>
              <h3 className={`text-base font-bold ${textMain}`}>生成历史</h3>
            </div>
            <button 
              onClick={() => setActivePanel(null)}
              className={`p-2 rounded-lg ${hoverBg} ${textSub}`}
            >
              <Icons.X size={18} />
            </button>
          </div>
          
          {/* Content Grid */}
          <div className="flex-1 p-4 overflow-y-auto custom-scrollbar">
            {imageNodes.length === 0 ? (
              <div className={`flex flex-col items-center justify-center h-full ${textMuted}`}>
                <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-4 ${isDark ? 'bg-zinc-800' : 'bg-gray-100'}`}>
                  <Icons.Image size={28} className="opacity-40" />
                </div>
                <p className="text-sm font-medium">暂无生成历史</p>
                <p className={`text-xs mt-1 ${textMuted}`}>生成的图片将显示在这里</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {imageNodes.map(node => (
                  <HistoryItem 
                    key={node.id} 
                    node={node} 
                    isDark={isDark}
                    onClick={() => onPreviewMedia(node.imageSrc || '', 'image')}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Footer Stats */}
          <div className={`px-4 py-3 border-t ${borderColor} shrink-0`}>
            <div className={`flex items-center justify-between text-xs ${textMuted}`}>
              <span>共 {imageNodes.length} 项</span>
              <span>图片历史</span>
            </div>
          </div>
        </div>
      );
    }

    // 其他面板 - 紧凑型
    let title = '';
    let content = null;

    switch (activePanel) {
      case 'ADD':
        title = '添加节点';
        content = renderAddPanel();
        break;
      case 'PROJECT':
        title = '项目';
        content = renderProjectPanel();
        break;
    }

    return (
      <div 
        ref={panelRef}
        className={`fixed left-[76px] top-1/2 -translate-y-1/2 w-64 max-h-[80vh] ${bgMain} backdrop-blur-xl border ${borderColor} rounded-2xl z-[190] flex flex-col shadow-xl animate-in slide-in-from-left-2 duration-200`}
      >
        {/* Panel Header */}
        <div className={`px-4 py-3 border-b ${borderColor} flex items-center justify-between shrink-0`}>
          <h3 className={`text-sm font-bold ${textMain}`}>{title}</h3>
          <button 
            onClick={() => setActivePanel(null)}
            className={`p-1.5 rounded-lg ${hoverBg} ${textSub}`}
          >
            <Icons.X size={16} />
          </button>
        </div>
        
        {/* Panel Content */}
        <div className="flex-1 p-4 overflow-y-auto custom-scrollbar">
          {content}
        </div>
      </div>
    );
  };

  return (
    <>
      {/* Sidebar */}
      <div 
        ref={sidebarRef}
        className={`fixed left-4 top-1/2 -translate-y-1/2 z-[200] ${bgMain} backdrop-blur-xl border ${borderColor} rounded-2xl p-2 flex flex-col items-center gap-1 shadow-xl`}
      >
        <SidebarButton icon={Icons.LayoutGrid} panel="ADD" tooltip="添加节点" />
        
        <div className={`w-8 h-px my-1 ${isDark ? 'bg-zinc-800' : 'bg-gray-200'}`} />
        
        <SidebarButton icon={Icons.Clock} panel="HISTORY" tooltip="生成历史" />
        <SidebarButton icon={Icons.Upload} tooltip="导入素材" onClick={onImportAsset} />
        
        <div className={`w-8 h-px my-1 ${isDark ? 'bg-zinc-800' : 'bg-gray-200'}`} />
        
        <SidebarButton icon={Icons.Folder} panel="PROJECT" tooltip="项目" />
      </div>

      {/* Panel */}
      {renderPanel()}
    </>
  );
};

export default Sidebar;
