import React, { useState, useEffect, useCallback } from 'react';
import { Icons } from '../Icons';
import { storageService, StorageStats, AppSettings } from '../../services/storageService';

interface StorageModalProps {
    isOpen: boolean;
    onClose: () => void;
    isDark: boolean;
}

type TabType = 'storage' | 'cache' | 'settings';

export const StorageModal: React.FC<StorageModalProps> = ({ isOpen, onClose, isDark }) => {
    const [activeTab, setActiveTab] = useState<TabType>('storage');
    
    // 存储状态
    const [storageDir, setStorageDir] = useState<string | null>(null);
    const [storageStats, setStorageStats] = useState<StorageStats | null>(null);
    const [cacheStats, setCacheStats] = useState<{ count: number, totalSize: number, byType: Record<string, number> } | null>(null);
    const [settings, setSettings] = useState<AppSettings | null>(null);
    
    // 操作状态
    const [isClearing, setIsClearing] = useState(false);
    const [clearingType, setClearingType] = useState<string | null>(null);

    // 加载数据
    const loadData = useCallback(async () => {
        const [dir, stats, cache, appSettings] = await Promise.all([
            storageService.getDownloadDirectoryName(),
            storageService.getStorageStats(),
            storageService.getCacheStats(),
            Promise.resolve(storageService.getSettings())
        ]);
        
        setStorageDir(dir);
        setStorageStats(stats);
        setCacheStats(cache);
        setSettings(appSettings);
    }, []);

    useEffect(() => {
        if (isOpen) {
            loadData();
        }
    }, [isOpen, loadData]);

    // 操作函数
    const handleSetDirectory = async () => {
        const name = await storageService.setDownloadDirectory();
        if (name) {
            setStorageDir(name);
        }
    };

    const handleResetDirectory = async () => {
        await storageService.clearDownloadDirectory();
        setStorageDir(null);
    };

    const handleClearCache = async (type?: string) => {
        setIsClearing(true);
        setClearingType(type || 'all');
        
        try {
            if (type) {
                await storageService.clearCache(type as any);
            } else {
                await storageService.clearAllData();
            }
            await loadData();
        } finally {
            setIsClearing(false);
            setClearingType(null);
        }
    };

    const handleUpdateSetting = async (key: keyof AppSettings, value: any) => {
        if (!settings) return;
        
        const newSettings = { ...settings, [key]: value };
        setSettings(newSettings);
        await storageService.saveSettings({ [key]: value });
    };

    const handleResetAllSettings = async () => {
        if (confirm('确定要重置所有设置吗？这将恢复到默认配置。')) {
            await storageService.resetAllSettings();
            await loadData();
        }
    };

    // 格式化工具
    const formatBytes = (bytes: number) => storageService.formatBytes(bytes);
    const formatPercent = (used: number, total: number) => total > 0 ? ((used / total) * 100).toFixed(1) : '0';

    // 样式 - shadcn/ui 风格
    const overlayBase = "fixed inset-0 z-[250] bg-black/80 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0";
    const contentBase = "fixed left-[50%] top-[50%] z-[250] w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border p-0 shadow-lg duration-200 sm:rounded-3xl overflow-hidden max-h-[90vh] flex flex-col";
    
    const bgMain = isDark ? 'bg-zinc-950' : 'bg-white';
    const borderColor = isDark ? 'border-zinc-800' : 'border-zinc-200';
    const textMain = isDark ? 'text-zinc-50' : 'text-zinc-900';
    const textSub = isDark ? 'text-zinc-400' : 'text-zinc-500';
    const textMuted = isDark ? 'text-zinc-500' : 'text-zinc-400';
    
    const buttonBase = "inline-flex items-center justify-center whitespace-nowrap rounded-xl text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 h-9 px-4 py-2";
    const buttonPrimary = isDark 
        ? "bg-zinc-50 text-zinc-900 hover:bg-zinc-50/90" 
        : "bg-zinc-900 text-zinc-50 hover:bg-zinc-900/90";
    const buttonOutline = isDark
        ? "border border-zinc-800 bg-transparent hover:bg-zinc-800 hover:text-zinc-50 text-zinc-300"
        : "border border-zinc-200 bg-transparent hover:bg-zinc-100 hover:text-zinc-900 text-zinc-700";
    const buttonGhost = isDark 
        ? "hover:bg-zinc-800 hover:text-zinc-50 text-zinc-400" 
        : "hover:bg-zinc-100 hover:text-zinc-900 text-zinc-500";
    const buttonDestructive = "bg-red-500 text-zinc-50 hover:bg-red-500/90";

    const tabListBase = "inline-flex h-9 items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground";
    const tabListState = isDark ? "bg-zinc-800/50" : "bg-zinc-100";
    const tabTriggerBase = "inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow";
    const tabTriggerState = (isActive: boolean) => isActive 
        ? (isDark ? "bg-zinc-950 text-zinc-50 shadow-sm" : "bg-white text-zinc-950 shadow-sm")
        : (isDark ? "text-zinc-400 hover:text-zinc-50" : "text-zinc-500 hover:text-zinc-900");

    if (!isOpen) return null;

    const renderStorageTab = () => (
        <div className="space-y-4">
            {/* 下载目录设置 */}
            <div className={`p-4 rounded-lg border ${borderColor} ${isDark ? 'bg-zinc-900/30' : 'bg-zinc-50/50'}`}>
                <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-md ${isDark ? 'bg-zinc-800' : 'bg-zinc-100'}`}>
                            <Icons.FolderOpen size={16} className={isDark ? "text-zinc-400" : "text-zinc-500"} />
                        </div>
                        <div>
                            <h3 className={`text-sm font-medium ${textMain}`}>下载目录</h3>
                            <p className={`text-xs mt-0.5 ${textMuted}`}>
                                生成的图片将保存到此位置
                            </p>
                        </div>
                    </div>
                </div>

                <div className={`p-2.5 rounded-md ${isDark ? 'bg-zinc-950' : 'bg-white'} border ${borderColor} mb-4`}>
                    <div className="flex items-center gap-2">
                        <Icons.Folder size={14} className={textMuted} />
                        <span className={`text-xs font-mono truncate ${storageDir ? textMain : textMuted}`}>
                            {storageDir || '使用浏览器默认下载位置'}
                        </span>
                    </div>
                </div>

                <div className="flex gap-2">
                    <button 
                        onClick={handleSetDirectory}
                        className={`${buttonBase} ${buttonPrimary} flex-1`}
                    >
                        {storageDir ? '更改目录' : '选择下载目录'}
                    </button>
                    {storageDir && (
                        <button 
                            onClick={handleResetDirectory}
                            className={`${buttonBase} ${buttonOutline}`}
                        >
                            重置
                        </button>
                    )}
                </div>

                {!storageService.isFileSystemAccessSupported() && (
                    <div className={`mt-3 p-2.5 rounded-md text-xs border ${isDark ? 'bg-amber-950/20 border-amber-900/30 text-amber-500' : 'bg-amber-50 border-amber-100 text-amber-600'}`}>
                        <div className="flex items-center gap-2">
                            <Icons.AlertCircle size={14} />
                            <span>您的浏览器不支持文件系统访问API，文件将使用默认下载方式</span>
                        </div>
                    </div>
                )}
            </div>

            {/* 存储使用情况 */}
            <div className={`p-4 rounded-lg border ${borderColor} ${isDark ? 'bg-zinc-900/30' : 'bg-zinc-50/50'}`}>
                <div className="flex items-center gap-3 mb-4">
                    <div className={`p-2 rounded-md ${isDark ? 'bg-zinc-800' : 'bg-zinc-100'}`}>
                        <Icons.Database size={16} className={isDark ? "text-zinc-400" : "text-zinc-500"} />
                    </div>
                    <div>
                        <h3 className={`text-sm font-medium ${textMain}`}>存储使用情况</h3>
                        <p className={`text-xs mt-0.5 ${textMuted}`}>
                            应用占用的本地存储空间
                        </p>
                    </div>
                </div>

                {storageStats && (
                    <div className="space-y-4">
                        {/* 总存储进度条 */}
                        <div>
                            <div className="flex justify-between text-xs mb-2">
                                <span className={textMain}>{formatBytes(storageStats.totalUsage)}</span>
                                <span className={textMuted}>{formatBytes(storageStats.indexedDBQuota)} 配额</span>
                            </div>
                            <div className={`h-2 rounded-full overflow-hidden ${isDark ? 'bg-zinc-800' : 'bg-zinc-200'}`}>
                                <div 
                                    className={`h-full rounded-full transition-all duration-500 ${isDark ? 'bg-zinc-50' : 'bg-zinc-900'}`}
                                    style={{ width: `${Math.min(100, parseFloat(formatPercent(storageStats.totalUsage, storageStats.indexedDBQuota)))}%` }}
                                />
                            </div>
                            <p className={`text-[10px] mt-1.5 ${textMuted} text-right`}>
                                已使用 {formatPercent(storageStats.totalUsage, storageStats.indexedDBQuota)}%
                            </p>
                        </div>

                        {/* 详细分类 */}
                        <div className="grid grid-cols-3 gap-2">
                            <div className={`p-3 rounded-md ${isDark ? 'bg-zinc-950' : 'bg-white'} border ${borderColor}`}>
                                <p className={`text-[10px] uppercase tracking-wider ${textMuted}`}>IndexedDB</p>
                                <p className={`text-sm font-medium mt-1 ${textMain}`}>{formatBytes(storageStats.indexedDBUsage)}</p>
                            </div>
                            <div className={`p-3 rounded-md ${isDark ? 'bg-zinc-950' : 'bg-white'} border ${borderColor}`}>
                                <p className={`text-[10px] uppercase tracking-wider ${textMuted}`}>Cache API</p>
                                <p className={`text-sm font-medium mt-1 ${textMain}`}>{formatBytes(storageStats.cacheAPIUsage)}</p>
                            </div>
                            <div className={`p-3 rounded-md ${isDark ? 'bg-zinc-950' : 'bg-white'} border ${borderColor}`}>
                                <p className={`text-[10px] uppercase tracking-wider ${textMuted}`}>LocalStorage</p>
                                <p className={`text-sm font-medium mt-1 ${textMain}`}>{formatBytes(storageStats.localStorageUsage)}</p>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );

    const renderCacheTab = () => (
        <div className="space-y-4">
            {/* 缓存概览 */}
            <div className={`p-4 rounded-lg border ${borderColor} ${isDark ? 'bg-zinc-900/30' : 'bg-zinc-50/50'}`}>
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-md ${isDark ? 'bg-zinc-800' : 'bg-zinc-100'}`}>
                            <Icons.Layers size={16} className={isDark ? "text-zinc-400" : "text-zinc-500"} />
                        </div>
                        <div>
                            <h3 className={`text-sm font-medium ${textMain}`}>缓存管理</h3>
                            <p className={`text-xs mt-0.5 ${textMuted}`}>
                                管理应用缓存以释放空间
                            </p>
                        </div>
                    </div>
                    {cacheStats && (
                        <div className="text-right">
                            <p className={`text-lg font-semibold ${textMain}`}>{formatBytes(cacheStats.totalSize)}</p>
                            <p className={`text-[10px] ${textMuted}`}>{cacheStats.count} 个缓存条目</p>
                        </div>
                    )}
                </div>

                {/* 缓存类型列表 */}
                {cacheStats && (
                    <div className="space-y-2 mb-4">
                        {Object.entries(cacheStats.byType).map(([type, size]) => (
                            <div 
                                key={type}
                                className={`flex items-center justify-between p-3 rounded-md ${isDark ? 'bg-zinc-950' : 'bg-white'} border ${borderColor}`}
                            >
                                <div className="flex items-center gap-2">
                                    {type === 'image' && <Icons.Image size={14} className={textSub} />}
                                    {type === 'workflow' && <Icons.Folder size={14} className={textSub} />}
                                    {type === 'other' && <Icons.Database size={14} className={textSub} />}
                                    <span className={`text-xs font-medium ${textMain}`}>
                                        {type === 'image' ? '图片缓存' : 
                                         type === 'workflow' ? '工作流缓存' : '其他缓存'}
                                    </span>
                                </div>
                                <div className="flex items-center gap-3">
                                    <span className={`text-xs font-mono ${textSub}`}>{formatBytes(size)}</span>
                                    <button
                                        onClick={() => handleClearCache(type)}
                                        disabled={isClearing}
                                        className={`p-1.5 rounded-sm transition-colors ${isDark ? 'hover:bg-zinc-800 text-zinc-400 hover:text-red-400' : 'hover:bg-zinc-100 text-zinc-500 hover:text-red-600'} disabled:opacity-50`}
                                        title={`清除${type}缓存`}
                                    >
                                        {isClearing && clearingType === type ? (
                                            <Icons.Loader2 size={12} className="animate-spin" />
                                        ) : (
                                            <Icons.Trash2 size={12} />
                                        )}
                                    </button>
                                </div>
                            </div>
                        ))}

                        {Object.keys(cacheStats.byType).length === 0 && (
                            <div className={`text-center py-8 ${textMuted}`}>
                                <Icons.Check size={24} className="mx-auto mb-2 opacity-50" />
                                <p className="text-xs">缓存为空</p>
                            </div>
                        )}
                    </div>
                )}

                {/* 清除所有按钮 */}
                <button 
                    onClick={() => handleClearCache()}
                    disabled={isClearing || (cacheStats?.count === 0)}
                    className={`${buttonBase} ${buttonDestructive} w-full`}
                >
                    {isClearing && clearingType === 'all' ? (
                        <Icons.Loader2 size={14} className="animate-spin mr-2" />
                    ) : (
                        <Icons.Trash2 size={14} className="mr-2" />
                    )}
                    清除所有缓存
                </button>
            </div>

            {/* 缓存设置 */}
            {settings && (
                <div className={`p-4 rounded-lg border ${borderColor} ${isDark ? 'bg-zinc-900/30' : 'bg-zinc-50/50'}`}>
                    <h3 className={`text-sm font-medium mb-4 ${textMain}`}>缓存设置</h3>
                    
                    <div className="space-y-4">
                        {/* 缓存开关 */}
                        <div className="flex items-center justify-between">
                            <div>
                                <p className={`text-xs font-medium ${textMain}`}>启用缓存</p>
                                <p className={`text-[10px] ${textMuted}`}>缓存生成的内容以加快加载速度</p>
                            </div>
                            <button
                                onClick={() => handleUpdateSetting('cacheEnabled', !settings.cacheEnabled)}
                                className={`relative w-9 h-5 rounded-full transition-colors ${settings.cacheEnabled ? (isDark ? 'bg-zinc-50' : 'bg-zinc-900') : (isDark ? 'bg-zinc-800' : 'bg-zinc-200')}`}
                            >
                                <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${settings.cacheEnabled ? 'translate-x-4.5' : 'translate-x-0.5'}`} />
                            </button>
                        </div>

                        {/* 最大缓存大小 */}
                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <p className={`text-xs font-medium ${textMain}`}>最大缓存大小</p>
                                <span className={`text-xs font-mono ${textSub}`}>{formatBytes(settings.maxCacheSize)}</span>
                            </div>
                            <input
                                type="range"
                                min={100 * 1024 * 1024}
                                max={2000 * 1024 * 1024}
                                step={100 * 1024 * 1024}
                                value={settings.maxCacheSize}
                                onChange={(e) => handleUpdateSetting('maxCacheSize', parseInt(e.target.value))}
                                className={`w-full h-1.5 rounded-full appearance-none cursor-pointer ${isDark ? 'bg-zinc-800 accent-zinc-50' : 'bg-zinc-200 accent-zinc-900'}`}
                            />
                            <div className={`flex justify-between text-[10px] mt-1 ${textMuted}`}>
                                <span>100 MB</span>
                                <span>2 GB</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );

    const renderSettingsTab = () => (
        <div className="space-y-4">
            {settings && (
                <>
                    {/* 自动保存 */}
                    <div className={`p-4 rounded-lg border ${borderColor} ${isDark ? 'bg-zinc-900/30' : 'bg-zinc-50/50'}`}>
                        <div className="flex items-center gap-3 mb-4">
                            <div className={`p-2 rounded-md ${isDark ? 'bg-zinc-800' : 'bg-zinc-100'}`}>
                                <Icons.Save size={16} className={isDark ? "text-zinc-400" : "text-zinc-500"} />
                            </div>
                            <div>
                                <h3 className={`text-sm font-medium ${textMain}`}>自动保存</h3>
                                <p className={`text-xs mt-0.5 ${textMuted}`}>工作流自动保存设置</p>
                            </div>
                        </div>

                        <div className="flex items-center justify-between">
                            <div>
                                <p className={`text-xs font-medium ${textMain}`}>自动保存工作流</p>
                                <p className={`text-[10px] ${textMuted}`}>每隔一段时间自动保存当前工作流</p>
                            </div>
                            <button
                                onClick={() => handleUpdateSetting('autoSaveWorkflow', !settings.autoSaveWorkflow)}
                                className={`relative w-9 h-5 rounded-full transition-colors ${settings.autoSaveWorkflow ? (isDark ? 'bg-zinc-50' : 'bg-zinc-900') : (isDark ? 'bg-zinc-800' : 'bg-zinc-200')}`}
                            >
                                <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${settings.autoSaveWorkflow ? 'translate-x-4.5' : 'translate-x-0.5'}`} />
                            </button>
                        </div>
                    </div>

                    {/* 图片质量 */}
                    <div className={`p-4 rounded-lg border ${borderColor} ${isDark ? 'bg-zinc-900/30' : 'bg-zinc-50/50'}`}>
                        <div className="flex items-center gap-3 mb-4">
                            <div className={`p-2 rounded-md ${isDark ? 'bg-zinc-800' : 'bg-zinc-100'}`}>
                                <Icons.Image size={16} className={isDark ? "text-zinc-400" : "text-zinc-500"} />
                            </div>
                            <div>
                                <h3 className={`text-sm font-medium ${textMain}`}>输出质量</h3>
                                <p className={`text-xs mt-0.5 ${textMuted}`}>保存图片时的压缩质量</p>
                            </div>
                        </div>

                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <p className={`text-xs font-medium ${textMain}`}>图片质量</p>
                                <span className={`text-xs font-mono ${textSub}`}>{Math.round(settings.imageQuality * 100)}%</span>
                            </div>
                            <input
                                type="range"
                                min={0.5}
                                max={1}
                                step={0.05}
                                value={settings.imageQuality}
                                onChange={(e) => handleUpdateSetting('imageQuality', parseFloat(e.target.value))}
                                className={`w-full h-1.5 rounded-full appearance-none cursor-pointer ${isDark ? 'bg-zinc-800 accent-zinc-50' : 'bg-zinc-200 accent-zinc-900'}`}
                            />
                            <div className={`flex justify-between text-[10px] mt-1 ${textMuted}`}>
                                <span>50% (小文件)</span>
                                <span>100% (最高质量)</span>
                            </div>
                        </div>
                    </div>

                    {/* 重置设置 */}
                    <div className={`p-4 rounded-lg border ${isDark ? 'border-red-900/30 bg-red-950/10' : 'border-red-200 bg-red-50'}`}>
                        <div className="flex items-center gap-3 mb-4">
                            <div className={`p-2 rounded-md ${isDark ? 'bg-red-950/30' : 'bg-red-100'}`}>
                                <Icons.AlertCircle size={16} className="text-red-500" />
                            </div>
                            <div>
                                <h3 className={`text-sm font-medium ${isDark ? 'text-red-400' : 'text-red-600'}`}>危险区域</h3>
                                <p className={`text-xs mt-0.5 ${isDark ? 'text-red-400/70' : 'text-red-500'}`}>重置所有设置到默认值</p>
                            </div>
                        </div>

                        <button 
                            onClick={handleResetAllSettings}
                            className={`${buttonBase} ${buttonOutline} w-full border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900/30 dark:text-red-400 dark:hover:bg-red-950/20`}
                        >
                            重置所有设置
                        </button>
                    </div>
                </>
            )}
        </div>
    );

    return (
        <div 
            className={overlayBase} 
            onClick={onClose}
        >
            <div 
                className={`${contentBase} ${bgMain} ${borderColor}`} 
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className={`px-6 py-4 border-b ${borderColor} flex items-center justify-between shrink-0`}>
                    <div className="flex flex-col gap-1">
                        <h2 className={`text-lg font-semibold leading-none tracking-tight ${textMain}`}>本地存储管理</h2>
                        <p className={`text-sm ${textMuted}`}>管理应用的本地存储、缓存和设置。</p>
                    </div>
                    <button onClick={onClose} className={`rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
                        <Icons.X size={16} />
                        <span className="sr-only">Close</span>
                    </button>
                </div>

                {/* Tabs */}
                <div className={`px-6 pt-4 border-b ${borderColor}`}>
                    <div className={`${tabListBase} ${tabListState}`}>
                        {[
                            { id: 'storage' as TabType, label: '存储' },
                            { id: 'cache' as TabType, label: '缓存' },
                            { id: 'settings' as TabType, label: '设置' },
                        ].map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`${tabTriggerBase} ${tabTriggerState(activeTab === tab.id)}`}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Content */}
                <div 
                    className="flex-1 p-6 overflow-y-auto custom-scrollbar overscroll-contain"
                    onWheel={(e) => e.stopPropagation()}
                >
                    {activeTab === 'storage' && renderStorageTab()}
                    {activeTab === 'cache' && renderCacheTab()}
                    {activeTab === 'settings' && renderSettingsTab()}
                </div>
            </div>
        </div>
    );
};
