"""
Real-ESRGAN 图片放大 API 处理器

POST /image/upscale  - 图片超分辨率放大
GET  /image/upscale/models - 获取可用模型列表
"""

import json
import logging
import tornado.web

from config import CONFIG
from handlers.common_handlers import CORSHandler, validate_api_key
from services.upscale_service import upscale_image, get_available_models

logger = logging.getLogger(__name__)


class UpscaleModelsHandler(CORSHandler):
    """获取可用的 Real-ESRGAN 放大模型列表"""

    def get(self):
        models = get_available_models()
        self.write({
            "models": models,
            "default_model": CONFIG["realesrgan"]["default_model"],
            "default_scale": CONFIG["realesrgan"]["default_scale"],
        })


class UpscaleHandler(CORSHandler):
    """图片超分辨率放大"""

    def post(self):
        cfg = CONFIG["realesrgan"]

        try:
            body = json.loads(self.request.body)
        except (json.JSONDecodeError, TypeError):
            self.set_status(400)
            self.write({"error": "Invalid JSON body"})
            return

        # 提取参数
        image_data = body.get("image") or body.get("image_data")
        if not image_data:
            self.set_status(400)
            self.write({"error": "Missing 'image' field (base64 encoded image)"})
            return

        model_name = body.get("model", cfg["default_model"])
        scale = body.get("scale", cfg["default_scale"])
        denoise_strength = float(body.get("denoise_strength", cfg["denoise_strength"]))
        output_format = body.get("output_format", "base64")

        logger.info(f"[Upscale] model={model_name}, scale={scale}, "
                     f"denoise={denoise_strength}, output={output_format}")

        try:
            result_b64, info = upscale_image(
                image_data=image_data,
                scale=scale,
                model_name=model_name,
                denoise_strength=denoise_strength,
            )
        except Exception as e:
            logger.error(f"[Upscale] Failed: {e}")
            self.set_status(500)
            self.write({"error": f"Upscale failed: {str(e)}"})
            return

        self.write({
            "image": result_b64,
            "info": info,
        })
