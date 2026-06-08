import json
import uuid
import logging
import os
import io
import base64

import tornado.web
from pydub import AudioSegment

from config import CONFIG

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


def validate_api_key(request, category=None):
    api_key = CONFIG.get("api_key", "")
    if category:
        api_keys = CONFIG.get("api_keys", {})
        api_key = api_keys.get(category, "") or api_key

    if not api_key:
        return True
    # Log all request headers for debugging
    all_headers = dict(request.headers)
    logger.info(f"[API Key] category={category}, all headers: {dict(all_headers)}")
    logger.info(f"[API Key] expected_key={repr(api_key)}")
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header[7:]
        match = token == api_key
        logger.info(f"[API Key] Auth header found, provided_token={repr(token)}, match={match}")
        return match
    logger.warning(f"[API Key] Missing or malformed Authorization header: {repr(auth_header)}")
    return False


class HealthHandler(CORSHandler):
    def get(self):
        from services.flux2_service import Flux2KlienService

        self.set_header("Content-Type", "application/json")
        self.write(json.dumps({
            "status": "ok",
            "model_loaded": Flux2KlienService.is_loaded(),
            "model": CONFIG["model_name"],
        }))


def _decode_base64_audio(b64_data: str) -> bytes:
    """Decode base64 audio data, supporting both data URI and raw base64 formats."""
    if "," in b64_data and b64_data.startswith("data:"):
        return base64.b64decode(b64_data.split(",", 1)[1])
    return base64.b64decode(b64_data)


class AudioMergeHandler(CORSHandler):
    def post(self):
        if not validate_api_key(self.request):
            self.set_status(401)
            self.write(json.dumps({"error": {"message": "Invalid API key", "type": "invalid_request_error"}}))
            return

        try:
            body = json.loads(self.request.body)

            audio_files = body.get("audio_files", [])
            audio_data_list = body.get("audio_data", [])
            
            if not audio_files and not audio_data_list:
                self.set_status(400)
                self.write(json.dumps({"error": {"message": "audio_files or audio_data is required", "type": "invalid_request_error"}}))
                return

            pause_seconds = body.get("pause_between", 0.3)
            pause_ms = int(pause_seconds * 1000)

            output_dir = CONFIG.get("output_dir", "/home/epic/imageGene/outputs")

            silence = AudioSegment.silent(duration=pause_ms, frame_rate=44100)

            segments = []
            
            # Load from base64 data
            for i, b64_data in enumerate(audio_data_list):
                try:
                    audio_bytes = _decode_base64_audio(b64_data)
                    segment = AudioSegment.from_file(io.BytesIO(audio_bytes))
                    target_dBFS = -16
                    change_in_dBFS = target_dBFS - segment.dBFS
                    normalized = segment.apply_gain(change_in_dBFS)
                    segments.append(normalized)
                    logger.info(f"Loaded and normalized audio_data[{i}] (duration: {len(normalized)/1000:.2f}s)")
                except Exception as e:
                    self.set_status(400)
                    self.write(json.dumps({"error": {"message": f"Failed to load audio data[{i}]: {str(e)}", "type": "invalid_request_error"}}))
                    return

            # Load from file paths (legacy support)
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

            total_files = len(audio_data_list) + len(audio_files)
            logger.info(f"[AudioMerge] audio_data={len(audio_data_list)}, audio_files={len(audio_files)}, pause_between={pause_seconds}s, response_format={body.get('response_format', 'url')}")

            response_format = body.get("response_format", "url")
            
            if response_format == "b64_json":
                import wave
                buffer = io.BytesIO()
                combined.export(buffer, format="wav", parameters=["-ar", "44100", "-ac", "2", "-b:a", "128k"])
                b64_audio = base64.b64encode(buffer.getvalue()).decode("utf-8")
                
                response = {
                    "created": int(time.time()),
                    "data": {
                        "b64_json": b64_audio,
                        "duration": len(combined)/1000,
                        "files_merged": total_files,
                        "pause_between_ms": pause_ms
                    }
                }
            else:
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
                        "files_merged": total_files,
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


import time


class ApiDocsHandler(CORSHandler):
    def get(self):
        api_docs = {
            "api_version": "1.0",
            "server": f"{CONFIG['host']}:{CONFIG['port']}",
            "endpoints": {
                "image": {
                    "description": "FLUX.2 图像生成相关接口",
                    "endpoints": [
                        {
                            "path": "/image/models",
                            "method": "GET",
                            "description": "获取图像模型状态",
                            "response_example": {
                                "object": "list",
                                "data": [
                                    {
                                        "id": "FLUX.2-klein-9B",
                                        "object": "model",
                                        "created": 1714537200,
                                        "owned_by": "black-forest-labs",
                                        "type": "image_generation",
                                        "status": "loaded",
                                        "path": "/models/FLUX.2-klein-9B"
                                    }
                                ]
                            }
                        },
                        {
                            "path": "/image/generate",
                            "method": "POST",
                            "description": "根据文本提示生成图像",
                            "request_example": {
                                "prompt": "一只可爱的猫在草地上玩耍",
                                "model": "FLUX.2-klein-9B",
                                "n": 1,
                                "size": "1024x1024",
                                "response_format": "url",
                                "seed": 42,
                                "guidance_scale": 3.5,
                                "num_inference_steps": 28
                            },
                            "response_example": {
                                "created": 1714537200,
                                "data": [
                                    {"url": "/outputs/abc123.png"}
                                ]
                            }
                        },
                        {
                            "path": "/image/edit",
                            "method": "POST",
                            "description": "根据参考图像和提示进行图像编辑",
                            "request_example": {
                                "prompt": "将猫变成狗",
                                "image": "data:image/png;base64,iVBORw0KGgo...",
                                "n": 1,
                                "size": "1024x1024"
                            }
                        },
                        {
                            "path": "/image/variations",
                            "method": "POST",
                            "description": "生成参考图像的变体",
                            "request_example": {
                                "image": "data:image/png;base64,iVBORw0KGgo...",
                                "n": 4,
                                "size": "1024x1024"
                            }
                        }
                    ]
                },
                "audio": {
                    "description": "Qwen3-TTS 语音合成相关接口",
                    "endpoints": [
                        {
                            "path": "/audio/models",
                            "method": "GET",
                            "description": "获取语音合成模型状态",
                            "response_example": {
                                "object": "list",
                                "data": [
                                    {
                                        "id": "Qwen3-TTS-12Hz-1.7B",
                                        "object": "model",
                                        "created": 1714537200,
                                        "owned_by": "qwen",
                                        "type": "text_to_speech",
                                        "status": "loaded",
                                        "path": "/models/qwen3_tts_12hz_1_7b_voicedesign"
                                    }
                                ]
                            }
                        },
                        {
                            "path": "/audio/tts",
                            "method": "POST",
                            "description": "文本转语音（使用 Qwen3-TTS）",
                            "request_example": {
                                "text": "你好，这是一个测试",
                                "model": "qwen3-tts",
                                "language": "zh",
                                "voice": "Cherry",
                                "emotion": "happy",
                                "speed": 1.0,
                                "response_format": "url",
                                "audio_format": "wav"
                            },
                            "response_example": {
                                "id": "abc123",
                                "created": 1714537200,
                                "model": "Qwen3-TTS-12Hz-1.7B",
                                "format": "wav",
                                "data": {"url": "/outputs/qwen_tts_abc123.wav"}
                            },
                            "notes": [
                                "model 参数可选值: qwen3-tts (默认)",
                                "qwen3-tts 支持 voice, emotion, voice_description, ref_audio 参数",
                                "注意：ref_audio（参考音频）不能与 emotion/voice_description 同时使用",
                                "emotion 参数用于设置情绪（支持中英文），例如: 开心, 难过, 生气, 平静, 激动",
                                "英文情绪词: happy, sad, angry, calm, excited",
                                "voice_description 可以设置详细的声音描述（覆盖 emotion）"
                            ]
                        },
                        {
                            "path": "/audio/voices",
                            "method": "GET",
                            "description": "获取可用音色列表"
                        },
                        {
                            "path": "/audio/status",
                            "method": "GET",
                            "description": "获取TTS模型加载状态",
                            "response_example": {"loaded": True, "model": "Qwen3-TTS-12Hz-1.7B"}
                        },
                        {
                            "path": "/audio/merge",
                            "method": "POST",
                            "description": "合并多个音频文件并进行音量归一化",
                            "request_example": {
                                "audio_files": ["audio1.wav", "audio2.wav"],
                                "pause_between": 0.3
                            }
                        }
                    ]
                },
                "text": {
                    "description": "文本分析相关接口（支持本地模型、LM Studio、DeepSeek）",
                    "endpoints": [
                        {
                            "path": "/text/models",
                            "method": "GET",
                            "description": "获取文本模型状态（本地Qwen模型）"
                        },
                        {
                            "path": "/text/analyze",
                            "method": "POST",
                            "description": "分析小说文本",
                            "request_example": {
                                "text": "SGVsbG8gV29ybGQh",
                                "provider": "local",
                                "model": "Qwen3.5-27B-Q4_K_M"
                            },
                            "notes": [
                                "model 参数规则：",
                                "  - 本地模型: 直接使用模型名，如 Qwen3.5-27B-Q4_K_M",
                                "  - LM Studio: 使用 lms- 前缀，如 model=lms-qwen3.6-35b-a3b",
                                "  - DeepSeek: 使用 deepseek- 前缀，如 model=deepseek-deepseek-v4-flash",
                                "provider 参数可选值: local (默认), lm-studio, deepseek",
                                "local: 使用本地 Qwen 模型进行分析，需要本地部署模型文件",
                                "lm-studio: 使用 LM Studio 本地 API 服务（需要配置 LM_STUDIO_ENABLED=true）",
                                "deepseek: 使用 DeepSeek 远程 API（需要配置 DEEPSEEK_ENABLED=true 和 API key）"
                            ]
                        },
                        {
                            "path": "/text/lines/process",
                            "method": "POST",
                            "description": "处理小说对白",
                            "request_example": {
                                "text": "SGVsbG8gV29ybGQh",
                                "model": "lms-qwen3.6-35b-a3b"
                            },
                            "notes": [
                                "provider 参数可选值: local (默认，本地Qwen模型), lm-studio, deepseek",
                                "lm-studio 需要配置: LM_STUDIO_ENABLED=true, LM_STUDIO_BASE_URL",
                                "deepseek 需要配置: DEEPSEEK_ENABLED=true, DEEPSEEK_API_KEY"
                            ]
                        },
                        {
                            "path": "/text/format",
                            "method": "POST",
                            "description": "小说文本格式优化（支持8000-12000字小说章节）",
                            "request_example": {
                                "prompt": "5Y+W5Yi35rKh5pyf5Yi7",
                                "text": "5rKh5pyf5Yi75Y+W5Yi3",
                                "model": "lms-qwen3.6-35b-a3b",
                                "temperature": 0.7,
                                "max_tokens": 4096
                            },
                            "notes": [
                                "prompt 和 text 参数为 base64 编码的 UTF-8 字符串",
                                "返回结果通过 result_b64 字段以 base64 编码返回",
                                "model 参数支持 lms- 前缀（LM Studio）和 deepseek- 前缀（DeepSeek API）",
                                "支持处理 8000-12000 字的小说章节"
                            ]
                        }
                    ]
                },
                "system": {
                    "description": "系统相关接口",
                    "endpoints": [
                        {
                            "path": "/health",
                            "method": "GET",
                            "description": "健康检查",
                            "response_example": {
                                "status": "ok",
                                "model_loaded": True,
                                "model": "FLUX.2-klein-9B"
                            }
                        },
                        {
                            "path": "/docs",
                            "method": "GET",
                            "description": "获取API文档"
                        }
                    ]
                }
            },
            "usage": {
                "base_url": f"http://{CONFIG['host']}:{CONFIG['port']}",
                "api_keys": {
                    "global": CONFIG.get("api_key", ""),
                    "image": CONFIG.get("api_keys", {}).get("image", ""),
                    "audio": CONFIG.get("api_keys", {}).get("audio", ""),
                    "text": CONFIG.get("api_keys", {}).get("text", ""),
                    "video": CONFIG.get("api_keys", {}).get("video", ""),
                },
                "output_dir": CONFIG["output_dir"],
                "notes": [
                    "所有POST请求需要设置Content-Type为application/json",
                    "音频输出文件存放在/outputs目录下",
                    "大文件建议使用url格式返回",
                    "API Key认证: 在请求头中添加 Authorization: Bearer <your_key>",
                    "每个类别可单独设置API Key，也可使用全局API Key"
                ]
            }
        }
        
        self.set_header("Content-Type", "application/json")
        self.write(json.dumps(api_docs, ensure_ascii=False, indent=2))
