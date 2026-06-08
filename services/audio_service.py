import os
import sys
import io
import base64
import logging
import time
import uuid
import threading
import tempfile
import gc

import torch
import soundfile as sf

from config import CONFIG
from services.model_manager import model_manager, ModelType

logger = logging.getLogger(__name__)

_model = None
_model_lock = threading.Lock()
_model_loaded = False
_current_model_path = None
_registered = False


def _register_to_manager():
    """注册到模型管理器"""
    global _registered
    if _registered:
        return
    
    model_manager.register_loader(ModelType.AUDIO, _load_model_wrapper)
    model_manager.register_unloader(ModelType.AUDIO, _unload_model_wrapper)
    _registered = True
    logger.info("Audio service registered to ModelManager")


def _load_model_wrapper(model_name, **kwargs):
    """模型管理器调用的加载函数包装器"""
    # model_name 对于音频服务来说是模型路径
    load_qwen_tts_model(model_name)
    return _model


def _unload_model_wrapper(model_name):
    """模型管理器调用的卸载函数包装器"""
    unload_qwen_tts_model()


# 在模块加载时注册
_register_to_manager()


def get_current_model_path():
    return _current_model_path


def is_qwen_tts_loaded():
    return _model_loaded


def unload_qwen_tts_model():
    global _model, _model_loaded, _current_model_path
    
    if _model is not None:
        if hasattr(_model, 'cpu'):
            _model.cpu()
        del _model
        _model = None
    
    if torch.cuda.is_available():
        torch.cuda.empty_cache()
        torch.cuda.synchronize()
    
    gc.collect()
    
    _model_loaded = False
    _current_model_path = None
    logger.info("Qwen3-TTS model unloaded, GPU memory released")


def load_qwen_tts_model(model_path=None):
    global _model, _model_loaded, _current_model_path

    if model_path is None:
        model_path = CONFIG["qwen_tts_model_path"]

    if _model_loaded and _current_model_path == model_path:
        logger.info(f"Qwen3-TTS model already loaded ({model_path}), skipping reload")
        return True

    with _model_lock:
        if _model_loaded and _current_model_path == model_path:
            logger.info(f"Qwen3-TTS model already loaded ({model_path}), skipping reload")
            return True

        try:
            if _model_loaded and _current_model_path != model_path:
                logger.info(f"Switching model from {_current_model_path} to {model_path}, unloading old model...")
                unload_qwen_tts_model()
            
            # 不再自动卸载其他模型，由模型管理器统一管理
            # logger.info("Unloading all other models before loading Qwen3-TTS...")
            
            # try:
            #     from services.flux2_service import Flux2KlienService
            #     Flux2KlienService.unload_all_models()
            # except Exception as e:
            #     logger.warning(f"Failed to unload FLUX.2: {e}")
            
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
                torch.cuda.synchronize()
            
            gc.collect()

            device = CONFIG.get("device", "cpu")

            logger.info(f"Loading Qwen3-TTS model from: {model_path}")
            logger.info(f"Device: {device}")

            dtype = torch.float16 if device == "cuda" else torch.float32

            from qwen_tts import Qwen3TTSModel

            _model = Qwen3TTSModel.from_pretrained(
                model_path,
                device_map="cuda:0" if device == "cuda" else "cpu",
                dtype=dtype,
                local_files_only=True,
            )

            _model_loaded = True
            _current_model_path = model_path
            logger.info(f"Qwen3-TTS model loaded successfully from {model_path}")
            return True

        except Exception as e:
            logger.error(f"Failed to load Qwen3-TTS model: {e}")
            import traceback
            traceback.print_exc()
            return False


def synthesize(
    text,
    language="zh",
    voice="Cherry",
    voice_description=None,
    ref_audio_path=None,
    speed=1.0,
    temperature=0.7,
    top_p=0.8,
    top_k=20,
    max_new_tokens=4096,
):
    global _model

    # 使用模型管理器确保模型已加载
    # 对于 TTS，需要根据参数确定使用哪个模型
    target_model_path = CONFIG["qwen_tts_model_path"]
    
    # Determine which model to use based on parameters
    if ref_audio_path:
        target_model_path = CONFIG["qwen_tts_model_path"].replace("voicedesign", "base")
    elif voice_description:
        target_model_path = CONFIG["qwen_tts_model_path"].replace("base", "voicedesign")
    elif voice:
        target_model_path = CONFIG["qwen_tts_model_path"].replace("voicedesign", "base")
    
    # 使用模型管理器确保模型已加载
    model_manager.ensure_model(ModelType.AUDIO, target_model_path)
    
    # 获取加载的模型实例
    if not _model_loaded or _model is None:
        raise RuntimeError("Qwen3-TTS model is not loaded")

    ref_audio_file = None
    try:
        # ref_audio_path is already decoded to file path by handler
        # Map language codes to model-supported languages
        language_map = {
            'zh': 'chinese',
            'en': 'english',
            'ja': 'japanese',
            'ko': 'korean',
            'de': 'german',
            'fr': 'french',
            'ru': 'russian',
            'pt': 'portuguese',
            'es': 'spanish',
            'it': 'italian',
            'none': 'chinese',
            'auto': 'chinese',
        }
        
        model_language = language_map.get(language.lower() if language else 'zh', 'chinese')
        logger.info(f"[QwenTTS] Language mapping: input={language} -> model_language={model_language}")
        
        # Log model information
        logger.info(f"Qwen3-TTS model type: {getattr(_model.model, 'tts_model_type', 'unknown')}")
        logger.info(f"Qwen3-TTS model size: {getattr(_model.model, 'tts_model_size', 'unknown')}")
        logger.info(f"Qwen3-TTS tokenizer type: {getattr(_model.model, 'tokenizer_type', 'unknown')}")
        
        # Log generation parameters
        logger.info(f"Generation parameters: text_len={len(text)}, language={language} -> {model_language}, voice={voice}, voice_description={voice_description}, ref_audio={bool(ref_audio_path)}")
        
        # Get model type
        model_type = getattr(_model.model, 'tts_model_type', 'unknown')
        logger.info(f"Current model type: {model_type}")

        logger.info(f"[QwenTTS] Voice parameters: voice={voice}, voice_description={voice_description}, ref_audio={bool(ref_audio_path)}")

        # 根据参数决定使用哪个模型
        # 1. 如果提供了 ref_audio → 使用 base 模型（支持声音克隆）
        # 2. 如果没有提供 ref_audio → 使用 voice_design 模型（支持声音描述）
        
        target_model_path = None
        
        if ref_audio_path:
            # 需要使用 base 模型进行声音克隆
            if model_type != 'base' and model_type != 'custom_voice':
                logger.info("Reference audio provided, switching to base model for voice cloning...")
                target_model_path = CONFIG.get("qwen_tts_base_model_path")
                if not target_model_path:
                    logger.warning("Base model path not configured, falling back to voice_design with error")
                    raise ValueError("Voice cloning requires base model, but base model path is not configured")
            else:
                target_model_path = _current_model_path
        else:
            # 使用 voice_design 模型
            if model_type != 'voice_design':
                logger.info("No reference audio, switching to voice_design model...")
                target_model_path = CONFIG.get("qwen_tts_voice_design_model_path")
                if not target_model_path:
                    logger.warning("Voice design model path not configured, using current model")
                    target_model_path = _current_model_path
            else:
                target_model_path = _current_model_path

        # 切换模型（如果需要）
        if target_model_path and target_model_path != _current_model_path:
            if not os.path.exists(target_model_path):
                logger.warning(f"Target model not found: {target_model_path}, falling back to current model")
                target_model_path = _current_model_path
                if ref_audio_path:
                    raise ValueError(f"Voice cloning requires base model, but model not found at: {CONFIG.get('qwen_tts_base_model_path')}")
            else:
                logger.info(f"Switching model: {model_type} -> {target_model_path}")
                unload_qwen_tts_model()
                if not load_qwen_tts_model(target_model_path):
                    raise RuntimeError(f"Failed to load model from {target_model_path}")
                model_type = getattr(_model.model, 'tts_model_type', 'unknown')
                logger.info(f"Switched to model type: {model_type}")

        model_to_use = _model
        model_type = getattr(_model.model, 'tts_model_type', 'unknown')
        use_base_model = (model_type == 'base' or model_type == 'custom_voice')
        use_voice_design = (model_type == 'voice_design')

        logger.info(f"[QwenTTS] Final decision: model_type={model_type}, use_base_model={use_base_model}, use_voice_design={use_voice_design}")

        # Generate audio based on model type and parameters
        if ref_audio_path and use_base_model:
            logger.info(f"Using voice cloning with reference audio: {ref_audio_path}")
            wavs, sr = model_to_use.generate_voice_clone(
                text=text,
                language=model_language,
                ref_audio=ref_audio_path,
                x_vector_only_mode=True
            )
        elif use_voice_design:
            logger.info(f"Using voice design: instruct={voice_description}")
            wavs, sr = model_to_use.generate_voice_design(
                text=text,
                language=model_language,
                instruct=voice_description if voice_description else "Use a natural speaking voice",
            )
        elif use_base_model and voice:
            logger.info(f"Using custom voice generation: speaker={voice}")
            wavs, sr = model_to_use.generate_custom_voice(
                text=text,
                language=model_language,
                speaker=voice,
            )
        else:
            logger.info(f"Using fallback: instruct={voice_description}")
            wavs, sr = model_to_use.generate_voice_design(
                text=text,
                language=model_language,
                instruct=voice_description if voice_description else "Use a natural speaking voice",
            )
        
        # Log generation result
        logger.info(f"Generation completed: audio length={len(wavs[0])}, sample rate={sr}")

        buf = io.BytesIO()
        sf.write(buf, wavs[0], sr, format="wav")
        buf.seek(0)

        audio_bytes = buf.getvalue()
        
        logger.info(f"Qwen3-TTS synthesis completed, model kept in memory for next request")
        
        return audio_bytes

    finally:
        if ref_audio_file and os.path.exists(ref_audio_file.name):
            try:
                os.unlink(ref_audio_file.name)
            except:
                pass


def save_audio(audio_bytes, filename=None):
    os.makedirs(CONFIG["output_dir"], exist_ok=True)
    if filename is None:
        filename = f"qwen_tts_{int(time.time() * 1000)}.wav"
    filepath = os.path.join(CONFIG["output_dir"], filename)
    with open(filepath, "wb") as f:
        f.write(audio_bytes)
    return filepath


AVAILABLE_VOICES = [
    {"id": "Cherry", "name": "Cherry", "language": "zh,en", "gender": "female", "description": "亲切女声"},
    {"id": "Ethan", "name": "Ethan", "language": "zh,en", "gender": "male", "description": "沉稳男声"},
    {"id": "Chelsie", "name": "Chelsie", "language": "zh,en", "gender": "female", "description": "活力女声"},
    {"id": "Serena", "name": "Serena", "language": "zh,en", "gender": "female", "description": "温柔女声"},
    {"id": "Dylan", "name": "Dylan", "language": "zh-cn(beijing)", "gender": "male", "description": "北京话男声"},
    {"id": "Jada", "name": "Jada", "language": "zh-cn(shanghai)", "gender": "female", "description": "上海话女声"},
    {"id": "Sunny", "name": "Sunny", "language": "zh-cn(sichuan)", "gender": "female", "description": "四川话女声"},
]

SUPPORTED_LANGUAGES = ["zh", "en", "ja", "ko", "de", "fr", "ru", "pt", "es", "it"]
