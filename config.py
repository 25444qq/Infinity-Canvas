import os

import torch

_base_dir = os.path.dirname(os.path.abspath(__file__))
_device = "cuda" if torch.cuda.is_available() else "cpu"

# 离线环境变量：阻止 HuggingFace Hub / basicSR / realesrgan 等库的网络请求
OFFLINE_ENV = {
    "HF_HUB_OFFLINE": "1",
    "HF_DATASETS_OFFLINE": "1",
    "TRANSFORMERS_OFFLINE": "1",
    "NO_TORCH_HUB_DOWNLOAD": "1",
}

CONFIG = {
    "host": os.environ.get("HOST", "0.0.0.0"),
    "port": int(os.environ.get("PORT", "8080")),
    "flux2_models_dir": os.environ.get("FLUX2_MODELS_DIR", os.path.join(_base_dir, "models")),
    "flux2_default_model": os.environ.get("FLUX2_DEFAULT_MODEL", "FLUX.2-klein-4B"),
    
    # 模型路径映射：根据请求的模型名称选择对应的模型目录
    "flux2_model_paths": {
        # 4B 原版模型（显存需求：约 16GB）
        "FLUX.2-klein-4B": os.path.join(_base_dir, "models/FLUX.2-klein-4B"),
        "flux.2-4b": os.path.join(_base_dir, "models/FLUX.2-klein-4B"),
        "flux2-4b": os.path.join(_base_dir, "models/FLUX.2-klein-4B"),
        "4b": os.path.join(_base_dir, "models/FLUX.2-klein-4B"),
        
        # 9B FP8 量化版本（显存需求：14GB，质量好）- 暂时禁用
        # "FLUX.2-klein-9B": os.path.join(_base_dir, "models/FLUX.2-klein-9B-FP8"),
        # "flux.2-9b": os.path.join(_base_dir, "models/FLUX.2-klein-9B-FP8"),
    },
    
    # 默认模型路径（向后兼容）
    "model_path": os.environ.get("FLUX2_MODEL_PATH", os.path.join(_base_dir, "models/FLUX.2-klein-4B")),
    "model_name": os.environ.get("FLUX2_MODEL_NAME", "FLUX.2-klein-4B"),
    "dtype": os.environ.get("FLUX2_DTYPE", "bfloat16" if _device == "cuda" else "float32"),
    "device": _device,
    "default_height": 1024,
    "default_width": 1024,
    "default_guidance_scale": 1.0,
    "default_num_inference_steps": 4,
    "output_dir": os.environ.get("OUTPUT_DIR", os.path.join(_base_dir, "outputs")),
    "image_url_prefix": os.environ.get("IMAGE_URL_PREFIX", "http://localhost:8080"),
    "api_key": os.environ.get("API_KEY", "sk-api-000000"),
    "api_keys": {
        "image": os.environ.get("IMAGE_API_KEY", "sk-image-000000"),
        "audio": os.environ.get("AUDIO_API_KEY", "sk-audio-000000"),
        "text": os.environ.get("TEXT_API_KEY", "sk-text-000000"),
        "video": os.environ.get("VIDEO_API_KEY", "sk-video-000000"),
    },
    "debug": os.environ.get("DEBUG", "false").lower() == "true",
    "novel_model_path": os.environ.get("NOVEL_MODEL_PATH", os.path.join(_base_dir, "models/Qwen3.5-27B-Q4_K_M.gguf")),
    "novel_model_name": os.environ.get("NOVEL_MODEL_NAME", "Qwen3.5-27B-Q4_K_M"),
    "novel_model_type": os.environ.get("NOVEL_MODEL_TYPE", "qwen"),
    "novel_max_new_tokens": int(os.environ.get("NOVEL_MAX_NEW_TOKENS", "4096")),
    "novel_temperature": float(os.environ.get("NOVEL_TEMPERATURE", "0.7")),
    "novel_top_p": float(os.environ.get("NOVEL_TOP_P", "0.8")),
    "novel_top_k": int(os.environ.get("NOVEL_TOP_K", "20")),
    
    # Qwen3-TTS 模型配置
    "qwen_tts_model_path": os.environ.get("QWEN_TTS_MODEL_PATH", os.path.join(_base_dir, "models/qwen3_tts_12hz_1_7b_voicedesign")),
    "qwen_tts_model_name": os.environ.get("QWEN_TTS_MODEL_NAME", "Qwen3-TTS-12Hz-1.7B"),
    "qwen_tts_sample_rate": int(os.environ.get("QWEN_TTS_SAMPLE_RATE", "24000")),
    
    # Qwen3-TTS Base 模型（支持声音克隆）
    "qwen_tts_base_model_path": os.environ.get("QWEN_TTS_BASE_MODEL_PATH", os.path.join(_base_dir, "models/qwen3_tts_12hz_1_7b_base")),
    
    # Qwen3-TTS Voice Design 模型（支持声音描述）
    "qwen_tts_voice_design_model_path": os.environ.get("QWEN_TTS_VOICE_DESIGN_MODEL_PATH", os.path.join(_base_dir, "models/qwen3_tts_12hz_1_7b_voicedesign")),
    
    "lm_studio": {
        "enabled": os.environ.get("LM_STUDIO_ENABLED", "false").lower() == "true",
        "base_url": os.environ.get("LM_STUDIO_BASE_URL", "http://localhost:1234/v1"),
        "api_key": os.environ.get("LM_STUDIO_API_KEY", "local"),
        "default_model": os.environ.get("LM_STUDIO_DEFAULT_MODEL", ""),
        "timeout": int(os.environ.get("LM_STUDIO_TIMEOUT", "120")),
    },
    "deepseek": {
        "enabled": os.environ.get("DEEPSEEK_ENABLED", "false").lower() == "true",
        "api_key": os.environ.get("DEEPSEEK_API_KEY", ""),
        "base_url": os.environ.get("DEEPSEEK_BASE_URL", "https://api.deepseek.com/v1"),
        "default_model": os.environ.get("DEEPSEEK_DEFAULT_MODEL", "deepseek-chat"),
        "timeout": int(os.environ.get("DEEPSEEK_TIMEOUT", "120")),
    },
    
    # Real-ESRGAN 图片超分辨率配置
    "realesrgan": {
        "enabled": os.environ.get("REALESRGAN_ENABLED", "true").lower() == "true",
        "model_path": os.environ.get("REALESRGAN_MODEL_PATH", os.path.join(_base_dir, "models/realesrgan")),
        # 默认模型: RealESRGAN_x4plus (通用场景), 可选: RealESRGAN_x4plus_anime (动漫)
        "default_model": os.environ.get("REALESRGAN_DEFAULT_MODEL", "RealESRGAN_x4plus"),
        # 默认放大倍数: 2, 4
        "default_scale": int(os.environ.get("REALESRGAN_DEFAULT_SCALE", "4")),
        # 人脸增强 (需要 GFPGAN)
        "face_enhance": os.environ.get("REALESRGAN_FACE_ENHANCE", "false").lower() == "true",
        # 分块大小 (用于大图片，防止显存溢出)
        "tile_size": int(os.environ.get("REALESRGAN_TILE_SIZE", "512")),
        # 分块重叠 padding
        "tile_pad": int(os.environ.get("REALESRGAN_TILE_PAD", "10")),
        # 降噪强度 (0.0-1.0, 0 表示不降噪)
        "denoise_strength": float(os.environ.get("REALESRGAN_DENOISE_STRENGTH", "0.5")),
    },
}
