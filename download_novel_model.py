#!/usr/bin/env python3
"""从 ModelScope 下载 Qwen3.5-27B-Q4_K_M GGUF 文本分析模型 (~16GB)"""

import os
from modelscope import snapshot_download

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_FILE = "Qwen3.5-27B-Q4_K_M.gguf"
OUTPUT_PATH = os.path.join(BASE_DIR, "models", MODEL_FILE)

# ModelScope 上的 GGUF 仓库
MODEL_ID = "qwen/Qwen3.5-27B-Instruct-GGUF"


def main():
    if os.path.isfile(OUTPUT_PATH):
        size_gb = os.path.getsize(OUTPUT_PATH) / (1024 ** 3)
        print(f"模型已存在，跳过: {OUTPUT_PATH} ({size_gb:.1f} GB)")
        return

    print(f"从 ModelScope 下载: {MODEL_ID}")
    print(f"输出: {OUTPUT_PATH}")

    # snapshot_download 会下载整个仓库的所有 GGUF 文件
    # 下载完成后 models/ 目录下会有所需的 GGUF 文件
    snapshot_download(
        model_id=MODEL_ID,
        local_dir=os.path.join(BASE_DIR, "models"),
    )

    if os.path.isfile(OUTPUT_PATH):
        size_gb = os.path.getsize(OUTPUT_PATH) / (1024 ** 3)
        print(f"\n下载完成: {OUTPUT_PATH} ({size_gb:.1f} GB)")
    else:
        print(f"\n下载完成，但未找到 {MODEL_FILE}，请检查 models/ 目录")


if __name__ == "__main__":
    main()
