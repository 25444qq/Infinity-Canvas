

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { NodeData, CharacterData } from '../../types';
import { Icons } from '../Icons';
import { MODEL_REGISTRY, getVisibleModels } from '../../services/geminiService';
import { LocalCustomDropdown, LocalMediaStack } from './Shared/LocalNodeComponents';

interface CharacterDisplayNodeProps {
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

export const CharacterDisplayNode: React.FC<CharacterDisplayNodeProps> = ({
    data, updateData, isDark = true, selected, onDelete, onGenerate, onDownload, onMaximize, inputs
}) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const hasData = !!data.characterData && data.characterData.length > 0;
    const hasResult = !!data.imageSrc && !data.isLoading;
    const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
    const [selectedIndex, setSelectedIndex] = useState<number>(data.selectedCharacterIndex || 0);
    const [editableDescription, setEditableDescription] = useState<string>('');
    const [customPrompt, setCustomPrompt] = useState<string>('真人电影风格，超细节，平视，人物正面，侧面，背面全身立绘三视图和纯正面大头照（大头照精致皮肤细腻可见毛孔）超写实摄影写真，全身三视图（正面，侧面，背面）+右边人物半身面部特写，纯白背景，写实质感，8K高清，细腻质感（注意：人物表情要自然） 光影：柔和均匀打光 背景：白色背景，全身像，光影交错，衣服材质精细，细节复杂，质感细腻、高细节，（一张图上正面侧面背面和大头照）。');
    const [imageModels, setImageModels] = useState<string[]>([]);

    const currentChar = hasData && selectedIndex >= 0 && selectedIndex < (data.characterData?.length || 0)
        ? data.characterData?.[selectedIndex]
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
        const char = hasData && selectedIndex >= 0 && selectedIndex < (data.characterData?.length || 0)
            ? data.characterData?.[selectedIndex]
            : null;
        if (char?.physical_description) {
            setEditableDescription(char.physical_description);
        } else {
            setEditableDescription('');
        }
    }, [selectedIndex, data.characterData, hasData]);

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const jsonContent = event.target?.result as string;
                const parsed = JSON.parse(jsonContent);

                let characters: CharacterData[] = [];
                if (Array.isArray(parsed)) {
                    characters = parsed;
                } else if (parsed.characters && Array.isArray(parsed.characters)) {
                    characters = parsed.characters;
                } else if (parsed.people && Array.isArray(parsed.people)) {
                    characters = parsed.people;
                } else {
                    console.warn('未找到人物数据数组');
                    return;
                }

                updateData(data.id, {
                    characterData: characters,
                    title: file.name.replace(/\.[^/.]+$/, '')
                });
                setSelectedIndex(0);
                // 同时更新 editableDescription
                if (characters[0]?.physical_description) {
                    setEditableDescription(characters[0].physical_description);
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
            const maxIndex = (data.characterData?.length || 1) - 1;
            const targetIndex = val - 1;
            const finalIndex = Math.max(0, Math.min(targetIndex, maxIndex));
            setSelectedIndex(finalIndex);
            updateData(data.id, { selectedCharacterIndex: finalIndex });
            // 让 useEffect 来处理 editableDescription 的更新，避免重复
        } else if (e.target.value === '') {
            setSelectedIndex(0);
        }
    };

    const handleDescriptionChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setEditableDescription(e.target.value);
    };

    const handleDescriptionBlur = () => {
        if (currentChar && editableDescription !== currentChar.physical_description) {
            const updatedChars = [...(data.characterData || [])];
            if (updatedChars[selectedIndex]) {
                updatedChars[selectedIndex] = {
                    ...updatedChars[selectedIndex],
                    physical_description: editableDescription
                };
                updateData(data.id, { characterData: updatedChars });
            }
        }
    };

    const handleRatioChange = (ratio: string) => {
        updateData(data.id, { aspectRatio: ratio });
    };

    const handleGenerate = () => {
        if (currentChar && editableDescription) {
            let finalPrompt = '';
            
            const charInfo = `Character reference: ${currentChar.name}. ${editableDescription}`;
            
            if (customPrompt.trim()) {
                finalPrompt = `${customPrompt.trim()}\n\n${charInfo}`;
            } else {
                const defaultPrompt = "真人电影风格，超细节，平视，人物正面，侧面，背面全身立绘三视图和纯正面大头照（大头照精致皮肤细腻可见毛孔）超写实摄影写真，全身三视图（正面，侧面，背面）+右边人物半身面部特写，纯白背景，写实质感，8K高清，细腻质感（注意：人物表情要自然）光影：柔和均匀打光背景：白色背景，全身像，光影交错，衣服材质精细，细节复杂，质感细腻、高细节，（一张图上正面侧面背面和大头照）。";
                finalPrompt = `${defaultPrompt}\n\n${charInfo}`;
            }
            
            updateData(data.id, {
                prompt: finalPrompt,
                model: data.model || imageModels[0] || 'Flux2',
                aspectRatio: data.aspectRatio || '1:1',
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
                      <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded select-none ${tagBg}`} title={`人物数量`}>
                          {data.characterData?.length || 0}
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
                          {data.characterData?.map((char, index) => (
                              <div key={index} className={`p-2.5 rounded-lg border cursor-pointer transition-all ${index === selectedIndex ? 'bg-blue-500/15 border-blue-500/50' : cardBg}`} onClick={() => {
                                  setSelectedIndex(index);
                                  updateData(data.id, { selectedCharacterIndex: index });
                                  // 让 useEffect 来处理 editableDescription 的更新，避免重复
                              }}>
                                  <div className="flex items-center gap-2 mb-2">
                                      <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${tagBgSecondary}`}>#{index + 1}</span>
                                      <Icons.User size={14} className={isDark ? 'text-rose-400' : 'text-rose-500'} />
                                      <span className={`text-sm font-bold ${textColor}`}>{char.name || '未知姓名'}</span>
                                      {char.gender && (<span className={`text-[10px] px-1.5 py-0.5 rounded ${tagBgSecondary}`}>{char.gender === '男' ? '♂' : '♀'}</span>)}
                                  </div>
                                  {char.personality && (
                                      <div className="mb-2">
                                          <span className={`text-[10px] font-medium ${textSecondary}`}>性格：</span>
                                          <div className="flex flex-wrap gap-1 mt-1">
                                              {Array.isArray(char.personality) ? char.personality.map((trait, i) => (<span key={i} className={`text-[10px] px-1.5 py-0.5 rounded ${tagBgSecondary}`}>{trait}</span>)) : (<span className={`text-[10px] ${textLight}`}>{char.personality}</span>)}
                                          </div>
                                      </div>
                                  )}
                                  {char.physical_description && (
                                      <div className={`text-[10px] leading-relaxed ${textLight}`}>
                                          <span className="font-medium">外貌：</span>{char.physical_description}
                                      </div>
                                  )}
                              </div>
                          ))}
                      </div>

                      {currentChar && (
                          <div className={`${controlPanelBg} border-t ${isDark ? 'border-zinc-800/50' : 'border-gray-200'} p-3 space-y-3`}>
                              <div className="flex items-center gap-3">
                                  <div className="flex items-center gap-2">
                                      <span className={`text-[10px] font-medium ${textSecondary}`}>序号</span>
                                      <input 
                                          type="number" 
                                          min={1} 
                                          max={data.characterData?.length || 1} 
                                          value={selectedIndex + 1} 
                                          onChange={handleIndexChange} 
                                          className={`w-12 h-7 text-xs text-center rounded border ${inputBg}`}
                                          onClick={(e) => e.stopPropagation()}
                                          onKeyDown={(e) => e.stopPropagation()}
                                      />
                                  </div>
                                  <div className="flex items-center gap-2 flex-1 min-w-0">
                                      <Icons.User size={12} className={isDark ? 'text-rose-400' : 'text-rose-500'} />
                                      <span className={`text-xs font-bold truncate ${textColor}`}>{currentChar.name || '未知姓名'}</span>
                                      {currentChar.gender && (<span className={`text-[10px] px-1.5 py-0.5 rounded ${tagBgSecondary}`}>{currentChar.gender === '男' ? '♂' : '♀'}</span>)}
                                  </div>
                              </div>

                              {currentChar.personality && (
                                  <div>
                                      <span className={`text-[10px] font-medium ${textSecondary}`}>性格：</span>
                                      <div className="flex flex-wrap gap-1 mt-1">
                                          {Array.isArray(currentChar.personality) ? currentChar.personality.map((trait, i) => (<span key={i} className={`text-[10px] px-1.5 py-0.5 rounded ${tagBgSecondary}`}>{trait}</span>)) : (<span className={`text-[10px] ${textLight}`}>{currentChar.personality}</span>)}
                                      </div>
                                  </div>
                              )}

                              <div>
                                  <span className={`text-[10px] font-medium ${textSecondary}`}>提示词：</span>
                                  <textarea value={customPrompt} onChange={(e) => setCustomPrompt(e.target.value)} className={`w-full mt-1 h-10 text-[10px] leading-relaxed rounded border px-2 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-blue-500/20 ${inputBg}`} placeholder="输入额外的提示词..." onClick={(e) => e.stopPropagation()} />
                              </div>

                              <div>
                                  <span className={`text-[10px] font-medium ${textSecondary}`}>人物描述（可编辑）：</span>
                                  <textarea value={editableDescription} onChange={handleDescriptionChange} onBlur={handleDescriptionBlur} className={`w-full mt-1 h-16 text-[10px] leading-relaxed rounded border px-2 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-blue-500/20 ${inputBg}`} placeholder="输入人物描述..." onClick={(e) => e.stopPropagation()} />
                              </div>

                              <div className={`text-[10px] font-medium ${textSecondary}`}>图片生成</div>
                              <div className="flex items-center gap-2">
                                  <LocalCustomDropdown options={imageModels} value={data.model || imageModels[0] || 'Flux2'} onChange={(val: any) => updateData(data.id, { model: val })} isOpen={activeDropdown === 'model'} onToggle={() => setActiveDropdown(activeDropdown === 'model' ? null : 'model')} onClose={() => setActiveDropdown(null)} align="left" width="w-[120px]" isDark={isDark} />
                                  <LocalCustomDropdown icon={Icons.Crop} options={aspectRatios} value={data.aspectRatio || '1:1'} onChange={handleRatioChange} isOpen={activeDropdown === 'ratio'} onToggle={() => setActiveDropdown(activeDropdown === 'ratio' ? null : 'ratio')} onClose={() => setActiveDropdown(null)} isDark={isDark} />
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
                          {data.characterData?.map((char, index) => (
                              <div key={index} className={`p-2.5 rounded-lg border cursor-pointer transition-all ${index === selectedIndex ? 'bg-blue-500/15 border-blue-500/50' : cardBg}`} onClick={() => {
                                  setSelectedIndex(index);
                                  updateData(data.id, { selectedCharacterIndex: index });
                                  // 让 useEffect 来处理 editableDescription 的更新，避免重复
                              }}>
                                  <div className="flex items-center gap-2 mb-2">
                                      <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${tagBgSecondary}`}>#{index + 1}</span>
                                      <Icons.User size={14} className={isDark ? 'text-rose-400' : 'text-rose-500'} />
                                      <span className={`text-sm font-bold ${textColor}`}>{char.name || '未知姓名'}</span>
                                      {char.gender && (<span className={`text-[10px] px-1.5 py-0.5 rounded ${tagBgSecondary}`}>{char.gender === '男' ? '♂' : '♀'}</span>)}
                                  </div>
                                  {char.personality && (
                                      <div className="mb-2">
                                          <span className={`text-[10px] font-medium ${textSecondary}`}>性格：</span>
                                          <div className="flex flex-wrap gap-1 mt-1">
                                              {Array.isArray(char.personality) ? char.personality.map((trait, i) => (<span key={i} className={`text-[10px] px-1.5 py-0.5 rounded ${tagBgSecondary}`}>{trait}</span>)) : (<span className={`text-[10px] ${textLight}`}>{char.personality}</span>)}
                                          </div>
                                      </div>
                                  )}
                                  {char.physical_description && (
                                      <div className={`text-[10px] leading-relaxed ${textLight}`}>
                                          <span className="font-medium">外貌：</span>{char.physical_description}
                                      </div>
                                  )}
                              </div>
                          ))}
                      </div>

                      {currentChar && (
                          <div className={`${controlPanelBg} border-t ${isDark ? 'border-zinc-800/50' : 'border-gray-200'} p-3 space-y-3`}>
                              <div className="flex items-center gap-3">
                                  <div className="flex items-center gap-2">
                                      <span className={`text-[10px] font-medium ${textSecondary}`}>序号</span>
                                      <input 
                                          type="number" 
                                          min={1} 
                                          max={data.characterData?.length || 1} 
                                          value={selectedIndex + 1} 
                                          onChange={handleIndexChange} 
                                          className={`w-12 h-7 text-xs text-center rounded border ${inputBg}`}
                                          onClick={(e) => e.stopPropagation()}
                                          onKeyDown={(e) => e.stopPropagation()}
                                      />
                                  </div>
                                  <div className="flex items-center gap-2 flex-1 min-w-0">
                                      <Icons.User size={12} className={isDark ? 'text-rose-400' : 'text-rose-500'} />
                                      <span className={`text-xs font-bold truncate ${textColor}`}>{currentChar.name || '未知姓名'}</span>
                                      {currentChar.gender && (<span className={`text-[10px] px-1.5 py-0.5 rounded ${tagBgSecondary}`}>{currentChar.gender === '男' ? '♂' : '♀'}</span>)}
                                  </div>
                              </div>

                              {currentChar.personality && (
                                  <div>
                                      <span className={`text-[10px] font-medium ${textSecondary}`}>性格：</span>
                                      <div className="flex flex-wrap gap-1 mt-1">
                                          {Array.isArray(currentChar.personality) ? currentChar.personality.map((trait, i) => (<span key={i} className={`text-[10px] px-1.5 py-0.5 rounded ${tagBgSecondary}`}>{trait}</span>)) : (<span className={`text-[10px] ${textLight}`}>{currentChar.personality}</span>)}
                                      </div>
                                  </div>
                              )}

                              <div>
                                  <span className={`text-[10px] font-medium ${textSecondary}`}>提示词：</span>
                                  <textarea value={customPrompt} onChange={(e) => setCustomPrompt(e.target.value)} className={`w-full mt-1 h-10 text-[10px] leading-relaxed rounded border px-2 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-blue-500/20 ${inputBg}`} placeholder="输入额外的提示词..." onClick={(e) => e.stopPropagation()} />
                              </div>

                              <div>
                                  <span className={`text-[10px] font-medium ${textSecondary}`}>人物描述（可编辑）：</span>
                                  <textarea value={editableDescription} onChange={handleDescriptionChange} onBlur={handleDescriptionBlur} className={`w-full mt-1 h-16 text-[10px] leading-relaxed rounded border px-2 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-blue-500/20 ${inputBg}`} placeholder="输入人物描述..." onClick={(e) => e.stopPropagation()} />
                              </div>

                              <div className={`text-[10px] font-medium ${textSecondary}`}>图片生成</div>
                              <div className="flex items-center gap-2">
                                  <LocalCustomDropdown options={imageModels} value={data.model || imageModels[0] || 'Flux2'} onChange={(val: any) => updateData(data.id, { model: val })} isOpen={activeDropdown === 'model'} onToggle={() => setActiveDropdown(activeDropdown === 'model' ? null : 'model')} onClose={() => setActiveDropdown(null)} align="left" width="w-[120px]" isDark={isDark} />
                                  <LocalCustomDropdown icon={Icons.Crop} options={aspectRatios} value={data.aspectRatio || '1:1'} onChange={handleRatioChange} isOpen={activeDropdown === 'ratio'} onToggle={() => setActiveDropdown(activeDropdown === 'ratio' ? null : 'ratio')} onClose={() => setActiveDropdown(null)} isDark={isDark} />
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
                      <span className={`text-[10px] select-none ${textLight}`}>包含人物信息的JSON</span>
                  </div>
              )}

              {data.isLoading && (<div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-20"><Icons.Loader2 size={24} className="text-blue-500 animate-spin" /></div>)}
          </div>
        </>
    );
};
