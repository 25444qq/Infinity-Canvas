"""
音频生成服务 (TTS)
对应前端 services/geminiService.ts (generateAudio)
"""

import os
import aiohttp
import base64
import logging
from typing import Optional
from urllib.parse import urljoin

from .model_config import get_model_config, MODEL_REGISTRY

logger = logging.getLogger(__name__)


async def generate_audio(
    prompt: str,
    model_name: str = "Qwen3-TTS",
    emotion: Optional[str] = None,
    ref_audio: Optional[str] = None,
    language: Optional[str] = None,
    preset_voice: Optional[str] = None,
    instruction: Optional[str] = None,
) -> str:
    """
    生成音频
    对应前端 generateAudio()
    """
    config = get_model_config(model_name)

    # Base64 编码文本 (与前端保持一致)
    base64_text = base64.b64encode(prompt.encode("utf-8")).decode("utf-8")

    payload = {
        "text": base64_text,
        "model": config.get("modelId") or MODEL_REGISTRY.get(model_name, {}).get("id", model_name),
        "response_format": "url",
        "audio_format": "wav",
    }

    if emotion:
        payload["voice_description"] = emotion
    if ref_audio:
        payload["ref_audio"] = ref_audio
    if language:
        payload["language"] = language
    if preset_voice and model_name != "MOSS-TTS":
        payload["voice"] = preset_voice
    if instruction:
        payload["instruction"] = base64.b64encode(instruction.encode("utf-8")).decode("utf-8")

    logger.info(f"[Audio Gen] Model: {model_name}, Emotion: {emotion or 'none'}, "
                f"Has Ref Audio: {bool(ref_audio)}, Language: {language or 'none'}, "
                f"Voice: {preset_voice or 'none'}")

    base_url = config["baseUrl"].rstrip("/")
    url = f"{base_url}/audio/tts"

    headers = {"Content-Type": "application/json"}
    if config.get("key"):
        headers["Authorization"] = f"Bearer {config['key']}"

    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(url, json=payload, headers=headers,
                                    timeout=aiohttp.ClientTimeout(total=300)) as resp:
                res = await resp.json()

        logger.info(f"[Audio Gen] Response keys: {list(res.keys()) if isinstance(res, dict) else 'not dict'}")

        # 解析 URL
        raw_url = (res.get("data", {}).get("url") or
                   res.get("url") or
                   res.get("data", {}).get("audio_url") or
                   res.get("audio_url") or "")

        if raw_url:
            return _resolve_url(raw_url, config["baseUrl"])

        # 直接返回 base64 音频
        if res.get("data", {}).get("audio"):
            return res["data"]["audio"]
        if res.get("audio"):
            return res["audio"]

        raise Exception("未获取到音频结果")

    except Exception as e:
        logger.error(f"Error generating audio with {model_name}: {e}")
        raise


def _resolve_url(relative_url: str, base_url: str) -> str:
    """解析相对 URL 为绝对 URL"""
    if not relative_url:
        return ""
    if relative_url.startswith(("http://", "https://", "data:")):
        return relative_url
    
    # 如果是 /outputs/ 路径，使用前端服务器地址（前端服务器会代理到后端）
    if relative_url.startswith("/outputs/"):
        # 使用前端服务器地址（端口 8090）
        frontend_port = os.environ.get("PORT", "8090")
        return f"http://localhost:{frontend_port}{relative_url}"
    
    # 其他路径，使用后端服务器地址
    return urljoin(base_url.rstrip("/") + "/", relative_url.lstrip("/"))
