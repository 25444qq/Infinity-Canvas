import React from 'react';
import { NodeData } from '../../types';
import { Icons } from '../Icons';
import { EditableTitle } from './Shared/NodeComponents';

interface CreativeDescNodeProps {
  data: NodeData;
  updateData: (id: string, updates: Partial<NodeData>) => void;
  onGenerate: (id: string) => void;
  selected?: boolean;
  showControls?: boolean;
  isDark?: boolean;
}

export const CreativeDescNode: React.FC<CreativeDescNodeProps> = ({
    data, updateData, onGenerate, selected, showControls, isDark = true
}) => {
    const isSelectedAndStable = selected;

    const containerBg = isDark ? 'bg-[#1e1e1e]' : 'bg-white';
    const containerBorder = selected 
        ? 'border-blue-500 ring-1 ring-blue-500' 
        : (isDark ? 'border-zinc-800' : 'border-gray-200');
    const controlPanelBg = isDark ? 'bg-[#1e1e1e] border-zinc-700/80' : 'bg-white border-gray-200';
    const inputBg = isDark ? 'bg-zinc-900/50 hover:bg-zinc-900 border-transparent focus:border-blue-500/50 text-zinc-200 placeholder-zinc-500' : 'bg-gray-50 hover:bg-gray-100 border-gray-200 focus:border-blue-400 text-gray-900 placeholder-gray-400';

    return (
        <>
          <div className="absolute bottom-full left-0 w-full mb-2 flex items-center justify-between"><EditableTitle title={data.title} onUpdate={(t) => updateData(data.id, { title: t })} isDark={isDark} /></div>
          <div className={`w-full h-full border rounded-xl p-4 flex flex-col shadow-lg transition-shadow duration-300 ${containerBg} ${containerBorder}`}>
              <div className={`flex items-center gap-2 text-xs mb-3 ${isDark ? 'text-zinc-400' : 'text-gray-500'}`}><div className="p-1.5 bg-blue-500/10 rounded-md"><Icons.Wand2 size={14} className="text-blue-500"/></div><span className="font-medium tracking-wide text-[12px]">创意助手</span></div>
              <textarea className={`w-full flex-1 border rounded-lg p-3 text-[12px] leading-relaxed resize-none focus:outline-none transition-colors no-scrollbar ${inputBg}`} placeholder="在此输入您的初步想法..." value={data.prompt || ''} onChange={(e) => updateData(data.id, { prompt: e.target.value })} onMouseDown={(e) => e.stopPropagation()} onWheel={(e) => e.stopPropagation()} />
              <button onClick={() => onGenerate(data.id)} className="mt-3 w-full bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium py-2 rounded-lg flex items-center justify-center gap-2 transition-all shadow-sm active:scale-[0.98]">
                  {data.isLoading ? <Icons.Loader2 className="animate-spin" size={14}/> : '优化提示词'}
              </button>
              {data.optimizedPrompt && isSelectedAndStable && showControls && (
                  <div className={`absolute top-full left-0 w-full mt-3 border rounded-xl p-4 text-xs z-[70] shadow-2xl animate-in slide-in-from-top-2 duration-200 ${controlPanelBg} ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                      <div className="text-[11px] text-gray-500 font-medium mb-2">优化结果</div>
                      <div className="leading-relaxed">{data.optimizedPrompt}</div>
                  </div>
              )}
          </div>
        </>
    );
};
