/**
 * API 客户端 - 通过 Tornado 后端代理所有 AI 服务请求
 * 
 * 架构变更：不再从浏览器直接调用第三方 API，改为通过 Tornado 后端中转。
 * 后端处理 API 密钥管理、请求转发和响应解析。
 */

const API_BASE = '';

async function apiPost(path: string, body: any): Promise<any> {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || `API error: ${res.status}`);
  }
  return data;
}

async function apiGet(path: string): Promise<any> {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || `API error: ${res.status}`);
  }
  return data;
}

async function apiDelete(path: string): Promise<any> {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, { method: 'DELETE' });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || `API error: ${res.status}`);
  }
  return data;
}

// ==================== Model Config API ====================

export interface ModelConfig {
  baseUrl: string;
  key: string;
  modelId: string;
  endpoint: string;
  queryEndpoint?: string;
  downloadEndpoint?: string;
}

export interface ModelDef {
  id: string;
  name: string;
  type: string;
  category: 'IMAGE' | 'TEXT' | 'AUDIO';
  defaultEndpoint: string;
  defaultQueryEndpoint?: string;
  defaultDownloadEndpoint?: string;
  defaultBaseUrl?: string;
}

export let MODEL_REGISTRY: Record<string, ModelDef> = {};

// 从 Tornado 后端加载模型注册表
export async function loadModelRegistry(): Promise<Record<string, ModelDef>> {
  try {
    const data = await apiGet('/api/models');
    MODEL_REGISTRY = data;
    return data;
  } catch (e) {
    console.warn('[Model Registry] Failed to load from backend:', e);
    return MODEL_REGISTRY;
  }
}

export const getVisibleModels = (): string[] => Object.keys(MODEL_REGISTRY);

// 从 Tornado 后端加载所有模型配置
export async function getAllModelConfigs(): Promise<Record<string, ModelConfig>> {
  try {
    return await apiGet('/api/configs');
  } catch (e) {
    console.warn('[Model Config] Failed to load from backend:', e);
    return {};
  }
}

export const getModelConfig = (modelName: string): ModelConfig => {
  // 使用缓存的配置 (由 App 启动时加载)
  const stored = modelConfigCache[modelName];
  if (stored) return stored;

  const def = MODEL_REGISTRY[modelName];
  return {
    baseUrl: def?.defaultBaseUrl || '',
    key: '',
    modelId: def?.id || '',
    endpoint: def?.defaultEndpoint || '/v1/chat/completions',
    queryEndpoint: def?.defaultQueryEndpoint || '',
    downloadEndpoint: def?.defaultDownloadEndpoint || '',
  };
};

// 模型配置缓存
let modelConfigCache: Record<string, ModelConfig> = {};

export const setModelConfigCache = (configs: Record<string, ModelConfig>) => {
  modelConfigCache = { ...modelConfigCache, ...configs };
};

export const saveModelConfig = async (modelName: string, config: ModelConfig) => {
  // 更新本地缓存
  modelConfigCache[modelName] = config;
  // 同步到后端
  try {
    await apiPost(`/api/models/${encodeURIComponent(modelName)}/config`, config);
  } catch (e) {
    console.warn('[Model Config] Failed to save to backend:', e);
  }
};

export const registerCustomModel = async (key: string, def: ModelDef) => {
  MODEL_REGISTRY[key] = def;
  try {
    await apiPost('/api/models/custom', { key, model: def });
  } catch (e) {
    console.warn('[Model Config] Failed to register custom model on backend:', e);
  }
};

export const deleteModel = async (key: string): Promise<boolean> => {
  delete MODEL_REGISTRY[key];
  delete modelConfigCache[key];
  try {
    await apiDelete(`/api/models/${encodeURIComponent(key)}`);
    return true;
  } catch (e) {
    console.warn('[Model Config] Failed to delete model on backend:', e);
    return false;
  }
};

export const isCustomModel = async (key: string): Promise<boolean> => {
  try {
    const models = await apiGet('/api/models');
    const def = models[key];
    return def?.isCustom || false;
  } catch {
    return false;
  }
};


// ==================== AI Generation API ====================

export const generateCreativeDescription = async (input: string): Promise<string> => {
  try {
    const data = await apiPost('/api/text/optimize', { prompt: input });
    return data.optimized || input;
  } catch (e) {
    console.warn('[Creative Desc] Fallback to original input:', e);
    return input;
  }
};

export const generateImage = async (
    prompt: string,
    aspectRatio: string = "1:1",
    modelName: string = "Flux2",
    resolution: string = "1k",
    count: number = 1,
    inputImages: string[] = [],
    promptOptimize: boolean = false
): Promise<string[]> => {
  console.log(`[Image Gen] Model: ${modelName}, Input Images: ${inputImages.length}, Prompt Optimize: ${promptOptimize}`);
  const data = await apiPost('/api/image/generate', {
    prompt,
    aspectRatio,
    model: modelName,
    resolution,
    count,
    inputImages,
    promptOptimize,
  });
  return data.images || [];
};

export const generateAudio = async (
    prompt: string,
    modelName: string = "Qwen3-TTS",
    emotion?: string,
    refAudio?: string,
    language?: string,
    presetVoice?: string,
    instruction?: string
): Promise<string> => {
  console.log(`[Audio Gen] Model: ${modelName}, Emotion: ${emotion || 'none'}`);
  const data = await apiPost('/api/audio/tts', {
    prompt,
    model: modelName,
    emotion,
    refAudio,
    language,
    presetVoice,
    instruction,
  });
  return data.audioUrl || '';
};

export const generateTextAnalyze = async (
    textContent: string,
    modelName: string = "Qwen3.5-27B"
): Promise<string> => {
  console.log(`[Text Format] Model: ${modelName}, Text length: ${textContent.length}`);
  const data = await apiPost('/api/text/analyze', {
    text: textContent,
    model: modelName,
  });
  return data.result || '';
};

export const generateNovelLines = async (
    textContent: string,
    modelName: string = "Qwen3.5-27B"
): Promise<any> => {
  console.log(`[Novel Lines] Model: ${modelName}, Text length: ${textContent.length}`);
  const data = await apiPost('/api/text/lines', {
    text: textContent,
    model: modelName,
  });
  return data;
};

export const generateMergeAudio = async (
    audioFiles: string[],
    pauseBetween: number = 0.3
): Promise<{ url: string; duration: number; filesMerged: number }> => {
  console.log(`[Merge Audio] Merging ${audioFiles.length} files`);
  
  // Detect if input is base64 data (starts with "data:") or filenames
  const isBase64 = audioFiles.length > 0 && audioFiles[0].startsWith('data:');
  
  const body: Record<string, any> = {
    pause_between: pauseBetween,
    response_format: 'url',
  };
  
  if (isBase64) {
    body.audio_data = audioFiles;
  } else {
    body.audio_files = audioFiles;
  }
  
  const data = await apiPost('/api/audio/merge', body);
  return {
    url: data.data?.url || '',
    duration: data.data?.duration || 0,
    filesMerged: data.data?.files_merged || 0,
  };
};

// ==================== Image Upscale API (Real-ESRGAN) ====================

export interface UpscaleInfo {
  original_width: number;
  original_height: number;
  result_width: number;
  result_height: number;
  scale: number;
  model: string;
}

export interface UpscaleModel {
  name: string;
  display: string;
  scale: number;
  description: string;
}

/** 获取可用的放大模型列表 */
export const getUpscaleModels = async (): Promise<{
  models: UpscaleModel[];
  default_model: string;
  default_scale: number;
}> => {
  return await apiGet('/image/upscale/models');
};

/** 图片超分辨率放大 */
export const upscaleImage = async (
    imageData: string,
    modelName: string = "RealESRGAN_x4plus",
    scale: number = 4,
): Promise<{ image: string; info: UpscaleInfo }> => {
  console.log(`[Upscale] Model: ${modelName}, Scale: ${scale}x`);
  const data = await apiPost('/image/upscale', {
    image: imageData,
    model: modelName,
    scale,
  });
  return {
    image: data.image,
    info: data.info,
  };
};
