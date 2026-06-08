import os
import sys
import argparse


def download_model(model_name, local_dir, source="hf"):
    print(f"Downloading model: {model_name}")
    print(f"Local directory: {local_dir}")
    print(f"Source: {source}")

    os.makedirs(local_dir, exist_ok=True)

    if source == "ms":
        # Download from ModelScope
        import modelscope
        
        result = modelscope.snapshot_download(
            model_id=model_name,
            cache_dir=local_dir,
        )
        print(f"Model downloaded successfully to: {result}")
    else:
        # Download from HuggingFace Hub
        from huggingface_hub import snapshot_download
        
        os.environ["HF_ENDPOINT"] = "https://hf-mirror.com" if "--mirror" in sys.argv else os.environ.get("HF_ENDPOINT", "")
        
        result = snapshot_download(
            repo_id=model_name,
            local_dir=local_dir,
            local_dir_use_symlinks=False,
        )
        print(f"Model downloaded successfully to: {result}")


AVAILABLE_MODELS = {
    "4b": "black-forest-labs/FLUX.2-klein-4B",
    "9b": "black-forest-labs/FLUX.2-klein-9B",
    "4b-base": "black-forest-labs/FLUX.2-klein-base-4B",
    "9b-base": "black-forest-labs/FLUX.2-klein-base-9B",
}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Download FLUX.2-Klein models")
    parser.add_argument(
        "--model",
        choices=list(AVAILABLE_MODELS.keys()),
        default="4b",
        help="Model variant to download (default: 4b)",
    )
    parser.add_argument(
        "--output-dir",
        default="/media/chengy/MYRAID0/imageGene/models",
        help="Base directory to save models",
    )
    parser.add_argument(
        "--source",
        choices=["hf", "ms"],
        default="ms",
        help="Download source: hf (HuggingFace) or ms (ModelScope, recommended for China)",
    )

    args = parser.parse_args()

    model_id = AVAILABLE_MODELS[args.model]
    model_dir_name = model_id.split("/")[-1]
    local_dir = os.path.join(args.output_dir, model_dir_name)

    download_model(model_id, local_dir, source=args.source)
