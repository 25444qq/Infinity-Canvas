import React, { useState, useEffect } from 'react';
import { NodeData } from '../../types';
import { Icons } from '../Icons';
import { LocalEditableTitle, LocalInputThumbnails, LocalMediaStack } from './Shared/LocalNodeComponents';

interface UpscaleNodeProps {
  data: NodeData;
  updateData: (id: string, updates: Partial<NodeData>) => void;
  onGenerate: (id: string) => void;
  selected?: boolean;
  showControls?: boolean;
  inputs?: string[];
  onMaximize?: (id: string) => void;
  onDownload?: (id: string) => void;
  isDark?: boolean;
  isSelecting?: boolean;
}

const SCALE_OPTIONS = [2, 4];

export const UpscaleNode: React.FC<UpscaleNodeProps> = ({
    data, updateData, onGenerate, selected, showControls, inputs = [], onMaximize, onDownload, isDark = true, isSelecting
}) => {
    const [deferredInputs, setDeferredInputs] = useState(false);

    const isSelectedAndStable = selected && !isSelecting;
    const hasInputImage = inputs.length > 0;
    const hasResult = !!data.imageSrc && !data.isLoading;

    // Initialize defaults
    useEffect(() => {
        if (data.upscaleScale === undefined) updateData(data.id, { upscaleScale: 4 });
        if (!data.upscaleModel) updateData(data.id, { upscaleModel: 'RealESRGAN_x4plus' });
    }, []);

    useEffect(() => {
        if (isSelectedAndStable && showControls) {
            const t = setTimeout(() => setDeferredInputs(true), 100);
            return () => clearTimeout(t);
        } else {
            setDeferredInputs(false);
        }
    }, [isSelectedAndStable, showControls]);

    const containerBg = isDark ? 'bg-[#1e1e1e]' : 'bg-white';
    const containerBorder = selected ? 'border-blue-500 ring-2 ring-blue-500/30' : (isDark ? 'border-zinc-700/50' : 'border-gray-200');
    const overlayToolbarBg = isDark ? 'bg-black/50 border-white/5 text-gray-400' : 'bg-white/50 border-black/5 text-gray-600';
    const controlPanelBg = isDark ? 'bg-[#1e1e1e] border-zinc-700/80' : 'bg-white border-gray-200';
    const emptyStateIconColor = isDark ? 'bg-zinc-900/50 border-zinc-800 text-zinc-600' : 'bg-gray-100 border-gray-200 text-gray-400';
    const emptyStateTextColor = isDark ? 'text-zinc-500' : 'text-gray-400';

    return (
      <>
        <div className="absolute bottom-full left-0 w-full mb-2 flex items-center justify-between pointer-events-auto">
           <div className="flex items-center gap-2 pl-1">
               <LocalEditableTitle title={data.title} onUpdate={(t) => updateData(data.id, { title: t })} isDark={isDark} />
           </div>
           <div className={`flex gap-1 backdrop-blur-md rounded-lg p-1 border ${overlayToolbarBg}`}>
               {hasResult && (
                   <button title="下载" className={`p-1 rounded transition-colors ${isDark ? 'hover:bg-zinc-800 hover:text-white' : 'hover:bg-gray-200 hover:text-black'}`} onClick={(e) => { e.stopPropagation(); onDownload?.(data.id); }}>
                       <Icons.Download size={12} />
                   </button>
               )}
               <button title="最大化" className={`p-1 rounded transition-colors ${isDark ? 'hover:bg-zinc-800 hover:text-white' : 'hover:bg-gray-200 hover:text-black'}`} onClick={(e) => { e.stopPropagation(); onMaximize?.(data.id); }}>
                   <Icons.Maximize2 size={12} />
               </button>
           </div>
        </div>
        
        <div className={`w-full h-full relative rounded-xl border ${containerBorder} ${containerBg} ${data.isStackOpen ? 'overflow-visible' : 'overflow-hidden'} shadow-lg group transition-colors duration-200`}>
             {hasResult ? (
                 <LocalMediaStack data={data} updateData={updateData} currentSrc={data.imageSrc} onMaximize={onMaximize} isDark={isDark} selected={selected} />
             ) : (
                 <div className={`w-full h-full flex flex-col items-center justify-center ${emptyStateTextColor} grid-pattern`}>
                     <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-3 border ${emptyStateIconColor}`}>
                         <Icons.ZoomIn size={20} className="opacity-50"/>
                     </div>
                     <span className="text-[11px] font-medium tracking-wide opacity-60">图片放大</span>
                 </div>
             )}
             {data.isLoading && <div className="absolute inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-20"><Icons.Loader2 size={24} className="text-blue-500 animate-spin" /></div>}
        </div>

        {isSelectedAndStable && showControls && (
            <div className="absolute top-full left-1/2 -translate-x-1/2 w-full min-w-[360px] pt-3 z-[70] pointer-events-auto" onMouseDown={(e) => e.stopPropagation()}>
                 {inputs.length > 0 && <LocalInputThumbnails inputs={inputs} ready={deferredInputs} isDark={isDark} label="原图" />}
                 <div className={`${controlPanelBg} rounded-2xl p-3 shadow-2xl flex flex-col gap-3 border`}>
                      <div className="flex items-center gap-2">
                          <span className={`text-[10px] font-medium uppercase tracking-wider ${isDark ? 'text-zinc-500' : 'text-gray-400'}`}>放大倍数</span>
                          <div className="flex gap-1.5">
                              {SCALE_OPTIONS.map(s => (
                                  <button
                                      key={s}
                                      onClick={() => updateData(data.id, { upscaleScale: s })}
                                      className={`px-3 py-1 text-[11px] rounded-md font-medium transition-all ${
                                          (data.upscaleScale || 4) === s
                                              ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                                              : (isDark ? 'text-zinc-400 hover:text-zinc-200 border border-zinc-700/50' : 'text-gray-500 hover:text-gray-700 border border-gray-300')
                                      }`}
                                  >
                                      {s}x
                                  </button>
                              ))}
                          </div>
                      </div>

                      <div className="flex items-center justify-end gap-2 h-7">
                          <button 
                              onClick={() => onGenerate(data.id)} 
                              className={`h-7 px-4 text-[11px] font-bold rounded-full flex items-center justify-center gap-1.5 transition-all shadow-sm active:scale-[0.98] whitespace-nowrap ${
                                  data.isLoading || !hasInputImage 
                                      ? 'opacity-50 cursor-not-allowed bg-zinc-600 text-white' 
                                      : 'bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40'
                              }`} 
                              disabled={data.isLoading || !hasInputImage} 
                              title={!hasInputImage ? '需要连接输入图片' : '放大'}
                          >
                              {data.isLoading ? <Icons.Loader2 className="animate-spin" size={12}/> : <Icons.ZoomIn size={12} />}
                              <span>放大</span>
                          </button>
                      </div>
                 </div>
            </div>
        )}
      </>
    );
};
