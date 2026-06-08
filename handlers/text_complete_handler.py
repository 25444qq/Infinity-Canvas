import json
import time
import logging
import base64
import requests

import tornado.web

from config import CONFIG
from handlers.common_handlers import CORSHandler, validate_api_key

logger = logging.getLogger(__name__)


class TextCompleteHandler(CORSHandler):
    def post(self):
        # 先解析请求体判断是否为 DeepSeek 请求
        try:
            body = json.loads(self.request.body)
            model = body.get("model", "")
            is_deepseek = model.lower().startswith("deepseek-") if model else False
        except Exception:
            is_deepseek = False
            body = {}

        # 本地模型需要 API Key，DeepSeek 使用 body 中的 api-key
        if not is_deepseek:
            if not validate_api_key(self.request, "text"):
                self.set_status(401)
                self.write(json.dumps({"error": {"message": "Invalid API key for text endpoints", "type": "invalid_request_error"}}))
                return

        try:
            if not body:
                body = json.loads(self.request.body)

            text_b64 = body.get("text", "")
            if not text_b64:
                self.set_status(400)
                self.write(json.dumps({"error": {"message": "text is required", "type": "invalid_request_error"}}))
                return

            try:
                padding = 4 - len(text_b64) % 4
                if padding != 4:
                    text_b64 += "=" * padding
                novel_text = base64.b64decode(text_b64).decode("utf-8")
                logger.info(f"Successfully decoded base64 text, length: {len(novel_text)}")
            except Exception as e:
                logger.error(f"Failed to decode base64 text: {e}")
                self.set_status(400)
                self.write(json.dumps({"error": {"message": "text is not valid base64 encoded UTF-8 string", "type": "invalid_request_error"}}))
                return

            text_length = len(novel_text)
            if text_length < 100:
                self.set_status(400)
                self.write(json.dumps({"error": {"message": "text is too short, at least 100 characters required", "type": "invalid_request_error"}}))
                return

            if text_length > 15000:
                self.set_status(400)
                self.write(json.dumps({"error": {"message": "text is too long, maximum 15000 characters allowed", "type": "invalid_request_error"}}))
                return

            model = body.get("model", None)
            provider = None

            if model is not None:
                if model.startswith("lms-"):
                    provider = "lm-studio"
                    model = model[4:]
                elif model.lower().startswith("deepseek-"):
                    provider = "deepseek"
                else:
                    # 本地模型
                    provider = "local"

            temperature = body.get("temperature", 0.7)
            max_tokens = body.get("max_tokens", 4096)

            logger.info(f"[TextComplete] model='{model}', provider={provider}, text_len={text_length}, temperature={temperature}, max_tokens={max_tokens}")

            api_key = body.get("api-key", "")

            if provider == "lm-studio":
                result = self._call_lm_studio(None, novel_text, model, temperature, max_tokens)
            elif provider == "deepseek":
                result = self._call_deepseek(None, novel_text, model, temperature, max_tokens, api_key)
            elif provider == "local":
                result = self._call_local_model(None, novel_text, model, temperature, max_tokens)
            else:
                # 默认使用本地模型
                result = self._call_local_model(None, novel_text, model, temperature, max_tokens)

            response = {
                "created": int(time.time()),
                "text_length": text_length,
                "model": model,
                "provider": provider,
                "result_b64": base64.b64encode(result.encode("utf-8")).decode("utf-8"),
            }

            self.set_header("Content-Type", "application/json")
            self.write(json.dumps(response, ensure_ascii=False))

        except Exception as e:
            logger.exception("Error in text complete")
            self.set_status(500)
            self.set_header("Content-Type", "application/json")
            self.write(json.dumps({"error": {"message": str(e), "type": "server_error"}}))

    def _call_local_model(self, prompt, text, model, temperature, max_tokens):
        """调用本地模型进行文本格式化"""
        from services.novel_service import format_text, load_novel_model, is_novel_model_loaded, get_loaded_model_name

        # 如果指定了模型名称，尝试加载
        if model:
            if not load_novel_model(model):
                raise RuntimeError(f"Failed to load model: {model}")
        elif not is_novel_model_loaded():
            # 如果没有指定模型且没有加载模型，加载默认模型
            logger.info("No model loaded, loading default model...")
            if not load_novel_model():
                raise RuntimeError("Failed to load default model")

        current_model = model or get_loaded_model_name()
        logger.info(f"[LocalModel] Using model: {current_model}")

        try:
            result = format_text(
                prompt=prompt,
                text=text,
                model_name=current_model,
            )
            logger.info(f"[LocalModel] Successfully formatted text, result length: {len(result)}")
            return result
        except Exception as e:
            logger.error(f"[LocalModel] Error formatting text: {e}")
            raise RuntimeError(f"Local model error: {str(e)}")

    def _call_lm_studio(self, prompt, text, model, temperature, max_tokens):
        lm_config = CONFIG.get("lm_studio", {})
        if not lm_config.get("enabled", False):
            raise RuntimeError("LM Studio is not enabled")

        base_url = lm_config.get("base_url", "http://localhost:1234/v1")
        api_key = lm_config.get("api_key", "local")
        timeout = lm_config.get("timeout", 120)

        # 使用默认提示词
        default_prompt = """你是一个专业的文本处理专家，根据提示词处理文本。
** 按语义自动拆分、重组小说段落，合理另起一行分段；
** 统一修正、规范全文标点符号，修正错用漏用；
** 所有人物对话统一用标准双引号（如："你好"）包裹，禁止使用「」；
** 规范话处理标点符号，如：结尾必须使用"。"，规范使用"、"、"，"；
** 根据上下文剧情，自动补全每句对话对应的说话人，标注在对话前方；
仅输出处理完成后的小说正文，不额外加说明、不保留原格式备注。"""

        full_prompt = f"""{default_prompt}

## 文本内容：

{text}

请根据上述提示词处理文本内容："""

        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}"
        }

        payload = {
            "messages": [
                {"role": "system", "content": "你是一个专业的文本处理助手。请根据用户提供的提示词处理文本。"},
                {"role": "user", "content": full_prompt}
            ],
            "temperature": temperature,
            "max_tokens": max_tokens,
            "stream": False
        }
        if model:
            payload["model"] = model

        try:
            logger.info(f"Sending request to LM Studio: {json.dumps(payload, ensure_ascii=False)}")
            response = requests.post(
                f"{base_url}/chat/completions",
                headers=headers,
                json=payload,
                timeout=timeout
            )
            logger.info(f"LM Studio response status: {response.status_code}")
            logger.info(f"LM Studio response content: {response.text}")
            response.raise_for_status()
            result = response.json()
            content = result["choices"][0]["message"]["content"]
            logger.info(f"Extracted content from LM Studio: {content}")
            return content

        except requests.exceptions.Timeout:
            raise RuntimeError("LM Studio request timeout")
        except requests.exceptions.ConnectionError:
            raise RuntimeError("Cannot connect to LM Studio. Please ensure LM Studio is running.")
        except Exception as e:
            raise RuntimeError(f"LM Studio API error: {str(e)}")

    def _call_deepseek(self, prompt, text, model, temperature, max_tokens, api_key=""):
        deepseek_config = CONFIG.get("deepseek", {})
        # 优先使用请求体传入的 api-key，回退到配置文件
        if not api_key:
            api_key = deepseek_config.get("api_key", "")
        if not api_key:
            raise RuntimeError("DeepSeek API key is not configured")

        base_url = deepseek_config.get("base_url", "https://api.deepseek.com/v1")
        timeout = deepseek_config.get("timeout", 300)

        from services.novel_service import TEXT_FORMAT_PROMPT_TEMPLATE, _strip_format_analysis, _split_text_into_segments

        # 分段处理（DeepSeek 支持更大上下文，每段 2000 字）
        segments = _split_text_into_segments(text, max_chars=2000)
        logger.info(f"[DeepSeek] Split into {len(segments)} segments, total {len(text)} chars")

        all_results = []

        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}"
        }

        for i, seg in enumerate(segments):
            logger.info(f"[DeepSeek] Processing segment {i+1}/{len(segments)} ({len(seg)} chars)")

            full_prompt = TEXT_FORMAT_PROMPT_TEMPLATE.format(text=seg)

            payload = {
                "model": model or deepseek_config.get("default_model", "deepseek-v4-pro"),
                "messages": [
                    {"role": "system", "content": "你是一个专业的文本处理助手。请根据用户提供的提示词处理文本。"},
                    {"role": "user", "content": full_prompt}
                ],
                "temperature": temperature,
                "max_tokens": max_tokens,
                "stream": False,
                "thinking": {"type": "disabled"}
            }

            try:
                response = requests.post(
                    f"{base_url}/chat/completions",
                    headers=headers,
                    json=payload,
                    timeout=timeout
                )
                response.raise_for_status()
                result = response.json()
                message = result["choices"][0]["message"]
                content = message.get("content") or message.get("reasoning_content", "")
                content = _strip_format_analysis(content, original_text=seg)
                logger.info(f"[DeepSeek] Segment {i+1} result: {len(content)} chars")
                all_results.append(content)

            except requests.exceptions.Timeout:
                raise RuntimeError(f"DeepSeek request timeout on segment {i+1}/{len(segments)}")
            except requests.exceptions.ConnectionError:
                raise RuntimeError("Cannot connect to DeepSeek API. Please check your network connection.")
            except requests.exceptions.HTTPError as e:
                status_code = e.response.status_code if hasattr(e, 'response') else 0
                if status_code == 401:
                    raise RuntimeError("DeepSeek API key is invalid or expired")
                elif status_code == 429:
                    raise RuntimeError("DeepSeek API rate limit exceeded. Please try again later.")
                else:
                    raise RuntimeError(f"DeepSeek API error: {str(e)}")
            except Exception as e:
                raise RuntimeError(f"DeepSeek API error on segment {i+1}: {str(e)}")

        final_text = '\n'.join(all_results).strip()
        logger.info(f"[DeepSeek] Merged: {len(segments)} segments → {len(final_text)} chars")
        return final_text
