import io
import os
import base64
import logging
import time
import threading
from PIL import Image

import torch
from diffusers import Flux2KleinPipeline

from config import CONFIG
from services.model_manager import model_manager, ModelType

logger = logging.getLogger(__name__)


def get_best_gpu():
    if not torch.cuda.is_available():
        return "cpu"
    
    num_gpus = torch.cuda.device_count()
    if num_gpus == 0:
        return "cpu"
    
    if num_gpus >= 2:
        logger.info(f"Found {num_gpus} GPUs, FLUX.2 will use GPU 0")
        return "cuda:0"
    
    best_gpu = 0
    max_free_memory = 0
    
    try:
        import pynvml
        pynvml.nvmlInit()
        
        for i in range(num_gpus):
            try:
                handle = pynvml.nvmlDeviceGetHandleByIndex(i)
                mem_info = pynvml.nvmlDeviceGetMemoryInfo(handle)
                free_mem = mem_info.free
                
                logger.info(f"GPU {i}: {mem_info.total/1024**3:.2f} GB total, {mem_info.used/1024**3:.2f} GB used, {free_mem/1024**3:.2f} GB free (via NVML)")
                
                if free_mem > max_free_memory:
                    max_free_memory = free_mem
                    best_gpu = i
            except Exception as e:
                logger.warning(f"Failed to check GPU {i} via NVML: {e}")
        
        pynvml.nvmlShutdown()
    except Exception as e:
        logger.warning(f"NVML not available: {e}")
        best_gpu = 0
    
    logger.info(f"Selected GPU {best_gpu} for FLUX.2 ({max_free_memory/1024**3:.2f} GB free)")
    return f"cuda:{best_gpu}"


def get_device():
    if torch.cuda.is_available():
        return get_best_gpu()
    logger.warning("CUDA not available, falling back to CPU. Image generation will be very slow.")
    return "cpu"


def get_dtype(device):
    if device == "cuda":
        dtype_str = CONFIG.get("dtype", "bfloat16")
        dtype_map = {
            "bfloat16": torch.bfloat16,
            "float16": torch.float16,
            "float32": torch.float32,
        }
        return dtype_map.get(dtype_str, torch.bfloat16)
    return torch.float32


class Flux2KlienService:
    _instance = None
    _lock = threading.Lock()
    _pipes = {}
    _current_model = None
    _device = None

    @classmethod
    def _register_to_manager(cls):
        """注册加载和卸载函数到模型管理器"""
        model_manager.register_loader(ModelType.IMAGE, cls._load_model_wrapper)
        model_manager.register_unloader(ModelType.IMAGE, cls._unload_model_wrapper)
        logger.info("Flux2KlienService registered to ModelManager")
    
    @classmethod
    def _load_model_wrapper(cls, model_name, **kwargs):
        """模型管理器调用的加载函数包装器"""
        cls.load_model(model_name)
        return cls._pipes.get(model_name)
    
    @classmethod
    def _unload_model_wrapper(cls, model_name):
        """模型管理器调用的卸载函数包装器"""
        cls.unload_model(model_name)

    @classmethod
    def get_available_models(cls):
        models_dir = CONFIG["flux2_models_dir"]
        models = []
        if os.path.exists(models_dir):
            for item in sorted(os.listdir(models_dir)):
                if item.startswith("FLUX.2-klein") and os.path.isdir(os.path.join(models_dir, item)):
                    models.append(item)
        return models

    @classmethod
    def is_loaded(cls, model_name=None):
        if model_name is None:
            model_name = CONFIG["flux2_default_model"]
        return model_name in cls._pipes

    @classmethod
    def get_device(cls):
        return cls._device or get_device()

    @classmethod
    def load_model(cls, model_name=None):
        if model_name is None:
            model_name = CONFIG["flux2_default_model"]
        
        if model_name in cls._pipes:
            cls._current_model = model_name
            return

        device = get_device()
        dtype = get_dtype(device)
        cls._device = device
        
        # 从配置的模型路径映射中获取路径
        model_paths = CONFIG.get("flux2_model_paths", {})
        model_path = model_paths.get(model_name)
        
        # 如果映射中没有，尝试直接拼接路径
        if model_path is None:
            models_dir = CONFIG["flux2_models_dir"]
            model_path = os.path.join(models_dir, model_name)
        
        # 检查路径是否存在
        if not os.path.exists(model_path):
            raise RuntimeError(f"Model path not found: {model_path}")

        logger.info(f"Loading model from: {model_path}")
        logger.info(f"Device: {device}, dtype: {dtype}")

        pipe = Flux2KleinPipeline.from_pretrained(
            model_path,
            torch_dtype=dtype,
            local_files_only=True,
        )

        if device.startswith("cuda"):
            device_idx = int(device.split(":")[1]) if ":" in device else 0
            
            try:
                pipe.enable_xformers_memory_efficient_attention()
                logger.info("Enabled xformers memory efficient attention.")
            except Exception as e:
                logger.warning(f"Failed to enable xformers: {e}")
            
            try:
                pipe.enable_model_cpu_offload(device_idx)
                logger.info(f"Enabled model CPU offload on GPU {device_idx} for VRAM optimization.")
            except Exception as e:
                logger.warning(f"Failed to enable CPU offload: {e}")
                try:
                    pipe.to(device)
                    logger.info(f"Moved model to {device}.")
                except Exception as e:
                    logger.warning(f"Failed to move model to GPU: {e}")
                    logger.warning("Falling back to CPU mode.")
                    pipe = Flux2KleinPipeline.from_pretrained(
                        model_path,
                        torch_dtype=torch.float32,
                        local_files_only=True,
                    )
                    cls._device = "cpu"
        else:
            logger.info("Running in CPU mode.")
            pipe = Flux2KleinPipeline.from_pretrained(
                model_path,
                torch_dtype=torch.float32,
                local_files_only=True,
            )
            try:
                pipe.enable_attention_slicing()
                logger.info("Enabled attention slicing for CPU optimization.")
            except Exception as e:
                logger.warning(f"Failed to enable attention slicing: {e}")
            
            try:
                pipe.enable_sequential_cpu_offload()
                logger.info("Enabled sequential CPU offload for optimization.")
            except Exception as e:
                logger.warning(f"Failed to enable sequential CPU offload: {e}")

        cls._pipes[model_name] = pipe
        cls._current_model = model_name
        logger.info(f"Model {model_name} loaded successfully.")

    @classmethod
    def unload_model(cls, model_name=None):
        import gc
        
        if model_name is None:
            model_name = cls._current_model
        
        if model_name and model_name in cls._pipes:
            pipe = cls._pipes[model_name]
            if hasattr(pipe, 'cpu'):
                try:
                    pipe.cpu()
                except Exception as e:
                    logger.warning(f"Failed to move model to CPU: {e}")
            del pipe
            del cls._pipes[model_name]
            
            if cls._current_model == model_name:
                cls._current_model = None
            
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
                torch.cuda.synchronize()
            
            gc.collect()
            logger.info(f"Model {model_name} unloaded, GPU memory released")
        
        return model_name

    @classmethod
    def unload_all_models(cls):
        import gc
        
        unloaded = []
        for model_name in list(cls._pipes.keys()):
            pipe = cls._pipes[model_name]
            if hasattr(pipe, 'cpu'):
                try:
                    pipe.cpu()
                except Exception as e:
                    logger.warning(f"Failed to move {model_name} to CPU: {e}")
            del pipe
            unloaded.append(model_name)
        
        cls._pipes.clear()
        cls._current_model = None
        
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
            torch.cuda.synchronize()
        
        gc.collect()
        logger.info(f"All FLUX.2 models unloaded: {unloaded}")
        return unloaded

    @classmethod
    def is_any_loaded(cls):
        return len(cls._pipes) > 0

    @classmethod
    def _log_gpu_memory(cls, stage: str = ""):
        """显示 GPU 显存使用情况"""
        if not torch.cuda.is_available():
            return
        
        device = cls._device or "cuda:0"
        if not device.startswith("cuda"):
            return
        
        device_idx = int(device.split(":")[1]) if ":" in device else 0
        
        # 获取 PyTorch 显存信息
        allocated = torch.cuda.memory_allocated(device_idx) / (1024**3)
        reserved = torch.cuda.memory_reserved(device_idx) / (1024**3)
        
        # 获取 NVML 显存信息（如果可用）
        try:
            import pynvml
            pynvml.nvmlInit()
            handle = pynvml.nvmlDeviceGetHandleByIndex(device_idx)
            mem_info = pynvml.nvmlDeviceGetMemoryInfo(handle)
            total = mem_info.total / (1024**3)
            used = mem_info.used / (1024**3)
            free = mem_info.free / (1024**3)
            pynvml.nvmlShutdown()
            
            logger.info(f"[GPU Memory {stage}] Device {device_idx}: "
                       f"Total={total:.2f}GB, Used={used:.2f}GB ({used/total*100:.1f}%), "
                       f"Free={free:.2f}GB, PyTorch Allocated={allocated:.2f}GB, Reserved={reserved:.2f}GB")
        except Exception as e:
            logger.info(f"[GPU Memory {stage}] Device {device_idx}: "
                       f"PyTorch Allocated={allocated:.2f}GB, Reserved={reserved:.2f}GB "
                       f"(NVML unavailable: {e})")

    @classmethod
    def generate(
        cls,
        prompt,
        image=None,
        height=None,
        width=None,
        guidance_scale=None,
        num_inference_steps=None,
        seed=None,
        n=1,
        model_name=None,
    ):
        if model_name is None:
            model_name = CONFIG["flux2_default_model"]
        
        # 显示生成前的显存状态
        cls._log_gpu_memory("Before Generation")
        
        # 使用模型管理器确保模型已加载
        pipe = model_manager.ensure_model(ModelType.IMAGE, model_name)
        
        # 如果模型管理器返回 None，回退到旧的加载方式
        if pipe is None:
            if model_name not in cls._pipes:
                cls.load_model(model_name)
            pipe = cls._pipes[model_name]
        
        device = cls._device or "cpu"

        height = height or CONFIG["default_height"]
        width = width or CONFIG["default_width"]
        guidance_scale = guidance_scale if guidance_scale is not None else CONFIG["default_guidance_scale"]
        num_inference_steps = num_inference_steps or CONFIG["default_num_inference_steps"]

        # 显示模型加载后的显存状态
        cls._log_gpu_memory("After Model Load")

        # 优化生成参数
        results = []
        start_time = time.time()
        
        for i in range(n):
            generator = None
            if seed is not None:
                generator = torch.Generator(device=device).manual_seed(seed + i)

            # 优化参数
            kwargs = {
                "prompt": prompt,
                "height": height,
                "width": width,
                "guidance_scale": guidance_scale,
                "num_inference_steps": num_inference_steps,
                "output_type": "pil",
                "return_dict": True,
            }
            
            # 内存优化
            if device == "cpu":
                kwargs["batch_size"] = 1
            
            if generator is not None:
                kwargs["generator"] = generator

            if image is not None:
                kwargs["image"] = image

            # 执行生成
            with torch.no_grad():
                output = pipe(**kwargs)
            
            img = output.images[0]
            results.append(img)
            
            step_time = time.time() - start_time
            logger.info(f"Generated image {i+1}/{n} in {step_time:.2f}s")
            
            # 显示每张图片生成后的显存状态
            cls._log_gpu_memory(f"After Image {i+1}")

        total_time = time.time() - start_time
        logger.info(f"Total generation time: {total_time:.2f}s, {total_time/n:.2f}s per image")
        
        # 显示生成完成后的显存状态
        cls._log_gpu_memory("After Generation Complete")

        # 不再自动卸载模型，由模型管理器统一管理
        # cls.unload_all_models()
        # logger.info("FLUX.2 model unloaded after generation")

        return results

    @classmethod
    def pil_to_base64(cls, img, fmt="PNG"):
        buf = io.BytesIO()
        img.save(buf, format=fmt)
        return base64.b64encode(buf.getvalue()).decode("utf-8")

    @classmethod
    def save_image(cls, img, filename=None, fmt="PNG"):
        os.makedirs(CONFIG["output_dir"], exist_ok=True)
        if filename is None:
            filename = f"img_{int(time.time() * 1000)}.{fmt.lower()}"
        filepath = os.path.join(CONFIG["output_dir"], filename)
        img.save(filepath, format=fmt)
        return filepath

    @classmethod
    def base64_to_pil(cls, b64_str):
        if not b64_str:
            return None
        try:
            if "," in b64_str:
                b64_str = b64_str.split(",", 1)[1]
            padding = 4 - len(b64_str) % 4
            if padding != 4:
                b64_str += "=" * padding
            img_bytes = base64.b64decode(b64_str)
            return Image.open(io.BytesIO(img_bytes)).convert("RGB")
        except Exception as e:
            logger.warning(f"Failed to decode base64 image: {e}")
            return None

    @classmethod
    def resolve_images(cls, body):
        image_data = body.get("image") or body.get("image_url")
        ref_data = body.get("reference_image")

        main_image = None
        if image_data:
            main_image = cls.base64_to_pil(image_data)

        ref_images = []
        if ref_data and isinstance(ref_data, list):
            for idx, item in enumerate(ref_data):
                if item:
                    img = cls.base64_to_pil(item)
                    if img is not None:
                        ref_images.append(img)
                    else:
                        logger.warning(f"reference_image[{idx}] is invalid, skipped")

        if main_image is None and not ref_images:
            return None

        if main_image is not None and ref_images:
            return [main_image] + ref_images

        if main_image is not None:
            return main_image

        return ref_images


# 在模块加载时注册到模型管理器
Flux2KlienService._register_to_manager()
