"""
文本处理服务
对应前端 services/geminiService.ts (generateCreativeDescription + generateTextAnalyze)
"""

import aiohttp
import base64
import json
import logging
from typing import Optional
from urllib.parse import urljoin

from .model_config import get_model_config

logger = logging.getLogger(__name__)


async def generate_creative_description(input_text: str) -> str:
    """
    创意描述优化
    对应前端 generateCreativeDescription()
    使用 Qwen3.5-27B 模型优化提示词
    """
    config = get_model_config("Qwen3.5-27B")
    prompt = f'Optimize this description for professional AI generation. Input: "{input_text}". Provide ONLY the optimized prompt text.'

    payload = {
        "model": "Qwen3.5-27B",
        "messages": [{"role": "user", "content": prompt}],
    }

    base_url = config["baseUrl"].rstrip("/")
    endpoint = config["endpoint"].lstrip("/")
    url = f"{base_url}/{endpoint}" if base_url else f"/{endpoint}"

    headers = {"Content-Type": "application/json"}
    if config.get("key"):
        headers["Authorization"] = f"Bearer {config['key']}"

    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(url, json=payload, headers=headers,
                                    timeout=aiohttp.ClientTimeout(total=60)) as resp:
                res = await resp.json()

        result = (res.get("choices", [{}])[0].get("message", {}).get("content", "") if isinstance(res, dict) else "")
        return result or input_text

    except Exception as e:
        logger.error(f"Error generating creative description: {e}")
        return input_text


async def generate_text_analyze(
    text_content: str,
    model_name: str = "Qwen3.5-27B",
) -> str:
    """
    文本格式化/分析
    对应前端 generateTextAnalyze()
    """
    config = get_model_config(model_name)

    base64_text = base64.b64encode(text_content.encode("utf-8")).decode("utf-8")

    payload = {
        "text": base64_text,
        "model": config.get("modelId") or model_name,
    }

    # 不再发送 prompt 参数
    if config.get("key"):
        payload["api-key"] = config["key"]

    base_url = config["baseUrl"].rstrip("/")
    endpoint = config["endpoint"].rstrip("/")
    url = f"{base_url}{endpoint}/format"

    headers = {"Content-Type": "application/json"}

    # 非 DeepSeek 请求需要本地 API key 验证
    model_id = config.get("modelId") or model_name
    if not model_id.lower().startswith("deepseek-"):
        headers["Authorization"] = "Bearer sk-text-000000"

    logger.info(f"[Text Format] Model: {model_name}, Text length: {len(text_content)}")

    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(url, json=payload, headers=headers,
                                    timeout=aiohttp.ClientTimeout(total=1200)) as resp:
                res = await resp.json()

        logger.info(f"[Text Format] Response keys: {list(res.keys()) if isinstance(res, dict) else 'not dict'}")

        # 尝试解码 base64 结果
        result_b64 = res.get("result_b64", "")
        if result_b64:
            try:
                return base64.b64decode(result_b64).decode("utf-8")
            except Exception:
                return result_b64

        # 其他可能的字段
        raw = (res.get("result") or
               res.get("data", {}).get("result") or
               res.get("text") or
               res.get("data", {}).get("text") or
               res.get("response") or
               res.get("data", {}).get("response") or "")

        if not raw:
            raise Exception("服务器未返回结果")

        try:
            return base64.b64decode(raw).decode("utf-8")
        except Exception:
            return raw

    except Exception as e:
        logger.error(f"Error in text format with {model_name}: {e}")
        raise


async def generate_novel_lines(
    text_content: str,
    model_name: str = "Qwen3.5-27B",
) -> dict:
    """
    小说文本分行处理
    对应前端 generateNovelLines()
    调用后端 /text/lines/process
    """
    config = get_model_config(model_name)

    base64_text = base64.b64encode(text_content.encode("utf-8")).decode("utf-8")

    payload = {
        "text": base64_text,
        "model": config.get("modelId") or model_name,
    }

    if config.get("key"):
        payload["api-key"] = config["key"]

    base_url = config["baseUrl"].rstrip("/")
    endpoint = config["endpoint"].rstrip("/")
    url = f"{base_url}{endpoint}/lines/process"

    headers = {"Content-Type": "application/json"}

    # 非 DeepSeek 请求需要本地 API key 验证
    model_id = config.get("modelId") or model_name
    if not model_id.lower().startswith("deepseek-"):
        headers["Authorization"] = "Bearer sk-text-000000"

    logger.info(f"[Novel Lines] Model: {model_name}, Text length: {len(text_content)}")

    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(url, json=payload, headers=headers,
                                    timeout=aiohttp.ClientTimeout(total=1200)) as resp:
                res = await resp.json()

        logger.info(f"[Novel Lines] Response keys: {list(res.keys()) if isinstance(res, dict) else 'not dict'}")
        logger.info(f"[Novel Lines] Response line_count: {res.get('line_count', 'N/A')}")
        logger.info(f"[Novel Lines] Full response: {json.dumps(res, ensure_ascii=False)[:3000]}")
        # 逐行打印 data 内容
        data = res.get("data", [])
        for i, line in enumerate(data[:5]):  # 仅打印前5行避免刷屏
            logger.info(f"[Novel Lines] Line {i}: {json.dumps(line, ensure_ascii=False)[:500]}")

        return res

    except Exception as e:
        logger.error(f"Error in novel lines with {model_name}: {e}")
        raise
