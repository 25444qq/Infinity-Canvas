import json
import math
import time
import uuid
import logging
import os
import base64

import tornado.web

from config import CONFIG
from services.flux2_service import Flux2KlienService
from handlers.common_handlers import CORSHandler, validate_api_key

logger = logging.getLogger(__name__)


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


def base64_encode_bytes(data):
    return base64.b64encode(data).decode("utf-8")


class Flux2ModelsHandler(CORSHandler):
    def get(self):
        available_models = Flux2KlienService.get_available_models()
        models_dir = CONFIG["flux2_models_dir"]
        data = []
        
        for model_id in available_models:
            model_info = {
                "id": model_id,
                "object": "model",
                "created": int(time.time()),
                "owned_by": "black-forest-labs",
                "type": "image_generation",
                "status": "loaded" if Flux2KlienService.is_loaded(model_id) else "not_loaded",
                "path": os.path.join(models_dir, model_id),
            }
            data.append(model_info)
        
        self.set_header("Content-Type", "application/json")
        self.write(json.dumps({"object": "list", "data": data}))


class Flux2GenerateHandler(CORSHandler):
    def post(self):
        if not validate_api_key(self.request, "image"):
            self.set_status(401)
            self.write(json.dumps({"error": {"message": "Invalid API key for image endpoints", "type": "invalid_request_error"}}))
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

            requested_model = body.get("model", CONFIG["flux2_default_model"])
            model = normalize_model_name(requested_model)
            n = min(max(body.get("n", 1), 1), 10)
            size_str = body.get("size", "1024x1024")
            width, height = parse_size(size_str)
            width = width or CONFIG["default_width"]
            height = height or CONFIG["default_height"]
            aspect_ratio = compute_aspect_ratio(width, height)

            response_format = body.get("response_format", "url")
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
                filename = f"{uuid.uuid4().hex}.png"
                filepath = Flux2KlienService.save_image(img, filename)
                b64 = Flux2KlienService.pil_to_base64(img)
                data.append({"b64_json": b64})

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
            body["model"] = self.get_argument("model", CONFIG["flux2_default_model"])
        if "n" in self.request.arguments:
            body["n"] = int(self.get_argument("n", "1"))
        if "size" in self.request.arguments:
            body["size"] = self.get_argument("size", "1024x1024")
        if "response_format" in self.request.arguments:
            body["response_format"] = self.get_argument("response_format", "url")
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


class Flux2EditHandler(CORSHandler):
    def post(self):
        if not validate_api_key(self.request, "image"):
            self.set_status(401)
            self.write(json.dumps({"error": {"message": "Invalid API key for image endpoints", "type": "invalid_request_error"}}))
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

            requested_model = body.get("model", CONFIG["flux2_default_model"])
            model = normalize_model_name(requested_model)
            n = min(max(body.get("n", 1), 1), 10)
            size_str = body.get("size", "1024x1024")
            width, height = parse_size(size_str)
            width = width or CONFIG["default_width"]
            height = height or CONFIG["default_height"]
            aspect_ratio = compute_aspect_ratio(width, height)

            response_format = body.get("response_format", "url")
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
                filename = f"{uuid.uuid4().hex}.png"
                filepath = Flux2KlienService.save_image(img, filename)
                b64 = Flux2KlienService.pil_to_base64(img)
                data.append({"b64_json": b64})

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
            body["model"] = self.get_argument("model", CONFIG["flux2_default_model"])
        if "n" in self.request.arguments:
            body["n"] = int(self.get_argument("n", "1"))
        if "size" in self.request.arguments:
            body["size"] = self.get_argument("size", "1024x1024")
        if "response_format" in self.request.arguments:
            body["response_format"] = self.get_argument("response_format", "url")
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


class Flux2VariationHandler(CORSHandler):
    def post(self):
        if not validate_api_key(self.request, "image"):
            self.set_status(401)
            self.write(json.dumps({"error": {"message": "Invalid API key for image endpoints", "type": "invalid_request_error"}}))
            return

        try:
            content_type = self.request.headers.get("Content-Type", "")
            if "multipart/form-data" in content_type:
                body = self._parse_multipart()
            else:
                body = json.loads(self.request.body)

            requested_model = body.get("model", CONFIG["flux2_default_model"])
            model = normalize_model_name(requested_model)
            n = min(max(body.get("n", 1), 1), 10)
            size_str = body.get("size", "1024x1024")
            width, height = parse_size(size_str)
            width = width or CONFIG["default_width"]
            height = height or CONFIG["default_height"]
            aspect_ratio = compute_aspect_ratio(width, height)

            response_format = body.get("response_format", "url")
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
                filename = f"{uuid.uuid4().hex}.png"
                filepath = Flux2KlienService.save_image(img, filename)
                b64 = Flux2KlienService.pil_to_base64(img)
                data.append({"b64_json": b64})

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
            body["model"] = self.get_argument("model", CONFIG["flux2_default_model"])
        if "n" in self.request.arguments:
            body["n"] = int(self.get_argument("n", "1"))
        if "size" in self.request.arguments:
            body["size"] = self.get_argument("size", "1024x1024")
        if "response_format" in self.request.arguments:
            body["response_format"] = self.get_argument("response_format", "url")
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
