"""
DeepSeek API 处理器
处理 /text/format 和 /text/lines/process 的 DeepSeek 模型请求
"""
import json
import time
import logging
import base64
import requests
import tornado.web

from config import CONFIG

logger = logging.getLogger(__name__)


def _get_deepseek_config(request_body):
    """从请求体中提取 DeepSeek 配置和参数"""
    body = json.loads(request_body.decode("utf-8")) if isinstance(request_body, bytes) else request_body

    text_b64 = body.get("text", "")
    if not text_b64:
        raise ValueError("text is required")

    # base64 解码
    try:
        padding = 4 - len(text_b64) % 4
        if padding != 4:
            text_b64 += "=" * padding
        text = base64.b64decode(text_b64).decode("utf-8")
    except Exception:
        raise ValueError("text is not valid base64 encoded UTF-8 string")

    model = body.get("model", "deepseek-v4-pro")

    api_key = body.get("api-key", "")
    if not api_key:
        # 回退到配置文件
        ds_config = CONFIG.get("deepseek", {})
        api_key = ds_config.get("api_key", "")
    if not api_key:
        raise ValueError("DeepSeek API key is not configured")

    ds_config = CONFIG.get("deepseek", {})
    base_url = ds_config.get("base_url", "https://api.deepseek.com/v1")
    timeout = ds_config.get("timeout", 120)

    return {
        "text": text,
        "text_length": len(text),
        "model": model,
        "api_key": api_key,
        "base_url": base_url,
        "timeout": timeout,
    }


def _call_deepseek_api(api_key, base_url, timeout, model, system_prompt, user_prompt, max_tokens=4096, temperature=0.7):
    """调用 DeepSeek Chat API"""
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}"
    }

    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ],
        "temperature": temperature,
        "max_tokens": max_tokens,
        "stream": False,
        "thinking": {"type": "disabled"}
    }

    logger.info(f"[DeepSeek] Sending request to {base_url}/chat/completions, model={model}")
    response = requests.post(
        f"{base_url}/chat/completions",
        headers=headers,
        json=payload,
        timeout=timeout
    )

    try:
        logger.info(f"[DeepSeek] Response status: {response.status_code}")
    except Exception:
        pass

    response.raise_for_status()
    result = response.json()
    message = result["choices"][0]["message"]
    content = message.get("content") or message.get("reasoning_content", "")
    return content


class DeepSeekAnalyzeHandler(tornado.web.RequestHandler):
    """DeepSeek 小说分析（角色/场景提取等）"""
    def post(self):
        try:
            config = _get_deepseek_config(self.request.body)
        except ValueError as e:
            self.set_status(400)
            self.write(json.dumps({"error": {"message": str(e), "type": "invalid_request_error"}}))
            return

        try:
            # 调用 DeepSeek API 进行小说分析
            from services.novel_service import TEXT_FORMAT_PROMPT_TEMPLATE
            system_prompt = "你是一个专业的小说分析助手。"
            user_prompt = TEXT_FORMAT_PROMPT_TEMPLATE.format(text=config["text"])

            content = _call_deepseek_api(
                config["api_key"], config["base_url"], config["timeout"],
                config["model"], system_prompt, user_prompt
            )

            response = {
                "created": int(time.time()),
                "text_length": config["text_length"],
                "model": config["model"],
                "provider": "deepseek",
                "data": content,
            }

            self.set_header("Content-Type", "application/json")
            self.write(json.dumps(response, ensure_ascii=False))

        except requests.exceptions.Timeout:
            self.set_status(504)
            self.write(json.dumps({"error": {"message": "DeepSeek request timeout", "type": "server_error"}}))
        except requests.exceptions.ConnectionError:
            self.set_status(502)
            self.write(json.dumps({"error": {"message": "Cannot connect to DeepSeek API", "type": "server_error"}}))
        except requests.exceptions.HTTPError as e:
            status_code = e.response.status_code if hasattr(e, 'response') else 500
            if status_code == 401:
                self.set_status(401)
                self.write(json.dumps({"error": {"message": "DeepSeek API key is invalid or expired", "type": "invalid_request_error"}}))
            elif status_code == 429:
                self.set_status(429)
                self.write(json.dumps({"error": {"message": "DeepSeek API rate limit exceeded", "type": "server_error"}}))
            else:
                self.set_status(500)
                self.write(json.dumps({"error": {"message": str(e), "type": "server_error"}}))
        except Exception as e:
            logger.exception("[DeepSeekAnalyze] Error")
            self.set_status(500)
            self.write(json.dumps({"error": {"message": str(e), "type": "server_error"}}))


class DeepSeekLineProcessingHandler(tornado.web.RequestHandler):
    """DeepSeek 小说分行处理"""
    def post(self):
        try:
            config = _get_deepseek_config(self.request.body)
        except ValueError as e:
            self.set_status(400)
            self.write(json.dumps({"error": {"message": str(e), "type": "invalid_request_error"}}))
            return

        try:
            from services.novel_service import LINE_PROCESSING_PROMPT_TEMPLATE, _parse_line_processing_response, _post_process_lines

            # 分段处理
            segments = _split_text_into_segments(config["text"], max_chars=2000)
            logger.info(f"[DeepSeekLines] Split into {len(segments)} segments")

            all_lines = []

            for i, seg in enumerate(segments):
                logger.info(f"[DeepSeekLines] Processing segment {i+1}/{len(segments)} ({len(seg)} chars)")

                system_prompt = "你是一个小说文本分行处理工具。只输出JSON数组，不输出任何解释。回复必须以双引号开头以双引号结尾。"
                user_prompt = LINE_PROCESSING_PROMPT_TEMPLATE.format(novel_text=seg)

                content = _call_deepseek_api(
                    config["api_key"], config["base_url"], config["timeout"],
                    config["model"], system_prompt, user_prompt,
                    max_tokens=4096
                )

                parsed = _parse_line_processing_response(content)
                lines = parsed.get("lines", [])
                logger.info(f"[DeepSeekLines] Segment {i+1} extracted {len(lines)} lines")
                all_lines.extend(lines)

            # 重新计算行号
            for j, line in enumerate(all_lines):
                if isinstance(line, dict):
                    line["line_number"] = j + 1

            # 后处理
            all_lines = _post_process_lines(all_lines)
            logger.info(f"[DeepSeekLines] Total lines: {len(all_lines)}")

            response = {
                "created": int(time.time()),
                "text_length": config["text_length"],
                "model": config["model"],
                "provider": "deepseek",
                "data": all_lines,
                "line_count": len(all_lines),
            }

            self.set_header("Content-Type", "application/json")
            self.write(json.dumps(response, ensure_ascii=False))

        except requests.exceptions.Timeout:
            self.set_status(504)
            self.write(json.dumps({"error": {"message": "DeepSeek request timeout", "type": "server_error"}}))
        except requests.exceptions.ConnectionError:
            self.set_status(502)
            self.write(json.dumps({"error": {"message": "Cannot connect to DeepSeek API", "type": "server_error"}}))
        except requests.exceptions.HTTPError as e:
            status_code = e.response.status_code if hasattr(e, 'response') else 500
            if status_code == 401:
                self.set_status(401)
                self.write(json.dumps({"error": {"message": "DeepSeek API key is invalid or expired", "type": "invalid_request_error"}}))
            elif status_code == 429:
                self.set_status(429)
                self.write(json.dumps({"error": {"message": "DeepSeek API rate limit exceeded", "type": "server_error"}}))
            else:
                self.set_status(500)
                self.write(json.dumps({"error": {"message": str(e), "type": "server_error"}}))
        except Exception as e:
            logger.exception("[DeepSeekLines] Error")
            self.set_status(500)
            self.write(json.dumps({"error": {"message": str(e), "type": "server_error"}}))


def _split_text_into_segments(text, max_chars=800):
    """将文本按句子边界分段"""
    import re
    sentences = re.split(r'(?<=[。；\n])', text)
    segments = []
    current = ""

    for sentence in sentences:
        if not sentence:
            continue
        if len(current) + len(sentence) <= max_chars:
            current += sentence
        else:
            if current:
                segments.append(current)
            if len(sentence) > max_chars:
                for i in range(0, len(sentence), max_chars):
                    segments.append(sentence[i:i + max_chars])
                current = ""
            else:
                current = sentence

    if current:
        segments.append(current)

    return segments
