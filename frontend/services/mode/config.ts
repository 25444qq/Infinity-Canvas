
import { EnvConfig } from "../env";
import type { ModelDef, ModelConfig } from "./types";

export type { ModelConfig };

const CUSTOM_MODELS_KEY = 'CUSTOM_MODEL_REGISTRY';
const DELETED_MODELS_KEY = 'DELETED_MODELS';

const loadCustomModels = (): Record<string, ModelDef> => {
    if (typeof window === 'undefined') return {};
    try {
        const stored = localStorage.getItem(CUSTOM_MODELS_KEY);
        return stored ? JSON.parse(stored) : {};
    } catch(e) { return {}; }
};

// 加载已删除的模型列表
const loadDeletedModels = (): Set<string> => {
    if (typeof window === 'undefined') return new Set();
    try {
        const stored = localStorage.getItem(DELETED_MODELS_KEY);
        return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch(e) { return new Set(); }
};

const customModels = loadCustomModels();
const deletedModels = loadDeletedModels();

export const MODEL_REGISTRY: Record<string, ModelDef> = {
  // --- Image Models ---
  'Flux2': { id: 'FLUX.2-klein-9B', name: 'Flux 2', type: 'IMAGE_GEN', category: 'IMAGE', defaultEndpoint: '/image/generate', defaultBaseUrl: 'http://www.customfunc.cn:8978' },
  
  // --- Text Models ---
  'Qwen3.5-27B': { id: 'Qwen3.5-27B', name: 'Qwen3.5-27B', type: 'TEXT_GEN', category: 'TEXT', defaultEndpoint: '/text' },
  
  // --- Audio Models ---
  'Qwen3-TTS': { id: 'Qwen3-TTS-12Hz-1.7B', name: 'Qwen3-TTS', type: 'AUDIO_GEN', category: 'AUDIO', defaultEndpoint: '/audio/tts' },
  'MOSS-TTS': { id: 'MOSS-TTS', name: 'MOSS-TTS', type: 'AUDIO_GEN', category: 'AUDIO', defaultEndpoint: '/audio/tts' },
  
  ...customModels
};

// 启动时删除已标记删除的模型
deletedModels.forEach(key => {
    delete MODEL_REGISTRY[key];
});

const getStorageKey = (modelName: string) => `API_CONFIG_MODEL_${modelName}`;

export const getModelConfig = (modelName: string): ModelConfig => {
    const def = MODEL_REGISTRY[modelName];
    
    if (!def) {
        return {
            baseUrl: EnvConfig.DEFAULT_BASE_URL,
            key: '',
            modelId: '',
            endpoint: '/v1/chat/completions'
        };
    }

    if (typeof window !== 'undefined') {
        const stored = localStorage.getItem(getStorageKey(modelName));
        if (stored) {
            const parsed = JSON.parse(stored);
            
            // 自动更新过时的 endpoint
            let endpoint = parsed.endpoint;
            let queryEndpoint = parsed.queryEndpoint;
            let downloadEndpoint = parsed.downloadEndpoint;
            

            
            return {
                baseUrl: parsed.baseUrl || def.defaultBaseUrl || EnvConfig.DEFAULT_BASE_URL,
                key: parsed.key || '', 
                modelId: parsed.modelId || def.id,
                endpoint: endpoint || def.defaultEndpoint,
                queryEndpoint: queryEndpoint || def.defaultQueryEndpoint || '',
                downloadEndpoint: downloadEndpoint || def.defaultDownloadEndpoint || ''
            };
        }
    }

    // 没有模型特定配置时，使用模型默认配置
    return {
        baseUrl: def.defaultBaseUrl || EnvConfig.DEFAULT_BASE_URL,
        key: '', 
        modelId: def.id,
        endpoint: def.defaultEndpoint,
        queryEndpoint: def.defaultQueryEndpoint || '',
        downloadEndpoint: def.defaultDownloadEndpoint || ''
    };
};

export const saveModelConfig = (modelName: string, config: ModelConfig) => {
    localStorage.setItem(getStorageKey(modelName), JSON.stringify(config));
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('modelConfigUpdated', { detail: { modelName } }));
    }
};

export const registerCustomModel = (key: string, def: ModelDef) => {
    MODEL_REGISTRY[key] = def;
    const current = loadCustomModels();
    current[key] = def;
    localStorage.setItem(CUSTOM_MODELS_KEY, JSON.stringify(current));
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('modelRegistryUpdated'));
    }
};

// 删除模型（任意模型都可删除）
export const deleteModel = (key: string): boolean => {
    if (!MODEL_REGISTRY[key]) return false;
    
    // 从 MODEL_REGISTRY 中删除
    delete MODEL_REGISTRY[key];
    
    // 如果是自定义模型，从自定义模型存储中删除
    const customModels = loadCustomModels();
    if (customModels[key]) {
        delete customModels[key];
        localStorage.setItem(CUSTOM_MODELS_KEY, JSON.stringify(customModels));
    }
    
    // 记录已删除的内置模型
    const deleted = loadDeletedModels();
    deleted.add(key);
    localStorage.setItem(DELETED_MODELS_KEY, JSON.stringify([...deleted]));
    deletedModels.add(key);
    
    // 删除该模型的配置
    localStorage.removeItem(`API_CONFIG_MODEL_${key}`);
    
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('modelRegistryUpdated'));
    }
    return true;
};

// 检查是否是自定义模型
export const isCustomModel = (key: string): boolean => {
    const customModels = loadCustomModels();
    return !!customModels[key];
};

// 获取可见的模型列表（用于下拉框）
export const getVisibleModels = (): string[] => {
    return Object.keys(MODEL_REGISTRY);
};
