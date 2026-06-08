
import React, { useState, useEffect, useRef, memo } from 'react';
import { Icons } from '../../Icons';
import { NodeData } from '../../../types';

// --- Local Components (Extracted) ---

export const LocalEditableTitle: React.FC<{ title: string; onUpdate: (newTitle: string) => void, isDark?: boolean }> = ({ title, onUpdate, isDark = true }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [editValue, setEditValue] = useState(title);
    const inputRef = useRef<HTMLInputElement>(null);
    useEffect(() => { if (isEditing && inputRef.current) { inputRef.current.focus(); inputRef.current.select(); } }, [isEditing]);
    useEffect(() => { if (!isEditing) setEditValue(title); }, [title, isEditing]);
    const handleBlur = () => { setIsEditing(false); if (editValue.trim() && editValue !== title) onUpdate(editValue.trim().slice(0, 20)); else setEditValue(title); };

    return isEditing ? (
        <input 
            ref={inputRef} 
            type="text" 
            value={editValue} 
            onChange={(e) => setEditValue(e.target.value)} 
            onBlur={handleBlur} 
            onKeyDown={(e) => { if (e.key === 'Enter') handleBlur(); if (e.key === 'Escape') { setEditValue(title); setIsEditing(false); } }} 
            className={`bg-black/60 backdrop-blur-md text-white border border-white/20 rounded-lg px-3 py-1.5 outline-none w-[160px] text-sm font-semibold focus:border-white/40`} 
            onClick={(e) => e.stopPropagation()} 
            onMouseDown={(e) => e.stopPropagation()} 
        />
    ) : (
        <div 
            className="bg-black/40 backdrop-blur-md text-white font-semibold text-sm px-3 py-1.5 rounded-lg cursor-text border border-transparent hover:border-white/20 truncate max-w-[160px] transition-all" 
            onDoubleClick={(e) => { e.stopPropagation(); setIsEditing(true); setEditValue(title); }} 
            onMouseDown={(e) => e.stopPropagation()} 
            title={title}
        >
            {title}
        </div>
    );
};

export const LocalCustomDropdown = ({ options, value, onChange, isOpen, onToggle, onClose, icon: Icon, width = "w-max", align = "center", disabledOptions = [], isDark = true }: any) => {
    const ref = useRef<HTMLDivElement>(null);
    const listRef = useRef<HTMLDivElement>(null);
    const [hoveredGroup, setHoveredGroup] = useState<string | null>(null);
    const [flyoutTop, setFlyoutTop] = useState<number>(0);
    const hoverTimeout = useRef<any>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => { if (ref.current && !ref.current.contains(event.target as Node)) onClose(); };
        if (isOpen) document.addEventListener('mousedown', handleClickOutside, true);
        return () => document.removeEventListener('mousedown', handleClickOutside, true);
    }, [isOpen, onClose]);

    useEffect(() => { if (!isOpen) { setHoveredGroup(null); } }, [isOpen]);

    const handleMouseEnterGroup = (label: string, e: React.MouseEvent) => {
        if (hoverTimeout.current) clearTimeout(hoverTimeout.current);
        if (listRef.current) {
            const listRect = listRef.current.getBoundingClientRect();
            const itemRect = e.currentTarget.getBoundingClientRect();
            setFlyoutTop(itemRect.top - listRect.top);
        }
        setHoveredGroup(label);
    };

    const handleMouseLeave = () => {
        hoverTimeout.current = setTimeout(() => setHoveredGroup(null), 200);
    };

    const handleMouseEnterFlyout = () => {
        if (hoverTimeout.current) clearTimeout(hoverTimeout.current);
    };

    const bgClass = isDark ? 'bg-[#1a1a1a] border-zinc-700' : 'bg-white border-gray-200 shadow-xl';
    const hoverClass = isDark ? 'hover:bg-zinc-700' : 'hover:bg-gray-100';
    const iconColor = isDark ? 'text-zinc-400 group-hover:text-white' : 'text-gray-500 group-hover:text-gray-700';
    const optionHover = isDark ? 'hover:bg-zinc-700 hover:text-white' : 'hover:bg-gray-100 hover:text-gray-900';
    const activeItem = isDark ? 'bg-blue-500/15 text-blue-400' : 'bg-blue-50 text-blue-600';
    const flyoutBg = isDark ? 'bg-[#1a1a1a] border-zinc-700' : 'bg-white border-gray-200 shadow-xl';

    const activeGroupItems = hoveredGroup ? (options.find((o: any) => typeof o === 'object' && o.label === hoveredGroup)?.items || []) : [];

    return (
        <div className="relative flex items-center" ref={ref}>
            {/* Trigger Button */}
            <button 
                className={`flex items-center gap-2 cursor-pointer group h-8 px-3 rounded-lg border transition-all ${
                    isOpen 
                        ? (isDark ? 'bg-zinc-700 border-zinc-600' : 'bg-gray-100 border-gray-300') 
                        : (isDark ? 'border-zinc-700 hover:border-zinc-600' : 'border-gray-200 hover:border-gray-300')
                } ${hoverClass}`} 
                onClick={(e) => { e.stopPropagation(); onToggle(); }}
            >
                {Icon && <Icon size={15} className={`transition-colors ${isOpen ? (isDark ? 'text-blue-400' : 'text-blue-600') : iconColor}`} />}
                <span className={`text-xs font-medium transition-colors select-none ${
                    isOpen 
                        ? (isDark ? 'text-white' : 'text-gray-900') 
                        : (isDark ? 'text-zinc-300 group-hover:text-white' : 'text-gray-600 group-hover:text-gray-900')
                } ${Icon ? 'min-w-[20px] text-center' : 'max-w-[90px] truncate'}`}>
                    {value}
                </span>
                {!Icon && <Icons.ChevronRight size={12} className={`transition-all duration-200 ${isOpen ? 'rotate-[-90deg] text-blue-400' : `rotate-90 ${isDark ? 'text-zinc-500' : 'text-gray-400'}`}`} />}
            </button>

            {/* Main Dropdown Body */}
            {isOpen && (
                <div className={`absolute bottom-full mb-2 ${align === 'left' ? 'left-0' : align === 'right' ? 'right-0' : 'left-1/2 -translate-x-1/2'} ${width} min-w-[130px] ${bgClass} border rounded-xl shadow-2xl py-1.5 z-[100] animate-in fade-in slide-in-from-bottom-2 duration-150 overflow-visible`} onMouseDown={(e) => e.stopPropagation()} onWheel={(e) => e.stopPropagation()}>
                    
                    <div ref={listRef} className="max-h-[300px] overflow-y-auto custom-scrollbar px-1.5">
                        {options.map((opt: any) => {
                            const isGroup = typeof opt === 'object';
                            const label = isGroup ? opt.label : opt;
                            const isDisabled = !isGroup && disabledOptions.includes(label);
                            const isSelected = !isGroup && label === value;
                            const isGroupHovered = isGroup && hoveredGroup === label;
                            const containsSelection = isGroup && opt.items.includes(value);
                            
                            return (
                                <div 
                                    key={label}
                                    className={`relative px-3 py-2 text-xs font-medium rounded-lg transition-colors flex items-center justify-between cursor-pointer mb-0.5
                                        ${isDisabled 
                                            ? 'text-zinc-600 cursor-not-allowed opacity-50' 
                                            : (isSelected || (isGroup && isGroupHovered)
                                                ? activeItem 
                                                : (containsSelection 
                                                    ? (isDark ? 'text-blue-400' : 'text-blue-600') + ` ${optionHover}`
                                                    : (isDark ? 'text-zinc-300' : 'text-gray-600') + ` ${optionHover}`
                                                  )
                                            )
                                        }
                                    `}
                                    onMouseEnter={(e) => isGroup ? handleMouseEnterGroup(label, e) : setHoveredGroup(null)}
                                    onMouseLeave={handleMouseLeave}
                                    onClick={(e) => { 
                                        e.stopPropagation(); 
                                        if (!isGroup && !isDisabled) { onChange(label); onClose(); }
                                    }}
                                >
                                    <span className="whitespace-nowrap pr-2">{label}</span>
                                    {isSelected && <Icons.Check size={12} className="text-blue-400 shrink-0 ml-2" />}
                                    {isGroup && <Icons.ChevronRight size={12} className={`shrink-0 ml-2 ${isGroupHovered ? 'text-blue-400' : (isDark ? 'text-zinc-500' : 'text-gray-400')}`} />}
                                </div>
                            );
                        })}
                    </div>

                    {/* Flyout Menu */}
                    {hoveredGroup && activeGroupItems.length > 0 && (
                        <div 
                            className={`absolute left-full ml-2 w-[150px] ${flyoutBg} border rounded-xl shadow-2xl py-1.5 z-[110] animate-in fade-in slide-in-from-left-2 duration-150 before:absolute before:-left-4 before:top-0 before:h-full before:w-4 before:bg-transparent`}
                            style={{ top: flyoutTop }}
                            onMouseEnter={handleMouseEnterFlyout}
                            onMouseLeave={handleMouseLeave}
                        >
                            <div className="max-h-[250px] overflow-y-auto custom-scrollbar px-1.5">
                                {activeGroupItems.map((subItem: string) => {
                                    const isSubSelected = subItem === value;
                                    return (
                                        <div 
                                            key={subItem}
                                            className={`px-3 py-2 text-xs font-medium rounded-lg transition-colors flex items-center justify-between cursor-pointer mb-0.5
                                                ${isSubSelected ? activeItem : optionHover}
                                                ${!isSubSelected && isDark ? 'text-zinc-300' : ''} 
                                            `}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onChange(subItem);
                                                onClose();
                                            }}
                                        >
                                            <span className="truncate">{subItem}</span>
                                            {isSubSelected && <Icons.Check size={12} className="text-blue-400 shrink-0 ml-2" />}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export const LocalThumbnailItem = memo(({ src, index, isDark }: { src: string, index: number, isDark: boolean }) => {
    const [loaded, setLoaded] = useState(false);
    return (
        <div className={`relative w-[48px] h-[48px] flex-shrink-0 border rounded-lg overflow-hidden shadow-sm group/thumb cursor-pointer hover:border-cyan-500/50 transition-colors ${isDark ? 'border-zinc-700 bg-black/40' : 'border-gray-300 bg-gray-100'}`}>
            <div className={`absolute inset-0 ${isDark ? 'bg-zinc-800/50' : 'bg-gray-200'}`} />
            <img src={src} className="absolute inset-0 w-full h-full object-cover will-change-[clip-path]" draggable={false} decoding="async" loading="lazy" onLoad={() => setLoaded(true)} style={{ clipPath: loaded ? 'inset(0 0 0% 0)' : 'inset(0 0 100% 0)', opacity: loaded ? 1 : 0, transition: 'clip-path 0.8s ease-out, opacity 0.3s ease-in' }} />
            <div className="absolute top-0 right-0 bg-black/60 backdrop-blur-sm text-white text-[9px] font-bold px-1.5 rounded-bl z-10">{index + 1}</div>
        </div>
    );
});

export const LocalInputThumbnails = memo(({ inputs, ready, isDark, label }: { inputs: string[], ready: boolean, isDark: boolean, label?: string }) => {
    if (!inputs || inputs.length === 0) return null;
    const labelColor = isDark ? 'text-zinc-500' : 'text-gray-400';
    return (
       <div className="flex flex-col items-center gap-1 pb-2">
           {label && <span className={`text-[9px] font-bold uppercase ${labelColor}`}>{label}</span>}
           <div className="flex justify-center gap-2 overflow-x-auto no-scrollbar min-h-[48px]">
               {inputs.slice(0, 8).map((src, i) => (
                   ready ? <LocalThumbnailItem key={src + i} src={src} index={i} isDark={isDark} /> : <div key={i} className={`relative w-[48px] h-[48px] flex-shrink-0 border rounded-lg overflow-hidden shadow-sm ${isDark ? 'border-zinc-700 bg-black/40' : 'border-gray-300 bg-gray-100'}`}><div className={`absolute inset-0 ${isDark ? 'bg-zinc-800/50' : 'bg-gray-200'}`} /></div>
               ))}
           </div>
       </div>
    );
});

export const safeDownload = async (src: string) => {
    try {
      const response = await fetch(src);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a'); 
      link.href = url; 
      link.download = `download_${Date.now()}.png`;
      document.body.appendChild(link); link.click(); document.body.removeChild(link); URL.revokeObjectURL(url);
    } catch (e) {
      const link = document.createElement('a'); link.href = src; link.download = `download_${Date.now()}`; link.target = "_blank"; document.body.appendChild(link); link.click(); document.body.removeChild(link);
    }
};

export const LocalMediaStack: React.FC<{ data: NodeData, updateData: any, currentSrc: string | undefined, onMaximize?: any, isDark?: boolean, selected?: boolean }> = ({ 
    data, updateData, currentSrc, onMaximize, isDark = true, selected
}) => {
    const stackRef = useRef<HTMLDivElement>(null);
    const artifacts = data.outputArtifacts || [];
    const sortedArtifacts = currentSrc ? [currentSrc, ...artifacts.filter(a => a !== currentSrc)] : artifacts;
    const showBadge = !data.isStackOpen && artifacts.length > 1;

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => { if (data.isStackOpen && stackRef.current && !stackRef.current.contains(event.target as Node)) updateData(data.id, { isStackOpen: false }); };
        if (data.isStackOpen) document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [data.isStackOpen, data.id, updateData]);

    useEffect(() => { if (!selected && data.isStackOpen) updateData(data.id, { isStackOpen: false }); }, [selected, data.isStackOpen, data.id, updateData]);

    if (data.isStackOpen) {
        return (
            <div ref={stackRef} className="absolute top-0 left-0 h-full flex gap-4 z-[100] animate-in fade-in zoom-in-95 duration-200">
                {sortedArtifacts.map((src, index) => {
                    const isMain = index === 0;
                    return (
                      <div key={src + index} className={`relative h-full rounded-xl border ${isDark ? 'border-zinc-800 bg-black' : 'border-gray-200 bg-white'} overflow-hidden shadow-2xl flex-shrink-0 group/card ${isMain ? 'ring-2 ring-cyan-500/50' : ''}`} style={{ width: data.width }}>
                           <img src={src} className={`w-full h-full object-contain ${isDark ? 'bg-[#09090b]' : 'bg-gray-50'}`} draggable={false} onMouseDown={(e) => e.preventDefault()} />
                           <div className="absolute bottom-2 right-2 flex items-center gap-1.5 z-20 pointer-events-auto">
                               {!isMain && <button className="h-6 px-2 bg-black/40 hover:bg-black/60 backdrop-blur-md border border-white/10 rounded-md text-[9px] font-bold text-white transition-colors flex items-center gap-1 shadow-sm" onClick={(e) => { e.stopPropagation(); updateData(data.id, { imageSrc: src, isStackOpen: false }); }}><Icons.Check size={10} className="text-cyan-400" /><span>Main</span></button>}
                               <button className="w-6 h-6 flex items-center justify-center bg-black/40 hover:bg-black/60 backdrop-blur-md border border-white/10 rounded-md text-white transition-colors shadow-sm" onClick={(e) => { e.stopPropagation(); onMaximize?.(data.id); }}><Icons.Maximize2 size={12}/></button>
                           </div>
                           <div className="absolute top-2 left-2 px-1.5 py-0.5 bg-black/60 backdrop-blur-md rounded text-[9px] text-white font-mono border border-white/10 select-none">#{index + 1}</div>
                      </div>
                    );
                })}
                <div className="flex flex-col justify-center h-full pl-2 pr-6"><button className={`w-10 h-10 rounded-full border flex items-center justify-center transition-all shadow-lg ${isDark ? 'bg-zinc-900 border-zinc-700 text-zinc-400 hover:text-white hover:bg-zinc-800' : 'bg-white border-gray-200 text-gray-500 hover:text-gray-800 hover:bg-gray-50'}`} onClick={(e) => { e.stopPropagation(); updateData(data.id, { isStackOpen: false }); }}><Icons.X size={20} /></button></div>
            </div>
        );
    }

    return (
        <>
           {currentSrc && <img src={currentSrc} className={`w-full h-full object-contain pointer-events-none ${isDark ? 'bg-[#09090b]' : 'bg-gray-50'}`} alt="Generated" draggable={false} />}
           {showBadge && <div className="absolute top-2 right-2 bg-black/30 backdrop-blur-md hover:bg-black/50 text-white text-[10px] px-2 py-1 rounded-full flex items-center gap-1 border border-white/10 z-30 pointer-events-auto cursor-pointer select-none shadow-lg transition-colors group/badge" onClick={(e) => { e.stopPropagation(); updateData(data.id, { isStackOpen: true }); }}><Icons.Layers size={10} className="text-cyan-400"/><span className="font-bold tabular-nums">{artifacts.length}</span><Icons.ChevronRight size={10} className="text-zinc-400 group-hover/badge:text-white" /></div>}
        </>
    );
};
