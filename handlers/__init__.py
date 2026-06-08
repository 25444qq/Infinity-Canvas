from handlers.common_handlers import (
    CORSHandler,
    HealthHandler,
    AudioMergeHandler,
    ApiDocsHandler,
    validate_api_key,
)

from handlers.flux2_handler import (
    Flux2ModelsHandler,
    Flux2GenerateHandler,
    Flux2EditHandler,
    Flux2VariationHandler,
)

from handlers.qwen_tts_handler import (
    QwenTTSHandler,
    QwenTTSVoicesHandler,
    QwenTTSStatusHandler,
    QwenAudioModelsHandler,
)

from handlers.qwen_novel_handler import (
    QwenNovelModelsHandler,
    QwenNovelAnalyzeHandler,
    QwenNovelLineProcessingHandler,
)

from handlers.text_complete_handler import (
    TextCompleteHandler,
)

from handlers.upscale_handler import (
    UpscaleHandler,
    UpscaleModelsHandler,
)
