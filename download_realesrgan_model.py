#!/usr/bin/env python3
"""
下载 Real-ESRGAN 模型权重文件（从 ModelScope 下载）

项目运行时完全离线，因此启动服务前必须用此脚本预先下载模型权重。

============================================================
使用方式（在有网络的机器上执行一次即可）:
============================================================

  # 下载全部模型（约 128MB）
  python download_realesrgan_model.py

  # 查看可用模型列表
  python download_realesrgan_model.py --list

  # 只下载指定模型（可同时指定多个）
  python download_realesrgan_model.py RealESRGAN_x4plus
  python download_realesrgan_model.py RealESRGAN_x4plus RealESRGAN_x2plus

============================================================
模型文件保存到 models/realesrgan/ 目录。
下载完成后把整个项目目录拷贝到离线机器即可使用。
============================================================

可用模型 (来自 ModelScope chenmingyu/real-esrgan):
  - RealESRGAN_x4plus  (通用 4x 放大, 64MB)
  - RealESRGAN_x2plus  (通用 2x 放大, 64MB)
"""

import os
import sys
import subprocess

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_DIR = os.path.join(BASE_DIR, "models", "realesrgan")

MODEL_REPOS = {
    "RealESRGAN_x4plus": {
        "repo": "chenmingyu/real-esrgan",
        "filename": "RealESRGAN_x4plus.pth",
        "size_mb": 64,
    },
    "RealESRGAN_x2plus": {
        "repo": "chenmingyu/real-esrgan",
        "filename": "RealESRGAN_x2plus.pth",
        "size_mb": 64,
    },
}


def _run_modelscope_download(repo: str, local_dir: str, include: str) -> bool:
    """使用 ModelScope CLI 下载模型文件"""
    cmd = [
        sys.executable, "-m", "modelscope", "download",
        "--model", repo,
        "--local_dir", local_dir,
        "--include", include,
    ]
    try:
        result = subprocess.run(cmd, capture_output=False, text=True)
        return result.returncode == 0
    except Exception as e:
        print(f"  Error: {e}")
        return False


def main():
    os.makedirs(MODEL_DIR, exist_ok=True)

    args = sys.argv[1:]
    if args and args[0] == "--list":
        print("Available models (from ModelScope):")
        for name, info in MODEL_REPOS.items():
            print(f"  {name} ({info['size_mb']} MB) - {info['repo']}#{info['filename']}")
        return

    # 默认下载所有模型
    models_to_download = list(MODEL_REPOS.keys()) if not args else args

    print(f"Model directory: {MODEL_DIR}")
    print(f"Source: ModelScope")
    print(f"Models to download: {', '.join(models_to_download)}")
    print("-" * 60)

    for model_name in models_to_download:
        if model_name not in MODEL_REPOS:
            print(f"Unknown model: {model_name}")
            print(f"Available: {list(MODEL_REPOS.keys())}")
            continue

        info = MODEL_REPOS[model_name]
        dest = os.path.join(MODEL_DIR, info["filename"])

        if os.path.exists(dest):
            size_mb = os.path.getsize(dest) / (1024 * 1024)
            if abs(size_mb - info["size_mb"]) < 1:
                print(f"[{model_name}] Already exists ({size_mb:.1f} MB): {dest}")
                continue

        print(f"\n[{model_name}] Downloading ({info['size_mb']} MB) from ModelScope...")
        success = _run_modelscope_download(
            repo=info["repo"],
            local_dir=MODEL_DIR,
            include=info["filename"],
        )

        if success:
            if os.path.exists(dest):
                size_mb = os.path.getsize(dest) / (1024 * 1024)
                print(f"[{model_name}] Done ({size_mb:.1f} MB)")
            else:
                print(f"[{model_name}] Warning: download succeeded but file not found")
        else:
            print(f"[{model_name}] Download failed")

    print("\n" + "=" * 60)
    print("Download complete!")
    print(f"Models saved to: {MODEL_DIR}")

    # 列出已下载的模型
    if os.path.exists(MODEL_DIR):
        files = [f for f in os.listdir(MODEL_DIR) if f.endswith(".pth")]
        if files:
            print(f"\nDownloaded models ({len(files)}):")
            for f in sorted(files):
                size_mb = os.path.getsize(os.path.join(MODEL_DIR, f)) / (1024 * 1024)
                print(f"  {f} ({size_mb:.1f} MB)")
        else:
            print("\nNo models found.")

    print("\n" + "=" * 60)
    print("模型已就绪，Real-ESRGAN 可以在离线模式下运行了。")
    print("如需将项目部署到离线机器，请把 models/realesrgan/ 目录一起拷贝过去。")
    print("=" * 60)


if __name__ == "__main__":
    main()
