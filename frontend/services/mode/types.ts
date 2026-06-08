
export type StrategyType = 
  | 'CHAT' 
  | 'IMAGE_GEN' 
  | 'BANANA_EDIT_ASYNC' 
  | 'MJ_MODAL' 
  | 'MJ_ACTION'
  | 'TEXT_GEN'
  | 'AUDIO_GEN';

export interface ModelDef {
  id: string; 
  name: string; 
  type: StrategyType;
  category: 'IMAGE' | 'TEXT' | 'AUDIO';
  defaultEndpoint: string;
  defaultQueryEndpoint?: string; 
  defaultDownloadEndpoint?: string;
  defaultBaseUrl?: string;
}

export interface ModelConfig {
    baseUrl: string;
    key: string;
    modelId: string;
    endpoint: string;
    queryEndpoint?: string;
    downloadEndpoint?: string;
}

export interface ImageModelRules {
    resolutions: string[];
    ratios: string[];
    supportsEdit?: boolean;
    hasPromptExtend?: boolean;
}

export interface IModelHandler<R> {
    rules: R;
    generate: (config: ModelConfig, prompt: string, params: any) => Promise<string | string[]>;
}
