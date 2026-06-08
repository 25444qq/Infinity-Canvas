import React, { useRef, useState } from 'react';
import { NodeData } from '../../types';
import { Icons } from '../Icons';
import { EditableTitle } from './Shared/NodeComponents';

interface AudioMergeNodeProps {
  data: NodeData;
  updateData: (id: string, updates: Partial<NodeData>) => void;
  onUpload?: (id: string) => void;
  onMerge: (id: string) => void;
  isDark?: boolean;
  selected?: boolean;
  onDelete?: (id: string) => void;
}

export const AudioMergeNode: React.FC<AudioMergeNodeProps> = ({
    data, updateData, onMerge, isDark = true, selected, onDelete
}) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const audioRef = useRef<HTMLAudioElement>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [mergeDuration, setMergeDuration] = useState(0);

    const audioFiles = data._audioFiles || [];
    const hasFiles = audioFiles.length > 0;
    const hasResult = !!data.mergeAudioUrl && !data.isMerging;

    const formatTime = (seconds: number) => {
        if (!seconds || isNaN(seconds)) return '0:00';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const formatFileSize = (bytes: number) => {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / 1048576).toFixed(2)} MB`;
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;

        const currentFiles = data._audioFiles || [];
        const newFiles: { name: string; data: string; size: number; duration: number }[] = [...currentFiles];

        let processed = 0;
        const totalNew = files.length;

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const reader = new FileReader();
            reader.onload = (event) => {
                const result = (event.target as FileReader).result as string;
                
                // Get duration
                const tempAudio = new Audio();
                tempAudio.onloadedmetadata = () => {
                    newFiles.push({
                        name: file.name,
                        data: result,
                        size: file.size,
                        duration: tempAudio.duration,
                    });
                    processed++;
                    if (processed === totalNew) {
                        updateData(data.id, { _audioFiles: newFiles });
                    }
                };
                tempAudio.src = result;
            };
            reader.readAsDataURL(file);
        }

        e.target.value = '';
    };

    const handleRemoveFile = (index: number) => {
        const newFiles = (data._audioFiles || []).filter((_, i) => i !== index);
        updateData(data.id, { _audioFiles: newFiles });
    };

    const handleMerge = () => {
        if (audioFiles.length < 2) return;
        onMerge(data.id);
    };

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

    const handleAudioEnded = () => setIsPlaying(false);

    const handleAudioLoadedMetadata = () => {
        if (audioRef.current) {
            setMergeDuration(audioRef.current.duration);
        }
    };

    const handleDownload = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!data.mergeAudioUrl) return;
        const a = document.createElement('a');
        a.href = data.mergeAudioUrl;
        a.download = `merged_audio.wav`;
        a.click();
    };

    const totalDuration = audioFiles.reduce((sum, f) => sum + (f.duration || 0), 0);

    const containerBg = isDark ? 'bg-[#1a1a1a]' : 'bg-white';
    const borderCls = selected ? 'border-violet-500 ring-2 ring-violet-500/30' : (isDark ? 'border-zinc-700/50' : 'border-gray-200');
    const overlayToolbarBg = isDark ? 'bg-black/50 border-white/5 text-gray-400' : 'bg-white/50 border-black/5 text-gray-600';

    return (
      <>
        {/* Toolbar */}
        <div className="absolute bottom-full left-0 w-full mb-2 flex items-center justify-between pointer-events-auto">
            <EditableTitle title={data.title} onUpdate={(t) => updateData(data.id, { title: t })} isDark={isDark} />
            {hasFiles && !hasResult && (
                <div className={`flex items-center gap-1.5 backdrop-blur-md rounded-lg p-1 border ${overlayToolbarBg}`}>
                    <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded select-none ${isDark ? 'bg-zinc-800/80 text-gray-300' : 'bg-gray-200/80 text-gray-600'}`}>
                        {audioFiles.length} 个文件
                    </span>
                    <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded select-none ${isDark ? 'bg-zinc-800/80 text-gray-300' : 'bg-gray-200/80 text-gray-600'}`}>
                        {formatTime(totalDuration)}
                    </span>
                    <button 
                        className={`p-1 rounded transition-colors ${isDark ? 'hover:bg-zinc-800 hover:text-white' : 'hover:bg-gray-200 hover:text-black'}`} 
                        onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
                        title="添加音频文件"
                    >
                        <Icons.Plus size={14} />
                    </button>
                </div>
            )}
        </div>

        <div
            className={`w-full h-full relative rounded-xl border ${borderCls} ${containerBg} shadow-lg overflow-hidden group`}
        >
            <input
                ref={fileInputRef}
                type="file"
                accept="audio/wav,audio/mp3,audio/mpeg,audio/ogg,audio/flac,.wav,.mp3,.ogg,.flac"
                className="hidden"
                multiple
                onChange={handleFileSelect}
            />

            {data.isMerging && (
                <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center z-20">
                    <Icons.Loader2 size={32} className="text-violet-500 animate-spin mb-3" />
                    <span className="text-white/80 text-sm font-medium">合并中...</span>
                </div>
            )}

            {selected && (
                <div className="absolute top-2 right-2 z-10">
                    <button
                        title="删除节点"
                        className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all backdrop-blur-md border shadow-sm ${
                            isDark ? 'bg-black/60 border-white/10 text-white/70 hover:bg-red-500/80 hover:text-white hover:border-red-500/50'
                                   : 'bg-white/80 border-gray-200 text-gray-500 hover:bg-red-500 hover:text-white'
                        }`}
                        onClick={(e) => { e.stopPropagation(); onDelete?.(data.id); }}
                    >
                        <Icons.Trash2 size={13} />
                    </button>
                </div>
            )}

            {hasResult ? (
                /* Result view - play and download */
                <div className="w-full h-full flex flex-col items-center justify-center gap-3 p-4">
                    <audio
                        ref={audioRef}
                        src={data.mergeAudioUrl}
                        onEnded={handleAudioEnded}
                        onLoadedMetadata={handleAudioLoadedMetadata}
                        preload="metadata"
                    />
                    <div
                        className={`w-20 h-20 rounded-full flex items-center justify-center cursor-pointer transition-all shadow-lg ${
                            isDark ? 'bg-gradient-to-br from-violet-500/20 to-purple-500/20 border border-violet-500/30'
                                   : 'bg-gradient-to-br from-violet-100 to-purple-100 border border-violet-200'
                        } hover:scale-105 active:scale-95`}
                        onClick={togglePlayPause}
                    >
                        {isPlaying ? (
                            <Icons.Pause size={32} className={isDark ? 'text-violet-400' : 'text-violet-600'}/>
                        ) : (
                            <Icons.Play size={32} className={`ml-1 ${isDark ? 'text-violet-400' : 'text-violet-600'}`}/>
                        )}
                    </div>
                    <div className="flex flex-col items-center gap-1">
                        <span className={`text-xs font-medium select-none ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                            {isPlaying ? '播放中...' : '点击播放'}
                        </span>
                        {mergeDuration > 0 && (
                            <span className={`text-[11px] font-mono select-none ${isDark ? 'text-zinc-500' : 'text-gray-500'}`}>
                                {formatTime(mergeDuration)} · {audioFiles.length} 文件合并
                            </span>
                        )}
                    </div>
                    <button
                        className={`mt-1 px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all ${
                            isDark ? 'bg-violet-500/15 text-violet-400 hover:bg-violet-500/25 border border-violet-500/20'
                                   : 'bg-violet-50 text-violet-600 hover:bg-violet-100 border border-violet-200'
                        }`}
                        onClick={handleDownload}
                    >
                        <Icons.Download size={14} />
                        下载合并音频
                    </button>
                </div>
            ) : hasFiles ? (
                /* File list view */
                <div className="w-full h-full flex flex-col">
                    <div className={`flex-1 overflow-y-auto p-3 space-y-1.5 ${isDark ? 'scrollbar-dark' : 'scrollbar-light'}`}>
                        {audioFiles.map((file, index) => (
                            <div
                                key={index}
                                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs group/item transition-all ${
                                    isDark ? 'bg-zinc-800/50 hover:bg-zinc-700/50' : 'bg-gray-100 hover:bg-gray-200/70'
                                }`}
                            >
                                <span className={`flex-shrink-0 w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold ${
                                    isDark ? 'bg-violet-500/20 text-violet-400' : 'bg-violet-100 text-violet-600'
                                }`}>
                                    {index + 1}
                                </span>
                                <div className="flex-1 min-w-0">
                                    <div className={`truncate font-medium ${isDark ? 'text-gray-200' : 'text-gray-700'}`}>
                                        {file.name}
                                    </div>
                                    <div className={`text-[10px] ${isDark ? 'text-zinc-500' : 'text-gray-400'}`}>
                                        {formatFileSize(file.size)} · {formatTime(file.duration)}
                                    </div>
                                </div>
                                <button
                                    className={`p-1 rounded opacity-0 group-hover/item:opacity-100 transition-all ${
                                        isDark ? 'hover:bg-red-500/20 hover:text-red-400 text-zinc-500' : 'hover:bg-red-100 hover:text-red-500 text-gray-400'
                                    }`}
                                    onClick={() => handleRemoveFile(index)}
                                    title="移除"
                                >
                                    <Icons.X size={14} />
                                </button>
                            </div>
                        ))}
                    </div>
                    {/* Bottom buttons */}
                    <div className={`p-3 border-t ${isDark ? 'border-zinc-800' : 'border-gray-200'} flex items-center gap-2`}>
                        <button
                            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] transition-all ${
                                isDark ? 'bg-zinc-800 hover:bg-zinc-700 text-gray-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-600'
                            }`}
                            onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
                        >
                            <Icons.Plus size={13} />
                            添加
                        </button>
                        <button
                            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all ${
                                audioFiles.length < 2
                                    ? (isDark ? 'bg-zinc-800/50 text-zinc-600 cursor-not-allowed' : 'bg-gray-100 text-gray-400 cursor-not-allowed')
                                    : (isDark ? 'bg-violet-500/20 text-violet-400 hover:bg-violet-500/30 border border-violet-500/20'
                                              : 'bg-violet-100 text-violet-600 hover:bg-violet-200 border border-violet-200')
                            }`}
                            onClick={handleMerge}
                            disabled={audioFiles.length < 2}
                            title={audioFiles.length < 2 ? '请至少添加2个音频文件' : '合并音频'}
                        >
                            <Icons.Wand2 size={13} />
                            合并 ({audioFiles.length})
                        </button>
                    </div>
                </div>
            ) : (
                /* Empty state */
                <div className="w-full h-full flex flex-col items-center justify-center text-zinc-600 gap-3 cursor-pointer"
                     onClick={() => fileInputRef.current?.click()}>
                    <div className={`w-16 h-16 rounded-full border flex items-center justify-center transition-all shadow-lg ${
                        isDark ? 'bg-zinc-900 border-zinc-700 hover:bg-zinc-800' : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
                    } hover:text-violet-400 hover:border-violet-500/50`}>
                        <Icons.Music size={28} className="transition-colors" />
                    </div>
                    <span className={`text-[11px] font-medium select-none ${isDark ? 'text-zinc-500' : 'text-gray-500'}`}>
                        点击选择多个音频文件
                    </span>
                    <span className={`text-[10px] select-none ${isDark ? 'text-zinc-600' : 'text-gray-400'}`}>
                        WAV, MP3, OGG, FLAC
                    </span>
                </div>
            )}
        </div>
      </>
    );
};
