import json
import time
import uuid
import base64
import logging
import os
import tempfile

import tornado.web

from config import CONFIG
from handlers.common_handlers import CORSHandler, validate_api_key

logger = logging.getLogger(__name__)


class QwenTTSHandler(CORSHandler):
    def post(self):
        if not validate_api_key(self.request, "audio"):
            self.set_status(401)
            self.write(json.dumps({"error": {"message": "Invalid API key for audio endpoints", "type": "invalid_request_error"}}))
            return

        try:
            body = json.loads(self.request.body)

            model = body.get("model", "qwen3-tts").lower()
            text = body.get("text", "")
            text_b64 = body.get("text_b64", "")

            if text_b64:
                try:
                    padding = 4 - len(text_b64) % 4
                    if padding != 4:
                        text_b64 += "=" * padding
                    text = base64.b64decode(text_b64).decode("utf-8")
                except Exception as e:
                    logger.error(f"Failed to decode base64 text: {e}")
                    self.set_status(400)
                    self.write(json.dumps({"error": {"message": "text_b64 is not valid base64 encoded UTF-8 string", "type": "invalid_request_error"}}))
                    return
            elif text:
                # 自动检测 base64 编码（不限制长度）
                import re
                # 检查是否只包含 base64 字符
                if re.fullmatch(r'[A-Za-z0-9+/=\s]+', text):
                    try:
                        cleaned = text.replace('\n', '').replace('\r', '').replace(' ', '')
                        padding = 4 - len(cleaned) % 4
                        if padding != 4:
                            cleaned += "=" * padding
                        decoded = base64.b64decode(cleaned).decode("utf-8")
                        # 验证解码后的文本是否是有效的 UTF-8 文本
                        if decoded and len(decoded) > 0:
                            logger.info(f"[TTS] Auto-detected base64 encoded text, decoded length: {len(decoded)} (raw: {len(text)})")
                            text = decoded
                    except Exception:
                        pass

            if not text:
                self.set_status(400)
                self.write(json.dumps({"error": {"message": "text is required", "type": "invalid_request_error"}}))
                return

            if len(text) > 5000:
                self.set_status(400)
                self.write(json.dumps({"error": {"message": f"text is too long ({len(text)} chars), maximum 5000 characters allowed", "type": "invalid_request_error"}}))
                return

            language = body.get("language", "zh")
            voice = body.get("voice", "Cherry")
            speed = body.get("speed", 1.0)
            response_format = body.get("response_format", "url")
            audio_format = body.get("audio_format", "wav")

            logger.info(f"[TTS] model='{model}', text_len={len(text)}, language={language}, voice={voice}, speed={speed}, response_format={response_format}, audio_format={audio_format}")

            body["text"] = text

            if model in ["moss-tts", "mosstts", "moss"]:
                self.set_status(400)
                self.write(json.dumps({"error": {"message": "MOSS-TTS is no longer supported. Please use qwen3-tts model instead.", "type": "invalid_request_error"}}))
                return
            else:
                self._handle_qwen_tts(body)

        except Exception as e:
            logger.exception("Error in TTS synthesis")
            self.set_status(500)
            self.write(json.dumps({"error": {"message": str(e), "type": "server_error"}}))

    def _handle_qwen_tts(self, body):
        from services.audio_service import (
            load_qwen_tts_model, synthesize, save_audio, get_current_model_path
        )

        model_path = CONFIG.get("qwen_tts_model_path")
        current_path = get_current_model_path()
        
        if current_path != model_path:
            logger.info(f"Model switch needed: current={current_path}, target={model_path}")
        
        if not load_qwen_tts_model(model_path):
            self.set_status(503)
            self.write(json.dumps({"error": {"message": "Qwen3-TTS model failed to load", "type": "server_error"}}))
            return

        language = body.get("language", "zh")
        voice = body.get("voice", "Cherry")
        voice_description = body.get("voice_description", None)
        voice_description_b64 = body.get("voice_description_b64", None)
        emotion = body.get("emotion", None)
        emotion_b64 = body.get("emotion_b64", None)
        instruction = body.get("instruction", None)
        instruction_b64 = body.get("instruction_b64", None)
        ref_audio = body.get("ref_audio", None)
        speed = body.get("speed", 1.0)
        response_format = body.get("response_format", "url")
        audio_format = body.get("audio_format", "wav")

        text = body.get("text", "")

        if instruction_b64:
            try:
                padding = 4 - len(instruction_b64) % 4
                if padding != 4:
                    instruction_b64 += "=" * padding
                instruction = base64.b64decode(instruction_b64).decode("utf-8")
                logger.info(f"[QwenTTS] Decoded instruction_b64: {instruction}")
            except Exception as e:
                logger.error(f"[QwenTTS] Failed to decode instruction_b64: {e}")

        if instruction and not instruction_b64:
            try:
                import re
                if re.fullmatch(r'[A-Za-z0-9+/=\s]+', instruction) and len(instruction) < 200:
                    cleaned = instruction.replace('\n', '').replace('\r', '').replace(' ', '')
                    padding = 4 - len(cleaned) % 4
                    if padding != 4:
                        cleaned += "=" * padding
                    decoded = base64.b64decode(cleaned).decode("utf-8")
                    logger.info(f"[QwenTTS] Auto-detected base64 encoded instruction, decoded: {decoded}")
                    instruction = decoded
            except Exception:
                pass

        if emotion_b64:
            try:
                padding = 4 - len(emotion_b64) % 4
                if padding != 4:
                    emotion_b64 += "=" * padding
                emotion = base64.b64decode(emotion_b64).decode("utf-8")
                logger.info(f"[QwenTTS] Decoded emotion_b64: {emotion}")
            except Exception as e:
                logger.error(f"[QwenTTS] Failed to decode emotion_b64: {e}")

        if voice_description_b64:
            try:
                padding = 4 - len(voice_description_b64) % 4
                if padding != 4:
                    voice_description_b64 += "=" * padding
                voice_description = base64.b64decode(voice_description_b64).decode("utf-8")
                logger.info(f"[QwenTTS] Decoded voice_description_b64: {voice_description}")
            except Exception as e:
                logger.error(f"[QwenTTS] Failed to decode voice_description_b64: {e}")

        logger.info(f"[QwenTTS] 请求参数: voice={voice}, emotion={emotion}, instruction={instruction}, voice_description={voice_description}, ref_audio={bool(ref_audio)}, language={language}, speed={speed}")

        emotion_map = {
            "neutral": "neutral", "happy": "happy", "sad": "sad", "angry": "angry",
            "calm": "calm", "excited": "excited", "gentle": "gentle", "warm": "warm",
            "serious": "serious", "nervous": "nervous", "whisper": "whisper",
            "开心": "happy", "高兴": "happy", "快乐": "happy",
            "难过": "sad", "伤心": "sad", "悲伤": "sad",
            "生气": "angry", "愤怒": "angry",
            "冷静": "calm", "平静": "calm",
            "激动": "excited", "兴奋": "excited",
            "温柔": "gentle", "亲切": "warm",
            "严肃": "serious", "紧张": "nervous", "中性": "neutral",
        }

        if instruction:
            voice_description = instruction
            logger.info(f"[QwenTTS] Using instruction as voice_description (priority): {instruction}")

        if emotion:
            normalized_emotion = emotion_map.get(emotion.lower() if isinstance(emotion, str) else str(emotion), str(emotion))
            if language == "zh":
                emotion_zh_map = {
                    "neutral": "平静", "happy": "开心", "sad": "难过", "angry": "生气",
                    "calm": "冷静", "excited": "激动", "gentle": "温柔", "warm": "亲切",
                    "serious": "严肃", "nervous": "紧张", "whisper": "低语",
                }
                emotion_label = emotion_zh_map.get(normalized_emotion, normalized_emotion)
                emotion_desc = f"用{emotion_label}的语气说话"
            else:
                emotion_desc = f"Speak with {normalized_emotion} emotion"
            
            if voice_description:
                voice_description = f"{voice_description}. {emotion_desc}"
                logger.info(f"[QwenTTS] Combined instruction with emotion: {voice_description}")
            else:
                voice_description = emotion_desc
                logger.info(f"[QwenTTS] Using emotion as voice_description: {voice_description}")

        if voice:
            voice = voice.strip().title()
            from services.audio_service import AVAILABLE_VOICES
            valid_voices = [v["id"] for v in AVAILABLE_VOICES]
            if voice not in valid_voices:
                logger.warning(f"[QwenTTS] Invalid voice '{voice}', falling back to 'Cherry'. Available: {valid_voices}")
                voice = "Cherry"

        ref_audio_path = None
        if ref_audio:
            if ref_audio.startswith("data:"):
                audio_data = ref_audio.split(",", 1)[1] if "," in ref_audio else ref_audio
                padding = 4 - len(audio_data) % 4
                if padding != 4:
                    audio_data += "=" * padding
                audio_bytes = base64.b64decode(audio_data)
                ref_audio_file = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
                ref_audio_file.write(audio_bytes)
                ref_audio_file.close()
                ref_audio_path = ref_audio_file.name
            else:
                ref_audio_path = ref_audio

        text = body.get("text", "")
        model_name = CONFIG.get("qwen_tts_model_name", "Qwen3-TTS-12Hz-1.7B")
        logger.info(f"[QwenTTS] model='{model_name}', text_len={len(text)}, lang={language}, voice={voice}, voice_desc={bool(voice_description)}, emotion={emotion}, ref_audio={bool(ref_audio_path)}, speed={speed}, response_format={response_format}, audio_format={audio_format}")

        try:
            audio_bytes = synthesize(
                text=text,
                language=language,
                voice=voice,
                voice_description=voice_description,
                ref_audio_path=ref_audio_path,
                speed=speed,
            )
        finally:
            if ref_audio and ref_audio.startswith("data:"):
                try:
                    os.unlink(ref_audio_path)
                except:
                    pass

        if audio_format == "mp3":
            try:
                from pydub import AudioSegment
                import io
                wav_buf = io.BytesIO(audio_bytes)
                audio_seg = AudioSegment.from_wav(wav_buf)
                mp3_buf = io.BytesIO()
                audio_seg.export(mp3_buf, format="mp3", bitrate="128k")
                audio_bytes = mp3_buf.getvalue()
                ext = "mp3"
            except ImportError:
                ext = "wav"
        else:
            ext = "wav"

        request_id = uuid.uuid4().hex
        created = int(time.time())
        model_name = CONFIG.get("qwen_tts_model_name", "Qwen3-TTS-12Hz-1.7B")

        if response_format == "b64_json":
            b64 = base64.b64encode(audio_bytes).decode("utf-8")
            response = {
                "id": request_id,
                "created": created,
                "model": model_name,
                "format": ext,
                "data": {
                    "b64_json": b64,
                },
            }
        else:
            filename = f"qwen_tts_{request_id}.{ext}"
            filepath = save_audio(audio_bytes, filename)
            url = f"/outputs/{filename}"
            response = {
                "id": request_id,
                "created": created,
                "model": model_name,
                "format": ext,
                "data": {
                    "url": url,
                    },
                }

        self.set_header("Content-Type", "application/json")
        self.write(json.dumps(response))


class QwenTTSVoicesHandler(CORSHandler):
    def get(self):
        from services.audio_service import AVAILABLE_VOICES, SUPPORTED_LANGUAGES

        response = {
            "object": "list",
            "voices": AVAILABLE_VOICES,
            "supported_languages": SUPPORTED_LANGUAGES,
            "supported_emotions": ["neutral", "happy", "sad", "angry", "calm", "excited", "gentle", "warm", "serious", "nervous"],
        }
        self.set_header("Content-Type", "application/json")
        self.write(json.dumps(response))


class QwenTTSStatusHandler(CORSHandler):
    def get(self):
        from services.audio_service import is_qwen_tts_loaded, get_current_model_path

        current_path = get_current_model_path()
        response = {
            "loaded": is_qwen_tts_loaded(),
            "model": CONFIG.get("qwen_tts_model_name", "Qwen3-TTS-12Hz-1.7B") if is_qwen_tts_loaded() else None,
            "model_path": current_path,
        }
        self.set_header("Content-Type", "application/json")
        self.write(json.dumps(response))


class QwenAudioModelsHandler(CORSHandler):
    def get(self):
        import os
        from services.audio_service import is_qwen_tts_loaded, get_current_model_path

        current_path = get_current_model_path()
        data = []

        qwen_model_name = CONFIG.get("qwen_tts_model_name", "Qwen3-TTS-12Hz-1.7B")
        qwen_model_path = CONFIG.get("qwen_tts_model_path", "")
        is_current = (current_path == qwen_model_path)
        data.append({
            "id": qwen_model_name,
            "object": "model",
            "created": int(time.time()),
            "owned_by": "qwen",
            "type": "text_to_speech",
            "status": "loaded" if is_qwen_tts_loaded() and is_current else "not_loaded",
            "path": qwen_model_path,
            "is_current": is_current,
        })

        self.set_header("Content-Type", "application/json")
        self.write(json.dumps({"object": "list", "data": data}))
