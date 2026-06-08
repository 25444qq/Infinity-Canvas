import React, { useRef } from 'react';
import { NodeData, NodeType } from '../../types';
import { Icons } from '../Icons';
import { EditableTitle } from './Shared/NodeComponents';

interface TextLoaderNodeProps {
  data: NodeData;
  updateData: (id: string, updates: Partial<NodeData>) => void;
  onUpload?: (id: string) => void;
  isDark?: boolean;
  selected?: boolean;
  onDelete?: (id: string) => void;
}

export const TextLoaderNode: React.FC<TextLoaderNodeProps> = ({
    data, updateData, onUpload, isDark = true, selected, onDelete
}) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const hasText = !!data.prompt;

    const charCount = (data.prompt || '').length;
    const wordCount = (data.prompt || '').trim() ? (data.prompt || '').trim().split(/\s+/).length : 0;

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const text = event.target?.result as string;
            updateData(data.id, { prompt: text, title: file.name.replace(/\.[^/.]+$/, '') });
        };
        reader.readAsText(file, 'utf-8');
        e.target.value = '';
    };

    const handleDoubleClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        fileInputRef.current?.click();
    };

    const handleTextAreaClick = (e: React.MouseEvent) => {
        e.stopPropagation();
    };

    const overlayToolbarBg = isDark ? 'bg-black/50 border-white/5 text-gray-400' : 'bg-white/50 border-black/5 text-gray-600';

    return (
        <>
          <div className="absolute bottom-full left-0 w-full mb-2 flex items-center justify-between pointer-events-auto">
              <EditableTitle title={data.title} onUpdate={(t) => updateData(data.id, { title: t })} isDark={isDark} />
              <div className={`flex items-center gap-1 backdrop-blur-md rounded-lg p-1 border ${overlayToolbarBg}`}>
                  {hasText && (
                      <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded select-none ${isDark ? 'bg-zinc-800/80 text-gray-300' : 'bg-gray-200/80 text-gray-600'}`} title={`字符数: ${charCount} | 词数: ${wordCount}`}>
                          {charCount.toLocaleString()}
                      </span>
                  )}
                  {hasText && (
                      <button title="重新选择文本文件" className={`p-1 rounded transition-colors ${isDark ? 'hover:bg-zinc-800 hover:text-white' : 'hover:bg-gray-200 hover:text-black'}`} onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}>
                          <Icons.Upload size={12} className="cursor-pointer"/>
                      </button>
                  )}
              </div>
          </div>

          <div 
              className={`w-full h-full relative group rounded-xl border ${isDark ? 'border-zinc-800 bg-black' : 'border-gray-200 bg-white'} shadow-lg overflow-hidden ${hasText ? '' : 'hover:border-cyan-500/50 transition-colors'}`}
              onDoubleClick={!hasText ? handleDoubleClick : undefined}
          >
              <input 
                  ref={fileInputRef}
                  type="file"
                  accept="text/plain,.txt,.md,.html,.json,.csv,.xml"
                  className="hidden"
                  onChange={handleFileSelect}
              />

              {hasText ? (
                  <div className="w-full h-full p-3 flex flex-col">
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
                      <textarea
                          value={data.prompt || ''}
                          onChange={(e) => updateData(data.id, { prompt: e.target.value })}
                          className={`flex-1 w-full resize-none rounded-md border ${
                              isDark 
                                  ? 'bg-zinc-900 border-zinc-700 text-gray-200 placeholder-gray-500 focus:border-cyan-500' 
                                  : 'bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400 focus:border-cyan-500'
                          } p-2 text-sm leading-relaxed focus:outline-none focus:ring-1 focus:ring-cyan-500/30`}
                          placeholder="从文件读取文本内容..."
                          onClick={handleTextAreaClick}
                      />
                  </div>
              ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center text-zinc-600 gap-3">
                      <div className={`w-16 h-16 rounded-full border flex items-center justify-center transition-all shadow-lg group/icon ${isDark ? 'bg-zinc-900 border-zinc-700 hover:bg-zinc-800' : 'bg-gray-50 border-gray-200 hover:bg-gray-100'} hover:text-cyan-400 hover:border-cyan-500/50`}>
                          <Icons.FilePlus size={28} className={`transition-colors ${isDark ? 'text-zinc-500 group-hover/icon:text-cyan-400' : 'text-gray-400 group-hover/icon:text-cyan-500'}`}/>
                      </div>
                      <span className={`text-[11px] font-medium select-none ${isDark ? 'text-zinc-500' : 'text-gray-500'}`}>双击选择文本文件</span>
                      <span className={`text-[10px] select-none ${isDark ? 'text-zinc-600' : 'text-gray-400'}`}>TXT, MD, HTML, JSON, CSV, XML</span>
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
