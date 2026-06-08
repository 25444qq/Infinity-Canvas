import React from 'react';
import { NovelLineItem as NovelLineItemType } from '../../types';
import { Icons } from '../Icons';

interface LineItemProps {
    idx: number;
    line: NovelLineItemType;
    characters: string[];
    activeDropdown: string | null;
    isDark: boolean;
    onToggleDropdown: (key: string | null) => void;
    onUpdateLine: (idx: number, field: string, value: string) => void;
    onAudioGenerate: (idx: number, e: React.MouseEvent) => void;
    onAudioPlay: (idx: number, e: React.MouseEvent) => void;
}

export const NovelLineItem: React.FC<LineItemProps> = ({
    idx, line, characters, activeDropdown, isDark,
    onToggleDropdown, onUpdateLine, onAudioGenerate, onAudioPlay,
}) => {
    const isDialogue = line.description === '对话' || line.description.includes('对话');
    const speakerValue = line.speaker || (isDialogue ? '未知' : '叙事');
    const displayText = line.dialogue || line.processed_text;

    return (
        <div
            className={`px-2 py-1.5 rounded-lg text-xs ${
                isDark ? 'bg-zinc-800/50 hover:bg-zinc-800' : 'bg-gray-50 hover:bg-white'
            } border ${isDark ? 'border-zinc-700/50' : 'border-gray-100'} transition-colors`}
        >
            {/* Row 1: speaker dropdown + dialogue + generate button + play button */}
            <div className="flex items-start gap-2">
                {/* Speaker dropdown */}
                <div className="relative shrink-0">
                    <button
                        className={`flex items-center gap-0.5 w-[72px] text-[10px] font-semibold px-1.5 py-0.5 rounded border transition-colors ${
                            isDialogue
                                ? (isDark ? 'bg-blue-500/10 border-blue-500/30 text-blue-400 hover:border-blue-500/50' : 'bg-blue-50 border-blue-200 text-blue-600 hover:border-blue-400')
                                : (isDark ? 'bg-zinc-700/30 border-zinc-600/30 text-zinc-400 hover:border-zinc-500' : 'bg-gray-100 border-gray-200 text-gray-600 hover:border-gray-400')
                        }`}
                        onClick={(e) => { e.stopPropagation(); onToggleDropdown(activeDropdown === `line-${idx}` ? null : `line-${idx}`); }}
                    >
                        <span className="truncate flex-1 text-left">{speakerValue}</span>
                        <Icons.ChevronRight size={9} className={`shrink-0 transition-transform ${activeDropdown === `line-${idx}` ? 'rotate-90' : ''}`} />
                    </button>
                    {activeDropdown === `line-${idx}` && (
                        <div className={`absolute top-full mt-1 left-0 min-w-[90px] ${isDark ? 'bg-[#1a1a1a] border-zinc-700' : 'bg-white border-gray-200 shadow-xl'} border rounded-lg py-1 z-[100]`}>
                            {characters.map((c) => (
                                <div
                                    key={c}
                                    className={`px-2.5 py-1 text-[10px] font-medium rounded cursor-pointer mx-1 ${
                                        c === speakerValue
                                            ? (isDark ? 'bg-blue-500/15 text-blue-400' : 'bg-blue-50 text-blue-600')
                                            : (isDark ? 'text-zinc-300 hover:bg-zinc-700' : 'text-gray-600 hover:bg-gray-100')
                                    }`}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onUpdateLine(idx, 'speaker', c);
                                        onToggleDropdown(null);
                                    }}
                                >
                                    {c}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Dialogue text */}
                <span className={`text-[11px] leading-relaxed flex-1 ${isDark ? 'text-gray-200' : 'text-gray-800'} pt-px`}>
                    {displayText}
                </span>

                {/* Generate button */}
                <button
                    className={`shrink-0 px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                        line.isGeneratingAudio
                            ? (isDark ? 'bg-zinc-600 text-zinc-400' : 'bg-gray-300 text-gray-500')
                            : isDark
                                ? 'bg-violet-500/15 text-violet-400 hover:bg-violet-500/25 border border-violet-500/20'
                                : 'bg-violet-50 text-violet-600 hover:bg-violet-100 border border-violet-200'
                    }`}
                    disabled={line.isGeneratingAudio}
                    onClick={(e) => onAudioGenerate(idx, e)}
                >
                    {line.isGeneratingAudio ? (
                        <Icons.Loader2 size={12} className="animate-spin" />
                    ) : (
                        '生成'
                    )}
                </button>

                {/* Play button — shown only after audio is generated */}
                {line.audioUrl && (
                    <button
                        className={`shrink-0 w-6 h-6 rounded flex items-center justify-center text-[10px] font-medium transition-colors ${
                            isDark
                                ? 'bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 border border-emerald-500/20'
                                : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100 border border-emerald-200'
                        }`}
                        onClick={(e) => onAudioPlay(idx, e)}
                    >
                        <Icons.Play size={10} />
                    </button>
                )}
            </div>

            {/* Row 2: original_text (reference, gray) */}
            <div className={`text-[10px] mt-0.5 ml-[calc(72px+0.5rem)] ${isDark ? 'text-zinc-600' : 'text-gray-400'}`}>
                {line.original_text}
            </div>
        </div>
    );
};
