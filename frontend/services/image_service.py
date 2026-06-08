"""
图片生成服务
对应前端 services/geminiService.ts (generateImage) + services/mode/image/flux.ts + banana.ts + rules.ts
"""

import aiohttp
import base64
import asyncio
import logging
from typing import List, Optional
from urllib.parse import urljoin

from .model_config import get_model_config

logger = logging.getLogger(__name__)

# ---------- 辅助函数 ----------

def _calculate_image_size(aspect_ratio: str, resolution: str, model_name: str = "Flux2") -> str:
    """计算图片尺寸"""
    if model_name == "Flux2":
        is_2k = resolution == "2k"
        mapping = {
            "1:1": ("2048x2048" if is_2k else "1024x1024"),
            "16:9": ("2048x1152" if is_2k else "1920x1080"),
            "9:16": ("1152x2048" if is_2k else "1080x1920"),
            "4:3": ("2048x1536" if is_2k else "1600x1200"),
            "3:4": ("1536x2048" if is_2k else "1200x1600"),
        }
        return mapping.get(aspect_ratio, "2048x2048" if is_2k else "1024x1024")

    w, h = aspect_ratio.split(":")
    w, h = int(w), int(h)

    if w == 1 and h == 1:
        width, height = 1024, 1024
    elif w == 4 and h == 3:
        width, height = 1024, 768
    elif w == 3 and h == 4:
        width, height = 768, 1024
    elif w == 16 and h == 9:
        width, height = 1024, 576
    elif w == 9 and h == 16:
        width, height = 576, 1024
    elif w == 21 and h == 9:
        width, height = 1536, 640
    elif w == 9 and h == 21:
        width, height = 640, 1536
    else:
        if w > h:
            width, height = 1024, round(1024 * (h / w))
        else:
            width, height = round(1024 * (w / h)), 1024

    return f"{width}x{height}"


def _extract_base64_urls(data: list) -> List[str]:
    """从响应中提取 base64 图片 URL"""
    results = []
    for item in data:
        b64 = item.get("b64_json", "")
        if b64:
            results.append(f"data:image/png;base64,{b64}")
    return results


def _construct_url(base_url: str, endpoint_path: str) -> str:
    """构建完整 URL"""
    if not base_url:
        return f"/{endpoint_path.lstrip('/')}"
    return urljoin(base_url.rstrip("/") + "/", endpoint_path.lstrip("/"))


# ---------- 图片生成 ----------

async def generate_image(
    prompt: str,
    aspect_ratio: str = "1:1",
    model_name: str = "Flux2",
    resolution: str = "1k",
    count: int = 1,
    input_images: Optional[List[str]] = None,
    prompt_optimize: bool = False,
) -> List[str]:
    """
    生成图片
    对应前端 generateImage()
    """
    config = get_model_config(model_name)
    size = _calculate_image_size(aspect_ratio, resolution, model_name)
    input_images = input_images or []

    logger.info(f"[Image Gen] Model: {model_name}, Size: {size}, Count: {count}, "
                f"Input Images: {len(input_images)}, Prompt Optimize: {prompt_optimize}")

    try:
        if input_images:
            return await _generate_edit_image(config, prompt, size, input_images[0], count)
        else:
            return await _generate_standard_image(config, prompt, size, resolution, count, model_name)
    except Exception as e:
        logger.error(f"Error generating image with {model_name}: {e}")
        raise


async def _generate_standard_image(
    config: dict,
    prompt: str,
    size: str,
    resolution: str,
    count: int,
    model_name: str,
) -> List[str]:
    """标准文生图 (Flux 兼容)"""
    target_url = _construct_url(config["baseUrl"], "/image/generate")
    headers = _build_headers(config)

    async def _single_gen():
        payload = {
            "model": config.get("modelId", ""),
            "prompt": prompt,
            "size": size,
            "n": 1,
            "response_format": "b64_json",
        }
        if resolution != "1k":
            payload["quality"] = "hd"

        async with aiohttp.ClientSession() as session:
            async with session.post(target_url, json=payload, headers=headers,
                                    timeout=aiohttp.ClientTimeout(total=200)) as resp:
                data = await resp.json()
                return _extract_base64_urls(data.get("data", [data]))

    if count > 1:
        tasks = [_single_gen() for _ in range(count)]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        all_urls = []
        for r in results:
            if isinstance(r, list):
                all_urls.extend(r)
        return [u for u in all_urls if u]

    return await _single_gen()


async def _generate_edit_image(
    config: dict,
    prompt: str,
    size: str,
    input_image: str,
    count: int,
) -> List[str]:
    """图生图/编辑模式"""
    target_url = _construct_url(config["baseUrl"], "/image/edit")
    headers = _build_headers(config)

    async def _single_edit():
        payload = {
            "prompt": prompt,
            "image": input_image,
            "size": size,
            "n": 1,
            "response_format": "b64_json",
        }
        async with aiohttp.ClientSession() as session:
            async with session.post(target_url, json=payload, headers=headers,
                                    timeout=aiohttp.ClientTimeout(total=200)) as resp:
                data = await resp.json()
                return _extract_base64_urls(data.get("data", [data]))

    if count > 1:
        tasks = [_single_edit() for _ in range(count)]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        all_urls = []
        for r in results:
            if isinstance(r, list):
                all_urls.extend(r)
        return [u for u in all_urls if u]

    return await _single_edit()


def _build_headers(config: dict) -> dict:
    """构建请求头"""
    headers = {"Content-Type": "application/json"}
    if config.get("key"):
        headers["Authorization"] = f"Bearer {config['key']}"
    return headers
