"""
模型注册与配置管理
对应前端 services/mode/config.ts + types.ts
"""

import json
import os
from typing import Optional, Dict, List

# ---------- 类型定义 ----------

MODEL_REGISTRY: Dict[str, dict] = {
    # --- Image Models ---
    "Flux2": {
        "id": "FLUX.2-klein-4B",
        "name": "Flux 2",
        "type": "IMAGE_GEN",
        "category": "IMAGE",
        "defaultEndpoint": "/image/generate",
        "defaultBaseUrl": "http://localhost:8080",
    },
    # --- Text Models ---
    "Qwen3.5-27B": {
        "id": "Qwen3.5-27B",
        "name": "Qwen3.5-27B",
        "type": "TEXT_GEN",
        "category": "TEXT",
        "defaultEndpoint": "/text",
        "defaultBaseUrl": "http://localhost:8080",
    },
    # --- Audio Models ---
    "Qwen3-TTS": {
        "id": "Qwen3-TTS-12Hz-1.7B",
        "name": "Qwen3-TTS",
        "type": "AUDIO_GEN",
        "category": "AUDIO",
        "defaultEndpoint": "/audio/tts",
        "defaultBaseUrl": "http://localhost:8080",
    },
    "MOSS-TTS": {
        "id": "MOSS-TTS",
        "name": "MOSS-TTS",
        "type": "AUDIO_GEN",
        "category": "AUDIO",
        "defaultEndpoint": "/audio/tts",
        "defaultBaseUrl": "http://localhost:8080",
    },
}

# 配置文件路径
CONFIG_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "config")
MODEL_CONFIG_FILE = os.path.join(CONFIG_DIR, "model_configs.json")
CUSTOM_MODELS_FILE = os.path.join(CONFIG_DIR, "custom_models.json")
DELETED_MODELS_FILE = os.path.join(CONFIG_DIR, "deleted_models.json")


def _ensure_config_dir():
    os.makedirs(CONFIG_DIR, exist_ok=True)


def _read_json(filepath: str, default=None):
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return default if default is not None else {}


def _write_json(filepath: str, data):
    _ensure_config_dir()
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def load_custom_models() -> dict:
    return _read_json(CUSTOM_MODELS_FILE, {})


def load_deleted_models() -> set:
    data = _read_json(DELETED_MODELS_FILE, [])
    return set(data)


# 初始化时清理已删除模型
def _init_registry():
    deleted = load_deleted_models()
    custom = load_custom_models()
    # 先删除被标记的模型
    for key in deleted:
        MODEL_REGISTRY.pop(key, None)
    # 加载自定义模型
    MODEL_REGISTRY.update(custom)


_init_registry()


def get_all_models() -> dict:
    """获取所有可见模型"""
    return dict(MODEL_REGISTRY)


def get_model_config(model_name: str) -> dict:
    """获取模型配置，优先使用用户保存的配置"""
    def_config = MODEL_REGISTRY.get(model_name)
    base_url = os.environ.get("DEFAULT_API_BASE_URL", "")

    base_config = {
        "baseUrl": def_config.get("defaultBaseUrl", base_url) if def_config else base_url,
        "key": "",
        "modelId": def_config.get("id", "") if def_config else "",
        "endpoint": def_config.get("defaultEndpoint", "/v1/chat/completions") if def_config else "/v1/chat/completions",
        "queryEndpoint": def_config.get("defaultQueryEndpoint", "") if def_config else "",
        "downloadEndpoint": def_config.get("defaultDownloadEndpoint", "") if def_config else "",
    }

    # 读取用户保存的配置
    configs = _read_json(MODEL_CONFIG_FILE, {})
    if model_name in configs:
        saved = configs[model_name]
        base_config.update(saved)

    return base_config


def save_model_config(model_name: str, config: dict):
    """保存模型配置"""
    configs = _read_json(MODEL_CONFIG_FILE, {})
    configs[model_name] = {
        "baseUrl": config.get("baseUrl", ""),
        "key": config.get("key", ""),
        "modelId": config.get("modelId", ""),
        "endpoint": config.get("endpoint", ""),
        "queryEndpoint": config.get("queryEndpoint", ""),
        "downloadEndpoint": config.get("downloadEndpoint", ""),
    }
    _write_json(MODEL_CONFIG_FILE, configs)


def register_custom_model(key: str, def_config: dict):
    """注册自定义模型"""
    MODEL_REGISTRY[key] = def_config
    custom = load_custom_models()
    custom[key] = def_config
    _write_json(CUSTOM_MODELS_FILE, custom)


def delete_model(key: str) -> bool:
    """删除模型"""
    if key not in MODEL_REGISTRY:
        return False

    del MODEL_REGISTRY[key]

    # 从自定义模型存储中删除
    custom = load_custom_models()
    if key in custom:
        del custom[key]
        _write_json(CUSTOM_MODELS_FILE, custom)

    # 记录已删除的内置模型
    deleted = load_deleted_models()
    deleted.add(key)
    _write_json(DELETED_MODELS_FILE, list(deleted))

    # 删除该模型的配置
    configs = _read_json(MODEL_CONFIG_FILE, {})
    configs.pop(key, None)
    _write_json(MODEL_CONFIG_FILE, configs)

    return True


def is_custom_model(key: str) -> bool:
    custom = load_custom_models()
    return key in custom


def get_visible_models() -> List[str]:
    return list(MODEL_REGISTRY.keys())
