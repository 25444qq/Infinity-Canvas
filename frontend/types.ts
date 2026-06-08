
export enum NodeType {
  TEXT_TO_IMAGE = 'TEXT_TO_IMAGE',
  IMAGE_TO_IMAGE = 'IMAGE_TO_IMAGE',
  CREATIVE_DESC = 'CREATIVE_DESC',
  ORIGINAL_IMAGE = 'ORIGINAL_IMAGE',
  IMAGE_LOADER = 'IMAGE_LOADER',
  TEXT_LOADER = 'TEXT_LOADER',
  AUDIO_LOADER = 'AUDIO_LOADER',
  AUDIO_GEN = 'AUDIO_GEN',
  AUDIO_MERGE = 'AUDIO_MERGE',
  TEXT_ANALYZE = 'TEXT_ANALYZE',
  NOVEL_LINES = 'NOVEL_LINES',
  CHARACTER_DISPLAY = 'CHARACTER_DISPLAY',
  SCENE_DISPLAY = 'SCENE_DISPLAY',
  IMAGE_UPSCALE = 'IMAGE_UPSCALE',
};

export interface NodeData {
  id: string;
  type: NodeType;
  x: number;
  y: number;
  width: number;
  height: number;
  title: string;
  
  // State
  prompt?: string;
  imageSrc?: string; // Result or Input (Active Selection)
  outputArtifacts?: string[]; // History/Batch results
  isLoading?: boolean;
  isStackOpen?: boolean; // UI State for expanded gallery
  
  // Configs
  aspectRatio?: string;
  resolution?: string;
  count?: number;
  model?: string;
  promptOptimize?: boolean; // Prompt Extension/Optimization switch
  generatedImage?: string; // Generated character reference image
  
  // Creative Desc specific
  optimizedPrompt?: string;

  // UI State
  activeToolbarItem?: string;
  
  // Audio Loader specific
  _audioSize?: number;
  
  // Audio Merge specific
  _audioFiles?: { name: string; data: string; size: number; duration: number }[];
  
  // Audio Gen specific
  audioSrc?: string;
  emotion?: string;
  language?: string;
  presetVoice?: string;
  instruction?: string;
  
  // Text Analyze specific
  decodedResult?: string;

  // Novel Lines specific
  lineData?: NovelLineItem[];
  characterConfigs?: CharacterConfig[];
  mergeAudioUrl?: string;
  isMerging?: boolean;

  // Character Display specific
  characterData?: CharacterData[];
  selectedCharacterIndex?: number;

  // Scene Display specific
  sceneData?: SceneData[];

  // Image Upscale specific
  upscaleScale?: number;
  upscaleModel?: string;
  upscaleDenoise?: number;
}

export interface CharacterData {
  name: string | null;
  gender: string | null;
  personality: string | string[] | null;
  physical_description: string | null;
}

export interface SceneData {
  position: string | null;
  people: string[] | null;
  scene: string | null;
}

export interface NovelLineItem {
  line_number: number;
  original_text: string;
  processed_text: string;
  speaker: string;
  dialogue: string;
  description: string;  // "对话" / "叙事"
  emotion?: string;
  audioUrl?: string;
  isGeneratingAudio?: boolean;
}

export interface CharacterConfig {
  character: string;
  refAudio?: string;       // base64 音频或空
  voiceDescription?: string;  // 如果没有参考音频，用文字描述
}

export interface Connection {
  id: string;
  sourceId: string;
  targetId: string;
  targetPortIndex?: number; // 0=第一个输入端口, 1=第二个输入端口 (用于双端口节点如 AUDIO_GEN)
}

export interface CanvasTransform {
  x: number;
  y: number;
  k: number; // Scale
}

export type DragMode = 'NONE' | 'PAN' | 'DRAG_NODE' | 'SELECT' | 'CONNECT' | 'RESIZE_NODE';

export interface Point {
  x: number;
  y: number;
}
