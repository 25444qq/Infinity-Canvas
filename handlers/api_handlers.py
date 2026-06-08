import json
import math
import time
import uuid
import logging
import os
import io

import tornado.web

from pydub import AudioSegment

from config import CONFIG
from services.flux2_service import Flux2KlienService

logger = logging.getLogger(__name__)


CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
}


class CORSHandler(tornado.web.RequestHandler):
    def set_default_headers(self):
        for key, value in CORS_HEADERS.items():
            self.set_header(key, value)

    def options(self):
        self.set_status(204)
        self.finish()


def normalize_model_name(model_name):
    if not model_name:
        return CONFIG["flux2_default_model"]
    available = Flux2KlienService.get_available_models()
    if model_name in available:
        return model_name
    name_lower = model_name.lower()
    for m in available:
        if m.lower() == name_lower:
            return m
    import re
    param_match = re.search(r'(\d+b)', name_lower)
    if param_match:
        param_size = param_match.group(1)
        for m in available:
            if param_size in m.lower():
                return m
    name_normalized = name_lower.replace(".", "").replace("-", "").replace(" ", "")
    for m in available:
        m_normalized = m.lower().replace(".", "").replace("-", "").replace(" ", "")
        if name_normalized == m_normalized:
            return m
    for m in available:
        m_normalized = m.lower().replace(".", "").replace("-", "").replace(" ", "")
        if name_normalized in m_normalized or m_normalized in name_normalized:
            return m
    logger.warning(f"Model '{model_name}' not found, available: {available}, falling back to default '{CONFIG['flux2_default_model']}'")
    return CONFIG["flux2_default_model"]


def compute_aspect_ratio(width, height):
    if not width or not height:
        return "unknown"
    g = math.gcd(width, height)
    return f"{width // g}:{height // g}"


def parse_size(size_str):
    if not size_str:
        return None, None
    parts = size_str.lower().split("x")
    if len(parts) == 2:
        return int(parts[0]), int(parts[1])
    return None, None


def resolve_image(body):
    image_data = body.get("image") or body.get("image_url")
    if image_data and Flux2KlienService.base64_to_pil(image_data) is None:
        raise ValueError("Failed to decode image data, please check the base64 encoding")
    return Flux2KlienService.resolve_images(body)


def validate_api_key(request):
    api_key = CONFIG.get("api_key", "")
    if not api_key:
        return True
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header[7:]
        return token == api_key
    return False


class ModelsHandler(CORSHandler):
    def get(self):
        models = [
            {
                "id": CONFIG["model_name"],
                "object": "model",
                "created": int(time.time()),
                "owned_by": "black-forest-labs",
            }
        ]
        self.set_header("Content-Type", "application/json")
        self.write(json.dumps({"object": "list", "data": models}))


class ImageModelsHandler(CORSHandler):
    def get(self):
        from services.flux2_service import Flux2KlienService
        
        model_info = {
            "id": CONFIG["model_name"],
            "object": "model",
            "created": int(time.time()),
            "owned_by": "black-forest-labs",
            "type": "image_generation",
            "status": "loaded" if Flux2KlienService.is_loaded() else "not_loaded",
            "path": CONFIG.get("model_path", ""),
        }
        
        self.set_header("Content-Type", "application/json")
        self.write(json.dumps({"object": "list", "data": [model_info]}))


class AudioModelsHandler(CORSHandler):
    def get(self):
        from services.audio_service import is_qwen_tts_loaded
        
        model_name = CONFIG.get("qwen_tts_model_name", "Qwen3-TTS-12Hz-1.7B")
        model_path = CONFIG.get("qwen_tts_model_path", "")
        
        model_info = {
            "id": model_name,
            "object": "model",
            "created": int(time.time()),
            "owned_by": "qwen",
            "type": "text_to_speech",
            "status": "loaded" if is_qwen_tts_loaded() else "not_loaded",
            "path": model_path,
        }
        
        self.set_header("Content-Type", "application/json")
        self.write(json.dumps({"object": "list", "data": [model_info]}))


class TextModelsHandler(CORSHandler):
    def get(self):
        from services.novel_service import is_novel_model_loaded, get_loaded_model_name
        
        model_name = CONFIG.get("novel_model_name", "Qwen3.5-27B-Q4_K_M")
        model_path = CONFIG.get("novel_model_path", "")
        
        models = []
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
        
        self.set_header("Content-Type", "application/json")
        self.write(json.dumps({"object": "list", "data": models}))


class ImageGenerationsHandler(CORSHandler):
    def post(self):
        if not validate_api_key(self.request):
            self.set_status(401)
            self.write(json.dumps({"error": {"message": "Invalid API key", "type": "invalid_request_error"}}))
            return

        try:
            content_type = self.request.headers.get("Content-Type", "")
            if "multipart/form-data" in content_type:
                body = self._parse_multipart()
            else:
                body = json.loads(self.request.body)

            prompt = body.get("prompt", "")
            if not prompt:
                self.set_status(400)
                self.write(json.dumps({"error": {"message": "prompt is required", "type": "invalid_request_error"}}))
                return

            requested_model = body.get("model", CONFIG["model_name"])
            model = normalize_model_name(requested_model)
            n = min(max(body.get("n", 1), 1), 10)
            size_str = body.get("size", "1024x1024")
            width, height = parse_size(size_str)
            width = width or CONFIG["default_width"]
            height = height or CONFIG["default_height"]
            aspect_ratio = compute_aspect_ratio(width, height)

            response_format = body.get("response_format", "b64_json")
            seed = body.get("seed", None)
            if seed is not None:
                seed = int(seed)

            guidance_scale = body.get("guidance_scale", None)
            if guidance_scale is not None:
                guidance_scale = float(guidance_scale)

            num_inference_steps = body.get("num_inference_steps", None)
            if num_inference_steps is not None:
                num_inference_steps = int(num_inference_steps)

            ref_image = resolve_image(body)

            logger.info(f"[ImageGenerate] requested_model='{requested_model}', resolved_model='{model}', resolution={width}x{height}, aspect_ratio={aspect_ratio}, n={n}, seed={seed}, guidance_scale={guidance_scale}, steps={num_inference_steps}")
            if requested_model != model:
                logger.info(f"[ImageGenerate] Model name normalized: '{requested_model}' -> '{model}'")

            Flux2KlienService.load_model(model)

            images = Flux2KlienService.generate(
                prompt=prompt,
                image=ref_image,
                height=height,
                width=width,
                guidance_scale=guidance_scale,
                num_inference_steps=num_inference_steps,
                seed=seed,
                n=n,
                model_name=model,
            )

            data = []
            for img in images:
                if response_format == "b64_json":
                    b64 = Flux2KlienService.pil_to_base64(img)
                    data.append({"b64_json": b64})
                else:
                    filename = f"{uuid.uuid4().hex}.png"
                    filepath = Flux2KlienService.save_image(img, filename)
                    url = f"/outputs/{filename}"
                    data.append({"url": url})

            response = {
                "created": int(time.time()),
                "data": data,
            }
            self.set_header("Content-Type", "application/json")
            self.write(json.dumps(response))

        except Exception as e:
            logger.exception("Error generating image")
            self.set_status(500)
            self.write(json.dumps({"error": {"message": str(e), "type": "server_error"}}))

    def _parse_multipart(self):
        body = {}
        if "prompt" in self.request.arguments:
            body["prompt"] = self.get_argument("prompt", "")
        if "model" in self.request.arguments:
            body["model"] = self.get_argument("model", CONFIG["model_name"])
        if "n" in self.request.arguments:
            body["n"] = int(self.get_argument("n", "1"))
        if "size" in self.request.arguments:
            body["size"] = self.get_argument("size", "1024x1024")
        if "response_format" in self.request.arguments:
            body["response_format"] = self.get_argument("response_format", "b64_json")
        if "seed" in self.request.arguments:
            body["seed"] = int(self.get_argument("seed", "0"))
        if "guidance_scale" in self.request.arguments:
            body["guidance_scale"] = float(self.get_argument("guidance_scale", "1.0"))
        if "num_inference_steps" in self.request.arguments:
            body["num_inference_steps"] = int(self.get_argument("num_inference_steps", "4"))

        if "image" in self.request.files:
            file_info = self.request.files["image"][0]
            b64 = base64_encode_bytes(file_info["body"])
            body["image"] = f"data:{file_info['content_type']};base64,{b64}"

        return body


class ImageEditsHandler(CORSHandler):
    def post(self):
        if not validate_api_key(self.request):
            self.set_status(401)
            self.write(json.dumps({"error": {"message": "Invalid API key", "type": "invalid_request_error"}}))
            return

        try:
            content_type = self.request.headers.get("Content-Type", "")
            if "multipart/form-data" in content_type:
                body = self._parse_multipart()
            else:
                body = json.loads(self.request.body)

            prompt = body.get("prompt", "")
            if not prompt:
                self.set_status(400)
                self.write(json.dumps({"error": {"message": "prompt is required", "type": "invalid_request_error"}}))
                return

            requested_model = body.get("model", CONFIG["model_name"])
            model = normalize_model_name(requested_model)
            n = min(max(body.get("n", 1), 1), 10)
            size_str = body.get("size", "1024x1024")
            width, height = parse_size(size_str)
            width = width or CONFIG["default_width"]
            height = height or CONFIG["default_height"]
            aspect_ratio = compute_aspect_ratio(width, height)

            response_format = body.get("response_format", "b64_json")
            seed = body.get("seed", None)
            if seed is not None:
                seed = int(seed)

            guidance_scale = body.get("guidance_scale", None)
            if guidance_scale is not None:
                guidance_scale = float(guidance_scale)

            num_inference_steps = body.get("num_inference_steps", None)
            if num_inference_steps is not None:
                num_inference_steps = int(num_inference_steps)

            ref_image = resolve_image(body)

            if ref_image is None:
                self.set_status(400)
                self.write(json.dumps({"error": {"message": "image is required for edits", "type": "invalid_request_error"}}))
                return

            logger.info(f"[ImageEdit] requested_model='{requested_model}', resolved_model='{model}', resolution={width}x{height}, aspect_ratio={aspect_ratio}, n={n}, seed={seed}, guidance_scale={guidance_scale}, steps={num_inference_steps}")
            if requested_model != model:
                logger.info(f"[ImageEdit] Model name normalized: '{requested_model}' -> '{model}'")

            Flux2KlienService.load_model(model)

            images = Flux2KlienService.generate(
                prompt=prompt,
                image=ref_image,
                height=height,
                width=width,
                guidance_scale=guidance_scale,
                num_inference_steps=num_inference_steps,
                seed=seed,
                n=n,
                model_name=model,
            )

            data = []
            for img in images:
                if response_format == "b64_json":
                    b64 = Flux2KlienService.pil_to_base64(img)
                    data.append({"b64_json": b64})
                else:
                    filename = f"{uuid.uuid4().hex}.png"
                    filepath = Flux2KlienService.save_image(img, filename)
                    url = f"/outputs/{filename}"
                    data.append({"url": url})

            response = {
                "created": int(time.time()),
                "data": data,
            }
            self.set_header("Content-Type", "application/json")
            self.write(json.dumps(response))

        except Exception as e:
            logger.exception("Error editing image")
            self.set_status(500)
            self.write(json.dumps({"error": {"message": str(e), "type": "server_error"}}))

    def _parse_multipart(self):
        body = {}
        if "prompt" in self.request.arguments:
            body["prompt"] = self.get_argument("prompt", "")
        if "model" in self.request.arguments:
            body["model"] = self.get_argument("model", CONFIG["model_name"])
        if "n" in self.request.arguments:
            body["n"] = int(self.get_argument("n", "1"))
        if "size" in self.request.arguments:
            body["size"] = self.get_argument("size", "1024x1024")
        if "response_format" in self.request.arguments:
            body["response_format"] = self.get_argument("response_format", "b64_json")
        if "seed" in self.request.arguments:
            body["seed"] = int(self.get_argument("seed", "0"))
        if "guidance_scale" in self.request.arguments:
            body["guidance_scale"] = float(self.get_argument("guidance_scale", "1.0"))
        if "num_inference_steps" in self.request.arguments:
            body["num_inference_steps"] = int(self.get_argument("num_inference_steps", "4"))
        if "image" in self.request.files:
            file_info = self.request.files["image"][0]
            b64 = base64_encode_bytes(file_info["body"])
            body["image"] = f"data:{file_info['content_type']};base64,{b64}"

        return body


class ImageVariationsHandler(CORSHandler):
    def post(self):
        if not validate_api_key(self.request):
            self.set_status(401)
            self.write(json.dumps({"error": {"message": "Invalid API key", "type": "invalid_request_error"}}))
            return

        try:
            content_type = self.request.headers.get("Content-Type", "")
            if "multipart/form-data" in content_type:
                body = self._parse_multipart()
            else:
                body = json.loads(self.request.body)

            requested_model = body.get("model", CONFIG["model_name"])
            model = normalize_model_name(requested_model)
            n = min(max(body.get("n", 1), 1), 10)
            size_str = body.get("size", "1024x1024")
            width, height = parse_size(size_str)
            width = width or CONFIG["default_width"]
            height = height or CONFIG["default_height"]
            aspect_ratio = compute_aspect_ratio(width, height)

            response_format = body.get("response_format", "b64_json")
            seed = body.get("seed", None)
            if seed is not None:
                seed = int(seed)

            guidance_scale = body.get("guidance_scale", None)
            if guidance_scale is not None:
                guidance_scale = float(guidance_scale)

            num_inference_steps = body.get("num_inference_steps", None)
            if num_inference_steps is not None:
                num_inference_steps = int(num_inference_steps)

            ref_image = resolve_image(body)

            if ref_image is None:
                self.set_status(400)
                self.write(json.dumps({"error": {"message": "image is required for variations", "type": "invalid_request_error"}}))
                return

            prompt = ""
            logger.info(f"[ImageVariation] requested_model='{requested_model}', resolved_model='{model}', resolution={width}x{height}, aspect_ratio={aspect_ratio}, n={n}, seed={seed}, guidance_scale={guidance_scale}, steps={num_inference_steps}")
            if requested_model != model:
                logger.info(f"[ImageVariation] Model name normalized: '{requested_model}' -> '{model}'")

            Flux2KlienService.load_model(model)

            images = Flux2KlienService.generate(
                prompt=prompt,
                image=ref_image,
                height=height,
                width=width,
                guidance_scale=guidance_scale,
                num_inference_steps=num_inference_steps,
                seed=seed,
                n=n,
                model_name=model,
            )

            data = []
            for img in images:
                if response_format == "b64_json":
                    b64 = Flux2KlienService.pil_to_base64(img)
                    data.append({"b64_json": b64})
                else:
                    filename = f"{uuid.uuid4().hex}.png"
                    filepath = Flux2KlienService.save_image(img, filename)
                    url = f"/outputs/{filename}"
                    data.append({"url": url})

            response = {
                "created": int(time.time()),
                "data": data,
            }
            self.set_header("Content-Type", "application/json")
            self.write(json.dumps(response))

        except Exception as e:
            logger.exception("Error generating variation")
            self.set_status(500)
            self.write(json.dumps({"error": {"message": str(e), "type": "server_error"}}))

    def _parse_multipart(self):
        body = {}
        if "model" in self.request.arguments:
            body["model"] = self.get_argument("model", CONFIG["model_name"])
        if "n" in self.request.arguments:
            body["n"] = int(self.get_argument("n", "1"))
        if "size" in self.request.arguments:
            body["size"] = self.get_argument("size", "1024x1024")
        if "response_format" in self.request.arguments:
            body["response_format"] = self.get_argument("response_format", "b64_json")
        if "seed" in self.request.arguments:
            body["seed"] = int(self.get_argument("seed", "0"))
        if "guidance_scale" in self.request.arguments:
            body["guidance_scale"] = float(self.get_argument("guidance_scale", "1.0"))
        if "num_inference_steps" in self.request.arguments:
            body["num_inference_steps"] = int(self.get_argument("num_inference_steps", "4"))

        if "image" in self.request.files:
            file_info = self.request.files["image"][0]
            b64 = base64_encode_bytes(file_info["body"])
            body["image"] = f"data:{file_info['content_type']};base64,{b64}"

        return body


class HealthHandler(CORSHandler):
    def get(self):
        self.set_header("Content-Type", "application/json")
        self.write(json.dumps({
            "status": "ok",
            "model_loaded": Flux2KlienService.is_loaded(),
            "model": CONFIG["model_name"],
        }))


class NovelAnalysisHandler(CORSHandler):
    def post(self):
        if not validate_api_key(self.request):
            self.set_status(401)
            self.write(json.dumps({"error": {"message": "Invalid API key", "type": "invalid_request_error"}}))
            return

        try:
            from services.novel_service import is_novel_model_loaded, load_novel_model, analyze_novel, get_loaded_model_name

            body = json.loads(self.request.body)

            text_b64 = body.get("text", "")
            if not text_b64:
                self.set_status(400)
                self.write(json.dumps({"error": {"message": "text is required", "type": "invalid_request_error"}}))
                return

            try:
                import base64
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
                "data": result,
            }

            self.set_header("Content-Type", "application/json")
            self.write(json.dumps(response, ensure_ascii=False))

        except Exception as e:
            logger.exception("Error analyzing novel")
            self.set_status(500)
            self.write(json.dumps({"error": {"message": str(e), "type": "server_error"}}))


class NovelModelsHandler(CORSHandler):
    def get(self):
        import os
        models = []
        model_path = CONFIG.get("novel_model_path", "")
        model_name = CONFIG.get("novel_model_name", "Qwen3.5-27B-Q4_K_M")
        
        if model_path and os.path.exists(model_path):
            file_size = os.path.getsize(model_path)
            file_ext = os.path.splitext(model_path)[1].lower()
            models.append({
                "id": model_name,
                "object": "model",
                "created": int(os.path.getctime(model_path)),
                "owned_by": "qwen",
                "type": "novel_analysis",
                "path": model_path,
                "size_bytes": file_size,
                "size_human": f"{file_size / (1024**3):.2f} GB",
                "format": "gguf" if file_ext == ".gguf" else "transformers",
                "status": "available"
            })
        else:
            models.append({
                "id": model_name,
                "object": "model",
                "created": 0,
                "owned_by": "qwen",
                "type": "novel_analysis",
                "status": "not_found",
                "error": f"Model file not found: {model_path}"
            })
        
        self.set_header("Content-Type", "application/json")
        self.write(json.dumps({"object": "list", "data": models}))


class NovelLineProcessingHandler(CORSHandler):
    def post(self):
        if not validate_api_key(self.request):
            self.set_status(401)
            self.write(json.dumps({"error": {"message": "Invalid API key", "type": "invalid_request_error"}}))
            return

        try:
            from services.novel_service import is_novel_model_loaded, load_novel_model, analyze_novel_lines, get_loaded_model_name

            body = json.loads(self.request.body)

            text_b64 = body.get("text", "")
            if not text_b64:
                self.set_status(400)
                self.write(json.dumps({"error": {"message": "text is required (base64 encoded)", "type": "invalid_request_error"}}))
                return

            try:
                import base64
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
                "data": result["lines"],
                "line_count": len(result["lines"]),
            }

            self.set_header("Content-Type", "application/json")
            self.write(json.dumps(response, ensure_ascii=False))

        except Exception as e:
            logger.exception("Error processing novel lines")
            self.set_status(500)
            self.write(json.dumps({"error": {"message": str(e), "type": "server_error"}}))


def base64_encode_bytes(data):
    import base64
    return base64.b64encode(data).decode("utf-8")


class AudioMergeHandler(CORSHandler):
    def post(self):
        if not validate_api_key(self.request):
            self.set_status(401)
            self.write(json.dumps({"error": {"message": "Invalid API key", "type": "invalid_request_error"}}))
            return

        try:
            body = json.loads(self.request.body)
            
            audio_files = body.get("audio_files", [])
            if not audio_files:
                self.set_status(400)
                self.write(json.dumps({"error": {"message": "audio_files is required", "type": "invalid_request_error"}}))
                return

            pause_seconds = body.get("pause_between", 0.3)
            pause_ms = int(pause_seconds * 1000)

            output_dir = CONFIG.get("output_dir", "/home/epic/imageGene/outputs")
            
            silence = AudioSegment.silent(duration=pause_ms, frame_rate=44100)

            segments = []
            for i, filename in enumerate(audio_files):
                filepath = os.path.join(output_dir, filename)
                if not os.path.exists(filepath):
                    self.set_status(404)
                    self.write(json.dumps({"error": {"message": f"Audio file not found: {filename}", "type": "invalid_request_error"}}))
                    return
                
                try:
                    segment = AudioSegment.from_file(filepath)
                    target_dBFS = -16
                    change_in_dBFS = target_dBFS - segment.dBFS
                    normalized = segment.apply_gain(change_in_dBFS)
                    segments.append(normalized)
                    logger.info(f"Loaded and normalized: {filename} (duration: {len(normalized)/1000:.2f}s)")
                except Exception as e:
                    self.set_status(400)
                    self.write(json.dumps({"error": {"message": f"Failed to load audio file {filename}: {str(e)}", "type": "invalid_request_error"}}))
                    return

            if not segments:
                self.set_status(400)
                self.write(json.dumps({"error": {"message": "No valid audio files found", "type": "invalid_request_error"}}))
                return

            combined = segments[0]
            for segment in segments[1:]:
                combined = combined + silence + segment
            
            logger.info(f"Merged {len(segments)} files with {pause_ms}ms pauses, total duration: {len(combined)/1000:.2f}s")

            output_filename = f"merged_{uuid.uuid4().hex}.wav"
            output_path = os.path.join(output_dir, output_filename)
            combined.export(output_path, format="wav", parameters=[
                "-ar", "44100",
                "-ac", "2",
                "-b:a", "128k"
            ])

            output_url = f"/outputs/{output_filename}"
            response = {
                "created": int(time.time()),
                "data": {
                    "filename": output_filename,
                    "url": output_url,
                    "duration": len(combined)/1000,
                    "files_merged": len(audio_files),
                    "pause_between_ms": pause_ms
                }
            }

            self.set_header("Content-Type", "application/json")
            self.write(json.dumps(response))

        except json.JSONDecodeError:
            self.set_status(400)
            self.write(json.dumps({"error": {"message": "Invalid JSON format", "type": "invalid_request_error"}}))
        except Exception as e:
            logger.exception("Error merging audio")
            self.set_status(500)
            self.write(json.dumps({"error": {"message": str(e), "type": "server_error"}}))
