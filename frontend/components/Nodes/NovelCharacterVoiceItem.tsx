import React, { useRef } from 'react';
import { CharacterConfig } from '../../types';
import { Icons } from '../Icons';

interface CharacterVoiceItemProps {
    char: string;
    cfg: CharacterConfig;
    characters: string[];
    isDark: boolean;
    inputBg: string;
    activeDropdown: string | null;
    onToggleDropdown: (key: string | null) => void;
    onUpdateCharacterConfig: (charName: string, updates: Partial<CharacterConfig>) => void;
}

export const NovelCharacterVoiceItem: React.FC<CharacterVoiceItemProps> = ({
    char, cfg, characters, isDark, inputBg,
    activeDropdown, onToggleDropdown, onUpdateCharacterConfig,
}) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const hasAudio = !!cfg.refAudio;
    const hasDesc = !!cfg.voiceDescription;

    const handleAudioUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            const b64 = ev.target?.result as string;
            onUpdateCharacterConfig(char, { refAudio: b64, voiceDescription: undefined });
        };
        reader.readAsDataURL(file);
        e.target.value = '';
    };

    return (
        <div
            className={`p-3 rounded-xl border ${isDark ? 'border-zinc-700 bg-zinc-800/30' : 'border-gray-200 bg-gray-50'}`}
        >
            <div className="flex items-center gap-3 mb-2">
                <span className={`text-xs font-bold ${isDark ? 'text-blue-400' : 'text-blue-600'} min-w-[50px]`}>
                    {char}
                </span>
                {/* Character dropdown - can switch to other character (hidden) */}
                <div className="relative hidden">
                    <button
                        className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-[10px] transition-all ${
                            isDark
                                ? 'border-zinc-600 hover:border-zinc-500 text-zinc-300'
                                : 'border-gray-300 hover:border-gray-400 text-gray-600'
                        }`}
                        onClick={(e) => { e.stopPropagation(); onToggleDropdown(activeDropdown === char ? null : char); }}
                    >
                        {char}
                        <Icons.ChevronRight size={10} className={`transition-transform ${activeDropdown === char ? 'rotate-90' : ''}`} />
                    </button>
                    {activeDropdown === char && (
                        <div className={`absolute top-full mt-1 left-0 min-w-[100px] ${isDark ? 'bg-[#1a1a1a] border-zinc-700' : 'bg-white border-gray-200 shadow-xl'} border rounded-xl py-1.5 z-[100]`}>
                            {characters.map((c) => (
                                <div
                                    key={c}
                                    className={`px-3 py-1.5 text-[10px] font-medium rounded-lg cursor-pointer mx-1 ${
                                        c === char
                                            ? (isDark ? 'bg-blue-500/15 text-blue-400' : 'bg-blue-50 text-blue-600')
                                            : (isDark ? 'text-zinc-300 hover:bg-zinc-700' : 'text-gray-600 hover:bg-gray-100')
                                    }`}
                                    onClick={() => {
                                        onUpdateCharacterConfig(char, { character: c });
                                        onToggleDropdown(null);
                                    }}
                                >
                                    {c}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
                {hasAudio && (
                    <span className={`text-[9px] px-1.5 py-0.5 rounded ${isDark ? 'bg-emerald-500/15 text-emerald-400' : 'bg-emerald-100 text-emerald-600'}`}>
                        <Icons.Music size={10} className="inline mr-0.5" />
                        已上传
                    </span>
                )}
            </div>

            {/* Reference audio or voice description */}
            {hasAudio ? (
                <div className="flex items-center gap-2">
                    <span className={`text-[10px] ${isDark ? 'text-zinc-400' : 'text-gray-500'} truncate flex-1`}>
                        参考音频已加载
                    </span>
                    <button
                        className={`text-[10px] px-2 py-0.5 rounded transition-colors ${isDark ? 'text-red-400 hover:bg-red-500/10' : 'text-red-500 hover:bg-red-50'}`}
                        onClick={() => onUpdateCharacterConfig(char, { refAudio: undefined })}
                    >
                        移除
                    </button>
                </div>
            ) : (
                <div className="flex items-center gap-2">
                    <input
                        type="text"
                        placeholder="描述此人物的语音特点..."
                        value={hasDesc ? cfg.voiceDescription : ''}
                        onChange={(e) => onUpdateCharacterConfig(char, { voiceDescription: e.target.value })}
                        className={`flex-1 text-[10px] px-2 py-1.5 rounded-lg border focus:outline-none ${inputBg}`}
                    />
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="audio/*"
                        className="hidden"
                        onChange={handleAudioUpload}
                    />
                    <button
                        className={`shrink-0 w-7 h-7 rounded-lg flex items-center justify-center border transition-all ${
                            isDark
                                ? 'border-zinc-600 hover:border-zinc-500 text-zinc-400 hover:text-white'
                                : 'border-gray-300 hover:border-gray-400 text-gray-500 hover:text-gray-700'
                        }`}
                        onClick={() => fileInputRef.current?.click()}
                        title="上传参考音频"
                    >
                        <Icons.Upload size={12} />
                    </button>
                </div>
            )}
        </div>
    );
};
