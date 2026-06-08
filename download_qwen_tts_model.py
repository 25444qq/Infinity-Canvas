import os
import sys
import argparse

HF_MIRRORS = {
    "hf": "https://huggingface.co",
    "hf-mirror": "https://hf-mirror.com",
}

MODEL_VARIANTS = {
    "qwen3-tts-12hz-1.7b-voicedesign": {
        "repo_id": "Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign",
        "ms_repo_id": "qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign",
        "description": "Qwen3-TTS-12Hz-1.7B-VoiceDesign (低延迟97ms+音色设计, 推荐)",
    },
    "qwen3-tts-12hz-1.7b-base": {
        "repo_id": "Qwen/Qwen3-TTS-12Hz-1.7B-Base",
        "ms_repo_id": "qwen/Qwen3-TTS-12Hz-1.7B-Base",
        "description": "Qwen3-TTS-12Hz-1.7B-Base (低延迟97ms, 基础版)",
    },
    "qwen3-tts-25hz-1.7b-base": {
        "repo_id": "Qwen/Qwen3-TTS-25Hz-1.7B-Base",
        "ms_repo_id": "qwen/Qwen3-TTS-25Hz-1.7B-Base",
        "description": "Qwen3-TTS-25Hz-1.7B-Base (高质量, 适合有声读物)",
    },
    "qwen3-tts-12hz-0.6b-base": {
        "repo_id": "Qwen/Qwen3-TTS-12Hz-0.6B-Base",
        "ms_repo_id": "qwen/Qwen3-TTS-12Hz-0.6B-Base",
        "description": "Qwen3-TTS-12Hz-0.6B-Base (轻量版, 6GB显存可运行)",
    },
}


def download_model(variant="qwen3-tts-12hz-1.7b-voicedesign", mirror="hf-mirror", output_dir=None, source="hf"):
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
        print("Please try ModelScope:")
        print(f"  python download_qwen_tts_model.py --variant {variant} --source ms")
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
    print(f"  export QWEN_TTS_MODEL_PATH={output_dir}")
    print(f"  export QWEN_TTS_MODEL_NAME={variant}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Download Qwen3-TTS model")
    parser.add_argument(
        "--variant",
        choices=list(MODEL_VARIANTS.keys()),
        default="qwen3-tts-12hz-1.7b-voicedesign",
        help="Model variant (default: qwen3-tts-12hz-1.7b-voicedesign)",
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
