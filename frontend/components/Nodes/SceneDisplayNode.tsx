
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { NodeData, SceneData } from '../../types';
import { Icons } from '../Icons';
import { MODEL_REGISTRY, getVisibleModels } from '../../services/geminiService';
import { LocalCustomDropdown, LocalMediaStack } from './Shared/LocalNodeComponents';

interface SceneDisplayNodeProps {
  data: NodeData;
  updateData: (id: string, updates: Partial<NodeData>) => void;
  isDark?: boolean;
  selected?: boolean;
  onDelete?: (id: string) => void;
  onGenerate?: (id: string, promptOverride?: string) => void;
  onDownload?: (id: string) => void;
  onMaximize?: (id: string) => void;
  inputs?: string[];
}

export const SceneDisplayNode: React.FC<SceneDisplayNodeProps> = ({
    data, updateData, isDark = true, selected, onDelete, onGenerate, onDownload, onMaximize, inputs
}) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const hasData = !!data.sceneData && data.sceneData.length > 0;
    const hasResult = !!data.imageSrc && !data.isLoading;
    const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
    const [selectedIndex, setSelectedIndex] = useState<number>(data.selectedSceneIndex || 0);
    const [editableDescription, setEditableDescription] = useState<string>('');
    const [customPrompt, setCustomPrompt] = useState<string>('电影级场景，超细节，广角镜头，全景视图，环境光影，氛围感，电影质感，8K高清，细腻质感，写实风格，专业摄影，景深效果，自然光照，细节丰富。');
    const [imageModels, setImageModels] = useState<string[]>([]);

    const currentScene = hasData && selectedIndex >= 0 && selectedIndex < (data.sceneData?.length || 0)
        ? data.sceneData?.[selectedIndex]
        : null;

    const updateModels = useCallback(() => {
        const visibleModels = getVisibleModels();
        const models = visibleModels.filter(k => MODEL_REGISTRY[k]?.category === 'IMAGE');
        setImageModels(models);
    }, []);

    useEffect(() => { 
        updateModels();
        window.addEventListener('modelRegistryUpdated', updateModels);
        return () => {
            window.removeEventListener('modelRegistryUpdated', updateModels);
        };
    }, [updateModels]);

    useEffect(() => {
        if (imageModels.length > 0 && (!data.model || !imageModels.includes(data.model))) {
            updateData(data.id, { model: imageModels[0] });
        }
    }, [imageModels, data.model, data.id, updateData]);

    useEffect(() => {
        const scene = hasData && selectedIndex >= 0 && selectedIndex < (data.sceneData?.length || 0)
            ? data.sceneData?.[selectedIndex]
            : null;
        if (scene?.scene) {
            setEditableDescription(scene.scene);
        } else {
            setEditableDescription('');
        }
    }, [selectedIndex, data.sceneData, hasData]);

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const jsonContent = event.target?.result as string;
                const parsed = JSON.parse(jsonContent);

                let scenes: SceneData[] = [];
                if (Array.isArray(parsed)) {
                    scenes = parsed;
                } else if (parsed.scenes && Array.isArray(parsed.scenes)) {
                    scenes = parsed.scenes;
                } else if (parsed.chapters && Array.isArray(parsed.chapters)) {
                    scenes = parsed.chapters;
                } else {
                    console.warn('未找到场景数据数组');
                    return;
                }

                updateData(data.id, {
                    sceneData: scenes,
                    title: file.name.replace(/\.[^/.]+$/, '')
                });
                setSelectedIndex(0);
                if (scenes[0]?.scene) {
                    setEditableDescription(scenes[0].scene);
                } else {
                    setEditableDescription('');
                }
            } catch (error) {
                console.error('JSON解析失败:', error);
            }
        };
        reader.readAsText(file, 'utf-8');
        e.target.value = '';
    };

    const handleDoubleClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        fileInputRef.current?.click();
    };

    const handleIndexChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = parseInt(e.target.value, 10);
        if (!isNaN(val) && hasData) {
            const maxIndex = (data.sceneData?.length || 1) - 1;
            const targetIndex = val - 1;
            const finalIndex = Math.max(0, Math.min(targetIndex, maxIndex));
            setSelectedIndex(finalIndex);
            updateData(data.id, { selectedSceneIndex: finalIndex });
        } else if (e.target.value === '') {
            setSelectedIndex(0);
        }
    };

    const handleDescriptionChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setEditableDescription(e.target.value);
    };

    const handleDescriptionBlur = () => {
        if (currentScene && editableDescription !== currentScene.scene) {
            const updatedScenes = [...(data.sceneData || [])];
            if (updatedScenes[selectedIndex]) {
                updatedScenes[selectedIndex] = {
                    ...updatedScenes[selectedIndex],
                    scene: editableDescription
                };
                updateData(data.id, { sceneData: updatedScenes });
            }
        }
    };

    const handleRatioChange = (ratio: string) => {
        updateData(data.id, { aspectRatio: ratio });
    };

    const handleGenerate = () => {
        if (currentScene && editableDescription) {
            let finalPrompt = '';
            
            const sceneInfo = `Scene: ${currentScene.position || `场景 ${selectedIndex + 1}`}. ${editableDescription}`;
            
            if (customPrompt.trim()) {
                finalPrompt = `${customPrompt.trim()}\n\n${sceneInfo}`;
            } else {
                const defaultPrompt = "电影级场景，超细节，广角镜头，全景视图，环境光影，氛围感，电影质感，8K高清，细腻质感，写实风格，专业摄影，景深效果，自然光照，细节丰富。";
                finalPrompt = `${defaultPrompt}\n\n${sceneInfo}`;
            }
            
            updateData(data.id, {
                prompt: finalPrompt,
                model: data.model || imageModels[0] || 'Flux2',
                aspectRatio: data.aspectRatio || '16:9',
                resolution: data.resolution || '1k',
                count: data.count || 1,
                isLoading: true
            });
            
            setTimeout(() => {
                onGenerate?.(data.id, finalPrompt);
            }, 50);
        }
    };

    const aspectRatios = ['1:1', '4:3', '3:4', '16:9', '9:16'];
    const resolutions = ['1k', '2k'];
    const batchCounts = [1, 2, 3, 4];

    const containerBg = isDark ? 'bg-black' : 'bg-white';
    const containerBorder = selected ? 'border-blue-500 ring-2 ring-blue-500/30' : (isDark ? 'border-zinc-800' : 'border-gray-200');
    const overlayToolbarBg = isDark ? 'bg-black/50 border-white/5 text-gray-400' : 'bg-white/50 border-black/5 text-gray-600';
    const inputBg = isDark ? 'bg-zinc-800 hover:bg-zinc-800 border-zinc-700 focus:border-blue-500 text-white placeholder-zinc-500' : 'bg-gray-50 hover:bg-white border-gray-200 focus:border-blue-500 text-gray-900 placeholder-gray-400';
    const controlPanelBg = isDark ? 'bg-black/95 backdrop-blur-xl border-zinc-800/50' : 'bg-white/95 backdrop-blur-xl border-gray-200 shadow-xl';
    const textColor = isDark ? 'text-gray-300' : 'text-gray-700';
    const textSecondary = isDark ? 'text-gray-500' : 'text-gray-500';
    const textLight = isDark ? 'text-gray-400' : 'text-gray-600';
    const tagBg = isDark ? 'bg-zinc-800/80 text-gray-300' : 'bg-gray-200/80 text-gray-600';
    const tagBgSecondary = isDark ? 'bg-zinc-800 text-gray-300' : 'bg-gray-200 text-gray-700';
    const cardBg = isDark ? 'bg-zinc-900 border-zinc-800 hover:border-zinc-700' : 'bg-gray-50 border-gray-200 hover:border-gray-300';

    return (
        <>
          <div className="absolute bottom-full left-0 w-full mb-2 flex items-center justify-between pointer-events-auto">
              <div className="flex items-center gap-2 pl-1">
                  <div className={`${isDark ? 'bg-black/40 text-white' : 'bg-white/60 text-gray-800'} backdrop-blur-md font-semibold text-sm px-3 py-1.5 rounded-lg border border-transparent ${isDark ? 'hover:border-white/20' : 'hover:border-black/20'} truncate max-w-[160px] transition-all`} title={data.title}>
                      {data.title}
                  </div>
              </div>
              <div className={`flex items-center gap-1 backdrop-blur-md rounded-lg p-1 border ${overlayToolbarBg}`}>
                  {hasData && (
                      <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded select-none ${tagBg}`} title={`场景数量`}>
                          {data.sceneData?.length || 0}
                      </span>
                  )}
                  {hasData && (
                      <button title="重新选择JSON文件" className={`p-1 rounded transition-colors ${isDark ? 'hover:bg-zinc-800 hover:text-white' : 'hover:bg-gray-200 hover:text-black'}`} onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}>
                          <Icons.Upload size={12} className="cursor-pointer" />
                      </button>
                  )}
                  {selected && onDelete && (
                      <button title="删除节点" className={`p-1 rounded transition-colors ${isDark ? 'hover:bg-red-500/80 hover:text-white' : 'hover:bg-red-500 hover:text-white'}`} onClick={(e) => { e.stopPropagation(); onDelete(data.id); }}>
                          <Icons.Trash2 size={12} className="cursor-pointer" />
                      </button>
                  )}
                  {hasResult && (
                      <>
                          <button title="最大化" className={`p-1 rounded transition-colors ${isDark ? 'hover:bg-zinc-800 hover:text-white' : 'hover:bg-gray-200 hover:text-black'}`} onClick={(e) => { e.stopPropagation(); onMaximize?.(data.id); }}>
                              <Icons.Maximize2 size={12} />
                          </button>
                      </>
                  )}
              </div>
          </div>

          <div className={`w-full h-full relative group rounded-xl border ${containerBorder} ${containerBg} ${data.isStackOpen ? 'overflow-visible' : 'overflow-hidden'} shadow-lg overflow-hidden`} onDoubleClick={!hasData ? handleDoubleClick : undefined}>
              <input ref={fileInputRef} type="file" accept="application/json,.json" className="hidden" onChange={handleFileSelect} />

              {hasResult && hasData ? (
                  <div className="w-full h-full flex flex-col overflow-hidden">
                      <div className="flex-1 overflow-auto p-3 space-y-3">
                          {data.sceneData?.map((scene, index) => (
                              <div key={index} className={`p-2.5 rounded-lg border cursor-pointer transition-all ${index === selectedIndex ? 'bg-blue-500/15 border-blue-500/50' : cardBg}`} onClick={() => {
                                  setSelectedIndex(index);
                                  updateData(data.id, { selectedSceneIndex: index });
                              }}>
                                  <div className="flex items-center gap-2 mb-2">
                                      <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${tagBgSecondary}`}>#{index + 1}</span>
                                      <Icons.Film size={14} className={isDark ? 'text-amber-400' : 'text-amber-500'} />
                                      <span className={`text-sm font-bold ${textColor}`}>{scene.position || `场景 ${index + 1}`}</span>
                                  </div>
                                  {scene.people && scene.people.length > 0 && (
                                      <div className="mb-2">
                                          <span className={`text-[10px] font-medium ${textSecondary}`}>人物：</span>
                                          <div className="flex flex-wrap gap-1 mt-1">
                                              {scene.people.map((person, i) => (<span key={i} className={`text-[10px] px-1.5 py-0.5 rounded ${tagBgSecondary}`}>{person}</span>))}
                                          </div>
                                      </div>
                                  )}
                                  {scene.scene && (
                                      <div className={`text-[10px] leading-relaxed ${textLight}`}>
                                          <span className="font-medium">场景：</span>{scene.scene}
                                      </div>
                                  )}
                              </div>
                          ))}
                      </div>

                      {currentScene && (
                          <div className={`${controlPanelBg} border-t ${isDark ? 'border-zinc-800/50' : 'border-gray-200'} p-3 space-y-3`}>
                              <div className="flex items-center gap-3">
                                  <div className="flex items-center gap-2">
                                      <span className={`text-[10px] font-medium ${textSecondary}`}>序号</span>
                                      <input 
                                          type="number" 
                                          min={1} 
                                          max={data.sceneData?.length || 1} 
                                          value={selectedIndex + 1} 
                                          onChange={handleIndexChange} 
                                          className={`w-12 h-7 text-xs text-center rounded border ${inputBg}`}
                                          onClick={(e) => e.stopPropagation()}
                                          onKeyDown={(e) => e.stopPropagation()}
                                      />
                                  </div>
                                  <div className="flex items-center gap-2 flex-1 min-w-0">
                                      <Icons.Film size={12} className={isDark ? 'text-amber-400' : 'text-amber-500'} />
                                      <span className={`text-xs font-bold truncate ${textColor}`}>{currentScene.position || `场景 ${selectedIndex + 1}`}</span>
                                  </div>
                              </div>

                              {currentScene.people && currentScene.people.length > 0 && (
                                  <div>
                                      <span className={`text-[10px] font-medium ${textSecondary}`}>人物：</span>
                                      <div className="flex flex-wrap gap-1 mt-1">
                                          {currentScene.people.map((person, i) => (<span key={i} className={`text-[10px] px-1.5 py-0.5 rounded ${tagBgSecondary}`}>{person}</span>))}
                                      </div>
                                  </div>
                              )}

                              <div>
                                  <span className={`text-[10px] font-medium ${textSecondary}`}>提示词：</span>
                                  <textarea value={customPrompt} onChange={(e) => setCustomPrompt(e.target.value)} className={`w-full mt-1 h-10 text-[10px] leading-relaxed rounded border px-2 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-blue-500/20 ${inputBg}`} placeholder="输入额外的提示词..." onClick={(e) => e.stopPropagation()} />
                              </div>

                              <div>
                                  <span className={`text-[10px] font-medium ${textSecondary}`}>场景描述（可编辑）：</span>
                                  <textarea value={editableDescription} onChange={handleDescriptionChange} onBlur={handleDescriptionBlur} className={`w-full mt-1 h-16 text-[10px] leading-relaxed rounded border px-2 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-blue-500/20 ${inputBg}`} placeholder="输入场景描述..." onClick={(e) => e.stopPropagation()} />
                              </div>

                              <div className={`text-[10px] font-medium ${textSecondary}`}>图片生成</div>
                              <div className="flex items-center gap-2">
                                  <LocalCustomDropdown options={imageModels} value={data.model || imageModels[0] || 'Flux2'} onChange={(val: any) => updateData(data.id, { model: val })} isOpen={activeDropdown === 'model'} onToggle={() => setActiveDropdown(activeDropdown === 'model' ? null : 'model')} onClose={() => setActiveDropdown(null)} align="left" width="w-[120px]" isDark={isDark} />
                                  <LocalCustomDropdown icon={Icons.Crop} options={aspectRatios} value={data.aspectRatio || '16:9'} onChange={handleRatioChange} isOpen={activeDropdown === 'ratio'} onToggle={() => setActiveDropdown(activeDropdown === 'ratio' ? null : 'ratio')} onClose={() => setActiveDropdown(null)} isDark={isDark} />
                                  <LocalCustomDropdown icon={Icons.Monitor} options={resolutions} value={data.resolution || '1k'} onChange={(val: any) => updateData(data.id, { resolution: val })} isOpen={activeDropdown === 'res'} onToggle={() => setActiveDropdown(activeDropdown === 'res' ? null : 'res')} onClose={() => setActiveDropdown(null)} isDark={isDark} />
                                  <LocalCustomDropdown icon={Icons.Layers} options={batchCounts} value={data.count || 1} onChange={(val: any) => updateData(data.id, { count: val })} isOpen={activeDropdown === 'count'} onToggle={() => setActiveDropdown(activeDropdown === 'count' ? null : 'count')} onClose={() => setActiveDropdown(null)} isDark={isDark} />
                                  <div className="flex-1" />
                                  <button onClick={(e) => { e.stopPropagation(); handleGenerate(); }} disabled={!editableDescription || data.isLoading} className={`h-8 px-4 rounded-lg text-sm font-semibold flex items-center gap-1.5 transition-all active:scale-[0.98] ${editableDescription && !data.isLoading ? 'bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white shadow-lg shadow-blue-500/25' : 'bg-gray-400 text-white cursor-not-allowed'}`}>
                                      {data.isLoading ? <Icons.Loader2 className="animate-spin" size={12}/> : <Icons.Wand2 size={12} />}
                                      <span>{data.isLoading ? '生成中' : '生成'}</span>
                                  </button>
                              </div>
                          </div>
                      )}
                      
                      {(inputs && inputs.length > 0 || hasResult) && (
                          <div className={`p-3 border-t ${isDark ? 'border-zinc-800/50' : 'border-gray-200'}`}>
                              <div className="flex gap-3">
                                  {inputs && inputs.length > 0 && (
                                      <div className={`p-2 rounded-lg border ${cardBg} flex-1`}>
                                          <div className="flex items-center gap-1.5 mb-1.5">
                                              <Icons.Image size={12} className={isDark ? 'text-purple-400' : 'text-purple-500'} />
                                              <span className={`text-xs font-bold ${textColor}`}>参考</span>
                                          </div>
                                          <div className="h-24 w-full relative rounded overflow-hidden bg-zinc-900/30 flex items-center justify-center">
                                              <img 
                                                  src={inputs[0]} 
                                                  alt="参考" 
                                                  className="max-h-full max-w-full object-contain"
                                              />
                                          </div>
                                      </div>
                                  )}
                                  
                                  {hasResult && (
                                      <div className={`p-2 rounded-lg border ${cardBg} flex-1`}>
                                          <div className="flex items-center gap-1.5 mb-1.5">
                                              <Icons.Image size={12} className={isDark ? 'text-blue-400' : 'text-blue-500'} />
                                              <span className={`text-xs font-bold ${textColor}`}>预览</span>
                                          </div>
                                          <div className="h-24 w-full relative rounded overflow-hidden bg-zinc-900/30 flex items-center justify-center">
                                              <img 
                                                  src={data.imageSrc} 
                                                  alt="预览" 
                                                  className="max-h-full max-w-full object-contain"
                                              />
                                          </div>
                                      </div>
                                  )}
                              </div>
                          </div>
                      )}
                  </div>
              ) : hasData ? (
                  <div className="w-full h-full flex flex-col overflow-hidden">
                      <div className="flex-1 overflow-auto p-3 space-y-3">
                          {data.sceneData?.map((scene, index) => (
                              <div key={index} className={`p-2.5 rounded-lg border cursor-pointer transition-all ${index === selectedIndex ? 'bg-blue-500/15 border-blue-500/50' : cardBg}`} onClick={() => {
                                  setSelectedIndex(index);
                                  updateData(data.id, { selectedSceneIndex: index });
                              }}>
                                  <div className="flex items-center gap-2 mb-2">
                                      <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${tagBgSecondary}`}>#{index + 1}</span>
                                      <Icons.Film size={14} className={isDark ? 'text-amber-400' : 'text-amber-500'} />
                                      <span className={`text-sm font-bold ${textColor}`}>{scene.position || `场景 ${index + 1}`}</span>
                                  </div>
                                  {scene.people && scene.people.length > 0 && (
                                      <div className="mb-2">
                                          <span className={`text-[10px] font-medium ${textSecondary}`}>人物：</span>
                                          <div className="flex flex-wrap gap-1 mt-1">
                                              {scene.people.map((person, i) => (<span key={i} className={`text-[10px] px-1.5 py-0.5 rounded ${tagBgSecondary}`}>{person}</span>))}
                                          </div>
                                      </div>
                                  )}
                                  {scene.scene && (
                                      <div className={`text-[10px] leading-relaxed ${textLight}`}>
                                          <span className="font-medium">场景：</span>{scene.scene}
                                      </div>
                                  )}
                              </div>
                          ))}
                      </div>

                      {currentScene && (
                          <div className={`${controlPanelBg} border-t ${isDark ? 'border-zinc-800/50' : 'border-gray-200'} p-3 space-y-3`}>
                              <div className="flex items-center gap-3">
                                  <div className="flex items-center gap-2">
                                      <span className={`text-[10px] font-medium ${textSecondary}`}>序号</span>
                                      <input 
                                          type="number" 
                                          min={1} 
                                          max={data.sceneData?.length || 1} 
                                          value={selectedIndex + 1} 
                                          onChange={handleIndexChange} 
                                          className={`w-12 h-7 text-xs text-center rounded border ${inputBg}`}
                                          onClick={(e) => e.stopPropagation()}
                                          onKeyDown={(e) => e.stopPropagation()}
                                      />
                                  </div>
                                  <div className="flex items-center gap-2 flex-1 min-w-0">
                                      <Icons.Film size={12} className={isDark ? 'text-amber-400' : 'text-amber-500'} />
                                      <span className={`text-xs font-bold truncate ${textColor}`}>{currentScene.position || `场景 ${selectedIndex + 1}`}</span>
                                  </div>
                              </div>

                              {currentScene.people && currentScene.people.length > 0 && (
                                  <div>
                                      <span className={`text-[10px] font-medium ${textSecondary}`}>人物：</span>
                                      <div className="flex flex-wrap gap-1 mt-1">
                                          {currentScene.people.map((person, i) => (<span key={i} className={`text-[10px] px-1.5 py-0.5 rounded ${tagBgSecondary}`}>{person}</span>))}
                                      </div>
                                  </div>
                              )}

                              <div>
                                  <span className={`text-[10px] font-medium ${textSecondary}`}>提示词：</span>
                                  <textarea value={customPrompt} onChange={(e) => setCustomPrompt(e.target.value)} className={`w-full mt-1 h-10 text-[10px] leading-relaxed rounded border px-2 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-blue-500/20 ${inputBg}`} placeholder="输入额外的提示词..." onClick={(e) => e.stopPropagation()} />
                              </div>

                              <div>
                                  <span className={`text-[10px] font-medium ${textSecondary}`}>场景描述（可编辑）：</span>
                                  <textarea value={editableDescription} onChange={handleDescriptionChange} onBlur={handleDescriptionBlur} className={`w-full mt-1 h-16 text-[10px] leading-relaxed rounded border px-2 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-blue-500/20 ${inputBg}`} placeholder="输入场景描述..." onClick={(e) => e.stopPropagation()} />
                              </div>

                              <div className={`text-[10px] font-medium ${textSecondary}`}>图片生成</div>
                              <div className="flex items-center gap-2">
                                  <LocalCustomDropdown options={imageModels} value={data.model || imageModels[0] || 'Flux2'} onChange={(val: any) => updateData(data.id, { model: val })} isOpen={activeDropdown === 'model'} onToggle={() => setActiveDropdown(activeDropdown === 'model' ? null : 'model')} onClose={() => setActiveDropdown(null)} align="left" width="w-[120px]" isDark={isDark} />
                                  <LocalCustomDropdown icon={Icons.Crop} options={aspectRatios} value={data.aspectRatio || '16:9'} onChange={handleRatioChange} isOpen={activeDropdown === 'ratio'} onToggle={() => setActiveDropdown(activeDropdown === 'ratio' ? null : 'ratio')} onClose={() => setActiveDropdown(null)} isDark={isDark} />
                                  <LocalCustomDropdown icon={Icons.Monitor} options={resolutions} value={data.resolution || '1k'} onChange={(val: any) => updateData(data.id, { resolution: val })} isOpen={activeDropdown === 'res'} onToggle={() => setActiveDropdown(activeDropdown === 'res' ? null : 'res')} onClose={() => setActiveDropdown(null)} isDark={isDark} />
                                  <LocalCustomDropdown icon={Icons.Layers} options={batchCounts} value={data.count || 1} onChange={(val: any) => updateData(data.id, { count: val })} isOpen={activeDropdown === 'count'} onToggle={() => setActiveDropdown(activeDropdown === 'count' ? null : 'count')} onClose={() => setActiveDropdown(null)} isDark={isDark} />
                                  <div className="flex-1" />
                                  <button onClick={(e) => { e.stopPropagation(); handleGenerate(); }} disabled={!editableDescription || data.isLoading} className={`h-8 px-4 rounded-lg text-sm font-semibold flex items-center gap-1.5 transition-all active:scale-[0.98] ${editableDescription && !data.isLoading ? 'bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white shadow-lg shadow-blue-500/25' : 'bg-gray-400 text-white cursor-not-allowed'}`}>
                                      {data.isLoading ? <Icons.Loader2 className="animate-spin" size={12}/> : <Icons.Wand2 size={12} />}
                                      <span>{data.isLoading ? '生成中' : '生成'}</span>
                                  </button>
                              </div>
                          </div>
                      )}
                      
                      {(inputs && inputs.length > 0) && (
                          <div className={`p-3 border-t ${isDark ? 'border-zinc-800/50' : 'border-gray-200'}`}>
                              <div className="flex gap-3">
                                  {inputs && inputs.length > 0 && (
                                      <div className={`p-2 rounded-lg border ${cardBg} flex-1`}>
                                          <div className="flex items-center gap-1.5 mb-1.5">
                                              <Icons.Image size={12} className={isDark ? 'text-purple-400' : 'text-purple-500'} />
                                              <span className={`text-xs font-bold ${textColor}`}>参考</span>
                                          </div>
                                          <div className="h-24 w-full relative rounded overflow-hidden bg-zinc-900/30 flex items-center justify-center">
                                              <img 
                                                  src={inputs[0]} 
                                                  alt="参考" 
                                                  className="max-h-full max-w-full object-contain"
                                              />
                                          </div>
                                      </div>
                                  )}
                              </div>
                          </div>
                      )}
                  </div>
              ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center gap-3">
                      <div className={`w-16 h-16 rounded-full border flex items-center justify-center transition-all shadow-lg ${isDark ? 'bg-zinc-900 border-zinc-800 hover:bg-zinc-800' : 'bg-gray-50 border-gray-200 hover:bg-gray-100'}`}>
                          <Icons.FilePlus size={28} className={`${isDark ? 'text-zinc-500 group-hover/icon:text-cyan-400' : 'text-gray-400 group-hover/icon:text-cyan-500'} transition-colors`} />
                      </div>
                      <span className={`text-[11px] font-medium select-none ${textSecondary}`}>双击选择JSON文件</span>
                      <span className={`text-[10px] select-none ${textLight}`}>包含场景信息的JSON</span>
                  </div>
              )}

              {data.isLoading && (<div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-20"><Icons.Loader2 size={24} className="text-blue-500 animate-spin" /></div>)}
          </div>
        </>
    );
};
