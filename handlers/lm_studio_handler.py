import json
import time
import logging
import base64
import requests

import tornado.web

from config import CONFIG
from handlers.common_handlers import CORSHandler, validate_api_key

logger = logging.getLogger(__name__)


class LMStudioModelsHandler(CORSHandler):
    def get(self):
        lm_config = CONFIG.get("lm_studio", {})
        enabled = lm_config.get("enabled", False)

        models = []
        if enabled:
            models.append({
                "id": "lm-studio",
                "object": "model",
                "created": int(time.time()),
                "owned_by": "lm-studio",
                "type": "novel_analysis",
                "status": "available",
                "base_url": lm_config.get("base_url", "http://localhost:1234/v1"),
                "default_model": lm_config.get("default_model", ""),
            })
        else:
            models.append({
                "id": "lm-studio",
                "object": "model",
                "created": 0,
                "owned_by": "lm-studio",
                "type": "novel_analysis",
                "status": "disabled",
                "error": "LM Studio is not enabled in configuration"
            })

        self.set_header("Content-Type", "application/json")
        self.write(json.dumps({"object": "list", "data": models}))


class LMStudioAnalyzeHandler(CORSHandler):
    def post(self):
        if not validate_api_key(self.request, "text"):
            self.set_status(401)
            self.write(json.dumps({"error": {"message": "Invalid API key for text endpoints", "type": "invalid_request_error"}}))
            return

        lm_config = CONFIG.get("lm_studio", {})
        if not lm_config.get("enabled", False):
            self.set_status(503)
            self.write(json.dumps({"error": {"message": "LM Studio is not enabled", "type": "server_error"}}))
            return

        try:
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

            model = body.get("model", lm_config.get("default_model", ""))
            temperature = body.get("temperature", lm_config.get("temperature", 0.7))
            max_tokens = body.get("max_tokens", lm_config.get("max_tokens", 4096))

            logger.info(f"LM Studio novel analysis request: text_length={text_length}, model={model}")

            result = self._analyze_with_lm_studio(novel_text, model, temperature, max_tokens)

            response = {
                "created": int(time.time()),
                "text_length": text_length,
                "model": model or "lm-studio",
                "provider": "lm-studio",
                "data": result,
            }

            self.set_header("Content-Type", "application/json")
            self.write(json.dumps(response, ensure_ascii=False))

        except Exception as e:
            logger.exception("Error in LM Studio novel analysis")
            self.set_status(500)
            self.write(json.dumps({"error": {"message": str(e), "type": "server_error"}}))

    def _analyze_with_lm_studio(self, novel_text, model, temperature, max_tokens):
        lm_config = CONFIG.get("lm_studio", {})
        base_url = lm_config.get("base_url", "http://localhost:1234/v1")
        api_key = lm_config.get("api_key", "local")
        timeout = lm_config.get("timeout", 120)

        prompt = f"""你是一位专业的文学分析师。请仔细阅读以下小说片段，并按照严格的JSON格式进行分析提取。

## 分析要求

1. **场景提取**：识别小说中所有独立场景，每个场景包含：
   - 场景名称：简明概括场景内容
   - 场景描述：场景的环境描写（原文或概括）
   - 场景内人物：出现在该场景中的角色列表
   - 场景内台词：该场景中的人物对话，需标注说话人

2. **人物提取**：识别小说中所有出场人物，每个人物包含：
   - 人物名称
   - 人物描述：外貌、性格、身份等特征
   - 人物关系：与其他人物的关系

## 输出格式

请严格按照以下JSON格式输出，不要添加任何其他文字说明：

```json
{{
  "scenes": [
    {{
      "scene_name": "场景名称",
      "scene_description": "场景环境描写",
      "characters": ["人物名1", "人物名2"],
      "dialogues": [
        {{
          "speaker": "说话人",
          "content": "台词内容"
        }}
      ]
    }}
  ],
  "characters": [
    {{
      "name": "人物名称",
      "description": "人物描述",
      "relationships": [
        {{
          "target": "相关人物",
          "relation": "关系描述"
        }}
      ]
    }}
  ]
}}
```

## 小说片段

{novel_text}

请开始分析："""

        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}"
        }

        payload = {
            "model": model if model else None,
            "messages": [
                {"role": "system", "content": "你是一位专业的文学分析师，擅长分析小说中的人物、场景和对话。请始终以严格的JSON格式输出分析结果。"},
                {"role": "user", "content": prompt}
            ],
            "temperature": temperature,
            "max_tokens": max_tokens,
            "stream": False
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

            content = result["choices"][0]["message"]["content"]
            return self._parse_analysis_response(content)

        except requests.exceptions.Timeout:
            raise RuntimeError("LM Studio request timeout")
        except requests.exceptions.ConnectionError:
            raise RuntimeError("Cannot connect to LM Studio. Please ensure LM Studio is running.")
        except Exception as e:
            raise RuntimeError(f"LM Studio API error: {str(e)}")

    def _parse_analysis_response(self, response_text):
        result = {
            "scenes": [],
            "characters": [],
            "raw_response": response_text,
        }

        json_str = response_text.strip()

        if "```json" in json_str:
            json_str = json_str.split("```json", 1)[1]
            json_str = json_str.split("```", 1)[0]
        elif "```" in json_str:
            json_str = json_str.split("```", 1)[1]
            json_str = json_str.split("```", 1)[0]

        json_str = json_str.strip()

        try:
            parsed = json.loads(json_str)
            if isinstance(parsed, dict):
                result["scenes"] = parsed.get("scenes", [])
                result["characters"] = parsed.get("characters", [])
        except json.JSONDecodeError:
            logger.warning("Failed to parse model response as JSON, returning raw response")

        return result


class LMStudioLineProcessingHandler(CORSHandler):
    def post(self):
        if not validate_api_key(self.request, "text"):
            self.set_status(401)
            self.write(json.dumps({"error": {"message": "Invalid API key for text endpoints", "type": "invalid_request_error"}}))
            return

        lm_config = CONFIG.get("lm_studio", {})
        if not lm_config.get("enabled", False):
            self.set_status(503)
            self.write(json.dumps({"error": {"message": "LM Studio is not enabled", "type": "server_error"}}))
            return

        try:
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

            model = body.get("model", lm_config.get("default_model", ""))
            temperature = body.get("temperature", lm_config.get("temperature", 0.7))
            max_tokens = body.get("max_tokens", lm_config.get("max_tokens", 4096))

            logger.info(f"LM Studio line processing request: text_length={text_length}, model={model}")

            result = self._process_lines_with_lm_studio(novel_text, model, temperature, max_tokens)

            response = {
                "created": int(time.time()),
                "text_length": text_length,
                "model": model or "lm-studio",
                "provider": "lm-studio",
                "data": result["lines"],
                "line_count": len(result["lines"]),
            }

            self.set_header("Content-Type", "application/json")
            self.write(json.dumps(response, ensure_ascii=False))

        except Exception as e:
            logger.exception("Error in LM Studio line processing")
            self.set_status(500)
            self.write(json.dumps({"error": {"message": str(e), "type": "server_error"}}))

    def _process_lines_with_lm_studio(self, novel_text, model, temperature, max_tokens):
        lm_config = CONFIG.get("lm_studio", {})
        base_url = lm_config.get("base_url", "http://localhost:1234/v1")
        api_key = lm_config.get("api_key", "local")
        timeout = lm_config.get("timeout", 120)

        prompt = f"""你是一个专业的小说文本分析助手。请严格按照以下规则处理给定的小说章节：

## 📋 核心规则
1. **原文完整性**：绝对不能修改、删减或增加原文的任何字符。所有输出必须100%源自原文。
2. **完整覆盖**：确保处理后的文本包含原文的每一个字符，不能遗漏任何内容。
3. **分离对话和叙述**：所有角色说出口的话（对话）独立成行，与叙述（其他内容）分离。
4. **保留所有内容**：叙述、旁白、环境描写、动作描写等非对话内容必须完整保留，不能删除。
5. **禁止空输出**：每一行的processed_text字段必须包含内容，绝对不能为空字符串。

## 🎭 最重要规则：对话 vs 叙述的判断标准
**判断标准：文本内容是否被引号（""）包裹，且是角色说出口的话。**

### ✅ 对话（需要加标签）：被引号包裹的角色说出口的话
- `"你真的要离开吗？"` → 对话，加标签 → `<角色:女子><情绪:担忧>"你真的要离开吗？"`
- `"是的，"` → 对话，加标签 → `<角色:林凡><情绪:平静>"是的，"`

### ❌ 叙述（绝对不能加标签）：所有非角色说出口的话
- `林凡站在悬崖边，望着远方的城市。` → 叙述，不加标签
- `女子沉默了片刻，然后说道：` → 这是叙述，不加标签！
- 只有引号内的内容才是对话！

## 📝 分行处理规则
- **按语义单位分行**：将文章内容按逻辑语义单位分行
- **每个语义单位独立成行**
- **禁止跳过内容**

## 👥 对话标注规则（仅适用于对话内容）
- **对话标注格式**：`<角色:角色名><情绪:情绪词>对话内容`
- 正确示例：`<角色:林凡><情绪:平静>"我要走了。"`
- 情绪词应为简短形容词：平静、悲伤、兴奋、愤怒、冷漠、急切、高兴、疑惑、警惕等

## JSON输出格式
```json
{{
  "line_number": 1,
  "original_text": "原文内容",
  "processed_text": "处理后的内容（必须非空）",
  "description": "内容类型：对话/叙述/动作描写/环境描写/心理描写"
}}
```

## 小说文本

{novel_text}

请严格按照上述规则处理并输出JSON数组："""

        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}"
        }

        payload = {
            "model": model if model else None,
            "messages": [
                {"role": "system", "content": "你是一个专业的小说文本分析助手，擅长对文本进行分行处理和对话标注。请始终以严格的JSON数组格式输出结果。"},
                {"role": "user", "content": prompt}
            ],
            "temperature": temperature,
            "max_tokens": max_tokens,
            "stream": False
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

            content = result["choices"][0]["message"]["content"]
            return self._parse_line_processing_response(content)

        except requests.exceptions.Timeout:
            raise RuntimeError("LM Studio request timeout")
        except requests.exceptions.ConnectionError:
            raise RuntimeError("Cannot connect to LM Studio. Please ensure LM Studio is running.")
        except Exception as e:
            raise RuntimeError(f"LM Studio API error: {str(e)}")

    def _parse_line_processing_response(self, response_text):
        result = {
            "lines": [],
        }

        json_str = response_text.strip()

        if "```json" in json_str:
            json_str = json_str.split("```json", 1)[1]
            json_str = json_str.split("```", 1)[0]
        elif "```" in json_str:
            json_str = json_str.split("```", 1)[1]
            json_str = json_str.split("```", 1)[0]

        json_str = json_str.strip()

        try:
            parsed = json.loads(json_str)
            if isinstance(parsed, list):
                result["lines"] = parsed
            elif isinstance(parsed, dict) and "lines" in parsed:
                result["lines"] = parsed["lines"]
        except json.JSONDecodeError:
            import re
            json_match = re.search(r'\[.*\]', json_str, re.DOTALL)
            if json_match:
                try:
                    result["lines"] = json.loads(json_match.group(0))
                except:
                    pass

        return result
