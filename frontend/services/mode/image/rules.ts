import { ImageModelRules } from "../types";

const DEFAULT_RATIOS = ['1:1', '3:4', '4:3', '9:16', '16:9'];

export const IMAGE_MODEL_CAPABILITIES: Record<string, ImageModelRules> = {
    'Flux2': { resolutions: ['1k', '2k'], ratios: DEFAULT_RATIOS }
};

export const getImageModelRules = (modelName: string): ImageModelRules => {
    return IMAGE_MODEL_CAPABILITIES[modelName] || { resolutions: ['1k'], ratios: DEFAULT_RATIOS };
};

export const calculateImageSize = (aspectRatio: string, resolution: string, modelName: string): string => {
  if (modelName === 'Flux2') {
      const is2k = resolution === '2k';
      if (aspectRatio === '1:1') return is2k ? '2048x2048' : '1024x1024';
      if (aspectRatio === '16:9') return is2k ? '2048x1152' : '1920x1080';
      if (aspectRatio === '9:16') return is2k ? '1152x2048' : '1080x1920';
      if (aspectRatio === '4:3') return is2k ? '2048x1536' : '1600x1200';
      if (aspectRatio === '3:4') return is2k ? '1536x2048' : '1200x1600';
      return is2k ? '2048x2048' : '1024x1024';
  }

  const [w, h] = aspectRatio.split(':').map(Number);
  
  let width = 1024;
  let height = 1024;

  const is1_1 = w === 1 && h === 1;
  const is4_3 = w === 4 && h === 3;
  const is3_4 = w === 3 && h === 4;
  const is16_9 = w === 16 && h === 9;
  const is9_16 = w === 9 && h === 16;
  const is21_9 = w === 21 && h === 9;
  const is9_21 = w === 9 && h === 21;

  if (is1_1) { width = 1024; height = 1024; }
  else if (is4_3) { width = 1024; height = 768; }
  else if (is3_4) { width = 768; height = 1024; }
  else if (is16_9) { width = 1024; height = 576; }
  else if (is9_16) { width = 576; height = 1024; }
  else if (is21_9) { width = 1536; height = 640; } 
  else if (is9_21) { width = 640; height = 1536; }
  else {
      if (!isNaN(w) && !isNaN(h)) {
          if (w > h) { width = 1024; height = Math.round(1024 * (h/w)); }
          else { height = 1024; width = Math.round(1024 * (w/h)); }
      }
  }

  width = Math.round(width);
  height = Math.round(height);

  return `${width}x${height}`;
};
