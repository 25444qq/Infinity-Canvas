import React, { useState, useEffect, useCallback } from 'react';
import { NodeData } from '../../types';
import { Icons } from '../Icons';
import { MODEL_REGISTRY, getVisibleModels } from '../../services/geminiService';

interface TextAnalyzeNodeProps {
  data: NodeData;
  updateData: (id: string, updates: Partial<NodeData>) => void;
  onGenerate: (id: string) => void;
  selected?: boolean;
  showControls?: boolean;
  inputs?: string[];
  isDark?: boolean;
  isSelecting?: boolean;
}

export const TextAnalyzeNode: React.FC<TextAnalyzeNodeProps> = ({
    data, updateData, onGenerate, selected, showControls, inputs = [], isDark = true, isSelecting
}) => {
    const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
    const [deferredInputs, setDeferredInputs] = useState(false);
    const [textModels, setTextModels] = useState<string[]>([]);

    const isSelectedAndStable = selected && !isSelecting;

    const updateModels = useCallback(() => {
        const visibleModels = getVisibleModels();
        const models = visibleModels.filter(k => MODEL_REGISTRY[k]?.category === 'TEXT');
        setTextModels(models);
    }, []);

    useEffect(() => {
        updateModels();
        window.addEventListener('modelRegistryUpdated', updateModels);
        return () => window.removeEventListener('modelRegistryUpdated', updateModels);
    }, [updateModels]);

    useEffect(() => {
        if (textModels.length > 0 && (!data.model || !textModels.includes(data.model))) {
            updateData(data.id, { model: textModels[0] });
        }
    }, [textModels, data.model, data.id, updateData]);

    useEffect(() => {
        if (isSelectedAndStable && showControls) {
            const t = setTimeout(() => setDeferredInputs(true), 100);
            return () => clearTimeout(t);
        } else setDeferredInputs(false);
    }, [isSelectedAndStable, showControls]);

    const hasResult = !!data.decodedResult && !data.isLoading;
    const textFromInput = inputs.find(i => i && !i.startsWith('data:')) || '';
    const charCount = data.decodedResult ? data.decodedResult.length : 0;

    const handleSaveText = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!data.decodedResult) return;
        const blob = new Blob([data.decodedResult], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${data.title || '格式化结果'}.txt`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    useEffect(() => {
        // 不再需要自动设置 prompt
    }, [textFromInput]);

    const containerBg = isDark ? 'bg-[#1a1a1a]' : 'bg-white';
    const containerBorder = selected ? 'border-blue-500 ring-2 ring-blue-500/30' : (isDark ? 'border-zinc-700/50' : 'border-gray-200');
    const controlPanelBg = isDark ? 'bg-[#1a1a1a]/95 backdrop-blur-xl border-zinc-700/50' : 'bg-white/95 backdrop-blur-xl border-gray-200 shadow-xl';
    const inputBg = isDark ? 'bg-zinc-800/80 hover:bg-zinc-800 border-zinc-700 focus:border-blue-500 text-white placeholder-zinc-500' : 'bg-gray-50 hover:bg-white border-gray-200 focus:border-blue-500 text-gray-900 placeholder-gray-400';
    const emptyStateIconColor = isDark ? 'bg-zinc-800/50 text-zinc-500' : 'bg-gray-100 text-gray-400';
    const emptyStateTextColor = isDark ? 'text-zinc-500' : 'text-gray-400';

    return (
      <>
        <div className={`w-full h-full relative rounded-2xl border ${containerBorder} ${containerBg} overflow-hidden shadow-xl group transition-all duration-200`}>
            {hasResult ? (
                <div className="w-full h-full p-4 flex flex-col">
                    <div className={`flex items-center justify-between mb-2 ${isDark ? 'text-zinc-400' : 'text-gray-500'}`}>
                        <div className="flex items-center gap-2">
                            <Icons.FileText size={14} />
                            <span className="text-[10px] font-bold uppercase tracking-wider">处理结果</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${isDark ? 'bg-zinc-800 text-zinc-400' : 'bg-gray-100 text-gray-500'}`}>
                                {charCount.toLocaleString()} 字
                            </span>
                            <button
                                title="保存文本"
                                className={`p-1 rounded transition-colors ${isDark ? 'hover:bg-zinc-700 hover:text-white' : 'hover:bg-gray-200 hover:text-gray-700'}`}
                                onClick={handleSaveText}
                            >
                                <Icons.Download size={14} />
                            </button>
                        </div>
                    </div>
                    <textarea
                        value={data.decodedResult || ''}
                        readOnly
                        className={`flex-1 w-full resize-none rounded-lg border p-3 text-sm leading-relaxed focus:outline-none ${
                            isDark
                                ? 'bg-zinc-900 border-zinc-700 text-gray-200'
                                : 'bg-gray-50 border-gray-200 text-gray-900'
                        }`}
                        onClick={(e) => e.stopPropagation()}
                    />
                </div>
            ) : (
                <div className={`w-full h-full flex flex-col items-center justify-center ${emptyStateTextColor}`}>
                    <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-4 ${emptyStateIconColor}`}>
                        <Icons.FileText size={28} className="opacity-60"/>
                    </div>
                    <span className="text-sm font-medium opacity-60">文本格式化</span>
                    <span className="text-xs opacity-40 mt-1">选中节点开始处理</span>
                </div>
            )}

            {data.isLoading && (
                <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center z-20">
                    <Icons.Loader2 size={32} className="text-blue-500 animate-spin mb-3" />
                    <span className="text-white/80 text-sm font-medium">处理中...</span>
                </div>
            )}
        </div>

        {isSelectedAndStable && showControls && (
            <div className="absolute top-full left-1/2 -translate-x-1/2 min-w-[520px] pt-4 z-[70] pointer-events-auto" onMouseDown={(e) => e.stopPropagation()}>
                <div className={`${controlPanelBg} rounded-2xl p-4 flex flex-col gap-3 border`}>
                    <div className="flex items-center gap-2">
                        {textFromInput && (
                            <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs ${isDark ? 'bg-amber-500/15 text-amber-400 border border-amber-500/20' : 'bg-amber-50 text-amber-600 border border-amber-200'}`}>
                                <Icons.FileText size={14} />
                                <span>小说文本已连接</span>
                            </div>
                        )}
                        <span className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? 'text-zinc-500' : 'text-gray-400'}`}>
                            文本格式化
                        </span>
                    </div>

                    <div className="flex items-center gap-2">
                        <div className="relative flex items-center">
                            <button
                                className={`flex items-center gap-2 cursor-pointer group h-8 px-3 rounded-lg border transition-all ${
                                    activeDropdown === 'model'
                                        ? (isDark ? 'bg-zinc-700 border-zinc-600' : 'bg-gray-100 border-gray-300')
                                        : (isDark ? 'border-zinc-700 hover:border-zinc-600' : 'border-gray-200 hover:border-gray-300')
                                } ${isDark ? 'hover:bg-zinc-700' : 'hover:bg-gray-100'}`}
                                onClick={(e) => { e.stopPropagation(); setActiveDropdown(activeDropdown === 'model' ? null : 'model'); }}
                            >
                                <Icons.Cpu size={15} className={`transition-colors ${activeDropdown === 'model' ? (isDark ? 'text-blue-400' : 'text-blue-600') : (isDark ? 'text-zinc-400 group-hover:text-white' : 'text-gray-500 group-hover:text-gray-700')}`} />
                                <span className={`text-xs font-medium transition-colors select-none max-w-[100px] truncate ${
                                    activeDropdown === 'model'
                                        ? (isDark ? 'text-white' : 'text-gray-900')
                                        : (isDark ? 'text-zinc-300 group-hover:text-white' : 'text-gray-600 group-hover:text-gray-900')
                                }`}>
                                    {data.model || '选择模型'}
                                </span>
                            </button>
                            {activeDropdown === 'model' && (
                                <div className={`absolute bottom-full mb-2 left-0 min-w-[150px] ${isDark ? 'bg-[#1a1a1a] border-zinc-700' : 'bg-white border-gray-200 shadow-xl'} border rounded-xl shadow-2xl py-1.5 z-[100]`} onMouseDown={(e) => e.stopPropagation()}>
                                    {textModels.map((m) => (
                                        <div
                                            key={m}
                                            className={`px-3 py-2 text-xs font-medium rounded-lg cursor-pointer mx-1.5 mb-0.5 ${
                                                data.model === m
                                                    ? (isDark ? 'bg-blue-500/15 text-blue-400' : 'bg-blue-50 text-blue-600')
                                                    : (isDark ? 'text-zinc-300 hover:bg-zinc-700 hover:text-white' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900')
                                            }`}
                                            onClick={() => { updateData(data.id, { model: m }); setActiveDropdown(null); }}
                                        >
                                            {m}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="flex-1" />

                        <button
                            onClick={() => onGenerate(data.id)}
                            disabled={data.isLoading || !textFromInput}
                            className={`shrink-0 h-8 px-4 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 whitespace-nowrap transition-all active:scale-[0.98] ${
                                data.isLoading || !textFromInput
                                    ? 'bg-gray-400 text-white cursor-not-allowed'
                                    : 'bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-white shadow-lg shadow-amber-500/25 hover:shadow-amber-500/40'
                            }`}
                        >
                            {data.isLoading ? <Icons.Loader2 className="animate-spin" size={15}/> : <Icons.Wand2 size={15} />}
                            <span>{data.isLoading ? '处理中' : '格式化'}</span>
                        </button>
                    </div>
                </div>
            </div>
        )}
      </>
    );
};
