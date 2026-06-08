import json
import logging
import os
import re
import tempfile
import threading

import torch
from transformers import AutoModelForCausalLM, AutoTokenizer

from config import CONFIG
from services.model_manager import model_manager, ModelType

logger = logging.getLogger(__name__)

_models = {}
_tokenizers = {}
_models_lock = threading.Lock()
_loaded_model_name = None
_registered = False


def _register_to_manager():
    """注册到模型管理器"""
    global _registered
    if _registered:
        return
    
    model_manager.register_loader(ModelType.TEXT, _load_model_wrapper)
    model_manager.register_unloader(ModelType.TEXT, _unload_model_wrapper)
    _registered = True
    logger.info("Novel service registered to ModelManager")


def _load_model_wrapper(model_name, **kwargs):
    """模型管理器调用的加载函数包装器"""
    load_novel_model(model_name)
    return _models.get(model_name)


def _unload_model_wrapper(model_name):
    """模型管理器调用的卸载函数包装器"""
    _unload_model(model_name)


# 在模块加载时注册
_register_to_manager()


def is_novel_model_loaded():
    return _loaded_model_name is not None


def get_loaded_model_name():
    return _loaded_model_name


def load_novel_model(model_name=None):
    global _loaded_model_name

    if model_name is None:
        model_name = CONFIG.get("novel_model_name", "Qwen3.5-27B-Q4_K_M")

    if _loaded_model_name == model_name:
        return True

    with _models_lock:
        if _loaded_model_name == model_name:
            return True

        try:
            model_path = _resolve_model_path(model_name)
            device = CONFIG.get("device", "cpu")

            logger.info(f"Loading novel analysis model: {model_name} from: {model_path}")
            logger.info(f"Device: {device}")

            # Check if it's a GGUF file
            if model_path.endswith(".gguf"):
                from llama_cpp import Llama
                
                # Load GGUF model
                model = Llama(
                    model_path=model_path,
                    n_ctx=8192,
                    n_batch=256,
                    n_gpu_layers=-1,
                    verbose=False
                )
                
                # For GGUF models, we don't need a separate tokenizer
                tokenizer = None
                logger.info(f"GGUF model loaded successfully: {model_name}")
            else:
                # Original transformers loading for standard models
                dtype = torch.bfloat16 if device == "cuda" else torch.float32

                tokenizer = AutoTokenizer.from_pretrained(
                    model_path,
                    trust_remote_code=True,
                    local_files_only=True,
                )

                model = AutoModelForCausalLM.from_pretrained(
                    model_path,
                    torch_dtype=dtype,
                    device_map="auto" if device == "cuda" else None,
                    trust_remote_code=True,
                    local_files_only=True,
                )

                if device != "cuda":
                    model = model.to(device)

                model.eval()
                logger.info(f"Transformers model loaded successfully: {model_name}")

            if _loaded_model_name and _loaded_model_name in _models:
                _unload_model(_loaded_model_name)

            _models[model_name] = model
            _tokenizers[model_name] = tokenizer
            _loaded_model_name = model_name

            return True

        except Exception as e:
            logger.error(f"Failed to load novel analysis model '{model_name}': {e}")
            import traceback
            traceback.print_exc()
            return False


def _unload_model(model_name):
    if model_name in _models:
        del _models[model_name]
    if model_name in _tokenizers:
        del _tokenizers[model_name]
    if torch.cuda.is_available():
        torch.cuda.empty_cache()


def _resolve_model_path(model_name):
    model_dir = CONFIG.get("novel_model_path", "")
    default_model_name = CONFIG.get("novel_model_name", "Qwen3.5-27B-Q4_K_M")
    if model_dir and model_name == default_model_name:
        return model_dir

    import os
    base_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "models")

    # GGUF 文件名映射：短名 -> 实际文件名
    gguf_name_map = {
        "Qwen3.5-27B": "Qwen3.5-27B-Q4_K_M.gguf",
    }
    if model_name in gguf_name_map:
        mapped = os.path.join(base_dir, gguf_name_map[model_name])
        if os.path.isfile(mapped):
            return mapped

    dir_name = model_name.lower().replace("-", "_").replace(".", "_")
    candidate = os.path.join(base_dir, dir_name)
    if os.path.isdir(candidate):
        return candidate
    
    gguf_candidate = os.path.join(base_dir, f"{model_name}.gguf")
    if os.path.isfile(gguf_candidate):
        return gguf_candidate

    if os.path.isfile(model_name) and model_name.endswith(".gguf"):
        return model_name

    return model_name


ANALYSIS_PROMPT_TEMPLATE = """你是一位专业的文学分析师。请仔细阅读以下小说片段，并按照严格的JSON格式进行分析提取。

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


def analyze_novel(novel_text, model_name=None):
    global _loaded_model_name

    if model_name is None:
        model_name = _loaded_model_name or CONFIG.get("novel_model_name", "Qwen3.5-27B-Q4_K_M")

    # 使用模型管理器确保模型已加载
    model_manager.ensure_model(ModelType.TEXT, model_name)

    model = _models.get(model_name)
    tokenizer = _tokenizers.get(model_name)

    if model is None:
        raise RuntimeError("Novel analysis model is not loaded")

    temperature = CONFIG["novel_temperature"]
    top_p = CONFIG["novel_top_p"]
    top_k = CONFIG["novel_top_k"]
    max_new_tokens = CONFIG["novel_max_new_tokens"]

    prompt = ANALYSIS_PROMPT_TEMPLATE.format(novel_text=novel_text)

    # Check if it's a GGUF model (using llama-cpp-python)
    if hasattr(model, "create_chat_completion"):
        # Use GGUF model
        messages = [
            {"role": "system", "content": "你是一位专业的文学分析师，擅长分析小说中的人物、场景和对话。请始终以严格的JSON格式输出分析结果。"},
            {"role": "user", "content": prompt},
        ]

        response = model.create_chat_completion(
            messages=messages,
            temperature=temperature,
            top_p=top_p,
            top_k=top_k,
            max_tokens=max_new_tokens,
            stop=["</s>"]
        )

        response_text = response["choices"][0]["message"]["content"]

        # 剥离 Qwen3.5 模型的思考过程
        response_text = _strip_thinking(response_text)
    else:
        # Use transformers model
        if tokenizer is None:
            raise RuntimeError("Tokenizer is not loaded for transformers model")

        model_type = CONFIG.get("novel_model_type", "qwen")

        if model_type == "qwen":
            messages = [
                {"role": "system", "content": "你是一位专业的文学分析师，擅长分析小说中的人物、场景和对话。请始终以严格的JSON格式输出分析结果。"},
                {"role": "user", "content": prompt},
            ]

            text = tokenizer.apply_chat_template(
                messages,
                tokenize=False,
                add_generation_prompt=True,
            )
        else:
            text = prompt

        model_inputs = tokenizer([text], return_tensors="pt").to(model.device)

        with torch.no_grad():
            generated_ids = model.generate(
                **model_inputs,
                max_new_tokens=max_new_tokens,
                temperature=temperature,
                top_p=top_p,
                top_k=top_k,
                do_sample=True,
                pad_token_id=tokenizer.eos_token_id,
            )

        generated_ids = [
            output_ids[len(input_ids):] for input_ids, output_ids in zip(model_inputs.input_ids, generated_ids)
        ]

        response_text = tokenizer.batch_decode(generated_ids, skip_special_tokens=True)[0]

    return _parse_analysis_response(response_text)


def _parse_analysis_response(response_text):
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


LINE_PROCESSING_PROMPT_TEMPLATE = """你的任务：提取小说中的人物说话内容，并分行输出 JSON 数组。

## 核心规则
1. 找出所有被双引号""包裹的、表示"说话"的文本,独立成一行
2. 通过上下文判断说话人是谁，保存到 speaker
3. 没有被引号包裹的内容，全部归类为"叙事"，也独立成行
4. 如果原文中包含叙事内容，同时也包含对话内容，那么就将叙事内容和对话内容分别独立成行。

## speaker 提取规则
- 如果原文在对话前面有 "XXX：" 或 "XXX说" 等标记，直接提取 XXX 作为 speaker
- 如果没有明确标记，通过上下文推断：谁在说话、谁在回应
- 推断不出则填 "未知"

## 重要约束
- 原文内容一个字都不能少、一个字都不能改
- original_text 必须保留原文完整片段，不能截断

## 输出示例
原文：
    "请将参军证明卡插入。"一句甜美的电脑合成音传出。站在狭窄椭圆形物体里面的唐龙忙把申请到的卡片插入一个磁卡孔。
    "姓名：唐龙、年龄：18、性别：男、文化：高中、报到兵种：步兵。"随着电脑上出现的数据，合成音再次响起："准备身份检查。"

输出：
[
  {{"line_number":1,"original_text":"\"请将参军证明卡插入。\"","speaker":"电脑合成音","dialogue":"请将参军证明卡插入。","description":"对话"}},
  {{"line_number":2,"original_text":"一句甜美的电脑合成音传出。站在狭窄椭圆形物体里面的唐龙忙把申请到的卡片插入一个磁卡孔。","speaker":"","dialogue":"一句甜美的电脑合成音传出。站在狭窄椭圆形物体里面的唐龙忙把申请到的卡片插入一个磁卡孔。","description":"叙事"}},
  {{"line_number":3,"original_text":"\"姓名：唐龙、年龄：18、性别：男、文化：高中、报到兵种：步兵。\"","speaker":"电脑合成音","dialogue":"姓名：唐龙、年龄：18、性别：男、文化：高中、报到兵种：步兵。","description":"对话"}},
  {{"line_number":4,"original_text":"随着电脑上出现的数据，合成音再次响起","speaker":"","dialogue":"唐龙忙站着不动，眼睛瞪得大大的。","description":"叙事"}}
  {{"line_number":5,"original_text":"\"准备身份检查。\"","speaker":"电脑合成音","dialogue":"准备身份检查。","description":"对话"}},
]

## ⚠️ 只输出 JSON 数组，不要输出任何其他文字。

{novel_text}"""


def _split_text_into_segments(text, max_chars=800):
    """将文本按句子边界分段，每段约 max_chars 字，以 。 ； \\n 为分割点"""
    sentences = re.split(r'(?<=[。；\n])', text)
    segments = []
    current = ""
    
    for sentence in sentences:
        if not sentence:
            continue
        if len(current) + len(sentence) <= max_chars:
            current += sentence
        else:
            if current:
                segments.append(current)
            # 如果单句超过限制，强制按 max_chars 切
            if len(sentence) > max_chars:
                for i in range(0, len(sentence), max_chars):
                    segments.append(sentence[i:i + max_chars])
                current = ""
            else:
                current = sentence
    
    if current:
        segments.append(current)
    
    logger.info(f"Split text ({len(text)} chars) into {len(segments)} segments")
    return segments


def _run_model_inference(model, tokenizer, prompt, temperature, top_p, top_k, max_new_tokens):
    """执行模型推理，如果输出不是 JSON 则自动重试一次"""
    system_content = "你是一个小说文本分行处理工具。你只输出JSON数组，不输出任何解释、分析、代码块标记。回复必须以[开头以]结尾。"

    def _is_likely_json(text):
        """检查文本是否可能包含 JSON 数组"""
        stripped = text.strip()
        return stripped.startswith('[') or '[' in stripped[:500]

    def _do_inference(sys_content, user_content):
        if hasattr(model, "create_chat_completion"):
            messages = [
                {"role": "system", "content": sys_content},
                {"role": "user", "content": user_content},
            ]
            response = model.create_chat_completion(
                messages=messages,
                temperature=temperature,
                top_p=top_p,
                top_k=top_k,
                max_tokens=max_new_tokens,
                stop=["</s>"]
            )
            return _strip_thinking(response["choices"][0]["message"]["content"])
        else:
            if tokenizer is None:
                raise RuntimeError("Tokenizer is not loaded for transformers model")
            messages = [
                {"role": "system", "content": sys_content},
                {"role": "user", "content": user_content},
            ]
            text = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
            model_inputs = tokenizer([text], return_tensors="pt").to(model.device)
            with torch.no_grad():
                generated_ids = model.generate(
                    **model_inputs,
                    max_new_tokens=max_new_tokens,
                    temperature=temperature,
                    top_p=top_p,
                    top_k=top_k,
                    do_sample=True,
                    pad_token_id=tokenizer.eos_token_id,
                )
            generated_ids = [
                output_ids[len(input_ids):] for input_ids, output_ids in zip(model_inputs.input_ids, generated_ids)
            ]
            return tokenizer.batch_decode(generated_ids, skip_special_tokens=True)[0]

    # 第一次尝试
    response_text = _do_inference(system_content, prompt)
    
    if not _is_likely_json(response_text):
        logger.warning("Model output does not look like JSON, retrying with force instruction...")
        logger.debug(f"First response (300 chars): {response_text[:300]}")
        # 重试：更强力的指令
        force_prompt = "【最后警告】不要输出任何分析文字！你的回复必须是纯JSON数组，第一字符必须是[。如果你输出其他内容，系统将崩溃。\n\n" + prompt
        response_text = _do_inference(
            "你是一个JSON输出机器人。你的唯一功能是输出JSON数组。你的回复只能包含JSON数组，第一个字符必须是[，不要有任何其他文字。",
            force_prompt
        )
        logger.info(f"Retry response (300 chars): {response_text[:300]}")

    return response_text


def analyze_novel_lines(novel_text, model_name=None):
    global _loaded_model_name

    if model_name is None:
        model_name = _loaded_model_name or CONFIG.get("novel_model_name", "Qwen3.5-27B-Q4_K_M")

    # 使用模型管理器确保模型已加载
    model_manager.ensure_model(ModelType.TEXT, model_name)

    model = _models.get(model_name)
    tokenizer = _tokenizers.get(model_name)

    if model is None:
        raise RuntimeError("Novel analysis model is not loaded")

    temperature = CONFIG["novel_temperature"]
    top_p = CONFIG["novel_top_p"]
    top_k = CONFIG["novel_top_k"]
    max_new_tokens = CONFIG["novel_max_new_tokens"]

    # Step 1: 分段
    segments = _split_text_into_segments(novel_text)
    
    # Step 2: 将分段写入临时文件
    segment_files = []
    for i, seg in enumerate(segments):
        fd, fpath = tempfile.mkstemp(suffix='.txt', prefix=f'novel_seg_{i}_')
        with os.fdopen(fd, 'w', encoding='utf-8') as f:
            f.write(seg)
        segment_files.append(fpath)
    
    all_lines = []
    max_segment_retries = 3
    
    try:
        # Step 3: 逐段发送到模型处理（每段最多重试3次）
        for i, (seg, fpath) in enumerate(zip(segments, segment_files)):
            logger.info(f"Processing segment {i+1}/{len(segments)} ({len(seg)} chars)")
            
            prompt = LINE_PROCESSING_PROMPT_TEMPLATE.format(novel_text=seg)
            
            lines = None
            for retry in range(max_segment_retries):
                response_text = _run_model_inference(
                    model, tokenizer, prompt,
                    temperature, top_p, top_k, max_new_tokens
                )
                
                logger.info(f"Segment {i+1} attempt {retry+1} raw response length: {len(response_text)}")
                
                # Step 4: 解析该段的 JSON 结果
                parsed = _parse_line_processing_response(response_text)
                lines = parsed.get("lines", [])
                logger.info(f"Segment {i+1} attempt {retry+1} extracted {len(lines)} lines")
                
                if lines:
                    break  # 成功解析到行数据，退出重试循环
                
                if retry < max_segment_retries - 1:
                    # 解析失败，重试时使用更强力的 prompt
                    prompt = ("【重要：只输出JSON！上一个回复没有包含有效的JSON数组，本次必须输出纯JSON！】\n\n"
                              + LINE_PROCESSING_PROMPT_TEMPLATE.format(novel_text=seg))
                    logger.warning(f"Segment {i+1} attempt {retry+1} returned 0 lines, retrying ({retry+2}/{max_segment_retries})...")
            
            if not lines:
                logger.error(f"Segment {i+1} failed after {max_segment_retries} retries, aborting entire processing")
                all_lines = []
                break
            
            all_lines.extend(lines)
        
        # Step 5: 重新计算行号
        for j, line in enumerate(all_lines):
            if isinstance(line, dict):
                line["line_number"] = j + 1
        
        # Step 6: 统一后处理
        all_lines = _post_process_lines(all_lines)
        
        logger.info(f"Total lines after merge: {len(all_lines)}")
    finally:
        # Step 7: 清理临时文件
        for fpath in segment_files:
            try:
                os.unlink(fpath)
            except OSError:
                pass
    
    return {"lines": all_lines}


def _parse_line_processing_response(response_text):
    result = {
        "lines": [],
    }

    json_str = response_text.strip()

    logger.info(f"Parsing response, original length: {len(json_str)}")

    if "```json" in json_str:
        json_str = json_str.split("```json", 1)[1]
        json_str = json_str.split("```", 1)[0]
        logger.info("Found ```json``` code block")
    elif "```" in json_str:
        json_str = json_str.split("```", 1)[1]
        json_str = json_str.split("```", 1)[0]
        logger.info("Found generic ``` code block")
    
    json_str = json_str.strip()

    try:
        parsed = json.loads(json_str)
        logger.info(f"Successfully parsed JSON, type: {type(parsed)}")
        
        if isinstance(parsed, list):
            result["lines"] = parsed
            logger.info(f"Parsed {len(parsed)} lines from JSON array")
        elif isinstance(parsed, dict):
            if "lines" in parsed:
                result["lines"] = parsed["lines"]
                logger.info(f"Parsed {len(result['lines'])} lines from 'lines' field")
            else:
                logger.warning(f"JSON is a dict but no 'lines' field found. Keys: {list(parsed.keys())}")
                
    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse response as JSON: {e}")
        logger.error(f"JSON string that failed to parse (first 1000 chars): {json_str[:1000]}")
        
        import re
        
        json_match = re.search(r'\[.*\]', json_str, re.DOTALL)
        if json_match:
            try:
                array_str = json_match.group(0)
                parsed = json.loads(array_str)
                result["lines"] = parsed
                logger.info(f"Extracted JSON array using regex, got {len(parsed)} lines")
            except Exception as regex_e:
                logger.error(f"Regex extraction also failed: {regex_e}")
                logger.error(f"Trying to fix broken JSON...")
                fixed_str = _fix_broken_json(array_str)
                if fixed_str:
                    result["lines"] = fixed_str
                    logger.info(f"Fixed JSON, got {len(fixed_str)} lines")

    # 后处理：修复模型输出中的常见问题
    result["lines"] = _post_process_lines(result["lines"])

    logger.info(f"Final result: {len(result['lines'])} lines extracted")
    return result


def _fix_broken_json(json_str):
    """尝试修复未闭合的 JSON 字符串"""
    try:
        import re
        lines = []
        current_line = None
        current_fields = {}
        
        for line in json_str.split('\n'):
            line = line.strip()
            if '"line_number"' in line:
                if current_line:
                    lines.append(current_line)
                match = re.search(r'"line_number"\s*:\s*(\d+)', line)
                current_line = {"line_number": int(match.group(1)) if match else 0}
            elif '"original_text"' in line:
                match = re.search(r'"original_text"\s*:\s*"((?:[^"\\]|\\.)*)"', line)
                if match:
                    current_fields["original_text"] = match.group(1)
            elif '"processed_text"' in line:
                match = re.search(r'"processed_text"\s*:\s*"((?:[^"\\]|\\.)*)"', line)
                if match:
                    current_fields["processed_text"] = match.group(1)
            elif '"dialogue"' in line:
                match = re.search(r'"dialogue"\s*:\s*"((?:[^"\\]|\\.)*)"', line)
                if match:
                    current_fields["dialogue"] = match.group(1)
            elif '"speaker"' in line:
                match = re.search(r'"speaker"\s*:\s*"((?:[^"\\]|\\.)*)"', line)
                if match:
                    current_fields["speaker"] = match.group(1)
            elif '"description"' in line:
                match = re.search(r'"description"\s*:\s*"((?:[^"\\]|\\.)*)"', line)
                if match:
                    current_fields["description"] = match.group(1)
                    if current_line:
                        current_line.update(current_fields)
                        current_fields = {}
        
        if current_line:
            lines.append(current_line)
        
        return lines if lines else None
    except Exception as e:
        logger.error(f"JSON fix failed: {e}")
        return None


def _post_process_lines(lines):
    """后处理：适配新的 speaker/dialogue 字段，同时兼容旧的 processed_text 格式"""
    import re
    
    processed_lines = []
    seen_originals = {}
    
    for line in lines:
        if not isinstance(line, dict):
            continue
        
        original_text = line.get("original_text", "")
        description = line.get("description", "")
        line_number = line.get("line_number", 0)
        speaker = line.get("speaker", "")
        dialogue = line.get("dialogue", "")
        processed_text = line.get("processed_text", "")

        # 去重
        original_key = original_text.strip()
        if original_key in seen_originals:
            logger.warning(f"跳过重复行 (line_number={line_number}): '{original_key[:50]}'")
            continue
        seen_originals[original_key] = True

        # 新格式：有 speaker/dialogue 字段
        if speaker or dialogue:
            # 处理可能还包含旧标签的情况（模型可能混用）
            speaker = re.sub(r'<[^>]+>', '', speaker).strip()
            dialogue = re.sub(r'<[^>]+>', '', dialogue).strip()

            # 如果 speaker 非空但 description 不是对话，修正 description
            if speaker and not description:
                description = "对话"
            elif not speaker and not description:
                description = "叙事"

            # 填充 processed_text 保持兼容
            if not processed_text:
                if speaker:
                    processed_text = dialogue
                else:
                    processed_text = dialogue or original_text

            processed_lines.append({
                "line_number": line_number,
                "original_text": original_text,
                "processed_text": processed_text,
                "speaker": speaker,
                "dialogue": dialogue,
                "description": description,
            })
            continue

        # 旧格式兼容：从 processed_text 中解析 speaker
        if processed_text:
            role_match = re.search(r'<角色:([^>]+)>', processed_text)
            emotion_match = re.search(r'<情绪:([^>]+)>', processed_text)

            if role_match:
                speaker = role_match.group(1)
                # 去掉标签得到纯对话内容
                dialogue = re.sub(r'<[^>]+>', '', processed_text).strip()
                if not description:
                    description = "对话"
            else:
                speaker = ""
                dialogue = processed_text.strip()
                if not description:
                    description = "叙事"

            processed_lines.append({
                "line_number": line_number,
                "original_text": original_text,
                "processed_text": processed_text,
                "speaker": speaker,
                "dialogue": dialogue,
                "description": description,
            })
            continue

        # 没有任何有效内容，跳过
        if not processed_text and not speaker and not dialogue:
            logger.warning(f"跳过空行 (line_number={line_number})")
            continue

    return processed_lines


def _strip_thinking(text):
    """剥离模型思考过程，仅保留最终输出"""
    import re
    # 去除  思考... 标签包裹的内容
    text = re.sub(r'.*?</think>\s*', '', text, flags=re.DOTALL)
    return text.strip()


TEXT_FORMAT_PROMPT_TEMPLATE = """你的任务是格式化小说文本。规则：
1. 按语义、句号、问号拆分段落，合理分行
2. 统一标点符号，修正错用漏用
3. 所有双引号包裹的对话内容必须原样保留，不得删除或改写引号及引号内的文字
4. 每句结尾必须用"。"，规范使用"、"、"，"
5. 不得删减、概括、压缩任何文字内容，只做格式调整

**只输出处理后的正文，不要输出任何分析、说明、标题、分隔线。直接输出小说内容。
**不输出任何解释、备注、额外内容。
{text}"""


def _strip_format_analysis(text, original_text=None):
    """剥离格式化输出中的分析过程，只保留最终正文
    
    Args:
        text: 模型输出的文本
        original_text: 原始输入文本（用于锚点定位正文起始位置）
    """
    import re

    original_len = len(text)

    # 0. 最稳健的方法：用原文锚点定位正文起始位置
    #    格式化输出必然包含原文内容，找到原文首次出现的位置，之前的内容全部丢弃
    if original_text:
        # 提取原文前几个有意义的字符（跳过空白），作为搜索锚点
        anchor = original_text.strip()[:30]
        if len(anchor) >= 6:
            # 在输出中搜索锚点（允许标点差异，取前8个非空白字符做模糊匹配）
            anchor_core = re.sub(r'\s+', '', anchor)[:8]
            if anchor_core:
                # 逐字符搜索锚点核心内容
                for i in range(len(text)):
                    # 从位置 i 开始，尝试匹配锚点核心字符（跳过标点差异）
                    match_pos = _fuzzy_find_start(text, anchor_core, i)
                    if match_pos is not None and match_pos < len(text) * 0.5:
                        # 只在输出前半部分匹配才算分析头
                        before = text[:match_pos].strip()
                        if before and len(before) > 10:
                            # 检查 before 是否像分析文本（含关键词或长度异常）
                            if re.search(r'分析|规则|要求|提示词|首先|然后|我需要|让我|现在.*?分析|处理.*?文本', before, re.IGNORECASE):
                                clean = text[match_pos:].strip()
                                logger.info(f"[Format] Anchor-based strip: {original_len} → {len(clean)} chars (anchor: '{anchor_core}')")
                                text = clean
                                break
                        elif len(before) > 50:
                            # 前缀太长但不含关键词，仍可能是分析
                            clean = text[match_pos:].strip()
                            logger.info(f"[Format] Anchor-based strip (long prefix): {original_len} → {len(clean)} chars")
                            text = clean
                            break

    # 1. 剥离 markdown 标题标记后的正文
    markers = [
        r'#+\s*处理后的正文\s*',
        r'#+\s*格式化后的文本\s*',
        r'#+\s*输出结果\s*',
        r'-{3,}\s*',
    ]
    for marker in markers:
        m = re.search(marker, text)
        if m:
            after = text[m.end():].strip()
            if after and len(after) > 20:
                logger.info(f"[Format] Stripped analysis marker, kept {len(after)} chars")
                return after

    # 2. 逐行扫描，跳过开头的分析行
    lines = text.split('\n')
    content_start = 0
    for i, line in enumerate(lines):
        stripped = line.strip()
        if not stripped:
            continue
        # markdown 标题含分析关键词
        if re.match(r'^#', stripped) and re.search(r'分析|问题|识别|检查|评估|报告|处理|格式化', stripped):
            content_start = i + 1
            continue
        # 分隔线
        if re.match(r'^-{3,}$', stripped):
            content_start = i + 1
            continue
        # 分析性语句
        if re.search(r'^(首先|然后|规则|现在|让我|好的|我需要|我来看|检查文本|分析文本|输出要求)', stripped):
            content_start = i + 1
            continue
        # 数字编号规则说明
        if re.match(r'^\d+\.\s', stripped) and re.search(r'规则|要求|注意|检查|需要|拆分|统一|保留|删减', stripped):
            content_start = i + 1
            continue
        # 遇到实际小说内容行就停止
        break

    if content_start > 0:
        text = '\n'.join(lines[content_start:]).strip()

    # 3. 去除代码块标记
    text = re.sub(r'\n```\s*$', '', text)
    text = re.sub(r'^```\w*\n', '', text)

    if len(text) != original_len:
        logger.info(f"[Format] Stripped analysis: {original_len} → {len(text)} chars")
    return text


def _fuzzy_find_start(text, anchor_core, start_pos=0):
    """在 text 中从 start_pos 开始模糊查找 anchor_core 的起始位置
    
    允许标点差异（中文标点可被替换或省略），但核心汉字必须连续匹配
    """
    if start_pos >= len(text):
        return None
    
    anchor_idx = 0
    text_idx = start_pos
    
    while text_idx < len(text) and anchor_idx < len(anchor_core):
        tc = text[text_idx]
        ac = anchor_core[anchor_idx]
        
        if tc == ac:
            anchor_idx += 1
            text_idx += 1
        elif _is_chinese_punct(tc) or tc in ' \t\n\r，。、；：！？""''—…·':
            # 跳过标点和空白
            text_idx += 1
        elif _is_chinese_punct(ac):
            # 锚点中的标点在输出中可能被省略，跳过锚点标点
            anchor_idx += 1
        else:
            # 字符不匹配，从下一个位置重新开始
            return None
    
    if anchor_idx >= len(anchor_core):
        # 匹配成功，回溯找到匹配的起始位置
        # 从 text_idx 往前数 anchor_core 中匹配的字符数
        matched_chars = 0
        pos = text_idx - 1
        while pos >= start_pos and matched_chars < len(anchor_core):
            if text[pos] == anchor_core[len(anchor_core) - 1 - matched_chars]:
                matched_chars += 1
            pos -= 1
        return pos + 1 if matched_chars >= len(anchor_core) * 0.8 else start_pos
    
    return None


def _is_chinese_punct(ch):
    """判断是否是中文标点"""
    return ch in '，。、；：！？""''—…·〈〉《》【】（）〔〕'


def format_text(prompt, text, model_name=None):
    """
    文本格式化处理（分段处理，避免超长文本导致输出截断）

    Args:
        prompt: 处理提示词（已废弃，使用默认提示词）
        text: 待处理的文本
        model_name: 模型名称（可选）

    Returns:
        处理后的文本
    """
    global _loaded_model_name

    if model_name is None:
        model_name = _loaded_model_name or CONFIG.get("novel_model_name", "Qwen3.5-27B-Q4_K_M")

    # 使用模型管理器确保模型已加载
    model_manager.ensure_model(ModelType.TEXT, model_name)

    model = _models.get(model_name)
    tokenizer = _tokenizers.get(model_name)

    if model is None:
        raise RuntimeError("Novel analysis model is not loaded")

    temperature = CONFIG["novel_temperature"]
    top_p = CONFIG["novel_top_p"]
    top_k = CONFIG["novel_top_k"]
    max_new_tokens = CONFIG["novel_max_new_tokens"]

    # Step 1: 分段
    segments = _split_text_into_segments(text)
    logger.info(f"[TextFormat] Split into {len(segments)} segments, total {len(text)} chars")

    # Step 2: 写入临时文件
    segment_files = []
    for i, seg in enumerate(segments):
        fd, fpath = tempfile.mkstemp(suffix='.txt', prefix=f'fmt_seg_{i}_')
        with os.fdopen(fd, 'w', encoding='utf-8') as f:
            f.write(seg)
        segment_files.append(fpath)

    all_results = []

    try:
        # Step 3: 逐段处理
        for i, (seg, fpath) in enumerate(zip(segments, segment_files)):
            logger.info(f"[TextFormat] Processing segment {i+1}/{len(segments)} ({len(seg)} chars)")

            seg_prompt = TEXT_FORMAT_PROMPT_TEMPLATE.format(text=seg)
            response_text = _run_model_inference(
                model, tokenizer, seg_prompt,
                temperature, top_p, top_k, max_new_tokens
            )

            # 剥离思考过程和分析文本
            response_text = _strip_thinking(response_text)
            response_text = _strip_format_analysis(response_text, original_text=seg)
            logger.info(f"[TextFormat] Segment {i+1} result length: {len(response_text)}")
            all_results.append(response_text)

        # Step 4: 合并结果
        final_text = '\n'.join(all_results).strip()
        logger.info(f"[TextFormat] Merged result: {len(all_results)} segments → {len(final_text)} chars")
        return final_text
    finally:
        # Step 5: 清理临时文件
        for fpath in segment_files:
            try:
                os.unlink(fpath)
            except OSError:
                pass
