import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Icons } from '../Icons';
import { MODEL_REGISTRY, getModelConfig, saveModelConfig, ModelConfig, registerCustomModel, deleteModel, isCustomModel } from '../../services/geminiService';

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    isDark: boolean;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, isDark }) => {
    
    // 模型配置
    const [configs, setConfigs] = useState<Record<string, ModelConfig>>({});
    const [expandedModels, setExpandedModels] = useState<Set<string>>(new Set());
    const [searchTerm, setSearchTerm] = useState('');
    const [filterType, setFilterType] = useState<'all' | 'image' | 'text' | 'audio'>('all');
    
    // 测试连接状态
    const [testingModels, setTestingModels] = useState<Set<string>>(new Set());
    const [testResults, setTestResults] = useState<Record<string, 'success' | 'error' | null>>({});
    
    // 添加模型状态
    const [showAddModel, setShowAddModel] = useState(false);
    const [newModelName, setNewModelName] = useState('');
    const [newModelId, setNewModelId] = useState('');
    const [newModelType, setNewModelType] = useState<'IMAGE' | 'TEXT' | 'AUDIO'>('IMAGE');
    const [newModelEndpoint, setNewModelEndpoint] = useState('');

    const configInputRef = useRef<HTMLInputElement>(null);

    // 加载配置
    useEffect(() => {
        if (isOpen) {
            // 加载模型配置
            const newConfigs: Record<string, ModelConfig> = {};
            Object.keys(MODEL_REGISTRY).forEach(key => {
                newConfigs[key] = getModelConfig(key);
            });
            setConfigs(newConfigs);
        }
    }, [isOpen]);

    // 更新模型配置
    const updateConfig = (modelKey: string, field: keyof ModelConfig, value: string) => {
        setConfigs(prev => {
            const newConfig = { ...prev[modelKey], [field]: value };
            // 立即保存到 localStorage
            saveModelConfig(modelKey, newConfig);
            return { ...prev, [modelKey]: newConfig };
        });
    };

    // 切换展开状态
    const toggleExpand = (key: string) => {
        setExpandedModels(prev => {
            const newSet = new Set(prev);
            if (newSet.has(key)) {
                newSet.delete(key);
            } else {
                newSet.add(key);
            }
            return newSet;
        });
    };

    // 测试连接 - 带超时处理
    const testConnection = async (modelKey: string) => {
        setTestingModels(prev => new Set(prev).add(modelKey));
        setTestResults(prev => ({ ...prev, [modelKey]: null }));
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10秒超时
        
        try {
            const config = configs[modelKey];
            const baseUrl = (config?.baseUrl || '').replace(/\/$/, '');
            const apiKey = config?.key;
            const modelId = config?.modelId || '';
            
            if (!baseUrl) {
                throw new Error('缺少 Base URL');
            }
            
            // 从 endpoint 提取前缀，例如 /image/generate → /image
            const endpoint = config?.endpoint || '';
            const endpointParts = endpoint.split('/').filter(Boolean);
            const prefix = endpointParts.length > 0 ? `/${endpointParts[0]}` : '';
            const testUrl = `${baseUrl}${prefix}/models`;
            
            const headers: Record<string, string> = {
                'Content-Type': 'application/json',
            };
            if (apiKey) {
                headers['Authorization'] = `Bearer ${apiKey}`;
            }
            
            const response = await fetch(testUrl, {
                method: 'GET',
                headers,
                signal: controller.signal,
            });
            
            clearTimeout(timeoutId);
            
            if (response.ok) {
                const json = await response.json();
                const data = json.data || json.models || [];
                const modelFound = Array.isArray(data) && data.some((item: any) => item.id === modelId);
                
                if (modelFound) {
                    setTestResults(prev => ({ ...prev, [modelKey]: 'success' }));
                } else {
                    throw new Error(`未找到模型 ${modelId}`);
                }
            } else {
                throw new Error(`HTTP ${response.status}`);
            }
        } catch (e: any) {
            clearTimeout(timeoutId);
            
            const config = configs[modelKey];
            const originalBaseUrl = (config?.baseUrl || '');
            
            if (e.name === 'AbortError') {
                console.warn(`测试 ${modelKey} 超时`);
            } else if (e.message === 'Failed to fetch' || e.name === 'TypeError') {
                if (typeof window !== 'undefined' && window.location.protocol === 'https:' && originalBaseUrl.startsWith('http://')) {
                      alert(`连接失败：\n1. 当前网站是 HTTPS 安全协议，浏览器禁止直接访问 HTTP 接口。\n2. 系统尝试自动升级为 HTTPS 连接，但对方服务器不支持 HTTPS 或握手失败。\n\n解决方案：\n👉 请更换支持 HTTPS 的 API 服务商（推荐）\n👉 或下载代码在本地 (localhost) 运行`);
                } else if (isMixedContent(originalBaseUrl)) {
                     alert('连接失败：浏览器禁止在 HTTPS 网站中访问 HTTP 接口。请使用 HTTPS API 地址。');
                }
            }
            
            setTestResults(prev => ({ ...prev, [modelKey]: 'error' }));
        } finally {
            setTestingModels(prev => {
                const newSet = new Set(prev);
                newSet.delete(modelKey);
                return newSet;
            });
        }
    };

    // 添加自定义模型
    const handleAddModel = () => {
        if (!newModelName || !newModelId) return;
        
        const getStrategyType = () => {
            switch (newModelType) {
                case 'IMAGE': return 'IMAGE_GEN';
                case 'TEXT': return 'TEXT_GEN';
                case 'AUDIO': return 'AUDIO_GEN';
            }
        };
        
        const getDefaultEndpoint = () => {
            if (newModelEndpoint) return newModelEndpoint;
            switch (newModelType) {
                case 'IMAGE': return '/v1/images/generations';
                case 'TEXT': return '/v1/chat/completions';
                case 'AUDIO': return '/v1/audio/speech';
            }
        };
        
        registerCustomModel(newModelName, {
            id: newModelId,
            name: newModelName,
            type: getStrategyType(),
            category: newModelType,
            defaultEndpoint: getDefaultEndpoint()
        });
        
        setConfigs(prev => ({
            ...prev,
            [newModelName]: getModelConfig(newModelName)
        }));
        
        setShowAddModel(false);
        setNewModelName('');
        setNewModelId('');
        setNewModelEndpoint('');
        setNewModelType('IMAGE');
        setExpandedModels(prev => new Set(prev).add(newModelName));
    };
    
    // 删除模型
    const handleDeleteModel = (key: string) => {
        const modelName = MODEL_REGISTRY[key]?.name || key;
        if (confirm(`确定要删除模型 "${modelName}" 吗？删除后将不再显示在模型选择列表中。`)) {
            deleteModel(key);
            setConfigs(prev => {
                const newConfigs = { ...prev };
                delete newConfigs[key];
                return newConfigs;
            });
            setExpandedModels(prev => {
                const newSet = new Set(prev);
                newSet.delete(key);
                return newSet;
            });
        }
    };

    // 导出配置
    const handleExport = () => {
        const exportData = {
            version: 2,
            timestamp: new Date().toISOString(),
            configs: Object.fromEntries(
                Object.entries(configs).filter(([_, v]: [string, ModelConfig]) => v.key || v.baseUrl || v.modelId)
            )
        };
        
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `infinity-canvas-config-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    // 导入配置
    const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const data = JSON.parse(event.target?.result as string);
                if (data.configs) {
                    Object.entries(data.configs).forEach(([key, config]) => {
                        saveModelConfig(key, config as ModelConfig);
                    });
                    // 重新加载
                    const newConfigs: Record<string, ModelConfig> = {};
                    Object.keys(MODEL_REGISTRY).forEach(key => {
                        newConfigs[key] = getModelConfig(key);
                    });
                    setConfigs(newConfigs);
                }
                alert('配置导入成功');
            } catch (err) {
                alert('导入失败：文件格式无效');
            }
        };
        reader.readAsText(file);
        e.target.value = '';
    };

    // 过滤模型列表
    const filteredModels = useMemo(() => {
        return Object.keys(MODEL_REGISTRY).filter(key => {
            const def = MODEL_REGISTRY[key];
            if (!def) return false;
            
            const matchesSearch = !searchTerm || 
                def.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                def.id.toLowerCase().includes(searchTerm.toLowerCase());
            
            const matchesType = filterType === 'all' || 
                (filterType === 'image' && def.category === 'IMAGE') ||
                (filterType === 'text' && def.category === 'TEXT') ||
                (filterType === 'audio' && def.category === 'AUDIO');
            
            return matchesSearch && matchesType;
        });
    }, [searchTerm, filterType, configs]);

    // 判断模型是否已配置
    const isConfigured = (key: string) => {
        const config = configs[key];
        return config?.key && config?.baseUrl;
    };

    // 检查是否是混合内容（Mixed Content）风险
    const isMixedContent = (url: string) => {
        if (typeof window === 'undefined') return false;
        return window.location.protocol === 'https:' && url.toLowerCase().startsWith('http://');
    };

    // 样式
    const bgMain = isDark ? 'bg-[#0f0f11]' : 'bg-gray-50';
    const bgCard = isDark ? 'bg-[#18181b]' : 'bg-white';
    const borderColor = isDark ? 'border-[#27272a]' : 'border-gray-200';
    const textMain = isDark ? 'text-white' : 'text-gray-900';
    const textSub = isDark ? 'text-gray-400' : 'text-gray-500';
    const textMuted = isDark ? 'text-gray-600' : 'text-gray-400';
    const inputBg = isDark ? 'bg-[#0f0f11]' : 'bg-gray-50';

    if (!isOpen) return null;

    return (
        <div 
            className="fixed inset-0 z-[250] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
            onClick={onClose}
        >
            <div 
                className={`w-full max-w-3xl max-h-[90vh] rounded-2xl overflow-hidden shadow-2xl border ${bgCard} ${borderColor} flex flex-col animate-in zoom-in-95 duration-200`}
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className={`px-6 py-4 border-b ${borderColor} flex items-center justify-between shrink-0`}>
                    <h2 className={`text-lg font-bold ${textMain}`}>模型接口配置</h2>
                    <button 
                        onClick={onClose}
                        className={`p-2 rounded-lg transition-colors ${isDark ? 'hover:bg-white/5 text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}
                    >
                        <Icons.X size={18} />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto custom-scrollbar">
                    <div className="p-6 space-y-6">

                        {/* 搜索和筛选 */}
                        <div className="flex items-center gap-3">
                            <div className={`flex-1 relative`}>
                                <Icons.Search size={16} className={`absolute left-3 top-1/2 -translate-y-1/2 ${textMuted}`} />
                                <input
                                    type="text"
                                    value={searchTerm}
                                    onChange={e => setSearchTerm(e.target.value)}
                                    className={`w-full pl-10 pr-4 py-2.5 rounded-xl text-sm border ${borderColor} ${inputBg} ${textMain} outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50 transition-all`}
                                    placeholder="搜索模型..."
                                />
                            </div>
                            <div className={`flex p-1 rounded-xl border ${borderColor} ${isDark ? 'bg-[#0f0f11]' : 'bg-gray-50'}`}>
                                {(['all', 'image', 'text', 'audio'] as const).map(type => (
                                    <button
                                        key={type}
                                        onClick={() => setFilterType(type)}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                                            filterType === type
                                                ? 'bg-blue-500 text-white shadow-sm'
                                                : `${textSub} hover:text-white`
                                        }`}
                                    >
                                        {type === 'all' ? '全部' : type === 'image' ? '图像' : type === 'text' ? '文字' : '语音'}
                                    </button>
                                ))}
                            </div>
                            <button
                                onClick={() => setShowAddModel(true)}
                                className={`px-3 py-2.5 rounded-xl text-xs font-medium border ${borderColor} ${textSub} hover:text-white hover:border-blue-500/50 transition-all flex items-center gap-1.5`}
                            >
                                <Icons.Plus size={14} /> 添加
                            </button>
                        </div>

                        {/* 模型列表 */}
                        <div className="space-y-3">
                            {filteredModels.map(key => {
                                const def = MODEL_REGISTRY[key];
                                const config = configs[key] || {};
                                const isExpanded = expandedModels.has(key);
                                const configured = isConfigured(key);
                                const testing = testingModels.has(key);
                                const testResult = testResults[key];
                                const isCustom = isCustomModel(key);

                                return (
                                    <div 
                                        key={key}
                                        className={`rounded-2xl border ${borderColor} overflow-hidden transition-all ${
                                            isExpanded ? (isDark ? 'bg-[#1a1a1f]' : 'bg-white') : ''
                                        }`}
                                    >
                                        {/* 模型头部 */}
                                        <div 
                                            className={`px-5 py-4 flex items-center justify-between cursor-pointer transition-colors ${
                                                isDark ? 'hover:bg-white/[0.02]' : 'hover:bg-gray-50'
                                            }`}
                                            onClick={() => toggleExpand(key)}
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className={`w-2.5 h-2.5 rounded-full ${
                                                    configured 
                                                        ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]' 
                                                        : (isDark ? 'bg-zinc-700' : 'bg-gray-300')
                                                }`} />
                                                <span className={`font-semibold ${textMain}`}>
                                                    {def.name}
                                                    {isCustom && <span className={`ml-2 text-[10px] font-normal ${textMuted}`}>(自定义)</span>}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase ${
                                                    def.category === 'IMAGE' 
                                                        ? (isDark ? 'bg-emerald-500/10 text-emerald-400' : 'bg-emerald-50 text-emerald-600')
                                                        : def.category === 'TEXT'
                                                        ? (isDark ? 'bg-blue-500/10 text-blue-400' : 'bg-blue-50 text-blue-600')
                                                        : def.category === 'AUDIO'
                                                        ? (isDark ? 'bg-rose-500/10 text-rose-400' : 'bg-rose-50 text-rose-600')
                                                        : (isDark ? 'bg-zinc-500/10 text-zinc-400' : 'bg-zinc-50 text-zinc-600')
                                                }`}>
                                                    {def.category === 'IMAGE' ? 'Image' : def.category === 'TEXT' ? 'Text' : 'Audio'}
                                                </span>
                                                
                                                {/* 删除按钮 */}
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); handleDeleteModel(key); }}
                                                    className={`p-1.5 rounded-lg transition-colors ${isDark ? 'hover:bg-red-500/10 text-zinc-500 hover:text-red-400' : 'hover:bg-red-50 text-gray-400 hover:text-red-500'}`}
                                                    title="删除模型"
                                                >
                                                    <Icons.Trash2 size={14} />
                                                </button>
                                                
                                                <Icons.ChevronRight 
                                                    size={16} 
                                                    className={`${textMuted} transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`} 
                                                />
                                            </div>
                                        </div>

                                        {/* 展开的配置区域 */}
                                        {isExpanded && (
                                            <div className={`px-5 pb-5 pt-2 space-y-4 border-t ${borderColor} animate-in slide-in-from-top-2 duration-200`}>
                                                {/* MODEL ID */}
                                                <div className="flex items-center gap-4">
                                                    <label className={`w-24 text-xs font-medium uppercase ${textSub} shrink-0 text-right`}>MODEL ID</label>
                                                    <input
                                                        type="text"
                                                        value={config.modelId || ''}
                                                        onChange={e => updateConfig(key, 'modelId', e.target.value)}
                                                        className={`flex-1 px-4 py-2.5 rounded-xl text-sm border ${borderColor} ${inputBg} ${textMain} outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50 transition-all`}
                                                        placeholder={def.id}
                                                    />
                                                </div>

                                                {/* API KEY */}
                                                <div className="flex items-center gap-4">
                                                    <label className={`w-24 text-xs font-medium uppercase ${textSub} shrink-0 text-right`}>API KEY</label>
                                                    <input
                                                        type="password"
                                                        value={config.key || ''}
                                                        onChange={e => updateConfig(key, 'key', e.target.value)}
                                                        className={`flex-1 px-4 py-2.5 rounded-xl text-sm border ${borderColor} ${inputBg} ${textMain} outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50 transition-all`}
                                                        placeholder="sk-..."
                                                    />
                                                </div>

                                                {/* BASE URL */}
                                                <div className="flex items-center gap-4">
                                                    <label className={`w-24 text-xs font-medium uppercase ${textSub} shrink-0 text-right`}>BASE URL</label>
                                                    <input
                                                        type="text"
                                                        value={config.baseUrl || ''}
                                                        onChange={e => updateConfig(key, 'baseUrl', e.target.value)}
                                                        className={`flex-1 px-4 py-2.5 rounded-xl text-sm border ${borderColor} ${inputBg} ${textMain} outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50 transition-all`}
                                                        placeholder="https://api.example.com"
                                                    />
                                                </div>

                                                {/* ENDPOINT */}
                                                <div className="flex items-center gap-4">
                                                    <label className={`w-24 text-xs font-medium uppercase ${textSub} shrink-0 text-right`}>ENDPOINT</label>
                                                    <input
                                                        type="text"
                                                        value={config.endpoint || ''}
                                                        onChange={e => updateConfig(key, 'endpoint', e.target.value)}
                                                        className={`flex-1 px-4 py-2.5 rounded-xl text-sm border ${borderColor} ${inputBg} ${textMain} outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50 transition-all`}
                                                        placeholder={def.defaultEndpoint || '/v1/chat/completions'}
                                                    />
                                                </div>

                                                {/* 测试连接按钮 */}
                                                <div className="flex items-center justify-end gap-3 pt-2">
                                                    {/* 测试结果提示 */}
                                                    {testResult && !testing && (
                                                        <span className={`text-xs font-medium ${
                                                            testResult === 'success' ? 'text-emerald-500' : 'text-red-500'
                                                        }`}>
                                                            {testResult === 'success' ? '连接成功' : '连接失败'}
                                                        </span>
                                                    )}
                                                    
                                                    <button
                                                        onClick={() => testConnection(key)}
                                                        disabled={testing}
                                                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium transition-all ${
                                                            testResult === 'success'
                                                                ? (isDark ? 'text-emerald-400 hover:bg-emerald-500/10' : 'text-emerald-600 hover:bg-emerald-50')
                                                                : testResult === 'error'
                                                                ? (isDark ? 'text-red-400 hover:bg-red-500/10' : 'text-red-600 hover:bg-red-50')
                                                                : `${textSub} hover:text-blue-500`
                                                        }`}
                                                    >
                                                        {testing ? (
                                                            <Icons.Loader2 size={14} className="animate-spin" />
                                                        ) : testResult === 'success' ? (
                                                            <Icons.Check size={14} />
                                                        ) : testResult === 'error' ? (
                                                            <Icons.AlertCircle size={14} />
                                                        ) : (
                                                            <Icons.Link size={14} />
                                                        )}
                                                        {testing ? '测试中...' : '测试连接'}
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}

                            {filteredModels.length === 0 && (
                                <div className={`text-center py-12 ${textMuted}`}>
                                    <Icons.Search size={32} className="mx-auto mb-3 opacity-50" />
                                    <p className="text-sm">未找到匹配的模型</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className={`px-6 py-4 border-t ${borderColor} flex items-center justify-between shrink-0`}>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => configInputRef.current?.click()}
                            className={`px-4 py-2 rounded-lg text-xs font-medium border ${borderColor} ${textSub} hover:text-white transition-all flex items-center gap-2`}
                        >
                            <Icons.Upload size={14} /> 导入配置
                        </button>
                        <button
                            onClick={handleExport}
                            className={`px-4 py-2 rounded-lg text-xs font-medium border ${borderColor} ${textSub} hover:text-white transition-all flex items-center gap-2`}
                        >
                            <Icons.Download size={14} /> 导出配置
                        </button>
                        <input type="file" ref={configInputRef} hidden accept=".json" onChange={handleImport} />
                    </div>
                    <div className={`text-xs ${textMuted}`}>
                        已配置 {Object.keys(configs).filter(k => isConfigured(k)).length} / {Object.keys(MODEL_REGISTRY).length} 个模型
                    </div>
                </div>
            </div>

            {/* 添加模型弹窗 */}
            {showAddModel && (
                <div 
                    className="fixed inset-0 z-[260] flex items-center justify-center bg-black/50"
                    onClick={() => setShowAddModel(false)}
                >
                    <div 
                        className={`w-full max-w-md p-6 rounded-2xl ${bgCard} border ${borderColor} shadow-2xl animate-in zoom-in-95 duration-200`}
                        onClick={e => e.stopPropagation()}
                    >
                        <h3 className={`text-lg font-bold mb-6 ${textMain}`}>添加自定义模型</h3>
                        
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <label className={`text-xs font-medium uppercase ${textSub}`}>模型名称</label>
                                <input
                                    type="text"
                                    value={newModelName}
                                    onChange={e => setNewModelName(e.target.value)}
                                    className={`w-full px-4 py-3 rounded-xl text-sm border ${borderColor} ${inputBg} ${textMain} outline-none focus:ring-2 focus:ring-blue-500/20`}
                                    placeholder="My Custom Model"
                                    autoFocus
                                />
                            </div>
                            
                            <div className="space-y-2">
                                <label className={`text-xs font-medium uppercase ${textSub}`}>模型 ID</label>
                                <input
                                    type="text"
                                    value={newModelId}
                                    onChange={e => setNewModelId(e.target.value)}
                                    className={`w-full px-4 py-3 rounded-xl text-sm border ${borderColor} ${inputBg} ${textMain} outline-none focus:ring-2 focus:ring-blue-500/20`}
                                    placeholder="custom-model-v1"
                                />
                            </div>
                            
                            <div className="space-y-2">
                                <label className={`text-xs font-medium uppercase ${textSub}`}>模型类型</label>
                                <div className="grid grid-cols-2 gap-2">
                                    {(['IMAGE', 'TEXT', 'AUDIO'] as const).map(type => (
                                        <button
                                            key={type}
                                            onClick={() => setNewModelType(type)}
                                            className={`py-3 rounded-xl text-sm font-medium border transition-all ${
                                                newModelType === type
                                                    ? 'border-blue-500 bg-blue-500/10 text-blue-500'
                                                    : `${borderColor} ${textSub}`
                                            }`}
                                        >
                                            {type === 'IMAGE' ? '图像生成' : type === 'TEXT' ? '文字' : '语音'}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className={`text-xs font-medium uppercase ${textSub}`}>接口地址（可选）</label>
                                <input
                                    type="text"
                                    value={newModelEndpoint}
                                    onChange={e => setNewModelEndpoint(e.target.value)}
                                    className={`w-full px-4 py-3 rounded-xl text-sm border ${borderColor} ${inputBg} ${textMain} outline-none focus:ring-2 focus:ring-blue-500/20`}
                                    placeholder="不填则使用默认地址"
                                />
                            </div>
                        </div>
                        
                        <div className="flex gap-3 mt-6">
                            <button
                                onClick={() => setShowAddModel(false)}
                                className={`flex-1 py-3 rounded-xl text-sm font-medium border ${borderColor} ${textSub} hover:text-white transition-all`}
                            >
                                取消
                            </button>
                            <button
                                onClick={handleAddModel}
                                disabled={!newModelName || !newModelId}
                                className={`flex-1 py-3 rounded-xl text-sm font-medium bg-blue-500 text-white hover:bg-blue-400 transition-all disabled:opacity-50 disabled:cursor-not-allowed`}
                            >
                                添加
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
