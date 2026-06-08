
import type { ModelConfig } from "../types";
import { fetchThirdParty, constructUrl, extractUrlFromContent } from "../network";

// 检测端点类型
type EndpointType = 'OPENAI_CHAT' | 'OPENAI_IMAGE' | 'OPENAI_EDIT' | 'GEMINI_NATIVE' | 'BANANA_API' | 'UNKNOWN';

const detectEndpointType = (endpoint: string): EndpointType => {
    if (endpoint.includes('generateContent') || endpoint.includes('predict')) return 'GEMINI_NATIVE';
    if (endpoint.includes('nano-banana')) return 'BANANA_API';
    if (endpoint.includes('/images/edits')) return 'OPENAI_EDIT';
    if (endpoint.includes('/images/generations')) return 'OPENAI_IMAGE';
    if (endpoint.includes('/chat/completions')) return 'OPENAI_CHAT';
    return 'UNKNOWN';
};

export const generateBananaChatImage = async (
    config: ModelConfig,
    prompt: string, 
    aspectRatio: string,
    resolution: string,
    calculatedSize: string,
    inputImages: string[] = []
): Promise<string> => {
    const hasInputImages = inputImages.length > 0;
    const needsHighRes = resolution !== '1k';
    let endpointType = detectEndpointType(config.endpoint);
    
    console.log(`[BananaPro] Original Endpoint: ${config.endpoint}`);
    console.log(`[BananaPro] Original Endpoint Type: ${endpointType}`);
    console.log(`[BananaPro] Has Input Images: ${hasInputImages}`);
    console.log(`[BananaPro] Needs High Res: ${needsHighRes} (resolution: ${resolution})`);
    
    // 关键修改：如果需要高分辨率（2K/4K）且当前是 OpenAI 兼容格式，
    // 自动切换到 Gemini 原生格式，因为 OpenAI 格式不支持 imageSize 参数
    let targetUrl: string;
    if (needsHighRes && (endpointType === 'OPENAI_CHAT' || endpointType === 'UNKNOWN')) {
        // 构建 Gemini 原生格式的 URL
        // 格式: {baseUrl}/v1beta/models/{modelId}:generateContent
        const geminiNativeEndpoint = `/v1beta/models/${config.modelId}:generateContent`;
        targetUrl = constructUrl(config.baseUrl, geminiNativeEndpoint);
        endpointType = 'GEMINI_NATIVE';
        console.log(`[BananaPro] Switched to Gemini Native format for high-res support`);
        console.log(`[BananaPro] New Endpoint: ${geminiNativeEndpoint}`);
    } else {
        targetUrl = constructUrl(config.baseUrl, config.endpoint);
    }
    
    console.log(`[BananaPro] Final Endpoint Type: ${endpointType}`);
    console.log(`[BananaPro] Final Target URL: ${targetUrl}`);
    
    const isNativeGemini = endpointType === 'GEMINI_NATIVE';

    // ========== Gemini 原生格式 (generateContent) ==========
    if (isNativeGemini) {
        console.log('[BananaPro] Using Gemini Native format');
        // 重要：Google API 要求 imageSize 必须是大写，如 "1K", "2K", "4K"
        const imageSizeUpperCase = resolution.toUpperCase();
        console.log(`[BananaPro] Resolution: ${resolution}, ImageSize: ${imageSizeUpperCase}, Calculated Size: ${calculatedSize}`);
        
        // 构建 parts 数组
        const parts: any[] = [];
        
        // 如果有输入图片，添加图片作为参考（图生图）
        if (hasInputImages) {
            console.log('[BananaPro] Adding reference image for image-to-image generation');
            const imgData = inputImages[0];
            
            // 检查是否是 base64 格式
            if (imgData.startsWith('data:')) {
                const [header, base64Data] = imgData.split(',');
                const mimeType = header.match(/data:([^;]+)/)?.[1] || 'image/png';
                parts.push({
                    inlineData: {
                        mimeType: mimeType,
                        data: base64Data
                    }
                });
            } else if (imgData.startsWith('http')) {
                // URL 格式 - Gemini 原生 API 可能不直接支持 URL，需要先下载
                // 但某些中转站可能支持 fileUri
                parts.push({
                    fileData: {
                        mimeType: 'image/png',
                        fileUri: imgData
                    }
                });
            }
            
            // 图生图的提示词
            parts.push({ 
                text: `请根据这张参考图片进行创作。要求：${prompt || '生成一张类似风格的图片'}。输出比例：${aspectRatio}` 
            });
        } else {
            // 纯文生图
            parts.push({ text: prompt });
        }
        
        // 根据 Google 官方文档，正确的格式是：
        // generationConfig.imageConfig.imageSize = "1K" / "2K" / "4K" (必须大写)
        // generationConfig.imageConfig.aspectRatio = "1:1" / "16:9" 等
        const payload: any = {
            contents: [{ parts }],
            generationConfig: {
                responseModalities: ["TEXT", "IMAGE"],
                imageConfig: {
                    aspectRatio: aspectRatio || "1:1",
                    imageSize: imageSizeUpperCase  // 必须大写: "1K", "2K", "4K"
                }
            }
        };
        
        console.log('[BananaPro] Gemini Native Payload:', JSON.stringify(payload).substring(0, 500));
        
        const res = await fetchThirdParty(targetUrl, 'POST', payload, config, { timeout: 200000 });
        console.log('[BananaPro] Gemini Native Response:', JSON.stringify(res).substring(0, 500));
        
        // 解析 Gemini 原生响应
        const candidates = res.candidates || [];
        for (const candidate of candidates) {
            const parts = candidate.content?.parts || [];
            for (const part of parts) {
                if (part.inlineData) {
                    return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
                }
                if (part.text && (part.text.includes('http') || part.text.includes('data:'))) {
                    return extractUrlFromContent(part.text);
                }
            }
        }
        
        // 兜底
        return extractUrlFromContent(JSON.stringify(res));
    }

    // --- 如果有输入图片，使用图生图模式 ---
    if (inputImages.length > 0) {
        // 重要：Google API 要求 imageSize 必须是大写，如 "1K", "2K", "4K"
        const imageSizeUpperCase = resolution.toUpperCase();
        console.log('[BananaPro] Detected input images, using image-to-image mode');
        console.log('[BananaPro] Target URL:', targetUrl);
        console.log('[BananaPro] Model ID:', config.modelId);
        console.log(`[BananaPro] Resolution: ${resolution}, ImageSize: ${imageSizeUpperCase}, Size: ${calculatedSize}`);
        console.log('[BananaPro] Input image preview:', inputImages[0].substring(0, 100) + '...');
        
        // 对于 Gemini 3 Pro Image 模型，直接使用 Chat 接口 + 多模态输入
        // 这是最通用的方式，大多数中转站都支持
        const img2imgPrompt = `请根据这张参考图片，生成一张新的图片。

要求：
- 以参考图片为基础进行创作
- 保持参考图片的主要风格和元素
- 根据以下描述进行修改或扩展：${prompt || '保持原图风格生成类似图片'}
- 输出比例：${aspectRatio}
- 输出分辨率：${imageSizeUpperCase} (${calculatedSize})`;
        
        // 构建多模态消息内容 - 先文字后图片（某些API需要这个顺序）
        const content: any[] = [
            { type: 'text', text: img2imgPrompt },
            { type: 'image_url', image_url: { url: inputImages[0] } }
        ];
        
        const payload: any = {
            model: config.modelId,
            messages: [{ role: 'user', content: content }],
            // OpenAI 风格的 response_format
            response_format: { type: 'image' },
            // generationConfig 透传 (Gemini 风格) - 这是关键！
            // 根据 Google 官方文档的正确格式
            generationConfig: {
                responseModalities: ["TEXT", "IMAGE"],
                imageConfig: {
                    aspectRatio: aspectRatio || "1:1",
                    imageSize: imageSizeUpperCase  // 必须大写: "1K", "2K", "4K"
                }
            },
            // 额外兼容参数
            image_size: imageSizeUpperCase,
            size: calculatedSize,
            aspect_ratio: aspectRatio
        };
        
        console.log('[BananaPro] Sending image-to-image request with payload structure:', {
            model: payload.model,
            messageContentTypes: content.map(c => c.type),
            hasResponseFormat: !!payload.response_format,
            imageSize: imageSizeUpperCase,
            aspectRatio: aspectRatio
        });
        
        try {
            const res = await fetchThirdParty(targetUrl, 'POST', payload, config, { timeout: 200000 });
            console.log('[BananaPro] Response received:', JSON.stringify(res).substring(0, 500));
            
            // 尝试多种方式提取图片
            const msgContent = res.choices?.[0]?.message?.content;
            
            // 如果返回的是字符串，尝试提取 URL
            if (typeof msgContent === 'string') {
                return extractUrlFromContent(msgContent);
            }
            
            // 如果返回的是数组（多模态响应）
            if (Array.isArray(msgContent)) {
                for (const part of msgContent) {
                    if (part.type === 'image_url' && part.image_url?.url) {
                        return part.image_url.url;
                    }
                    if (part.type === 'image' && part.url) {
                        return part.url;
                    }
                    if (part.image?.url) {
                        return part.image.url;
                    }
                }
            }
            
            // 检查 Gemini 原生格式的响应
            const parts = res.candidates?.[0]?.content?.parts;
            if (parts) {
                for (const part of parts) {
                    if (part.inlineData) {
                        return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
                    }
                    if (part.text && (part.text.includes('http') || part.text.includes('data:'))) {
                        return extractUrlFromContent(part.text);
                    }
                }
            }
            
            // 最后尝试从整个响应中提取
            return extractUrlFromContent(JSON.stringify(res));
        } catch (error) {
            console.error('[BananaPro] Image-to-image request failed:', error);
            throw error;
        }
    }

    // --- 原有的 OpenAI 兼容逻辑 (无输入图片时的文生图) ---
    // 重要：Google API 要求 imageSize 必须是大写，如 "1K", "2K", "4K"
    const imageSizeUpperCase = resolution.toUpperCase();
    console.log(`[BananaPro] OpenAI Compatible format - Resolution: ${resolution}, ImageSize: ${imageSizeUpperCase}, Size: ${calculatedSize}`);
    
    const enhancedPrompt = `Strictly generate an image with aspect ratio ${aspectRatio} and ${imageSizeUpperCase} resolution (${calculatedSize}). \n\nUser Request: ${prompt}`;
    const messages: any[] = [{ role: 'user', content: enhancedPrompt }];

    const payload: any = {
        model: config.modelId, 
        messages,
        // OpenAI 风格的 response_format
        response_format: { type: 'image' },
        // generationConfig 透传 (Gemini 风格) - 这是关键！
        // 根据 Google 官方文档的正确格式
        generationConfig: {
            responseModalities: ["TEXT", "IMAGE"],
            imageConfig: {
                aspectRatio: aspectRatio || "1:1",
                imageSize: imageSizeUpperCase  // 必须大写: "1K", "2K", "4K"
            }
        },
        // 额外兼容参数（某些中转商可能读取这些）
        image_size: imageSizeUpperCase,
        size: calculatedSize,
        aspect_ratio: aspectRatio
    };
    
    const res = await fetchThirdParty(targetUrl, 'POST', payload, config, { timeout: 200000 });
    const content = res.choices?.[0]?.message?.content;
    
    // 如果返回的是 markdown 图片链接
    return extractUrlFromContent(content);
};

export const generateBananaEdit = async (
    config: ModelConfig,
    prompt: string, 
    aspectRatio: string,
    resolution: string,
    inputImages: string[]
): Promise<string> => {
    const hasInput = inputImages.length > 0;
    
    // 检查是否使用自定义端点，如果有则使用自定义端点
    // 如果没有，使用默认的香蕉编辑端点
    let targetUrl: string;
    if (config.endpoint && !config.endpoint.includes('chat/completions')) {
        // 用户配置了自定义端点，可能是专门的图片生成端点
        targetUrl = constructUrl(config.baseUrl, config.endpoint);
    } else {
        // 默认使用香蕉编辑端点
        const endpointSuffix = hasInput ? '-edit' : '';
        targetUrl = constructUrl(config.baseUrl, `/api/gemini/nano-banana${endpointSuffix}`);
    }
    
    // 重要：Google API 要求 imageSize 必须是大写，如 "1K", "2K", "4K"
    const imageSizeUpperCase = resolution.toUpperCase();
    console.log(`[BananaEdit] Target URL: ${targetUrl}, Has Input: ${hasInput}, ImageSize: ${imageSizeUpperCase}`);
    
    const payload: any = {
        model: config.modelId,
        prompt: prompt,
        aspect_ratio: aspectRatio,
        image_size: imageSizeUpperCase,
        // generationConfig 透传 (Gemini 风格)
        generationConfig: {
            responseModalities: ["TEXT", "IMAGE"],
            imageConfig: {
                aspectRatio: aspectRatio || "1:1",
                imageSize: imageSizeUpperCase
            }
        }
    };

    if (hasInput) {
        // 传递多种格式的图片参数以兼容不同的 API
        payload.image_urls = [inputImages[0]];
        payload.image = inputImages[0];
        payload.image_url = inputImages[0];
        payload.init_image = inputImages[0];
        payload.reference_image = inputImages[0];
        
        console.log(`[BananaEdit] Input image length: ${inputImages[0].length} chars`);
    }

    const res = await fetchThirdParty(targetUrl, 'POST', payload, config, { timeout: 200000 });
    
    const extractBananaUrl = (data: any) => {
        if (!data) return null;
        
        // Handle deep nesting: data.data.data.images (From User Log)
        const deepImages = data?.data?.data?.images;
        if (Array.isArray(deepImages) && deepImages[0]?.url) {
            return deepImages[0].url;
        }

        // Handle standard nesting: data.data.images
        const midImages = data?.data?.images;
        if (Array.isArray(midImages) && midImages[0]?.url) {
             return midImages[0].url;
        }

        // Handle root nesting: images
        const rootImages = data?.images;
        if (Array.isArray(rootImages) && rootImages[0]?.url) {
             return rootImages[0].url;
        }

        // Handle direct URLs
        if (data?.url) return data.url;
        if (data?.data?.url) return data.data.url;
        if (data?.output?.url) return data.output.url;
        if (data?.result?.url) return data.result.url;
        
        return null;
    };

    const immediateUrl = extractBananaUrl(res);
    if (immediateUrl) return immediateUrl;

    const taskId = res.id || res.task_id || res.data?.id || res.data?.task_id || (typeof res.data === 'string' ? res.data : undefined);

    if (!taskId) {
        if (res.url) return res.url;
        if (res.data && res.data.url) return res.data.url;
        throw new Error("No Task ID returned from Banana Pro Edit");
    }

    const queryUrl = constructUrl(config.baseUrl, `/api/gemini/nano-banana/${taskId}`);

    let attempts = 0;
    while (attempts < 120) {
        await new Promise(r => setTimeout(r, 3000));
        const check = await fetchThirdParty(queryUrl, 'GET', null, config, { timeout: 10000 });
        const statusRaw = check.data?.state || check.state || check.data?.status || check.status || check.task_status;
        const status = (statusRaw || '').toString().toUpperCase();
        
        if (['SUCCESS', 'SUCCEEDED', 'COMPLETED', 'OK', '3'].includes(status)) {
            const url = extractBananaUrl(check);
            if (url) return url;
        } else if (['FAIL', 'FAILED', 'FAILURE'].includes(status)) {
            throw new Error(`Banana Edit failed: ${check.fail_reason || check.error || 'Unknown error'}`);
        }
        attempts++;
    }
    throw new Error("Banana Edit timed out");
};
