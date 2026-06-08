import json
import time
import logging
import os
import base64

import tornado.web

from config import CONFIG
from handlers.common_handlers import CORSHandler, validate_api_key

logger = logging.getLogger(__name__)


class QwenNovelModelsHandler(CORSHandler):
    def get(self):
        from services.novel_service import is_novel_model_loaded

        models = []
        
        # 本地 Qwen 模型
        model_name = CONFIG.get("novel_model_name", "Qwen3.5-27B-Q4_K_M")
        model_path = CONFIG.get("novel_model_path", "")
        
        if model_path and os.path.exists(model_path):
            file_size = os.path.getsize(model_path)
            file_ext = os.path.splitext(model_path)[1].lower()

            models.append({
                "id": model_name,
                "object": "model",
                "created": int(os.path.getctime(model_path)),
                "owned_by": "qwen",
                "type": "novel_analysis",
                "status": "loaded" if is_novel_model_loaded() else "not_loaded",
                "path": model_path,
                "size_bytes": file_size,
                "size_human": f"{file_size / (1024**3):.2f} GB",
                "format": "gguf" if file_ext == ".gguf" else "transformers",
            })
        else:
            models.append({
                "id": model_name,
                "object": "model",
                "created": 0,
                "owned_by": "qwen",
                "type": "novel_analysis",
                "status": "not_found",
                "path": model_path,
                "error": f"Model file not found: {model_path}"
            })

        # LM Studio 模型
        lm_config = CONFIG.get("lm_studio", {})
        if lm_config.get("enabled", False):
            models.append({
                "id": "lms-" + (lm_config.get("default_model", "unknown") or "unknown"),
                "object": "model",
                "created": 0,
                "owned_by": "lm-studio",
                "type": "novel_analysis",
                "status": "available",
                "provider": "lm-studio",
                "base_url": lm_config.get("base_url", "http://localhost:1234/v1"),
            })

        # DeepSeek 模型
        ds_config = CONFIG.get("deepseek", {})
        if ds_config.get("enabled", False):
            default_model = ds_config.get("default_model", "deepseek-v4-pro")
            models.append({
                "id": "deepseek-" + default_model.replace("deepseek-", ""),
                "object": "model",
                "created": 0,
                "owned_by": "deepseek",
                "type": "novel_analysis",
                "status": "available",
                "provider": "deepseek",
                "base_url": ds_config.get("base_url", "https://api.deepseek.com/v1"),
            })

        self.set_header("Content-Type", "application/json")
        self.write(json.dumps({"object": "list", "data": models}))


class QwenNovelAnalyzeHandler(CORSHandler):
    def post(self):
        try:
            body = json.loads(self.request.body)
        except Exception:
            self.set_status(400)
            self.write(json.dumps({"error": {"message": "Invalid JSON body", "type": "invalid_request_error"}}))
            return

        # DeepSeek 请求跳过本地 API key 验证
        model = body.get("model", None)
        provider = body.get("provider", None)
        if provider is None and model is not None:
            if model.startswith("lms-"):
                provider = "lm-studio"
            elif model.lower().startswith("deepseek-"):
                provider = "deepseek"

        if provider != "deepseek":
            if not validate_api_key(self.request, "text"):
                self.set_status(401)
                self.write(json.dumps({"error": {"message": "Invalid API key for text endpoints", "type": "invalid_request_error"}}))
                return

        try:

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
                logger.debug(f"Decoded text preview (first 200 chars): {novel_text[:200]}")
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

            if text_length > 20000:
                self.set_status(400)
                self.write(json.dumps({"error": {"message": "text is too long, maximum 20000 characters allowed", "type": "invalid_request_error"}}))
                return

            provider = body.get("provider", provider)
            model = body.get("model", model)
            
            if provider is None and model is not None:
                if model.startswith("lms-"):
                    provider = "lm-studio"
                elif model.lower().startswith("deepseek-"):
                    provider = "deepseek"
            
            if provider == "lm-studio":
                from handlers.lm_studio_handler import LMStudioAnalyzeHandler
                handler = LMStudioAnalyzeHandler.__new__(LMStudioAnalyzeHandler)
                handler.__dict__.update(self.__dict__)
                handler.post()
                return
            elif provider == "deepseek":
                from handlers.deepseek_handler import DeepSeekAnalyzeHandler
                handler = DeepSeekAnalyzeHandler.__new__(DeepSeekAnalyzeHandler)
                handler.__dict__.update(self.__dict__)
                handler.post()
                return
            
            from services.novel_service import is_novel_model_loaded, load_novel_model, analyze_novel, get_loaded_model_name

            model_name = body.get("model", None)

            if model_name:
                if not load_novel_model(model_name):
                    self.set_status(400)
                    self.write(json.dumps({"error": {"message": f"Failed to load model: {model_name}", "type": "invalid_request_error"}}))
                    return
            elif not is_novel_model_loaded():
                logger.info("Novel analysis model not loaded, loading default model...")
                if not load_novel_model():
                    self.set_status(503)
                    self.write(json.dumps({"error": {"message": "Novel analysis model failed to load", "type": "server_error"}}))
                    return

            current_model = model_name or get_loaded_model_name()
            logger.info(f"[NovelAnalyze] model='{current_model}', provider='local', text_length={text_length}")

            result = analyze_novel(
                novel_text=novel_text,
                model_name=current_model,
            )

            response = {
                "created": int(time.time()),
                "text_length": text_length,
                "model": current_model,
                "provider": "local",
                "data": result,
            }

            self.set_header("Content-Type", "application/json")
            self.write(json.dumps(response, ensure_ascii=False))

        except Exception as e:
            logger.exception("Error analyzing novel")
            self.set_status(500)
            self.write(json.dumps({"error": {"message": str(e), "type": "server_error"}}))


class QwenNovelLineProcessingHandler(CORSHandler):
    def post(self):
        # 先解析请求体判断是否为 DeepSeek 请求
        try:
            body = json.loads(self.request.body)
            model = body.get("model", "")
            is_deepseek = model.lower().startswith("deepseek-") if model else False
        except Exception:
            is_deepseek = False
            body = {}

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
                self.write(json.dumps({"error": {"message": "text is required (base64 encoded)", "type": "invalid_request_error"}}))
                return

            try:
                padding = 4 - len(text_b64) % 4
                if padding != 4:
                    text_b64 += "=" * padding
                novel_text = base64.b64decode(text_b64).decode("utf-8")
            except Exception:
                self.set_status(400)
                self.write(json.dumps({"error": {"message": "text is not valid base64 encoded UTF-8 string", "type": "invalid_request_error"}}))
                return

            text_length = len(novel_text)
            if text_length < 100:
                self.set_status(400)
                self.write(json.dumps({"error": {"message": "text is too short, at least 100 characters required", "type": "invalid_request_error"}}))
                return

            if text_length > 20000:
                self.set_status(400)
                self.write(json.dumps({"error": {"message": "text is too long, maximum 20000 characters allowed", "type": "invalid_request_error"}}))
                return

            provider = body.get("provider", None)
            model = body.get("model", None)
            
            if provider is None and model is not None:
                if model.startswith("lms-"):
                    provider = "lm-studio"
                elif model.lower().startswith("deepseek-"):
                    provider = "deepseek"
            
            if provider == "lm-studio":
                from handlers.lm_studio_handler import LMStudioLineProcessingHandler
                handler = LMStudioLineProcessingHandler.__new__(LMStudioLineProcessingHandler)
                handler.__dict__.update(self.__dict__)
                handler.post()
                return
            elif provider == "deepseek":
                from handlers.deepseek_handler import DeepSeekLineProcessingHandler
                handler = DeepSeekLineProcessingHandler.__new__(DeepSeekLineProcessingHandler)
                handler.__dict__.update(self.__dict__)
                handler.post()
                return
            
            from services.novel_service import is_novel_model_loaded, load_novel_model, analyze_novel_lines, get_loaded_model_name

            model_name = body.get("model", None)

            if model_name:
                if not load_novel_model(model_name):
                    self.set_status(400)
                    self.write(json.dumps({"error": {"message": f"Failed to load model: {model_name}", "type": "invalid_request_error"}}))
                    return
            elif not is_novel_model_loaded():
                logger.info("Novel line processing model not loaded, loading default model...")
                if not load_novel_model():
                    self.set_status(503)
                    self.write(json.dumps({"error": {"message": "Novel analysis model failed to load", "type": "server_error"}}))
                    return

            current_model = model_name or get_loaded_model_name()
            logger.info(f"[NovelLineProcess] model='{current_model}', provider='local', text_length={text_length}")

            result = analyze_novel_lines(
                novel_text=novel_text,
                model_name=current_model,
            )

            logger.info(f"[NovelLineProcess] completed, extracted {len(result['lines'])} lines")

            response = {
                "created": int(time.time()),
                "text_length": text_length,
                "model": current_model,
                "provider": "local",
                "data": result["lines"],
                "line_count": len(result["lines"]),
            }

            self.set_header("Content-Type", "application/json")
            self.write(json.dumps(response, ensure_ascii=False))

        except Exception as e:
            logger.exception("Error processing novel lines")
            self.set_status(500)
            self.write(json.dumps({"error": {"message": str(e), "type": "server_error"}}))
