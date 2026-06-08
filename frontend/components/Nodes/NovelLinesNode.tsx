import React, { useState, useEffect, useCallback, useRef } from 'react';
import { NodeData, NovelLineItem, CharacterConfig } from '../../types';
import { Icons } from '../Icons';
import { MODEL_REGISTRY, getVisibleModels, generateAudio, generateMergeAudio } from '../../services/geminiService';
import { NovelLineItem as NovelLineItemComp } from './NovelLineItem';
import { NovelCharacterVoiceItem } from './NovelCharacterVoiceItem';

interface NovelLinesNodeProps {
  data: NodeData;
  updateData: (id: string, updates: Partial<NodeData>) => void;
  onGenerate: (id: string) => void;
  selected?: boolean;
  showControls?: boolean;
  inputs?: string[];
  isDark?: boolean;
  isSelecting?: boolean;
}

export const NovelLinesNode: React.FC<NovelLinesNodeProps> = ({
    data, updateData, onGenerate, selected, showControls, inputs = [], isDark = true, isSelecting
}) => {
    const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
    const [textModels, setTextModels] = useState<string[]>([]);
    const loadFileRef = useRef<HTMLInputElement>(null);

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

    const textFromInput = inputs.find(i => !i.startsWith('data:')) || '';
    const lineData: NovelLineItem[] = data.lineData || [];
    const hasResult = lineData.length > 0 && !data.isLoading;
    const characterConfigs = data.characterConfigs || [];

    // Extract unique characters from line data, prepend fixed "叙事"
    const characters: string[] = [
        '叙事',
        ...new Set(
            lineData
                .filter(l => l.description === '对话' && l.speaker)
                .map(l => l.speaker as string)
        ),
    ];

    const containerBg = isDark ? 'bg-[#1a1a1a]' : 'bg-white';
    const containerBorder = selected ? 'border-blue-500 ring-2 ring-blue-500/30' : (isDark ? 'border-zinc-700/50' : 'border-gray-200');
    const controlPanelBg = isDark ? 'bg-[#1a1a1a]/95 backdrop-blur-xl border-zinc-700/50' : 'bg-white/95 backdrop-blur-xl border-gray-200 shadow-xl';
    const inputBg = isDark ? 'bg-zinc-800/80 hover:bg-zinc-800 border-zinc-700 focus:border-blue-500 text-white placeholder-zinc-500' : 'bg-gray-50 hover:bg-white border-gray-200 focus:border-blue-500 text-gray-900 placeholder-gray-400';
    const emptyStateIconColor = isDark ? 'bg-zinc-800/50 text-zinc-500' : 'bg-gray-100 text-gray-400';
    const emptyStateTextColor = isDark ? 'text-zinc-500' : 'text-gray-400';

    const updateCharacterConfig = (charName: string, updates: Partial<CharacterConfig>) => {
        const newConfigs = [...characterConfigs];
        const existingIdx = newConfigs.findIndex(c => c.character === charName);
        if (existingIdx >= 0) {
            newConfigs[existingIdx] = { ...newConfigs[existingIdx], ...updates };
        } else {
            // ensure we have entries up to the correct position
            const targetIdx = characters.indexOf(charName);
            if (targetIdx >= 0) {
                // fill gaps with undefined
                while (newConfigs.length <= targetIdx) newConfigs.push(undefined as any);
                newConfigs[targetIdx] = { character: charName, ...updates };
            }
        }
        updateData(data.id, { characterConfigs: newConfigs });
    };

    const updateLine = (idx: number, field: string, value: string) => {
        const newLines = [...lineData];
        (newLines[idx] as any)[field] = value;
        updateData(data.id, { lineData: newLines });
    };

    const audioRefs = useRef<Map<number, HTMLAudioElement>>(new Map());
    const mergeAudioRef = useRef<HTMLAudioElement | null>(null);
    const lineDataRef = useRef<NovelLineItem[]>([]);
    const characterConfigsRef = useRef<CharacterConfig[]>([]);
    const [isBatchGenerating, setIsBatchGenerating] = useState(false);
    const [isMergePlaying, setIsMergePlaying] = useState(false);

    // Always sync latest values to refs
    lineDataRef.current = lineData;
    characterConfigsRef.current = characterConfigs;

    const generateLineAudio = async (lineIdx: number): Promise<boolean> => {
        const latestLines = lineDataRef.current;
        const line = latestLines[lineIdx];
        const speaker = line.speaker || (line.description?.includes('对话') ? '未知' : '叙事');
        const dialogueText = line.dialogue || line.processed_text;
        if (!dialogueText) return false;

        // Mark as generating
        const newLines = [...latestLines];
        newLines[lineIdx] = { ...newLines[lineIdx], isGeneratingAudio: true };
        updateData(data.id, { lineData: newLines });

        try {
            const cfg = characterConfigsRef.current.find(c => c.character === speaker);
            const refAudio = cfg?.refAudio;
            const voiceDescription = cfg?.voiceDescription;
            const audioModel = 'Qwen3-TTS';

            let refAudioParam: string | undefined;
            let instructionParam: string | undefined;
            let emotionParam: string | undefined;

            if (refAudio) {
                refAudioParam = refAudio;
            } else if (voiceDescription) {
                instructionParam = voiceDescription;
            }

            const audioUrl = await generateAudio(
                dialogueText,
                audioModel,
                emotionParam,
                refAudioParam,
                undefined,
                undefined,
                instructionParam,
            );

            const updatedLines = [...lineDataRef.current];
            updatedLines[lineIdx] = { ...updatedLines[lineIdx], audioUrl, isGeneratingAudio: false };
            updateData(data.id, { lineData: updatedLines });
            return true;
        } catch (err) {
            console.error('Audio generation failed for line', lineIdx, err);
            const updatedLines = [...lineDataRef.current];
            updatedLines[lineIdx] = { ...updatedLines[lineIdx], isGeneratingAudio: false };
            updateData(data.id, { lineData: updatedLines });
            return false;
        }
    };

    const handleLineAudioGenerate = async (lineIdx: number, e: React.MouseEvent) => {
        e.stopPropagation();
        await generateLineAudio(lineIdx);
    };

    const handleBatchGenerate = async () => {
        setIsBatchGenerating(true);
        const len = lineDataRef.current.length;
        for (let i = 0; i < len; i++) {
            await generateLineAudio(i);
            await new Promise(r => setTimeout(r, 1000));
        }
        setIsBatchGenerating(false);
    };

    const handleLineAudioPlay = (lineIdx: number, e: React.MouseEvent) => {
        e.stopPropagation();
        const line = lineData[lineIdx];
        if (!line.audioUrl) return;
        let audio = audioRefs.current.get(lineIdx);
        if (!audio) {
            audio = new Audio(line.audioUrl);
            audio.onended = () => {
                // No action needed
            };
            audioRefs.current.set(lineIdx, audio);
        }
        if (audio.paused) {
            audio.play().catch(() => {});
        } else {
            audio.pause();
            audio.currentTime = 0;
        }
    };

    const handleMergeAudio = async () => {
        // Collect filenames from all lines that have audio
        const filenames: string[] = [];
        for (const line of lineDataRef.current) {
            if (line.audioUrl) {
                // Extract filename from path like /outputs/abc.wav
                const parts = line.audioUrl.split('/');
                filenames.push(parts[parts.length - 1]);
            }
        }
        if (filenames.length === 0) return;

        updateData(data.id, { isMerging: true });
        try {
            const result = await generateMergeAudio(filenames);
            updateData(data.id, { mergeAudioUrl: result.url, isMerging: false });
        } catch (err) {
            console.error('Audio merge failed:', err);
            updateData(data.id, { isMerging: false });
        }
    };

    const handleMergePlay = () => {
        if (!data.mergeAudioUrl) return;
        if (!mergeAudioRef.current) {
            mergeAudioRef.current = new Audio(data.mergeAudioUrl);
            mergeAudioRef.current.onended = () => setIsMergePlaying(false);
        }
        if (mergeAudioRef.current.paused) {
            mergeAudioRef.current.play().catch(() => {});
            setIsMergePlaying(true);
        } else {
            mergeAudioRef.current.pause();
            mergeAudioRef.current.currentTime = 0;
            setIsMergePlaying(false);
        }
    };

    const handleSaveLines = () => {
        const exportData = {
            lineData,
            characterConfigs,
            exportedAt: new Date().toISOString(),
        };
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `novel_lines_${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const handleLoadLines = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            try {
                const json = JSON.parse(ev.target?.result as string);
                if (json.lineData && Array.isArray(json.lineData)) {
                    updateData(data.id, {
                        lineData: json.lineData,
                        characterConfigs: json.characterConfigs || [],
                    });
                }
            } catch (err) {
                console.error('Failed to parse file:', err);
            }
        };
        reader.readAsText(file);
        e.target.value = '';
    };

    return (
      <>
        <div className={`w-full h-full relative rounded-2xl border ${containerBorder} ${containerBg} overflow-hidden shadow-xl group transition-all duration-200`}>
            {/* Save + Load buttons — top-right corner */}
            <div className="absolute top-2 right-2 flex items-center gap-1 z-10">
                {hasResult && (
                    <button
                        className={`w-7 h-7 rounded-lg flex items-center justify-center border transition-all ${
                            isDark
                                ? 'border-zinc-600 hover:border-zinc-500 text-zinc-400 hover:text-white bg-black/40'
                                : 'border-gray-300 hover:border-gray-400 text-gray-500 hover:text-gray-700 bg-white/70'
                        }`}
                        onClick={(e) => { e.stopPropagation(); handleSaveLines(); }}
                        title="保存 JSON"
                    >
                        <Icons.Download size={12} />
                    </button>
                )}
                <input
                    ref={loadFileRef}
                    type="file"
                    accept=".json"
                    className="hidden"
                    onChange={handleLoadLines}
                />
                <button
                    className={`w-7 h-7 rounded-lg flex items-center justify-center border transition-all ${
                        isDark
                            ? 'border-zinc-600 hover:border-zinc-500 text-zinc-400 hover:text-white bg-black/40'
                            : 'border-gray-300 hover:border-gray-400 text-gray-500 hover:text-gray-700 bg-white/70'
                    }`}
                    onClick={(e) => { e.stopPropagation(); loadFileRef.current?.click(); }}
                    title="加载 JSON"
                >
                    <Icons.Upload size={12} />
                </button>
            </div>
            {hasResult ? (
                <div className="w-full h-full p-2 flex flex-col">
                    {/* Header */}
                    <div className={`flex items-center justify-between px-2 py-1 mb-1 pr-16 ${isDark ? 'text-zinc-400' : 'text-gray-500'}`}>
                        <div className="flex items-center gap-2">
                            <Icons.BookOpen size={14} />
                            <span className="text-[10px] font-bold uppercase tracking-wider">角色自动分析结果</span>
                        </div>
                        <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${isDark ? 'bg-zinc-800 text-zinc-400' : 'bg-gray-100 text-gray-500'}`}>
                            {lineData.length} 行
                        </span>
                    </div>

                    {/* Scrollable list — uses sub-component */}
                    <div className="flex-1 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
                        {lineData.map((line, idx) => (
                            <NovelLineItemComp
                                key={idx}
                                idx={idx}
                                line={line}
                                characters={characters}
                                activeDropdown={activeDropdown}
                                isDark={isDark}
                                onToggleDropdown={setActiveDropdown}
                                onUpdateLine={updateLine}
                                onAudioGenerate={handleLineAudioGenerate}
                                onAudioPlay={handleLineAudioPlay}
                            />
                        ))}
                    </div>
                </div>
            ) : (
                <div className={`w-full h-full flex flex-col items-center justify-center ${emptyStateTextColor}`}>
                    <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-4 ${emptyStateIconColor}`}>
                        <Icons.BookOpen size={28} className="opacity-60"/>
                    </div>
                    <span className="text-sm font-medium opacity-60">多角色配音</span>
                    <span className="text-xs opacity-40 mt-1">连接小说文本到左侧连接点，开始处理</span>
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
            <div className="absolute top-full left-1/2 -translate-x-1/2 min-w-[580px] pt-4 z-[70] pointer-events-auto" onMouseDown={(e) => e.stopPropagation()}>
                <div className={`${controlPanelBg} rounded-2xl p-4 flex flex-col gap-3 border`}>
                    {/* Header row */}
                    <div className="flex items-center gap-2">
                        {textFromInput && (
                            <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs ${isDark ? 'bg-amber-500/15 text-amber-400 border border-amber-500/20' : 'bg-amber-50 text-amber-600 border border-amber-200'}`}>
                                <Icons.FileText size={14} />
                                <span>小说文本已连接</span>
                            </div>
                        )}
                        <span className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? 'text-zinc-500' : 'text-gray-400'}`}>
                            {hasResult ? `${lineData.length} 行已处理` : '多角色配音处理'}
                        </span>
                    </div>

                    {/* Character voice config list — uses sub-component */}
                    {hasResult && characters.length > 0 && (
                        <div className="space-y-2 max-h-[300px] overflow-y-auto custom-scrollbar">
                            <div className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? 'text-zinc-500' : 'text-gray-400'}`}>
                                人物配音配置
                            </div>
                            {characters.map((char) => {
                                const cfg = characterConfigs.find(c => c.character === char) || { character: char, refAudio: undefined, voiceDescription: undefined };
                                return (
                                    <NovelCharacterVoiceItem
                                        key={char}
                                        char={char}
                                        cfg={cfg}
                                        characters={characters}
                                        isDark={isDark}
                                        inputBg={inputBg}
                                        activeDropdown={activeDropdown}
                                        onToggleDropdown={setActiveDropdown}
                                        onUpdateCharacterConfig={updateCharacterConfig}
                                    />
                                );
                            })}
                        </div>
                    )}

                    {/* Model selector + format button row */}
                    <div className="flex items-center gap-2 pt-1 border-t ${isDark ? 'border-zinc-700' : 'border-gray-200'}">
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
                                    : 'bg-gradient-to-r from-violet-600 to-violet-500 hover:from-violet-500 hover:to-violet-400 text-white shadow-lg shadow-violet-500/25 hover:shadow-violet-500/40'
                            }`}
                        >
                            {data.isLoading ? <Icons.Loader2 className="animate-spin" size={15}/> : <Icons.Wand2 size={15} />}
                            <span>{data.isLoading ? '处理中' : '开始'}</span>
                        </button>
                    </div>

                    {/* Bottom action bar: batch generate / merge audio / download */}
                    {hasResult && characters.length > 0 && (
                        <div className="flex items-center gap-2 pt-1 border-t ${isDark ? 'border-zinc-700' : 'border-gray-200'}">
                            <button
                                className={`flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium transition-all ${
                                    isBatchGenerating
                                        ? (isDark ? 'bg-zinc-600 text-zinc-400 cursor-not-allowed' : 'bg-gray-300 text-gray-500 cursor-not-allowed')
                                        : isDark
                                            ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/25'
                                            : 'bg-emerald-50 text-emerald-600 border border-emerald-200 hover:bg-emerald-100'
                                }`}
                                onClick={handleBatchGenerate}
                                disabled={isBatchGenerating}
                            >
                                {isBatchGenerating ? <Icons.Loader2 size={14} className="animate-spin" /> : <Icons.Play size={14} />}
                                批量生成音频
                            </button>

                            <button
                                className={`flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium transition-all ${
                                    data.isMerging
                                        ? (isDark ? 'bg-zinc-600 text-zinc-400 cursor-not-allowed' : 'bg-gray-300 text-gray-500 cursor-not-allowed')
                                        : isDark
                                            ? 'bg-blue-500/15 text-blue-400 border border-blue-500/20 hover:bg-blue-500/25'
                                            : 'bg-blue-50 text-blue-600 border border-blue-200 hover:bg-blue-100'
                                }`}
                                onClick={handleMergeAudio}
                                disabled={data.isMerging}
                            >
                                {data.isMerging ? <Icons.Loader2 size={14} className="animate-spin" /> : <Icons.Layers size={14} />}
                                合并音频
                            </button>

                            {/* Play/Pause for merged audio */}
                            {data.mergeAudioUrl && (
                                <button
                                    className={`flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium transition-all ${
                                        isDark
                                            ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/25'
                                            : 'bg-emerald-50 text-emerald-600 border border-emerald-200 hover:bg-emerald-100'
                                    }`}
                                    onClick={handleMergePlay}
                                >
                                    {isMergePlaying ? <Icons.Pause size={14} /> : <Icons.Play size={14} />}
                                    播放合并
                                </button>
                            )}

                            <div className="flex-1" />

                            {data.mergeAudioUrl && (
                                <a
                                    href={data.mergeAudioUrl}
                                    download
                                    className={`flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium transition-all ${
                                        isDark
                                            ? 'bg-zinc-500/15 text-zinc-400 border border-zinc-500/20 hover:bg-zinc-500/25'
                                            : 'bg-gray-100 text-gray-600 border border-gray-300 hover:bg-gray-200'
                                    }`}
                                >
                                    <Icons.Download size={14} />
                                    下载
                                </a>
                            )}
                        </div>
                    )}
                </div>
            </div>
        )}
      </>
    );
};
