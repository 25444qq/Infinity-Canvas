"""
Tornado 一体化服务器
- 托管 React 前端静态文件 (dist/)
- 提供 AI 服务 API (图片生成 / 音频生成 / 文本分析)
- 模型配置管理
"""

import os
import json
import logging
import tornado.ioloop
import tornado.web
import tornado.httpserver
from pathlib import Path

from services.model_config import (
    get_all_models, get_model_config, save_model_config,
    register_custom_model, delete_model, get_visible_models,
)
from services.image_service import generate_image
from services.audio_service import generate_audio
from services.text_service import generate_creative_description, generate_text_analyze, generate_novel_lines

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# 获取项目根目录
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DIST_DIR = os.path.join(BASE_DIR, "dist")


class BaseHandler(tornado.web.RequestHandler):
    """基础 Handler，统一 JSON 响应"""

    def set_default_headers(self):
        self.set_header("Access-Control-Allow-Origin", "*")
        self.set_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.set_header("Access-Control-Allow-Headers", "Content-Type, Authorization")

    def options(self, *args, **kwargs):
        self.set_status(204)
        self.finish()

    def write_json(self, data, status=200):
        self.set_header("Content-Type", "application/json")
        self.set_status(status)
        self.finish(json.dumps(data, ensure_ascii=False))

    def write_error(self, status_code, data):
        self.set_header("Content-Type", "application/json")
        self.set_status(status_code)
        self.finish(json.dumps({"error": str(data)}, ensure_ascii=False))


# ==================== 模型管理 API ====================

class ModelListHandler(BaseHandler):
    """GET /api/models - 获取所有模型"""
    def get(self):
        models = get_visible_models()
        registry = get_all_models()
        result = {k: registry[k] for k in models if k in registry}
        self.write_json(result)


class ModelConfigHandler(BaseHandler):
    """GET/POST /api/models/<name>/config - 模型配置 CRUD"""
    def get(self, model_name):
        config = get_model_config(model_name)
        self.write_json(config)

    def post(self, model_name):
        try:
            config = json.loads(self.request.body.decode("utf-8"))
            save_model_config(model_name, config)
            self.write_json({"status": "ok"})
        except Exception as e:
            self.write_error(400, str(e))


class CustomModelHandler(BaseHandler):
    """POST /api/models/custom - 注册自定义模型"""
    def post(self):
        try:
            data = json.loads(self.request.body.decode("utf-8"))
            key = data.get("key")
            model_def = data.get("model")
            if not key or not model_def:
                self.write_error(400, "Missing key or model definition")
                return
            register_custom_model(key, model_def)
            self.write_json({"status": "ok"})
        except Exception as e:
            self.write_error(400, str(e))


class DeleteModelHandler(BaseHandler):
    """DELETE /api/models/<name> - 删除模型"""
    def delete(self, model_name):
        success = delete_model(model_name)
        if success:
            self.write_json({"status": "ok"})
        else:
            self.write_error(404, f"Model '{model_name}' not found")


class AllConfigsHandler(BaseHandler):
    """GET /api/configs - 获取所有模型配置; POST /api/configs - 批量保存配置"""
    def get(self):
        all_models = get_visible_models()
        configs = {}
        for name in all_models:
            configs[name] = get_model_config(name)
        self.write_json(configs)

    def post(self):
        try:
            data = json.loads(self.request.body.decode("utf-8"))
            for name, config in data.items():
                save_model_config(name, config)
            self.write_json({"status": "ok"})
        except Exception as e:
            self.write_error(400, str(e))


# ==================== AI 服务 API ====================

class ImageGenerateHandler(BaseHandler):
    """POST /api/image/generate - 图片生成"""
    async def post(self):
        try:
            data = json.loads(self.request.body.decode("utf-8"))
            prompt = data.get("prompt", "")
            aspect_ratio = data.get("aspectRatio", "1:1")
            model_name = data.get("model", "Flux2")
            resolution = data.get("resolution", "1k")
            count = data.get("count", 1)
            input_images = data.get("inputImages", [])
            prompt_optimize = data.get("promptOptimize", False)

            logger.info(f"[API] Image Generate: model={model_name}, count={count}")
            results = await generate_image(
                prompt=prompt,
                aspect_ratio=aspect_ratio,
                model_name=model_name,
                resolution=resolution,
                count=count,
                input_images=input_images,
                prompt_optimize=prompt_optimize,
            )
            self.write_json({"images": results})
        except Exception as e:
            logger.exception("Image generation failed")
            self.write_error(500, str(e))


class AudioGenerateHandler(BaseHandler):
    """POST /api/audio/tts - 音频生成"""
    async def post(self):
        try:
            data = json.loads(self.request.body.decode("utf-8"))
            prompt = data.get("prompt", "")
            model_name = data.get("model", "Qwen3-TTS")
            emotion = data.get("emotion")
            ref_audio = data.get("refAudio")
            language = data.get("language")
            preset_voice = data.get("presetVoice")
            instruction = data.get("instruction")

            logger.info(f"[API] Audio Generate: model={model_name}")
            result = await generate_audio(
                prompt=prompt,
                model_name=model_name,
                emotion=emotion,
                ref_audio=ref_audio,
                language=language,
                preset_voice=preset_voice,
                instruction=instruction,
            )
            self.write_json({"audioUrl": result})
        except Exception as e:
            logger.exception("Audio generation failed")
            self.write_error(500, str(e))


class TextOptimizeHandler(BaseHandler):
    """POST /api/text/optimize - 创意描述优化"""
    async def post(self):
        try:
            data = json.loads(self.request.body.decode("utf-8"))
            input_text = data.get("prompt", "")
            logger.info(f"[API] Text Optimize: {len(input_text)} chars")
            result = await generate_creative_description(input_text)
            self.write_json({"optimized": result})
        except Exception as e:
            logger.exception("Text optimization failed")
            self.write_error(500, str(e))


class TextAnalyzeHandler(BaseHandler):
    """POST /api/text/analyze - 文本格式化/分析"""
    async def post(self):
        try:
            data = json.loads(self.request.body.decode("utf-8"))
            text_content = data.get("text", "")
            model_name = data.get("model", "Qwen3.5-27B")

            logger.info(f"[API] Text Analyze: model={model_name}, {len(text_content)} chars")
            result = await generate_text_analyze(
                text_content=text_content,
                model_name=model_name,
            )
            self.write_json({"result": result})
        except Exception as e:
            logger.exception("Text analysis failed")
            self.write_error(500, str(e))


class NovelLinesHandler(BaseHandler):
    """POST /api/text/lines - 小说文本分行处理"""
    async def post(self):
        try:
            data = json.loads(self.request.body.decode("utf-8"))
            text_content = data.get("text", "")
            model_name = data.get("model", "Qwen3.5-27B")

            logger.info(f"[API] Novel Lines: model={model_name}, {len(text_content)} chars")
            result = await generate_novel_lines(
                text_content=text_content,
                model_name=model_name,
            )
            self.write_json(result)
        except Exception as e:
            logger.exception("Novel lines processing failed")
            self.write_error(500, str(e))


# ==================== 静态文件托管 ====================

class FallbackHandler(tornado.web.RequestHandler):
    """
    SPA fallback: 对于非 API、非静态资源路径，返回 index.html
    让 React Router 处理前端路由
    """
    def get(self):
        index_path = os.path.join(DIST_DIR, "index.html")
        if os.path.isfile(index_path):
            self.set_header("Content-Type", "text/html; charset=utf-8")
            with open(index_path, "r", encoding="utf-8") as f:
                self.write(f.read())
        else:
            self.set_status(404)
            self.finish("<h1>404 - Build not found. Please run 'npm run build' first.</h1>")


class OutputsProxyHandler(BaseHandler):
    """代理 /outputs/ 请求到后端服务器"""
    async def get(self, filename):
        import aiohttp
        
        # 获取后端服务器地址
        backend_url = os.environ.get("DEFAULT_API_BASE_URL", "http://localhost:8080")
        url = f"{backend_url}/outputs/{filename}"
        
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(url) as resp:
                    if resp.status == 200:
                        # 设置正确的 Content-Type
                        content_type = resp.headers.get("Content-Type", "application/octet-stream")
                        self.set_header("Content-Type", content_type)
                        
                        # 读取并返回音频数据
                        data = await resp.read()
                        self.write(data)
                    else:
                        self.set_status(resp.status)
                        self.write_error(resp.status, f"File not found: {filename}")
        except Exception as e:
            logger.error(f"Error proxying /outputs/{filename}: {e}")
            self.set_status(500)
            self.write_error(500, str(e))


class ImageUpscaleProxyHandler(BaseHandler):
    """代理 /image/upscale* 请求到后端服务器 (Real-ESRGAN)"""
    async def _proxy(self, method):
        import aiohttp
        backend_url = os.environ.get("DEFAULT_API_BASE_URL", "http://localhost:8080")
        url = f"{backend_url}{self.request.path}"
        
        try:
            headers = {"Content-Type": "application/json"}
            body = self.request.body or b"{}"
            
            async with aiohttp.ClientSession() as session:
                async with session.request(
                    method, url, data=body, headers=headers,
                    timeout=aiohttp.ClientTimeout(total=300)
                ) as resp:
                    result = await resp.json()
                    self.set_status(resp.status)
                    self.write_json(result)
        except Exception as e:
            logger.error(f"Error proxying {self.request.path}: {e}")
            self.set_status(500)
            self.write_error(500, str(e))

    async def get(self):
        await self._proxy("GET")

    async def post(self):
        await self._proxy("POST")


class AudioMergeHandler(BaseHandler):
    """POST /api/audio/merge - 合并音频文件"""
    async def post(self):
        import aiohttp
        try:
            data = json.loads(self.request.body.decode("utf-8"))
            backend_url = os.environ.get("DEFAULT_API_BASE_URL", "http://localhost:8080")
            url = f"{backend_url}/audio/merge"

            logger.info(f"[API] Audio Merge: {len(data.get('audio_files', []))} files")

            headers = {"Content-Type": "application/json"}
            # 合并音频是本地操作，使用本地 API key
            local_api_key = os.environ.get("GENE_API_KEY", "sk-api-000000")
            if local_api_key:
                headers["Authorization"] = f"Bearer {local_api_key}"

            async with aiohttp.ClientSession() as session:
                async with session.post(url, json=data, headers=headers,
                                        timeout=aiohttp.ClientTimeout(total=300)) as resp:
                    result = await resp.json()
                    if resp.status != 200:
                        error_msg = result.get("error", {}).get("message", "Merge failed")
                        self.set_status(resp.status)
                        self.write_error(resp.status, str(error_msg))
                        return
                    self.write_json(result)
        except Exception as e:
            logger.exception("Audio merge failed")
            self.write_error(500, str(e))


def make_app():
    return tornado.web.Application([
        # 模型管理 API
        (r"/api/models", ModelListHandler),
        (r"/api/models/custom", CustomModelHandler),
        (r"/api/models/([^/]+)/config", ModelConfigHandler),
        (r"/api/models/([^/]+)", DeleteModelHandler),
        (r"/api/configs", AllConfigsHandler),

        # AI 服务 API
        (r"/api/image/generate", ImageGenerateHandler),
        (r"/api/audio/tts", AudioGenerateHandler),
        (r"/api/audio/merge", AudioMergeHandler),
        (r"/api/text/optimize", TextOptimizeHandler),
        (r"/api/text/analyze", TextAnalyzeHandler),
        (r"/api/text/lines", NovelLinesHandler),

        # 输出文件代理（转发到后端服务器）
        (r"/outputs/(.*)", OutputsProxyHandler),

        # 图片放大代理（转发到后端服务器 Real-ESRGAN）
        (r"/image/upscale/models", ImageUpscaleProxyHandler),
        (r"/image/upscale/?", ImageUpscaleProxyHandler),

        # 静态文件托管 (dist 目录)
        (r"/(.*)", tornado.web.StaticFileHandler, {
            "path": DIST_DIR,
            "default_filename": "index.html",
        }),
    ])


def main():
    port = int(os.environ.get("PORT", 8090))
    app = make_app()
    server = tornado.httpserver.HTTPServer(app)
    server.listen(port)

    logger.info(f"=" * 60)
    logger.info(f"  Infinity Canvas 已启动")
    logger.info(f"  地址: http://localhost:{port}")
    logger.info(f"  前端目录: {DIST_DIR}")
    if os.path.isdir(DIST_DIR):
        logger.info(f"  前端状态: 已构建")
    else:
        logger.info(f"  前端状态: 未构建 (请运行 'npm run build')")
    logger.info(f"=" * 60)

    tornado.ioloop.IOLoop.current().start()


if __name__ == "__main__":
    main()
