#!/usr/bin/env python3
"""从 ModelScope 下载 Real-ESRGAN 图片超分辨率模型 (~128MB)"""

import os
import sys
import subprocess

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_DIR = os.path.join(BASE_DIR, "models", "realesrgan")

MODEL_REPO = "chenmingyu/real-esrgan"
MODEL_FILES = [
    ("RealESRGAN_x4plus.pth", "通用 4x 放大"),
    ("RealESRGAN_x2plus.pth", "通用 2x 放大"),
]


def main():
    os.makedirs(MODEL_DIR, exist_ok=True)

    for filename, desc in MODEL_FILES:
        dest = os.path.join(MODEL_DIR, filename)
        if os.path.isfile(dest):
            size_mb = os.path.getsize(dest) / (1024 * 1024)
            print(f"已存在，跳过: {filename} ({size_mb:.1f} MB) - {desc}")
            continue

        print(f"从 ModelScope 下载: {filename} ({desc})")
        cmd = [
            sys.executable, "-m", "modelscope", "download",
            "--model", MODEL_REPO,
            "--local_dir", MODEL_DIR,
            "--include", filename,
        ]
        result = subprocess.run(cmd, capture_output=False, text=True)
        if result.returncode != 0:
            print(f"  失败: {filename}")
            continue

        if os.path.isfile(dest):
            size_mb = os.path.getsize(dest) / (1024 * 1024)
            print(f"  完成: {filename} ({size_mb:.1f} MB)")

    print(f"\n模型目录: {MODEL_DIR}")
    files = sorted(f for f in os.listdir(MODEL_DIR) if f.endswith(".pth"))
    if files:
        print(f"已下载模型 ({len(files)}):")
        for f in files:
            size_mb = os.path.getsize(os.path.join(MODEL_DIR, f)) / (1024 * 1024)
            print(f"  {f} ({size_mb:.1f} MB)")
    print("\n模型已就绪")


if __name__ == "__main__":
    main()
