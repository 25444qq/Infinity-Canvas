#!/usr/bin/env python3
"""从 ModelScope 下载 FLUX.2-klein-4B 图像生成模型 (~23GB)"""

import os
from modelscope import snapshot_download

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_ID = "black-forest-labs/FLUX.2-klein-4B"
OUTPUT_DIR = os.path.join(BASE_DIR, "models", "FLUX.2-klein-4B")


def main():
    if os.path.isdir(OUTPUT_DIR) and os.listdir(OUTPUT_DIR):
        print(f"模型已存在，跳过: {OUTPUT_DIR}")
        return

    os.makedirs(OUTPUT_DIR, exist_ok=True)
    print(f"从 ModelScope 下载: {MODEL_ID}")
    print(f"输出目录: {OUTPUT_DIR}")
    snapshot_download(model_id=MODEL_ID, local_dir=OUTPUT_DIR)
    print(f"\n下载完成: {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
