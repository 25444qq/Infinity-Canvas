import React, { useState, useRef, useEffect, memo } from 'react';
import { Icons } from '../../Icons';
import { storageService } from '../../../services/storageService';

// --- Helper Functions ---

export const safeDownload = async (src: string) => {
    const filename = `下载_${Date.now()}.png`;

    try {
      const response = await fetch(src);
      const blob = await response.blob();

      // Try storage service first
      const saved = await storageService.saveFile(blob, filename);
      if (saved) return;

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (e) {
      const link = document.createElement('a'); link.href = src; link.download = `下载_${Date.now()}`; link.target = "_blank"; document.body.appendChild(link); link.click(); document.body.removeChild(link);
    }
};

// --- Components ---

export const ThumbnailItem = memo(({ src, index, isDark }: { src: string, index: number, isDark: boolean }) => {
    const [loaded, setLoaded] = useState(false);

    return (
        <div className={`relative w-[48px] h-[48px] flex-shrink-0 border rounded-lg overflow-hidden shadow-sm group/thumb cursor-pointer hover:border-blue-500/50 transition-colors ${isDark ? 'border-zinc-700 bg-black/40' : 'border-gray-300 bg-gray-100'}`}>
            <div className={`absolute inset-0 ${isDark ? 'bg-zinc-800/50' : 'bg-gray-200'}`} />
            
            <img 
                src={src} 
                className="absolute inset-0 w-full h-full object-cover will-change-[clip-path]" 
                draggable={false} 
                decoding="async" 
                loading="lazy" 
                alt={`输入 ${index+1}`} 
                onLoad={() => setLoaded(true)}
                style={{
                    clipPath: loaded ? 'inset(0 0 0% 0)' : 'inset(0 0 100% 0)',
                    opacity: loaded ? 1 : 0,
                    transition: 'clip-path 0.8s ease-out, opacity 0.3s ease-in'
                }}
            />
            <div className="absolute top-0 right-0 bg-black/60 backdrop-blur-sm text-white text-[9px] font-bold px-1.5 rounded-bl z-10">{index + 1}</div>
        </div>
    );
});

export const InputThumbnails = memo(({ inputs, ready, isDark }: { inputs: string[], ready: boolean, isDark: boolean }) => {
    if (!inputs || inputs.length === 0) return null;
    return (
       <div className="flex justify-center gap-2 pb-2 overflow-x-auto no-scrollbar min-h-[56px]">
           {inputs.slice(0, 8).map((src, i) => (
               ready ? (
                   <ThumbnailItem key={src + i} src={src} index={i} isDark={isDark} />
               ) : (
                   <div key={i} className={`relative w-[48px] h-[48px] flex-shrink-0 border rounded-lg overflow-hidden shadow-sm ${isDark ? 'border-zinc-700 bg-black/40' : 'border-gray-300 bg-gray-100'}`}>
                       <div className={`absolute inset-0 ${isDark ? 'bg-zinc-800/50' : 'bg-gray-200'}`} />
                   </div>
               )
           ))}
       </div>
    );
}, (prev, next) => {
    if (prev.ready !== next.ready) return false;
    if (prev.isDark !== next.isDark) return false;
    if (prev.inputs === next.inputs) return true;
    if (prev.inputs.length !== next.inputs.length) return false;
    return false; 
});

export const CustomDropdown = ({ 
    options, value, onChange, isOpen, onToggle, onClose, icon: Icon, width = "w-max", align = "center", disabledOptions = [], isDark = true
}: any) => {
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => { 
            if (ref.current && !ref.current.contains(event.target as Node)) {
                onClose(); 
            }
        };
        if (isOpen) document.addEventListener('mousedown', handleClickOutside, true);
        return () => document.removeEventListener('mousedown', handleClickOutside, true);
    }, [isOpen, onClose]);

    const bgClass = isDark ? 'bg-[#1e1e1e] border-zinc-700' : 'bg-white border-gray-200';
    const hoverClass = isDark ? 'hover:bg-white/5' : 'hover:bg-gray-100';
    const iconColor = isDark ? 'text-zinc-500 group-hover:text-zinc-300' : 'text-gray-400 group-hover:text-gray-600';
    const optionHover = isDark ? 'hover:bg-zinc-800 hover:text-gray-200' : 'hover:bg-gray-100 hover:text-gray-900';
    const activeItem = isDark ? 'bg-blue-500/10 text-blue-400' : 'bg-blue-50 text-blue-600';

    return (
        <div className="relative h-full flex items-center" ref={ref}>
            <div className={`flex items-center gap-1.5 cursor-pointer group h-full px-1.5 rounded transition-colors ${isOpen ? (isDark ? 'bg-white/5' : 'bg-gray-100') : ''} ${hoverClass}`} onClick={(e) => { e.stopPropagation(); onToggle(); }}>
                {Icon && <Icon size={13} className={`transition-colors ${isOpen ? 'text-blue-400' : iconColor}`} />}
                <span className={`text-[11px] font-medium transition-colors select-none ${isOpen ? (isDark ? 'text-gray-200' : 'text-gray-900') : (isDark ? 'text-zinc-400 group-hover:text-zinc-200' : 'text-gray-500 group-hover:text-gray-700')} ${Icon ? 'min-w-[16px] text-center' : 'max-w-[70px] truncate'}`}>{value}</span>
                {!Icon && <Icons.ChevronRight size={10} className={`transition-all duration-200 ${isOpen ? 'rotate-[-90deg] text-blue-400' : `rotate-90 ${isDark ? 'text-zinc-600 group-hover:text-zinc-400' : 'text-gray-400 group-hover:text-gray-600'}`}`} />}
            </div>
            {isOpen && (
                <div className={`absolute bottom-full mb-2 ${align === 'left' ? 'left-0' : align === 'right' ? 'right-0' : 'left-1/2 -translate-x-1/2'} ${width} min-w-[80px] ${bgClass} border rounded-lg shadow-2xl py-1 z-[100] animate-in fade-in slide-in-from-bottom-2 duration-150 custom-scrollbar`} onMouseDown={(e) => e.stopPropagation()} onWheel={(e) => e.stopPropagation()} style={{ maxHeight: '300px', overflowY: 'auto' }}>
                    {options.map((opt: any) => {
                        const isDisabled = disabledOptions.includes(opt);
                        return (
                            <div key={opt} className={`px-3 py-1.5 text-[11px] font-medium transition-colors flex items-center justify-between group/item ${isDisabled ? 'text-zinc-600 cursor-not-allowed opacity-50' : opt == value ? activeItem + ' cursor-pointer' : (isDark ? 'text-zinc-400' : 'text-gray-500') + ` ${optionHover} cursor-pointer`}`} onClick={(e) => { e.stopPropagation(); if (!isDisabled) { onChange(opt); onClose(); } }}>
                                <span className="whitespace-nowrap pr-2">{opt}</span>
                                {opt == value && <Icons.Check size={10} className="text-blue-400 shrink-0 ml-2" />}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export const EditableTitle: React.FC<{ title: string; onUpdate: (newTitle: string) => void, isDark?: boolean }> = ({ title, onUpdate, isDark = true }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [editValue, setEditValue] = useState(title);
    const inputRef = useRef<HTMLInputElement>(null);
    useEffect(() => { if (isEditing && inputRef.current) { inputRef.current.focus(); inputRef.current.select(); } }, [isEditing]);
    useEffect(() => { if (!isEditing) setEditValue(title); }, [title, isEditing]);
    const handleBlur = () => { setIsEditing(false); if (editValue.trim() && editValue !== title) onUpdate(editValue.trim().slice(0, 20)); else setEditValue(title); };
    
    const inputBg = isDark ? 'bg-zinc-800 text-white border-zinc-600' : 'bg-white text-gray-900 border-gray-300 shadow-sm';
    const displayBg = isDark ? 'text-gray-300 hover:border-zinc-700 bg-[#1A1D21]/50' : 'text-gray-700 hover:border-gray-300 bg-white/50';

    return isEditing ? (
        <input ref={inputRef} type="text" value={editValue} onChange={(e) => setEditValue(e.target.value)} onBlur={handleBlur} onKeyDown={(e) => { if (e.key === 'Enter') handleBlur(); if (e.key === 'Escape') { setEditValue(title); setIsEditing(false); } }} className={`${inputBg} border rounded px-2 py-0.5 outline-none w-[140px] text-xs font-bold`} onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()} />
    ) : (
        <div className={`${displayBg} font-bold text-xs px-2 py-0.5 rounded cursor-text border border-transparent truncate max-w-[140px]`} onDoubleClick={(e) => { e.stopPropagation(); setIsEditing(true); setEditValue(title); }} onMouseDown={(e) => e.stopPropagation()} title={title}>{title}</div>
    );
};