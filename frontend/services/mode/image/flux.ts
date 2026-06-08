import type { ModelConfig, ModelDef } from "../types";
import { fetchThirdParty, constructUrl } from "../network";

const extractBase64 = (res: any): string[] => {
    const data = (res.data && Array.isArray(res.data)) ? res.data : (res.data ? [res.data] : [res]);
    return data.map((item: any) => {
        if (item.b64_json) return `data:image/png;base64,${item.b64_json}`;
        return '';
    }).filter((url: string) => !!url);
};

export const generateStandardImage = async (
    config: ModelConfig,
    modelDef: ModelDef,
    prompt: string,
    aspectRatio: string,
    resolution: string,
    calculatedSize: string,
    inputImages: string[],
    n: number,
    promptOptimize?: boolean
): Promise<string[]> => {
   const hasInputImage = inputImages.length > 0;

   if (hasInputImage) {
       return await generateEditImage(config, prompt, calculatedSize, inputImages[0], n);
   }

   const targetUrl = constructUrl(config.baseUrl, '/image/generate');
   const isFlux = modelDef.id.includes('flux'); 

   if (isFlux && n > 1) {
      const promises = Array(n).fill(null).map(async () => {
         const payload: any = {
            model: config.modelId, 
            prompt, 
            size: calculatedSize, 
            n: 1,
            response_format: "b64_json"
         };
         if (resolution !== '1k') payload.quality = 'hd';
         const res = await fetchThirdParty(targetUrl, 'POST', payload, config, { timeout: 200000 });
         return extractBase64(res)[0] || '';
      });
      const results = await Promise.all(promises);
      return results.filter(r => !!r);
   }

   const payload: any = {
      model: config.modelId, prompt, n: n,
      response_format: "b64_json"
   };

   payload.size = calculatedSize;
   if (resolution !== '1k') payload.quality = 'hd';

   const res = await fetchThirdParty(targetUrl, 'POST', payload, config, { timeout: 200000 });

   return extractBase64(res);
};

export const generateEditImage = async (
    config: ModelConfig,
    prompt: string,
    calculatedSize: string,
    inputImage: string,
    n: number
): Promise<string[]> => {
   const targetUrl = constructUrl(config.baseUrl, '/image/edit');

   if (n > 1) {
      const promises = Array(n).fill(null).map(async () => {
         const res = await fetchThirdParty(targetUrl, 'POST', { prompt, image: inputImage, size: calculatedSize, n: 1, response_format: "b64_json" }, config, { timeout: 200000 });
         return extractBase64(res)[0] || '';
      });
      const results = await Promise.all(promises);
      return results.filter(r => !!r);
   }

   const res = await fetchThirdParty(targetUrl, 'POST', { prompt, image: inputImage, size: calculatedSize, n, response_format: "b64_json" }, config, { timeout: 200000 });

   return extractBase64(res);
};
