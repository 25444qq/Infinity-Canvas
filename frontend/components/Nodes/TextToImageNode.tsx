
import React, { useState, useEffect, useCallback } from 'react';
import { NodeData } from '../../types';
import { Icons } from '../Icons';
import { MODEL_REGISTRY, getVisibleModels } from '../../services/geminiService';
import { IMAGE_HANDLERS } from '../../services/mode/image/configurations';
import { LocalEditableTitle, LocalCustomDropdown, LocalInputThumbnails, LocalMediaStack } from './Shared/LocalNodeComponents';

interface TextToImageNodeProps {
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

export const TextToImageNode: React.FC<TextToImageNodeProps> = ({
    data, updateData, onGenerate, selected, showControls, inputs = [], onMaximize, onDownload, isDark = true, isSelecting
}) => {
    const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
    const [deferredInputs, setDeferredInputs] = useState(false);
    const [isConfigured, setIsConfigured] = useState(true);
    const [imageModels, setImageModels] = useState<string[]>([]);

    const isSelectedAndStable = selected && !isSelecting;

    const checkConfig = useCallback(() => {
         setIsConfigured(true);
    }, []);

    const updateModels = useCallback(() => {
        const visibleModels = getVisibleModels();
        const models = visibleModels.filter(k => MODEL_REGISTRY[k]?.category === 'IMAGE');
        setImageModels(models);
    }, []);

    useEffect(() => { 
        checkConfig(); 
        updateModels();
        window.addEventListener('modelConfigUpdated', checkConfig); 
        window.addEventListener('modelRegistryUpdated', updateModels);
        return () => {
            window.removeEventListener('modelConfigUpdated', checkConfig);
            window.removeEventListener('modelRegistryUpdated', updateModels);
        };
    }, [checkConfig, updateModels]);

    useEffect(() => {
        if (imageModels.length > 0 && (!data.model || !imageModels.includes(data.model))) {
            updateData(data.id, { model: imageModels[0] });
        }
    }, [imageModels, data.model, data.id, updateData]);

    useEffect(() => { if (isSelectedAndStable && showControls) { const t = setTimeout(() => setDeferredInputs(true), 100); return () => clearTimeout(t); } else setDeferredInputs(false); }, [isSelectedAndStable, showControls]);

    // Get Rules for current model
    const currentModel = data.model || 'Flux2';
    const handler = IMAGE_HANDLERS[currentModel] || IMAGE_HANDLERS['Flux2']; // Fallback rules
    const rules = handler.rules;
    const supportedResolutions = rules.resolutions || ['1k'];
    const supportedRatios = rules.ratios || ['1:1', '16:9'];
    const canOptimize = !!rules.hasPromptExtend;

    const handleRatioChange = (ratio: string) => {
        const currentShort = Math.min(data.width, data.height);
        const baseSize = Math.max(currentShort, 400); // Preserve current scale, min 400px

        const [wStr, hStr] = ratio.split(':');
        const wR = parseFloat(wStr);
        const hR = parseFloat(hStr);
        const r = wR / hR;

        let newW, newH;
        if (r >= 1) {
            // Landscape or Square: Height is limiting factor
            newH = baseSize;
            newW = baseSize * r;
        } else {
            // Portrait: Width is limiting factor
            newW = baseSize;
            newH = baseSize / r;
        }
        updateData(data.id, { aspectRatio: ratio, width: Math.round(newW), height: Math.round(newH) });
    };

    const hasResult = !!data.imageSrc && !data.isLoading;
    
    // Auto-correct
    useEffect(() => { 
        if (data.aspectRatio && !supportedRatios.includes(data.aspectRatio)) updateData(data.id, { aspectRatio: '1:1' }); 
        if (data.resolution && !supportedResolutions.includes(data.resolution)) updateData(data.id, { resolution: supportedResolutions[0] });
    }, [data.model, data.aspectRatio, data.resolution, data.id, updateData, supportedRatios, supportedResolutions]);

    const containerBg = isDark ? 'bg-[#1a1a1a]' : 'bg-white';
    const containerBorder = selected ? 'border-blue-500 ring-2 ring-blue-500/30' : (isDark ? 'border-zinc-700/50' : 'border-gray-200');
    const controlPanelBg = isDark ? 'bg-[#1a1a1a]/95 backdrop-blur-xl border-zinc-700/50' : 'bg-white/95 backdrop-blur-xl border-gray-200 shadow-xl';
    const inputBg = isDark ? 'bg-zinc-800/80 hover:bg-zinc-800 border-zinc-700 focus:border-blue-500 text-white placeholder-zinc-500' : 'bg-gray-50 hover:bg-white border-gray-200 focus:border-blue-500 text-gray-900 placeholder-gray-400';
    const emptyStateIconColor = isDark ? 'bg-zinc-800/50 text-zinc-500' : 'bg-gray-100 text-gray-400';
    const emptyStateTextColor = isDark ? 'text-zinc-500' : 'text-gray-400';

    return (
      <>
        <div className={`w-full h-full relative rounded-2xl border ${containerBorder} ${containerBg} ${data.isStackOpen ? 'overflow-visible' : 'overflow-hidden'} shadow-xl group transition-all duration-200`}>
             {hasResult ? (
                 <>
                     <LocalMediaStack data={data} updateData={updateData} currentSrc={data.imageSrc} onMaximize={onMaximize} isDark={isDark} selected={selected} />
                     
                     {/* Hover Overlay with Title & Actions */}
                     <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
                         {/* Top Gradient */}
                         <div className="absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-black/60 to-transparent" />
                         
                         {/* Title */}
                         <div className="absolute top-3 left-3 pointer-events-auto">
                             <LocalEditableTitle title={data.title} onUpdate={(t) => updateData(data.id, { title: t })} isDark={true} />
                         </div>
                         
                         {/* Action Buttons */}
                         <div className="absolute top-3 right-3 flex items-center gap-1.5 pointer-events-auto">
                             <button 
                                 title="最大化" 
                                 className="w-8 h-8 rounded-lg bg-black/40 hover:bg-black/60 backdrop-blur-md text-white/80 hover:text-white flex items-center justify-center transition-all"
                                 onClick={(e) => { e.stopPropagation(); onMaximize?.(data.id); }}
                             >
                                 <Icons.Maximize2 size={16} />
                             </button>
                         </div>
                     </div>
                 </>
             ) : (
                 <div className={`w-full h-full flex flex-col items-center justify-center ${emptyStateTextColor}`}>
                     <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-4 ${emptyStateIconColor}`}>
                         <Icons.Image size={28} className="opacity-60"/>
                     </div>
                     <span className="text-sm font-medium opacity-60">生图</span>
                     <span className="text-xs opacity-40 mt-1">选中节点开始创作</span>
                 </div>
             )}
             
             {/* Loading Overlay */}
             {data.isLoading && (
                 <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center z-20">
                     <Icons.Loader2 size={32} className="text-blue-500 animate-spin mb-3" />
                     <span className="text-white/80 text-sm font-medium">生成中...</span>
                 </div>
             )}
        </div>

        {/* Control Panel */}
        {isSelectedAndStable && showControls && (
            <div className="absolute top-full left-1/2 -translate-x-1/2 min-w-[520px] pt-4 z-[70] pointer-events-auto" onMouseDown={(e) => e.stopPropagation()}>
                 {inputs.length > 0 && <LocalInputThumbnails inputs={inputs} ready={deferredInputs} isDark={isDark} />}
                 <div className={`${controlPanelBg} rounded-2xl p-4 flex flex-col gap-3 border`}>
                      {/* Prompt Input */}
                      <textarea 
                          className={`w-full border rounded-xl px-4 py-3 text-sm leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/20 min-h-[72px] no-scrollbar transition-all ${inputBg}`} 
                          placeholder="描述你想要生成的图片..." 
                          value={data.prompt || ''} 
                          onChange={(e) => updateData(data.id, { prompt: e.target.value })} 
                          onWheel={(e) => e.stopPropagation()} 
                      />
                      
                      {/* Parameters Row - All in one line */}
                      <div className="flex items-center gap-2">
                          <LocalCustomDropdown 
                              options={imageModels} 
                              value={data.model || 'Flux2'} 
                              onChange={(val: any) => updateData(data.id, { model: val })} 
                              isOpen={activeDropdown === 'model'} 
                              onToggle={() => setActiveDropdown(activeDropdown === 'model' ? null : 'model')} 
                              onClose={() => setActiveDropdown(null)} 
                              align="left" 
                              width="w-[130px]" 
                              isDark={isDark} 
                          />
                          <LocalCustomDropdown icon={Icons.Crop} options={supportedRatios} value={data.aspectRatio || '1:1'} onChange={handleRatioChange} isOpen={activeDropdown === 'ratio'} onToggle={() => setActiveDropdown(activeDropdown === 'ratio' ? null : 'ratio')} onClose={() => setActiveDropdown(null)} isDark={isDark} />
                          <LocalCustomDropdown icon={Icons.Monitor} options={supportedResolutions} value={data.resolution || '1k'} onChange={(val: any) => updateData(data.id, { resolution: val })} isOpen={activeDropdown === 'res'} onToggle={() => setActiveDropdown(activeDropdown === 'res' ? null : 'res')} onClose={() => setActiveDropdown(null)} disabledOptions={['1k', '2k', '4k'].filter(r => !supportedResolutions.includes(r))} isDark={isDark} />
                          <LocalCustomDropdown icon={Icons.Layers} options={[1, 2, 3, 4]} value={data.count || 1} onChange={(val: any) => updateData(data.id, { count: val })} isOpen={activeDropdown === 'count'} onToggle={() => setActiveDropdown(activeDropdown === 'count' ? null : 'count')} onClose={() => setActiveDropdown(null)} isDark={isDark} />
                          <button 
                              className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-all border ${
                                  canOptimize 
                                      ? (data.promptOptimize 
                                          ? (isDark ? 'text-blue-400 bg-blue-500/20 border-blue-500/30' : 'text-blue-600 bg-blue-100 border-blue-200') 
                                          : (isDark ? 'text-zinc-400 hover:text-white border-zinc-700 hover:border-zinc-600 hover:bg-zinc-700' : 'text-gray-400 hover:text-gray-600 border-gray-200 hover:bg-gray-100')
                                        ) 
                                      : (isDark ? 'text-zinc-600 border-zinc-800 opacity-40 cursor-not-allowed' : 'text-gray-300 border-gray-100 opacity-40 cursor-not-allowed')
                              }`} 
                              onClick={() => canOptimize && updateData(data.id, { promptOptimize: !data.promptOptimize })}
                              title={canOptimize ? `提示词优化: ${data.promptOptimize ? '开启' : '关闭'}` : '此模型不支持提示词优化'}
                              disabled={!canOptimize}
                          >
                              <Icons.Sparkles size={15} fill={data.promptOptimize && canOptimize ? "currentColor" : "none"} />
                          </button>
                          
                          {/* Spacer */}
                          <div className="flex-1" />
                          
                          {/* Download Button - only show when has result */}
                          {hasResult && (
                              <button 
                                  title="下载图片" 
                                  className={`shrink-0 h-8 px-3 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 whitespace-nowrap transition-all active:scale-[0.98] ${
                                      isDark 
                                          ? 'bg-zinc-700 hover:bg-zinc-600 text-zinc-300 hover:text-white border border-zinc-600' 
                                          : 'bg-gray-100 hover:bg-gray-200 text-gray-600 hover:text-gray-800 border border-gray-200'
                                  }`}
                                  onClick={(e) => { e.stopPropagation(); onDownload?.(data.id); }}
                              >
                                  <Icons.Download size={15} />
                                  <span>下载</span>
                              </button>
                          )}
                          
                          {/* Generate Button */}
                          <button 
                              onClick={() => onGenerate(data.id)} 
                              disabled={data.isLoading || !isConfigured}
                              title={!isConfigured ? '请在设置中配置 API Key' : '开始生成'}
                              className={`shrink-0 h-8 px-4 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 whitespace-nowrap transition-all active:scale-[0.98] ${
                                  data.isLoading || !isConfigured 
                                      ? 'bg-gray-400 text-white cursor-not-allowed' 
                                      : 'bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40'
                              }`}
                          >
                              {data.isLoading ? <Icons.Loader2 className="animate-spin" size={15}/> : <Icons.Wand2 size={15} />}
                              <span>{data.isLoading ? '生成中' : '生成'}</span>
                          </button>
                      </div>
                 </div>
            </div>
        )}
      </>
    );
};
