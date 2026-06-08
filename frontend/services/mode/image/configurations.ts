import type { ModelConfig } from "../types";
import { generateStandardImage } from "./flux";
import { calculateImageSize } from "./rules";

const BASE_RATIOS = ['1:1', '3:4', '4:3', '9:16', '16:9'];

export const Flux2Handler = {
    rules: { resolutions: ['1k', '2k'], ratios: BASE_RATIOS },
    generate: async (cfg: ModelConfig, prompt: string, params: any) => {
        const size = calculateImageSize(params.aspectRatio, params.resolution, 'Flux2');
        return await generateStandardImage(cfg, { id: cfg.modelId || 'FLUX.2-klein-9B', name: 'Flux', type: 'IMAGE_GEN' } as any, prompt, params.aspectRatio, params.resolution, size, params.inputImages, params.count, params.promptOptimize);
    }
};

export const IMAGE_HANDLERS: Record<string, any> = {
    'Flux2': Flux2Handler
};
