import React, { memo } from 'react';
import { NodeData, NodeType } from '../../types';
import { TextToImageNode } from './TextToImageNode';
import { OriginalImageNode } from './OriginalImageNode';
import { CreativeDescNode } from './CreativeDescNode';
import { ImageLoaderNode } from './ImageLoaderNode';
import { ImageToImageNode } from './ImageToImageNode';
import { TextLoaderNode } from './TextLoaderNode';
import { AudioLoaderNode } from './AudioLoaderNode';
import { AudioGenNode } from './AudioGenNode';
import { AudioMergeNode } from './AudioMergeNode';
import { TextAnalyzeNode } from './TextAnalyzeNode';
import { NovelLinesNode } from './NovelLinesNode';
import { CharacterDisplayNode } from './CharacterDisplayNode';
import { SceneDisplayNode } from './SceneDisplayNode';
import { UpscaleNode } from './UpscaleNode';

interface NodeContentProps {
  data: NodeData;
  updateData: (id: string, updates: Partial<NodeData>) => void;
  onGenerate: (id: string, promptOverride?: string) => void;
  onMerge?: (id: string) => void;
  selected?: boolean;
  showControls?: boolean;
  inputs?: string[];
  onMaximize?: (id: string) => void;
  onDownload?: (id: string) => void;
  onUpload?: (nodeId: string) => void;
  isSelecting?: boolean;
  onDelete?: (id: string) => void;
  isDark?: boolean;
}

const NodeContentComponent: React.FC<NodeContentProps> = (props) => {
    const { data } = props;

    switch (data.type) {
        case NodeType.TEXT_TO_IMAGE:
            return <TextToImageNode {...props} />;
        case NodeType.ORIGINAL_IMAGE:
            return <OriginalImageNode {...props} />;
        case NodeType.CREATIVE_DESC:
            return <CreativeDescNode {...props} />;
        case NodeType.IMAGE_LOADER:
            return <ImageLoaderNode {...props} />;
        case NodeType.IMAGE_TO_IMAGE:
            return <ImageToImageNode {...props} />;
        case NodeType.TEXT_LOADER:
            return <TextLoaderNode {...props} />;
        case NodeType.AUDIO_LOADER:
            return <AudioLoaderNode {...props} />;
        case NodeType.AUDIO_GEN:
            return <AudioGenNode {...props} />;
        case NodeType.AUDIO_MERGE:
            return <AudioMergeNode {...props} onMerge={props.onMerge || (() => {})} />;
        case NodeType.TEXT_ANALYZE:
            return <TextAnalyzeNode {...props} />;
        case NodeType.NOVEL_LINES:
            return <NovelLinesNode {...props} />;
        case NodeType.CHARACTER_DISPLAY:
            return <CharacterDisplayNode {...props} />;
        case NodeType.SCENE_DISPLAY:
            return <SceneDisplayNode {...props} />;
        case NodeType.IMAGE_UPSCALE:
            return <UpscaleNode {...props} />;
        default:
            return null;
    }
};

export const NodeContent = memo(NodeContentComponent, (prev, next) => {
    if (prev.isSelecting !== next.isSelecting) return false;
    if (prev.isDark !== next.isDark) return false;
    
    // Check Inputs
    if (prev.inputs !== next.inputs) {
         if (prev.inputs?.length !== next.inputs?.length) return false;
         if (prev.inputs && next.inputs) { 
             for (let i = 0; i < prev.inputs.length; i++) { 
                 if (prev.inputs[i] !== next.inputs[i]) return false; 
             } 
         }
    }
    
    // Check Selection/Visibility State
    if (prev.selected !== next.selected || prev.showControls !== next.showControls) return false;

    // Check Data *Excluding* X/Y to prevent re-renders on drag
    if (prev.data === next.data) return true;
    
    const keys = Object.keys(prev.data) as (keyof NodeData)[];
    // Check if keys length changed (rare but possible)
    if (keys.length !== Object.keys(next.data).length) return false;

    for (const key of keys) {
        if (key === 'x' || key === 'y') continue;
        if (prev.data[key] !== next.data[key]) return false;
    }
    
    return true;
});
