import os
import logging
import tornado.ioloop
import tornado.web
import tornado.log

from config import CONFIG
from handlers import (
    HealthHandler,
    AudioMergeHandler,
    ApiDocsHandler,
    Flux2ModelsHandler,
    Flux2GenerateHandler,
    Flux2EditHandler,
    Flux2VariationHandler,
    QwenTTSHandler,
    QwenTTSVoicesHandler,
    QwenTTSStatusHandler,
    QwenAudioModelsHandler,
    QwenNovelModelsHandler,
    QwenNovelAnalyzeHandler,
    QwenNovelLineProcessingHandler,
    TextCompleteHandler,
    UpscaleHandler,
    UpscaleModelsHandler,
)
from services.flux2_service import Flux2KlienService
from services.model_manager import model_manager

logging.basicConfig(
    level=logging.DEBUG if CONFIG["debug"] else logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


class CORSStaticFileHandler(tornado.web.StaticFileHandler):
    def set_default_headers(self):
        self.set_header("Access-Control-Allow-Origin", "*")
        self.set_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.set_header("Access-Control-Allow-Methods", "GET, OPTIONS")

    def options(self):
        self.set_status(204)
        self.finish()


def make_app():
    return tornado.web.Application(
        [
            # Image endpoints (FLUX.2)
            (r"/image/models", Flux2ModelsHandler),
            (r"/image/generate", Flux2GenerateHandler),
            (r"/image/edit", Flux2EditHandler),
            (r"/image/variations", Flux2VariationHandler),

            # Image upscale (Real-ESRGAN)
            (r"/image/upscale", UpscaleHandler),
            (r"/image/upscale/models", UpscaleModelsHandler),

            # Audio endpoints (Qwen3-TTS)
            (r"/audio/tts", QwenTTSHandler),
            (r"/audio/voices", QwenTTSVoicesHandler),
            (r"/audio/status", QwenTTSStatusHandler),
            (r"/audio/models", QwenAudioModelsHandler),
            (r"/audio/merge", AudioMergeHandler),

            # Text endpoints (Qwen Novel)
            (r"/text/analyze", QwenNovelAnalyzeHandler),
            (r"/text/models", QwenNovelModelsHandler),
            (r"/text/lines/process", QwenNovelLineProcessingHandler),
            (r"/text/complete", TextCompleteHandler),
            (r"/text/format", TextCompleteHandler),

            # Health check
            (r"/health", HealthHandler),

            # API documentation
            (r"/docs", ApiDocsHandler),

            # Static files
            (
                r"/outputs/(.*)",
                CORSStaticFileHandler,
                {"path": CONFIG["output_dir"]},
            ),
        ],
        debug=CONFIG["debug"],
        max_buffer_size=104857600,  # 100MB
        body_timeout=300,  # 5 minutes
        request_timeout=300,  # 5 minutes
    )


if __name__ == "__main__":
    logger.info("=" * 60)
    logger.info("FLUX.2-Klein + Qwen3-TTS API Server")
    logger.info("=" * 60)
    logger.info(f"Model path: {CONFIG['model_path']}")
    logger.info(f"Model name: {CONFIG['model_name']}")
    logger.info(f"Listen on: {CONFIG['host']}:{CONFIG['port']}")
    logger.info(f"Output dir: {CONFIG['output_dir']}")
    
    # 模型管理器状态
    logger.info("=" * 60)
    logger.info("Model Manager Status:")
    status = model_manager.get_status()
    logger.info(f"  GPU Total Memory: {status['gpu_total_memory_gb']:.2f} GB")
    logger.info(f"  GPU Free Memory: {status['gpu_free_memory_gb']:.2f} GB")
    logger.info(f"  Loaded Models: {status['model_count']}")
    logger.info("=" * 60)
    
    # Clean up output directory
    output_dir = CONFIG.get("output_dir", os.path.join(os.path.dirname(os.path.abspath(__file__)), "outputs"))
    if os.path.exists(output_dir):
        files = [f for f in os.listdir(output_dir) if os.path.isfile(os.path.join(output_dir, f))]
        for file in files:
            try:
                os.remove(os.path.join(output_dir, file))
            except Exception as e:
                logger.warning(f"Failed to delete file {file}: {e}")
        logger.info(f"Cleaned {len(files)} files from output directory")
    else:
        os.makedirs(output_dir, exist_ok=True)
        logger.info(f"Created output directory: {output_dir}")
    
    # logger.info("Loading image model... (this may take a while on first run)")

    # Flux2KlienService.load_model()

    # logger.info("Image model loaded.")
    logger.info("All models will be loaded on first request (lazy loading via Model Manager).")
    logger.info("Model Manager will automatically manage GPU memory and unload models when needed.")

    app = make_app()
    app.listen(CONFIG["port"], address=CONFIG["host"])

    logger.info(f"Server started at http://{CONFIG['host']}:{CONFIG['port']}")
    logger.info("API Endpoints:")
    logger.info(f"  Image endpoints (/image):")
    logger.info(f"    GET  /image/models           - List image models and status")
    logger.info(f"    POST /image/generate         - Generate images from text")
    logger.info(f"    POST /image/edit             - Edit images with reference")
    logger.info(f"    POST /image/variations       - Generate image variations")
    logger.info(f"    POST /image/upscale          - Upscale image (Real-ESRGAN)")
    logger.info(f"    GET  /image/upscale/models   - List upscale models")
    logger.info(f"  Audio endpoints (/audio):")
    logger.info(f"    GET  /audio/models           - List audio models and status")
    logger.info(f"    POST /audio/tts              - Text to speech (Qwen3-TTS)")
    logger.info(f"    GET  /audio/voices           - List Qwen3-TTS voices")
    logger.info(f"    GET  /audio/status           - Qwen3-TTS model status")
    logger.info(f"    POST /audio/merge            - Merge audio files with loudness normalization")
    logger.info(f"  Text endpoints (/text):")
    logger.info(f"    GET  /text/models            - List text models and status")
    logger.info(f"    POST /text/analyze           - Analyze novel text (Qwen)")
    logger.info(f"    POST /text/lines/process     - Process novel lines with dialogue tagging")
    logger.info(f"    POST /text/format            - Novel text formatting (LM Studio / DeepSeek)")
    logger.info(f"  Other endpoints:")
    logger.info(f"    GET  /health                 - Health check")

    tornado.ioloop.IOLoop.current().start()
