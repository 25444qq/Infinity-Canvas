import React, { useRef } from 'react';
import { NodeData, NodeType } from '../../types';
import { Icons } from '../Icons';
import { EditableTitle } from './Shared/NodeComponents';
import { calculateImportDimensions } from '../../App';

interface ImageLoaderNodeProps {
  data: NodeData;
  updateData: (id: string, updates: Partial<NodeData>) => void;
  onUpload?: (id: string) => void;
  isDark?: boolean;
  selected?: boolean;
  onDelete?: (id: string) => void;
}

export const ImageLoaderNode: React.FC<ImageLoaderNodeProps> = ({
    data, updateData, onUpload, isDark = true, selected, onDelete
}) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const hasImage = !!data.imageSrc;

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const result = event.target?.result as string;
            const img = new Image();
            img.onload = () => {
                const { width, height, ratio } = calculateImportDimensions(img.width, img.height);
                updateData(data.id, { 
                    imageSrc: result, 
                    width, 
                    height,
                    aspectRatio: `${ratio}:1`
                });
            };
            img.src = result;
        };
        reader.readAsDataURL(file);
        e.target.value = '';
    };

    const handleTogglePrefix = (e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
        const currentWithPrefix = data.imageSrc?.startsWith('data:') || false;
        if (currentWithPrefix && data.imageSrc) {
            const base64 = data.imageSrc.split(',')[1];
            updateData(data.id, { imageSrc: base64 });
        } else if (data.imageSrc) {
            const match = data.imageSrc.match(/^data:([^;]+);/);
            const mimeType = match ? match[1] : 'image/png';
            updateData(data.id, { imageSrc: `data:${mimeType};base64,${data.imageSrc}` });
        }
    };

    const handleDoubleClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        fileInputRef.current?.click();
    };

    const overlayToolbarBg = isDark ? 'bg-black/50 border-white/5 text-gray-400' : 'bg-white/50 border-black/5 text-gray-600';

    return (
        <>
          <div className="absolute bottom-full left-0 w-full mb-2 flex items-center justify-between pointer-events-auto">
              <EditableTitle title={data.title} onUpdate={(t) => updateData(data.id, { title: t })} isDark={isDark} />
              {hasImage && (
                  <div className={`flex gap-1 backdrop-blur-md rounded-lg p-1 border ${overlayToolbarBg}`}>
                      <button title="切换base64格式" className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                          data.imageSrc?.startsWith('data:')
                              ? (isDark ? 'bg-blue-500/30 border border-blue-500/50 text-blue-300' : 'bg-blue-100 border border-blue-200 text-blue-600')
                              : (isDark ? 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600' : 'bg-gray-200 text-gray-700 hover:bg-gray-300')
                      }`} onClick={handleTogglePrefix}>
                          {data.imageSrc?.startsWith('data:') ? 'BASE64' : 'PLAIN'}
                      </button>
                      <button title="重新选择图片" className={`p-1 rounded transition-colors ${isDark ? 'hover:bg-zinc-800 hover:text-white' : 'hover:bg-gray-200 hover:text-black'}`} onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}>
                          <Icons.Upload size={12} className="cursor-pointer"/>
                      </button>
                  </div>
              )}
          </div>

          <div 
              className={`w-full h-full relative group rounded-xl border ${isDark ? 'border-zinc-800 bg-black' : 'border-gray-200 bg-white'} shadow-lg overflow-hidden ${hasImage ? '' : 'hover:border-cyan-500/50 transition-colors'}`}
              onDoubleClick={!hasImage ? handleDoubleClick : undefined}
          >
              <input 
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/jpg"
                  className="hidden"
                  onChange={handleFileSelect}
              />

              {hasImage ? (
                  <>
                      <img 
                          src={data.imageSrc.startsWith('data:') ? data.imageSrc : `data:image/png;base64,${data.imageSrc}`} 
                          alt="Loaded" 
                          className="w-full h-full object-contain pointer-events-none"
                      />
                      {selected && (
                          <div className="absolute top-2 right-2 z-10">
                              <button
                                  title="删除节点"
                                  className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all backdrop-blur-md border shadow-sm ${
                                      isDark ? 'bg-black/60 border-white/10 text-white/70 hover:bg-red-500/80 hover:text-white hover:border-red-500/50' : 'bg-white/80 border-gray-200 text-gray-500 hover:bg-red-500 hover:text-white'
                                  }`}
                                  onClick={(e) => { e.stopPropagation(); onDelete?.(data.id); }}
                              >
                                  <Icons.Trash2 size={13} />
                              </button>
                          </div>
                      )}
                  </>
              ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center text-zinc-600 gap-3">
                      <div className={`w-16 h-16 rounded-full border flex items-center justify-center transition-all shadow-lg group/icon ${isDark ? 'bg-zinc-900 border-zinc-700 hover:bg-zinc-800' : 'bg-gray-50 border-gray-200 hover:bg-gray-100'} hover:text-cyan-400 hover:border-cyan-500/50`}>
                          <Icons.ImagePlus size={28} className={`transition-colors ${isDark ? 'text-zinc-500 group-hover/icon:text-cyan-400' : 'text-gray-400 group-hover/icon:text-cyan-500'}`}/>
                      </div>
                      <span className={`text-[11px] font-medium select-none ${isDark ? 'text-zinc-500' : 'text-gray-500'}`}>双击选择图片</span>
                      <span className={`text-[10px] select-none ${isDark ? 'text-zinc-600' : 'text-gray-400'}`}>PNG, JPG, JPEG</span>
                      {selected && (
                          <button
                              title="删除节点"
                              className={`mt-1 px-2.5 py-1 rounded-lg text-[10px] font-medium flex items-center gap-1 transition-all backdrop-blur-md border ${
                                  isDark ? 'bg-black/60 border-white/10 text-white/70 hover:bg-red-500/80 hover:text-white hover:border-red-500/50' : 'bg-white/80 border-gray-200 text-gray-500 hover:bg-red-500 hover:text-white'
                              }`}
                              onClick={(e) => { e.stopPropagation(); onDelete?.(data.id); }}
                          >
                              <Icons.Trash2 size={11} />
                              <span>删除</span>
                          </button>
                      )}
                  </div>
              )}
          </div>
        </>
    );
};