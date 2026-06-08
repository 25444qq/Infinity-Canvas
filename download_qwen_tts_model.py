#!/usr/bin/env python3
"""从 ModelScope 下载 Qwen3-TTS 语音合成模型 (Base + VoiceDesign, 合计约 8.6GB)"""

import os
from modelscope import snapshot_download

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

MODELS = [
    {
        "model_id": "qwen/Qwen3-TTS-12Hz-1.7B-Base",
        "output_dir": os.path.join(BASE_DIR, "models", "qwen3_tts_12hz_1_7b_base"),
        "desc": "Base (声音克隆 / 预设角色)",
    },
    {
        "model_id": "qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign",
        "output_dir": os.path.join(BASE_DIR, "models", "qwen3_tts_12hz_1_7b_voicedesign"),
        "desc": "VoiceDesign (声音描述生成语音)",
    },
]


def main():
    for info in MODELS:
        if os.path.isdir(info["output_dir"]) and os.listdir(info["output_dir"]):
            print(f"已存在，跳过: {info['desc']}")
            continue

        os.makedirs(info["output_dir"], exist_ok=True)
        print(f"从 ModelScope 下载: {info['desc']} ({info['model_id']})")
        snapshot_download(model_id=info["model_id"], local_dir=info["output_dir"])
        print(f"完成: {info['output_dir']}")

    print("\n全部下载完成")


if __name__ == "__main__":
    main()
