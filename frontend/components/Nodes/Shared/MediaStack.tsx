
import React, { useRef, useEffect } from 'react';
import { NodeData } from '../../../types';
import { Icons } from '../../Icons';

interface MediaStackProps {
    data: NodeData;
    updateData: (id: string, updates: Partial<NodeData>) => void;
    currentSrc: string | undefined;
    type: 'image';
    onMaximize?: (id: string) => void;
    isDark?: boolean;
    selected?: boolean;
}

export const MediaStack: React.FC<MediaStackProps> = ({ 
    data, updateData, currentSrc, type, onMaximize, isDark = true, selected
}) => {
    const stackRef = useRef<HTMLDivElement>(null);
    const artifacts = data.outputArtifacts || [];
    const sortedArtifacts = currentSrc ? [currentSrc, ...artifacts.filter(a => a !== currentSrc)] : artifacts;
    const showBadge = !data.isStackOpen && artifacts.length > 1;

    // Handle click outside to close stack
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (data.isStackOpen && stackRef.current && !stackRef.current.contains(event.target as Node)) {
                 updateData(data.id, { isStackOpen: false });
            }
        };
        if (data.isStackOpen) document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [data.isStackOpen, data.id, updateData]);

    // Close stack when deselected
    useEffect(() => {
        if (!selected && data.isStackOpen) updateData(data.id, { isStackOpen: false });
    }, [selected, data.isStackOpen, data.id, updateData]);

    if (data.isStackOpen) {
        return (
            <div ref={stackRef} className="absolute top-0 left-0 h-full flex gap-4 z-[100] animate-in fade-in zoom-in-95 duration-200">
                {sortedArtifacts.map((src, index) => {
                    const isMain = index === 0;
                    return (
                      <div 
                          key={src + index} 
                          className={`relative h-full rounded-xl border ${isDark ? 'border-zinc-800 bg-black' : 'border-gray-200 bg-white'} overflow-hidden shadow-2xl flex-shrink-0 group/card ${isMain ? 'ring-2 ring-cyan-500/50' : ''}`}
                          style={{ width: data.width }}
                      >
                           <img src={src} className={`w-full h-full object-contain ${isDark ? 'bg-[#09090b]' : 'bg-gray-50'}`} draggable={false} onMouseDown={(e) => e.preventDefault()} />
                           
                           <div className="absolute bottom-2 right-2 flex items-center gap-1.5 z-20 pointer-events-auto">
                               {!isMain && (
                                   <button className="h-6 px-2 bg-black/40 hover:bg-black/60 backdrop-blur-md border border-white/10 rounded-md text-[9px] font-bold text-white transition-colors flex items-center gap-1 shadow-sm" onClick={(e) => { e.stopPropagation(); updateData(data.id, { imageSrc: src, isStackOpen: false }); }}>
                                       <Icons.Check size={10} className="text-cyan-400" /><span>Main</span>
                                   </button>
                               )}
                               <button className="w-6 h-6 flex items-center justify-center bg-black/40 hover:bg-black/60 backdrop-blur-md border border-white/10 rounded-md text-white transition-colors shadow-sm" onClick={(e) => { e.stopPropagation(); onMaximize?.(data.id); }}><Icons.Maximize2 size={12}/></button>
                           </div>
                           
                           <div className="absolute top-2 left-2 px-1.5 py-0.5 bg-black/60 backdrop-blur-md rounded text-[9px] text-white font-mono border border-white/10 select-none">
                               #{index + 1}
                           </div>
                      </div>
                    );
                })}
                <div className="flex flex-col justify-center h-full pl-2 pr-6">
                    <button className={`w-10 h-10 rounded-full border flex items-center justify-center transition-all shadow-lg ${isDark ? 'bg-zinc-900 border-zinc-700 text-zinc-400 hover:text-white hover:bg-zinc-800' : 'bg-white border-gray-200 text-gray-500 hover:text-gray-800 hover:bg-gray-50'}`} onClick={(e) => { e.stopPropagation(); updateData(data.id, { isStackOpen: false }); }}><Icons.X size={20} /></button>
                </div>
            </div>
        );
    }

    return (
        <>
           {currentSrc && <img src={currentSrc} className={`w-full h-full object-contain pointer-events-none ${isDark ? 'bg-[#09090b]' : 'bg-gray-50'}`} alt="Generated" draggable={false} />}
           {showBadge && (
               <div className="absolute top-2 right-2 bg-black/30 backdrop-blur-md hover:bg-black/50 text-white text-[10px] px-2 py-1 rounded-full flex items-center gap-1 border border-white/10 z-30 pointer-events-auto cursor-pointer select-none shadow-lg transition-colors group/badge" onClick={(e) => { e.stopPropagation(); updateData(data.id, { isStackOpen: true }); }}>
                   <Icons.Layers size={10} className="text-cyan-400"/>
                   <span className="font-bold tabular-nums">{artifacts.length}</span>
                   <Icons.ChevronRight size={10} className="text-zinc-400 group-hover/badge:text-white" />
               </div>
           )}
        </>
    );
};
