import React, { useRef, useState } from 'react';
import { NodeData, NodeType } from '../../types';
import { Icons } from '../Icons';
import { EditableTitle } from './Shared/NodeComponents';

interface AudioLoaderNodeProps {
  data: NodeData;
  updateData: (id: string, updates: Partial<NodeData>) => void;
  onUpload?: (id: string) => void;
  isDark?: boolean;
  selected?: boolean;
  onDelete?: (id: string) => void;
}

export const AudioLoaderNode: React.FC<AudioLoaderNodeProps> = ({
    data, updateData, onUpload, isDark = true, selected, onDelete
}) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [duration, setDuration] = useState(0);
    const audioRef = useRef<HTMLAudioElement>(null);
    const hasAudio = !!data.imageSrc; // 复用 imageSrc 存储 base64

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
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const result = event.target?.result as string;
            updateData(data.id, { 
                imageSrc: result, 
                title: file.name.replace(/\.[^/.]+$/, ''),
                _audioSize: file.size
            });
        };
        reader.readAsDataURL(file);
        e.target.value = '';
    };

    const handleDoubleClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        fileInputRef.current?.click();
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

    const handleAudioEnded = () => {
        setIsPlaying(false);
    };

    const handleAudioLoadedMetadata = () => {
        if (audioRef.current) {
            setDuration(audioRef.current.duration);
        }
    };

    const overlayToolbarBg = isDark ? 'bg-black/50 border-white/5 text-gray-400' : 'bg-white/50 border-black/5 text-gray-600';

    return (
        <>
          <div className="absolute bottom-full left-0 w-full mb-2 flex items-center justify-between pointer-events-auto">
              <EditableTitle title={data.title} onUpdate={(t) => updateData(data.id, { title: t })} isDark={isDark} />
              {hasAudio && (
                  <div className={`flex items-center gap-1 backdrop-blur-md rounded-lg p-1 border ${overlayToolbarBg}`}>
                      {(data._audioSize || 0) > 0 && (
                          <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded select-none ${isDark ? 'bg-zinc-800/80 text-gray-300' : 'bg-gray-200/80 text-gray-600'}`} title="文件大小">
                              {formatFileSize(data._audioSize || 0)}
                          </span>
                      )}
                      {duration > 0 && (
                          <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded select-none ${isDark ? 'bg-zinc-800/80 text-gray-300' : 'bg-gray-200/80 text-gray-600'}`} title="音频时长">
                              {formatTime(duration)}
                          </span>
                      )}
                      <button title="重新选择音频文件" className={`p-1 rounded transition-colors ${isDark ? 'hover:bg-zinc-800 hover:text-white' : 'hover:bg-gray-200 hover:text-black'}`} onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}>
                          <Icons.Upload size={12} className="cursor-pointer"/>
                      </button>
                  </div>
              )}
          </div>

          <div 
              className={`w-full h-full relative group rounded-xl border ${isDark ? 'border-zinc-800 bg-black' : 'border-gray-200 bg-white'} shadow-lg overflow-hidden ${hasAudio ? '' : 'hover:border-cyan-500/50 transition-colors'}`}
              onDoubleClick={!hasAudio ? handleDoubleClick : undefined}
          >
              <input 
                  ref={fileInputRef}
                  type="file"
                  accept="audio/wav,audio/mp3,audio/mpeg,audio/ogg,audio/flac,.wav,.mp3,.ogg,.flac"
                  className="hidden"
                  onChange={handleFileSelect}
              />

              {hasAudio && data.imageSrc && (
                  <audio 
                      ref={audioRef}
                      src={data.imageSrc}
                      onEnded={handleAudioEnded}
                      onLoadedMetadata={handleAudioLoadedMetadata}
                      preload="metadata"
                  />
              )}

              {hasAudio ? (
                  <div className="w-full h-full flex flex-col items-center justify-center gap-4 p-4">
                      {selected && (
                          <div className="absolute top-2 right-2 z-10">
                              <button
                                  title="删除节点"
                                  className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all backdrop-blur-md border shadow-sm ${
                                      isDark ? 'bg-black/60 border-white/10 text-white/70 hover:bg-red-500/80 hover:text-white hover:border-red-500/50' : 'bg-white/80 border-gray-200 text-gray-500 hover:bg-red-500 hover:text-white'
                                  }`}
                                  onClick={(e) => { e.stopPropagation(); onDelete?.(data.id); }}
                              >
                                  <Icons.Trash2 size={13} />
                              </button>
                          </div>
                      )}
                      <div 
                          className={`w-20 h-20 rounded-full flex items-center justify-center cursor-pointer transition-all shadow-lg ${isDark ? 'bg-gradient-to-br from-violet-500/20 to-purple-500/20 border border-violet-500/30' : 'bg-gradient-to-br from-violet-100 to-purple-100 border border-violet-200'} hover:scale-105 active:scale-95`}
                          onClick={togglePlayPause}
                      >
                          {isPlaying ? (
                              <Icons.Pause size={32} className={`${isDark ? 'text-violet-400' : 'text-violet-600'}`}/>
                          ) : (
                              <Icons.Play size={32} className={`ml-1 ${isDark ? 'text-violet-400' : 'text-violet-600'}`}/>
                          )}
                      </div>
                      <div className="flex flex-col items-center gap-1">
                          <span className={`text-xs font-medium select-none ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                              {isPlaying ? '播放中...' : '点击播放'}
                          </span>
                          {data.imageSrc && (
                              <span className={`text-[10px] select-none ${isDark ? 'text-zinc-500' : 'text-gray-400'}`}>
                                  {data.imageSrc.split(';')[0]?.replace('data:', '').toUpperCase() || 'AUDIO'}
                              </span>
                          )}
                      </div>
                  </div>
              ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center text-zinc-600 gap-3">
                      <div className={`w-16 h-16 rounded-full border flex items-center justify-center transition-all shadow-lg group/icon ${isDark ? 'bg-zinc-900 border-zinc-700 hover:bg-zinc-800' : 'bg-gray-50 border-gray-200 hover:bg-gray-100'} hover:text-cyan-400 hover:border-cyan-500/50`}>
                          <Icons.Music size={28} className={`transition-colors ${isDark ? 'text-zinc-500 group-hover/icon:text-cyan-400' : 'text-gray-400 group-hover/icon:text-cyan-500'}`}/>
                      </div>
                      <span className={`text-[11px] font-medium select-none ${isDark ? 'text-zinc-500' : 'text-gray-500'}`}>双击选择音频文件</span>
                      <span className={`text-[10px] select-none ${isDark ? 'text-zinc-600' : 'text-gray-400'}`}>WAV, MP3, OGG, FLAC</span>
                      {selected && (
                          <button
                              title="删除节点"
                              className={`mt-1 px-2.5 py-1 rounded-lg text-[10px] font-medium flex items-center gap-1 transition-all backdrop-blur-md border ${
                                  isDark ? 'bg-black/60 border-white/10 text-white/70 hover:bg-red-500/80 hover:text-white hover:border-red-500/50' : 'bg-white/80 border-gray-200 text-gray-500 hover:bg-red-500 hover:text-white'
                              }`}
                              onClick={(e) => { e.stopPropagation(); onDelete?.(data.id); }}
                          >
                              <Icons.Trash2 size={11} />
                              <span>删除</span>
                          </button>
                      )}
                  </div>
              )}
          </div>
        </>
    );
};
