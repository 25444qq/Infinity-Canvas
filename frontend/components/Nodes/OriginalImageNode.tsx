import React from 'react';
import { NodeData } from '../../types';
import { Icons } from '../Icons';
import { EditableTitle } from './Shared/NodeComponents';
import { MediaStack } from './Shared/MediaStack';

interface OriginalImageNodeProps {
  data: NodeData;
  updateData: (id: string, updates: Partial<NodeData>) => void;
  onMaximize?: (id: string) => void;
  onDownload?: (id: string) => void;
  onDelete?: (id: string) => void;
  onUpload?: (id: string) => void;
  isDark?: boolean;
  selected?: boolean;
}

export const OriginalImageNode: React.FC<OriginalImageNodeProps> = ({
    data, updateData, onMaximize, onDownload, onDelete, onUpload, isDark = true, selected
}) => {
    const overlayToolbarBg = isDark ? 'bg-black/50 border-white/5 text-gray-400' : 'bg-white/50 border-black/5 text-gray-600';

    return (
        <>
          <div className="absolute bottom-full left-0 w-full mb-2 flex items-center justify-between pointer-events-auto">
              <EditableTitle title={data.title} onUpdate={(t) => updateData(data.id, { title: t })} isDark={isDark} />
              <div className={`flex gap-1 backdrop-blur-md rounded-lg p-1 border ${overlayToolbarBg}`}>
                      <button title="Maximize" className={`p-1 rounded transition-colors ${isDark ? 'hover:bg-zinc-800 hover:text-white' : 'hover:bg-gray-200 hover:text-black'}`} onClick={(e) => { e.stopPropagation(); onMaximize?.(data.id); }}><Icons.Maximize2 size={12} className="cursor-pointer"/></button>
                      <button title="Download" className={`p-1 rounded transition-colors ${isDark ? 'hover:bg-zinc-800 hover:text-white' : 'hover:bg-gray-200 hover:text-black'}`} onClick={(e) => { e.stopPropagation(); onDownload?.(data.id); }}><Icons.Download size={12} className="cursor-pointer"/></button>
                      <button title="Delete" className={`p-1 rounded transition-colors text-red-400 ${isDark ? 'hover:bg-zinc-800' : 'hover:bg-gray-200'}`} onClick={(e) => { e.stopPropagation(); onDelete?.(data.id); }}><Icons.Trash2 size={12} className="cursor-pointer"/></button>
              </div>
          </div>
          
          <div className={`w-full h-full relative group rounded-xl border ${isDark ? 'border-zinc-800 bg-black' : 'border-gray-200 bg-white'} shadow-lg ${data.isStackOpen ? 'overflow-visible' : 'overflow-hidden'}`}>
              {data.imageSrc ? (
                  <MediaStack 
                      data={data} 
                      updateData={updateData} 
                      currentSrc={data.imageSrc} 
                      type="image" 
                      onMaximize={onMaximize} 
                      isDark={isDark}
                      selected={selected}
                  />
              ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center text-zinc-600 gap-3">
                      <div className={`w-16 h-16 rounded-full border flex items-center justify-center cursor-pointer transition-all shadow-lg group/icon ${isDark ? 'bg-zinc-900 border-zinc-700 hover:bg-zinc-800' : 'bg-gray-50 border-gray-200 hover:bg-gray-100'} hover:text-cyan-400 hover:border-cyan-500/50`} onClick={(e) => { e.stopPropagation(); if (onUpload) onUpload(data.id); }}>
                          <Icons.Upload size={28} className={`transition-colors ${isDark ? 'text-zinc-500 group-hover/icon:text-cyan-400' : 'text-gray-400 group-hover/icon:text-cyan-500'}`}/>
                      </div>
                      <span className={`text-[11px] font-medium select-none ${isDark ? 'text-zinc-500' : 'text-gray-500'}`}>Click icon to Upload</span>
                  </div>
              )}
          </div>
        </>
    );
};