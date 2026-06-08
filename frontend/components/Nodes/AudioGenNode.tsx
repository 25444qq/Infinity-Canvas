import React, { useState, useEffect, useRef, useCallback } from 'react';
import { NodeData } from '../../types';
import { Icons } from '../Icons';
import { MODEL_REGISTRY, getVisibleModels } from '../../services/geminiService';

interface AudioGenNodeProps {
  data: NodeData;
  updateData: (id: string, updates: Partial<NodeData>) => void;
  onGenerate: (id: string) => void;
  selected?: boolean;
  showControls?: boolean;
  inputs?: string[];
  onDownload?: (id: string) => void;
  isDark?: boolean;
  isSelecting?: boolean;
}

const EMOTIONS = ['neutral', 'happy', 'sad', 'angry', 'excited', 'gentle', 'whisper', 'narrative'];

const QWEN_LANGUAGES = [
  { value: 'zh', label: '中文' },
  { value: 'en', label: '英文' },
  { value: 'ja', label: '日语' },
  { value: 'ko', label: '韩语' },
  { value: 'de', label: '德语' },
  { value: 'fr', label: '法语' },
  { value: 'ru', label: '俄语' },
  { value: 'pt', label: '葡萄牙语' },
  { value: 'es', label: '西班牙语' },
  { value: 'it', label: '意大利语' }
];

const QWEN_PRESET_VOICES = [
  { value: 'cherry', label: '亲切女声' },
  { value: 'ethan', label: '沉稳男声' },
  { value: 'chelsie', label: '活力女声' },
  { value: 'serena', label: '温柔女声' },
  { value: 'dylan', label: '北京男声' },
  { value: 'jada', label: '上海女声' },
  { value: 'sunny', label: '四川女声' }
];

export const AudioGenNode: React.FC<AudioGenNodeProps> = ({
    data, updateData, onGenerate, selected, showControls, inputs = [], onDownload, isDark = true, isSelecting
}) => {
    const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
    const [deferredInputs, setDeferredInputs] = useState(false);
    const [audioModels, setAudioModels] = useState<string[]>([]);
    const [isPlaying, setIsPlaying] = useState(false);
    const audioRef = useRef<HTMLAudioElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const isSelectedAndStable = selected && !isSelecting;

    const updateModels = useCallback(() => {
        const visibleModels = getVisibleModels();
        const models = visibleModels.filter(k => MODEL_REGISTRY[k]?.category === 'AUDIO');
        setAudioModels(models);
    }, []);

    useEffect(() => {
        updateModels();
        window.addEventListener('modelRegistryUpdated', updateModels);
        return () => window.removeEventListener('modelRegistryUpdated', updateModels);
    }, [updateModels]);

    useEffect(() => {
        if (audioModels.length > 0 && (!data.model || !audioModels.includes(data.model))) {
            updateData(data.id, { model: audioModels[0] });
        }
    }, [audioModels, data.model, data.id, updateData]);

    useEffect(() => {
        if (isSelectedAndStable && showControls) {
            const t = setTimeout(() => setDeferredInputs(true), 100);
            return () => clearTimeout(t);
        } else setDeferredInputs(false);
    }, [isSelectedAndStable, showControls]);

    const hasResult = !!data.audioSrc && !data.isLoading;

    const handleAudioEnded = () => setIsPlaying(false);

    const togglePlayPause = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (audioRef.current) {
            if (isPlaying) {
                audioRef.current.pause();
                setIsPlaying(false);
            } else {
                audioRef.current.play().catch(() => {});
                setIsPlaying(true);
            }
        }
    };

    const containerBg = isDark ? 'bg-[#1a1a1a]' : 'bg-white';
    const containerBorder = selected ? 'border-blue-500 ring-2 ring-blue-500/30' : (isDark ? 'border-zinc-700/50' : 'border-gray-200');
    const controlPanelBg = isDark ? 'bg-[#1a1a1a]/95 backdrop-blur-xl border-zinc-700/50' : 'bg-white/95 backdrop-blur-xl border-gray-200 shadow-xl';
    const inputBg = isDark ? 'bg-zinc-800/80 hover:bg-zinc-800 border-zinc-700 focus:border-blue-500 text-white placeholder-zinc-500' : 'bg-gray-50 hover:bg-white border-gray-200 focus:border-blue-500 text-gray-900 placeholder-gray-400';
    const emptyStateIconColor = isDark ? 'bg-zinc-800/50 text-zinc-500' : 'bg-gray-100 text-gray-400';
    const emptyStateTextColor = isDark ? 'text-zinc-500' : 'text-gray-400';

    const refAudioConnected = inputs.some(i => i.startsWith('data:audio/'));
    const textFromInput = inputs.find(i => !i.startsWith('data:')) || '';

    useEffect(() => {
        if (textFromInput && !data.prompt) {
            updateData(data.id, { prompt: textFromInput });
        }
    }, [textFromInput]);

    const hasPrompt = !!(data.prompt || textFromInput);

    return (
      <>
        <div className={`w-full h-full relative rounded-2xl border ${containerBorder} ${containerBg} overflow-hidden shadow-xl group transition-all duration-200`}>
            {hasResult ? (
                <div className="w-full h-full flex flex-col items-center justify-center gap-3 p-4">
                    <audio
                        ref={audioRef}
                        src={data.audioSrc}
                        onEnded={handleAudioEnded}
                        preload="metadata"
                    />
                    <div
                        className={`w-20 h-20 rounded-full flex items-center justify-center cursor-pointer transition-all shadow-lg ${isDark ? 'bg-gradient-to-br from-blue-500/20 to-cyan-500/20 border border-blue-500/30' : 'bg-gradient-to-br from-blue-100 to-cyan-100 border border-blue-200'} hover:scale-105 active:scale-95`}
                        onClick={togglePlayPause}
                    >
                        {isPlaying ? (
                            <Icons.Pause size={32} className={`${isDark ? 'text-blue-400' : 'text-blue-600'}`}/>
                        ) : (
                            <Icons.Play size={32} className={`ml-1 ${isDark ? 'text-blue-400' : 'text-blue-600'}`}/>
                        )}
                    </div>
                    <span className={`text-xs font-medium select-none ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                        {isPlaying ? '播放中...' : '点击播放'}
                    </span>
                </div>
            ) : (
                <div className={`w-full h-full flex flex-col items-center justify-center ${emptyStateTextColor}`}>
                    <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-4 ${emptyStateIconColor}`}>
                        <Icons.Music size={28} className="opacity-60"/>
                    </div>
                    <span className="text-sm font-medium opacity-60">音频生成</span>
                    <span className="text-xs opacity-40 mt-1">选中节点开始创作</span>
                </div>
            )}

            {data.isLoading && (
                <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center z-20">
                    <Icons.Loader2 size={32} className="text-blue-500 animate-spin mb-3" />
                    <span className="text-white/80 text-sm font-medium">生成中...</span>
                </div>
            )}
        </div>

        {isSelectedAndStable && showControls && (
            <div className="absolute top-full left-1/2 -translate-x-1/2 min-w-[480px] pt-4 z-[70] pointer-events-auto" onMouseDown={(e) => e.stopPropagation()}>
                <div className={`${controlPanelBg} rounded-2xl p-4 flex flex-col gap-3 border`}>
                    <div className="flex items-center gap-2">
                        {refAudioConnected && (
                            <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs ${isDark ? 'bg-violet-500/15 text-violet-400 border border-violet-500/20' : 'bg-violet-50 text-violet-600 border border-violet-200'}`}>
                                <Icons.Music size={14} />
                                <span>参考音频已连接</span>
                            </div>
                        )}
                        <span className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? 'text-zinc-500' : 'text-gray-400'}`}>
                            {textFromInput ? '已连接文本输入' : '手动输入文本'}
                        </span>
                    </div>

                    <textarea
                        className={`w-full border rounded-xl px-4 py-3 text-sm leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/20 min-h-[72px] no-scrollbar transition-all ${inputBg}`}
                        placeholder="输入要合成的文本..."
                        value={data.prompt || ''}
                        onChange={(e) => updateData(data.id, { prompt: e.target.value })}
                        onWheel={(e) => e.stopPropagation()}
                    />

                    <textarea
                        className={`w-full border rounded-xl px-4 py-3 text-sm leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/20 min-h-[48px] no-scrollbar transition-all ${inputBg}`}
                        placeholder="输入语音指令描述（如：人物性别，声音特点，语速、语调、情感表达等）...，输入指令会屏蔽预设人物角色"
                        value={data.instruction || ''}
                        onChange={(e) => updateData(data.id, { instruction: e.target.value })}
                        onWheel={(e) => e.stopPropagation()}
                    />

                    <div className="flex items-center gap-2 flex-wrap">
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
                                    {audioModels.map((m) => (
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

                        <div className="relative flex items-center">
                            <button
                                className={`flex items-center gap-2 cursor-pointer group h-8 px-3 rounded-lg border transition-all ${
                                    activeDropdown === 'emotion'
                                        ? (isDark ? 'bg-zinc-700 border-zinc-600' : 'bg-gray-100 border-gray-300')
                                        : (isDark ? 'border-zinc-700 hover:border-zinc-600' : 'border-gray-200 hover:border-gray-300')
                                } ${isDark ? 'hover:bg-zinc-700' : 'hover:bg-gray-100'}`}
                                onClick={(e) => { e.stopPropagation(); setActiveDropdown(activeDropdown === 'emotion' ? null : 'emotion'); }}
                            >
                                <Icons.Smile size={15} className={`transition-colors ${activeDropdown === 'emotion' ? (isDark ? 'text-blue-400' : 'text-blue-600') : (isDark ? 'text-zinc-400 group-hover:text-white' : 'text-gray-500 group-hover:text-gray-700')}`} />
                                <span className={`text-xs font-medium transition-colors select-none max-w-[80px] truncate ${
                                    activeDropdown === 'emotion'
                                        ? (isDark ? 'text-white' : 'text-gray-900')
                                        : (isDark ? 'text-zinc-300 group-hover:text-white' : 'text-gray-600 group-hover:text-gray-900')
                                }`}>
                                    {data.emotion || '情绪'}
                                </span>
                            </button>
                            {activeDropdown === 'emotion' && (
                                <div className={`absolute bottom-full mb-2 left-0 min-w-[130px] ${isDark ? 'bg-[#1a1a1a] border-zinc-700' : 'bg-white border-gray-200 shadow-xl'} border rounded-xl shadow-2xl py-1.5 z-[100]`} onMouseDown={(e) => e.stopPropagation()}>
                                    {EMOTIONS.map((em) => (
                                        <div
                                            key={em}
                                            className={`px-3 py-2 text-xs font-medium rounded-lg cursor-pointer mx-1.5 mb-0.5 ${
                                                data.emotion === em
                                                    ? (isDark ? 'bg-blue-500/15 text-blue-400' : 'bg-blue-50 text-blue-600')
                                                    : (isDark ? 'text-zinc-300 hover:bg-zinc-700 hover:text-white' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900')
                                            }`}
                                            onClick={() => { updateData(data.id, { emotion: em }); setActiveDropdown(null); }}
                                        >
                                            {em}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                            <div className="relative flex items-center">
                                <button
                                    className={`flex items-center gap-2 cursor-pointer group h-8 px-3 rounded-lg border transition-all ${
                                        activeDropdown === 'language'
                                            ? (isDark ? 'bg-zinc-700 border-zinc-600' : 'bg-gray-100 border-gray-300')
                                            : (isDark ? 'border-zinc-700 hover:border-zinc-600' : 'border-gray-200 hover:border-gray-300')
                                    } ${isDark ? 'hover:bg-zinc-700' : 'hover:bg-gray-100'}`}
                                    onClick={(e) => { e.stopPropagation(); setActiveDropdown(activeDropdown === 'language' ? null : 'language'); }}
                                >
                                    <Icons.Globe size={15} className={`transition-colors ${activeDropdown === 'language' ? (isDark ? 'text-blue-400' : 'text-blue-600') : (isDark ? 'text-zinc-400 group-hover:text-white' : 'text-gray-500 group-hover:text-gray-700')}`} />
                                    <span className={`text-xs font-medium transition-colors select-none max-w-[80px] truncate ${
                                        activeDropdown === 'language'
                                            ? (isDark ? 'text-white' : 'text-gray-900')
                                            : (isDark ? 'text-zinc-300 group-hover:text-white' : 'text-gray-600 group-hover:text-gray-900')
                                    }`}>
                                        {QWEN_LANGUAGES.find(l => l.value === data.language)?.label || '语言'}
                                    </span>
                                </button>
                                {activeDropdown === 'language' && (
                                    <div className={`absolute bottom-full mb-2 left-0 min-w-[130px] ${isDark ? 'bg-[#1a1a1a] border-zinc-700' : 'bg-white border-gray-200 shadow-xl'} border rounded-xl shadow-2xl py-1.5 z-[100]`} onMouseDown={(e) => e.stopPropagation()}>
                                        {QWEN_LANGUAGES.map((lang) => (
                                            <div
                                                key={lang.value}
                                                className={`px-3 py-2 text-xs font-medium rounded-lg cursor-pointer mx-1.5 mb-0.5 ${
                                                    data.language === lang.value
                                                        ? (isDark ? 'bg-blue-500/15 text-blue-400' : 'bg-blue-50 text-blue-600')
                                                        : (isDark ? 'text-zinc-300 hover:bg-zinc-700 hover:text-white' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900')
                                                }`}
                                                onClick={() => { updateData(data.id, { language: lang.value }); setActiveDropdown(null); }}
                                            >
                                                {lang.label}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {data.model !== 'MOSS-TTS' && (
                                <div className="relative flex items-center">
                                    <button
                                        className={`flex items-center gap-2 cursor-pointer group h-8 px-3 rounded-lg border transition-all ${
                                            activeDropdown === 'presetVoice'
                                                ? (isDark ? 'bg-zinc-700 border-zinc-600' : 'bg-gray-100 border-gray-300')
                                                : (isDark ? 'border-zinc-700 hover:border-zinc-600' : 'border-gray-200 hover:border-gray-300')
                                        } ${isDark ? 'hover:bg-zinc-700' : 'hover:bg-gray-100'}`}
                                        onClick={(e) => { e.stopPropagation(); setActiveDropdown(activeDropdown === 'presetVoice' ? null : 'presetVoice'); }}
                                    >
                                        <Icons.User size={15} className={`transition-colors ${activeDropdown === 'presetVoice' ? (isDark ? 'text-blue-400' : 'text-blue-600') : (isDark ? 'text-zinc-400 group-hover:text-white' : 'text-gray-500 group-hover:text-gray-700')}`} />
                                        <span className={`text-xs font-medium transition-colors select-none max-w-[100px] truncate ${
                                            activeDropdown === 'presetVoice'
                                                ? (isDark ? 'text-white' : 'text-gray-900')
                                                : (isDark ? 'text-zinc-300 group-hover:text-white' : 'text-gray-600 group-hover:text-gray-900')
                                        }`}>
                                            {QWEN_PRESET_VOICES.find(v => v.value === data.presetVoice)?.label || '预设人物'}
                                        </span>
                                    </button>
                                    {activeDropdown === 'presetVoice' && (
                                        <div className={`absolute bottom-full mb-2 left-0 min-w-[130px] ${isDark ? 'bg-[#1a1a1a] border-zinc-700' : 'bg-white border-gray-200 shadow-xl'} border rounded-xl shadow-2xl py-1.5 z-[100]`} onMouseDown={(e) => e.stopPropagation()}>
                                            {QWEN_PRESET_VOICES.map((voice) => (
                                                <div
                                                    key={voice.value}
                                                    className={`px-3 py-2 text-xs font-medium rounded-lg cursor-pointer mx-1.5 mb-0.5 ${
                                                        data.presetVoice === voice.value
                                                            ? (isDark ? 'bg-blue-500/15 text-blue-400' : 'bg-blue-50 text-blue-600')
                                                            : (isDark ? 'text-zinc-300 hover:bg-zinc-700 hover:text-white' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900')
                                                    }`}
                                                    onClick={() => { updateData(data.id, { presetVoice: voice.value }); setActiveDropdown(null); }}
                                                >
                                                    {voice.label}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                        <div className="flex-1" />

                        {/* Download Button - only show when has result */}
                        {hasResult && (
                            <button 
                                title="下载音频" 
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

                        <button
                            onClick={() => onGenerate(data.id)}
                            disabled={data.isLoading || !hasPrompt}
                            className={`shrink-0 h-8 px-4 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 whitespace-nowrap transition-all active:scale-[0.98] ${
                                data.isLoading || !hasPrompt
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
