import os
import sys
import argparse

HF_MIRRORS = {
    "hf": "https://huggingface.co",
    "hf-mirror": "https://hf-mirror.com",
}

MODEL_VARIANTS = {
    "qwen2.5-7b-instruct": {
        "repo_id": "Qwen/Qwen2.5-7B-Instruct",
        "ms_repo_id": "qwen/Qwen2.5-7B-Instruct",
        "description": "Qwen2.5-7B-Instruct (约15GB显存FP16/5GB显存INT4, 推荐)",
    },
    "qwen2.5-3b-instruct": {
        "repo_id": "Qwen/Qwen2.5-3B-Instruct",
        "ms_repo_id": "qwen/Qwen2.5-3B-Instruct",
        "description": "Qwen2.5-3B-Instruct (约7GB显存FP16, 中等GPU)",
    },
    "qwen2.5-1.5b-instruct": {
        "repo_id": "Qwen/Qwen2.5-1.5B-Instruct",
        "ms_repo_id": "qwen/Qwen2.5-1.5B-Instruct",
        "description": "Qwen2.5-1.5B-Instruct (约3GB显存FP16, 轻量级)",
    },
    "qwen3.5-9b-instruct": {
        "repo_id": "Qwen/Qwen3.5-9B-Instruct",
        "ms_repo_id": None,
        "description": "Qwen3.5-9B-Instruct (约18GB显存FP16/6GB显存INT4, 需HF认证)",
    },
    "qwen3.5-4b-instruct": {
        "repo_id": "Qwen/Qwen3.5-4B-Instruct",
        "ms_repo_id": None,
        "description": "Qwen3.5-4B-Instruct (约8GB显存FP16/3GB显存INT4, 需HF认证)",
    },
}


def download_model(variant="qwen2.5-7b-instruct", mirror="hf-mirror", output_dir=None, source="hf"):
    model_info = MODEL_VARIANTS[variant]

    if output_dir is None:
        output_dir = os.path.join(os.path.dirname(__file__), "models", variant.replace("-", "_").replace(".", "_"))

    if source == "ms":
        ms_repo_id = model_info.get("ms_repo_id")
        if not ms_repo_id:
            print(f"ModelScope repo not available for {variant}, please use --source hf")
            sys.exit(1)
        _download_from_modelscope(ms_repo_id, output_dir, variant)
    else:
        _download_from_hf(model_info["repo_id"], output_dir, variant, mirror)


def _download_from_hf(repo_id, output_dir, variant, mirror):
    from huggingface_hub import snapshot_download

    mirror_url = HF_MIRRORS.get(mirror)
    if mirror_url and mirror != "hf":
        os.environ["HF_ENDPOINT"] = mirror_url

    print(f"Downloading model from HuggingFace: {MODEL_VARIANTS[variant]['description']}")
    print(f"  Repo: {repo_id}")
    print(f"  Output: {output_dir}")
    print(f"  Mirror: {mirror_url or 'default'}")
    print()

    try:
        snapshot_download(
            repo_id=repo_id,
            local_dir=output_dir,
        )
    except Exception as e:
        print(f"\nHuggingFace download failed: {e}")
        print("\nPlease try one of the following:")
        print()
        print("1. Login to HuggingFace first:")
        print("   huggingface-cli login")
        print()
        print("2. Use ModelScope mirror instead (recommended for China):")
        print(f"   python download_novel_model.py --variant {variant} --source ms")
        sys.exit(1)

    _print_success(output_dir, variant)


def _download_from_modelscope(repo_id, output_dir, variant):
    import os as _os
    _os.makedirs('/home/epic/imageGene/.modelscope_cache/credentials', exist_ok=True)
    try:
        from modelscope.hub.api import ModelScopeConfig
        ModelScopeConfig.path_credential = '/home/epic/imageGene/.modelscope_cache/credentials'
        ModelScopeConfig.path_session = _os.path.join('/home/epic/imageGene/.modelscope_cache/credentials', 'session')
    except Exception:
        pass

    from modelscope import snapshot_download as ms_snapshot_download

    print(f"Downloading model from ModelScope: {MODEL_VARIANTS[variant]['description']}")
    print(f"  Repo: {repo_id}")
    print(f"  Output: {output_dir}")
    print()

    ms_snapshot_download(
        model_id=repo_id,
        local_dir=output_dir,
        cache_dir='/home/epic/imageGene/.modelscope_cache',
    )

    _print_success(output_dir, variant)


def _print_success(output_dir, variant):
    print(f"\nModel downloaded to: {output_dir}")
    print(f"Set environment variable to use this model:")
    print(f"  export NOVEL_MODEL_PATH={output_dir}")
    print(f"  export NOVEL_MODEL_NAME={variant}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Download novel analysis model (Qwen)")
    parser.add_argument(
        "--variant",
        choices=list(MODEL_VARIANTS.keys()),
        default="qwen2.5-7b-instruct",
        help="Model variant to download (default: qwen2.5-7b-instruct)",
    )
    parser.add_argument(
        "--mirror",
        choices=list(HF_MIRRORS.keys()),
        default="hf-mirror",
        help="HuggingFace mirror (default: hf-mirror)",
    )
    parser.add_argument(
        "--source",
        choices=["hf", "ms"],
        default="ms",
        help="Download source: hf=HuggingFace, ms=ModelScope (default: ms)",
    )
    parser.add_argument(
        "--output-dir",
        default=None,
        help="Custom output directory",
    )

    args = parser.parse_args()
    download_model(variant=args.variant, mirror=args.mirror, output_dir=args.output_dir, source=args.source)
