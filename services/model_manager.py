"""
统一的模型管理器

负责管理所有模型的加载、卸载和切换，根据 GPU 内存自动决策是否保留已加载的模型。
"""
import os
import logging
import threading
import time
from typing import Optional, Dict, Any, Callable
from enum import Enum

import torch

from config import CONFIG

logger = logging.getLogger(__name__)


class ModelType(Enum):
    """模型类型枚举"""
    IMAGE = "image"      # FLUX.2 图像生成模型
    AUDIO = "audio"      # Qwen3-TTS 语音合成模型
    TEXT = "text"        # 文本分析模型


class ModelInfo:
    """模型信息"""
    def __init__(self, model_type: ModelType, model_name: str, model_instance: Any = None):
        self.model_type = model_type
        self.model_name = model_name
        self.model_instance = model_instance
        self.loaded_at = time.time() if model_instance else None
        self.last_used = time.time() if model_instance else None
        self.vram_usage = 0  # 预估的显存占用（GB）

    def update_last_used(self):
        """更新最后使用时间"""
        self.last_used = time.time()


class ModelManager:
    """
    统一的模型管理器
    
    功能：
    1. 管理所有类型的模型（图像、音频、文本）
    2. 跟踪已加载的模型和 GPU 内存使用情况
    3. 自动决策是否卸载其他模型以释放显存
    4. 提供统一的模型加载/卸载接口
    """
    _instance = None
    _lock = threading.Lock()
    
    def __new__(cls):
        with cls._lock:
            if cls._instance is None:
                cls._instance = super().__new__(cls)
                cls._instance._initialized = False
        return cls._instance
    
    def __init__(self):
        if self._initialized:
            return
        
        self._initialized = True
        self._models: Dict[str, ModelInfo] = {}  # key: f"{model_type.value}:{model_name}"
        self._models_lock = threading.Lock()
        self._loaders: Dict[ModelType, Callable] = {}  # 模型加载函数
        self._unloaders: Dict[ModelType, Callable] = {}  # 模型卸载函数
        
        # 配置
        self._max_vram_gb = self._get_gpu_total_memory()
        self._vram_threshold = 0.85  # 显存使用阈值，超过此值时考虑卸载模型
        self._model_priorities = {
            ModelType.IMAGE: 1,   # 图像模型优先级较低
            ModelType.AUDIO: 2,   # 音频模型优先级中等
            ModelType.TEXT: 3,    # 文本模型优先级较高
        }
        
        # 预估的模型显存占用（GB）
        self._estimated_vram = {
            "FLUX.2-klein-4B": 16.0,      # 4B 原版 (需要约 16GB)
            "flux.2-4b": 16.0,            # 简化名称映射
            "flux2-4b": 16.0,             # 简化名称映射
            "4b": 16.0,                   # 简化名称映射
            "qwen3_tts_12hz_1_7b_voicedesign": 4.0,
            "qwen3_tts_12hz_1_7b_base": 4.0,
            "Qwen3.5-27B-Q4_K_M": 16.0,
        }
        
        logger.info(f"ModelManager initialized. GPU memory: {self._max_vram_gb:.2f} GB")
    
    def _get_gpu_total_memory(self) -> float:
        """获取 GPU 总显存（GB）"""
        if not torch.cuda.is_available():
            return 0.0
        
        try:
            import pynvml
            pynvml.nvmlInit()
            handle = pynvml.nvmlDeviceGetHandleByIndex(0)
            mem_info = pynvml.nvmlDeviceGetMemoryInfo(handle)
            total_gb = mem_info.total / (1024 ** 3)
            pynvml.nvmlShutdown()
            return total_gb
        except Exception as e:
            logger.warning(f"Failed to get GPU memory via NVML: {e}")
            # 回退到 torch
            try:
                total = torch.cuda.get_device_properties(0).total_memory
                return total / (1024 ** 3)
            except:
                return 24.0  # 默认假设 24GB
    
    def _get_gpu_free_memory(self) -> float:
        """获取 GPU 空闲显存（GB）"""
        if not torch.cuda.is_available():
            return 0.0
        
        try:
            import pynvml
            pynvml.nvmlInit()
            handle = pynvml.nvmlDeviceGetHandleByIndex(0)
            mem_info = pynvml.nvmlDeviceGetMemoryInfo(handle)
            free_gb = mem_info.free / (1024 ** 3)
            pynvml.nvmlShutdown()
            return free_gb
        except Exception as e:
            logger.warning(f"Failed to get GPU free memory via NVML: {e}")
            # 回退到 torch
            try:
                free = torch.cuda.memory_reserved(0) - torch.cuda.memory_allocated(0)
                return free / (1024 ** 3)
            except:
                return 0.0
    
    def register_loader(self, model_type: ModelType, loader: Callable):
        """注册模型加载函数"""
        self._loaders[model_type] = loader
        logger.info(f"Registered loader for {model_type.value}")
    
    def register_unloader(self, model_type: ModelType, unloader: Callable):
        """注册模型卸载函数"""
        self._unloaders[model_type] = unloader
        logger.info(f"Registered unloader for {model_type.value}")
    
    def _get_model_key(self, model_type: ModelType, model_name: str) -> str:
        """生成模型唯一标识"""
        return f"{model_type.value}:{model_name}"
    
    def _estimate_model_vram(self, model_name: str) -> float:
        """估算模型显存占用"""
        # 尝试匹配已知模型
        for key, vram in self._estimated_vram.items():
            if key.lower() in model_name.lower():
                return vram
        
        # 默认估算：基于模型名称中的参数量
        # FLUX.2 模型需要更多显存（包含 text encoder）
        if "9b" in model_name.lower() or "9B" in model_name:
            # FLUX.2-klein-9B 原版需要 24GB+
            if "flux" in model_name.lower() or "klein" in model_name.lower():
                return 24.0
            return 16.0  # 其他 9B 模型
        elif "27b" in model_name.lower() or "27B" in model_name:
            return 16.0
        elif "7b" in model_name.lower() or "7B" in model_name:
            return 6.0
        elif "4b" in model_name.lower() or "4B" in model_name:
            # FLUX.2-klein-4B 原版需要 8GB+
            if "flux" in model_name.lower() or "klein" in model_name.lower():
                return 8.0
            return 5.0
        elif "1.7b" in model_name.lower() or "1_7b" in model_name.lower():
            return 4.0
        
        return 8.0  # 默认 8GB
    
    def is_loaded(self, model_type: ModelType, model_name: str) -> bool:
        """检查模型是否已加载"""
        key = self._get_model_key(model_type, model_name)
        with self._models_lock:
            return key in self._models and self._models[key].model_instance is not None
    
    def get_loaded_models(self) -> Dict[str, ModelInfo]:
        """获取所有已加载的模型"""
        with self._models_lock:
            return {k: v for k, v in self._models.items() if v.model_instance is not None}
    
    def _should_unload_other_models(self, model_type: ModelType, model_name: str) -> bool:
        """
        判断是否需要卸载其他模型
        
        决策逻辑：
        1. 如果 GPU 空闲显存足够，不卸载
        2. 如果空闲显存不足，根据优先级卸载低优先级模型
        3. 同类型模型切换时，卸载旧模型
        """
        if not torch.cuda.is_available():
            return False
        
        # 计算需要的显存
        required_vram = self._estimate_model_vram(model_name)
        free_vram = self._get_gpu_free_memory()
        
        logger.info(f"VRAM check: required={required_vram:.2f}GB, free={free_vram:.2f}GB")
        
        # 如果空闲显存足够，不卸载
        if free_vram >= required_vram * 1.2:  # 留 20% 余量
            logger.info(f"Enough free VRAM ({free_vram:.2f}GB), no need to unload other models")
            return False
        
        # 空闲显存不足，需要卸载
        logger.info(f"Insufficient free VRAM ({free_vram:.2f}GB < {required_vram:.2f}GB), will unload other models")
        return True
    
    def _select_models_to_unload(self, exclude_type: ModelType, exclude_name: str) -> list:
        """
        选择需要卸载的模型
        
        策略：
        1. 优先卸载低优先级模型
        2. 同类型模型必须卸载（因为要切换）
        3. 优先卸载最久未使用的模型
        """
        models_to_unload = []
        
        with self._models_lock:
            for key, info in self._models.items():
                if info.model_instance is None:
                    continue
                
                # 同类型模型必须卸载
                if info.model_type == exclude_type:
                    if info.model_name != exclude_name:
                        models_to_unload.append((key, info, 100))  # 高优先级卸载
                    continue
                
                # 根据优先级和最后使用时间决定
                priority = self._model_priorities.get(info.model_type, 1)
                time_factor = (time.time() - info.last_used) / 3600  # 小时
                score = priority * 10 - time_factor  # 优先级越高，分数越高；越久未用，分数越低
                
                models_to_unload.append((key, info, score))
        
        # 按分数排序（分数低的优先卸载）
        models_to_unload.sort(key=lambda x: x[2])
        
        return [(key, info) for key, info, _ in models_to_unload]
    
    def ensure_model(
        self,
        model_type: ModelType,
        model_name: str,
        force_unload: bool = False,
        **kwargs
    ) -> Any:
        """
        确保模型已加载
        
        这是主要的模型管理函数，在每次 API 调用时使用。
        
        Args:
            model_type: 模型类型
            model_name: 模型名称
            force_unload: 是否强制卸载其他模型
            **kwargs: 传递给加载函数的额外参数
            
        Returns:
            模型实例
        """
        key = self._get_model_key(model_type, model_name)
        
        with self._models_lock:
            # 如果模型已加载，更新最后使用时间并返回
            if key in self._models and self._models[key].model_instance is not None:
                self._models[key].update_last_used()
                logger.info(f"Model {key} already loaded, updating last_used time")
                return self._models[key].model_instance
        
        # 模型未加载，需要加载
        logger.info(f"Model {key} not loaded, preparing to load...")
        
        # 检查是否需要卸载其他模型
        should_unload = force_unload or self._should_unload_other_models(model_type, model_name)
        
        if should_unload:
            models_to_unload = self._select_models_to_unload(model_type, model_name)
            
            # 卸载模型直到有足够空间
            required_vram = self._estimate_model_vram(model_name)
            freed_vram = 0.0
            
            for unload_key, unload_info in models_to_unload:
                if freed_vram >= required_vram:
                    break
                
                logger.info(f"Unloading model {unload_key} to free VRAM...")
                self._unload_model_internal(unload_info.model_type, unload_info.model_name)
                freed_vram += unload_info.vram_usage
        
        # 加载新模型
        return self._load_model_internal(model_type, model_name, **kwargs)
    
    def _load_model_internal(self, model_type: ModelType, model_name: str, **kwargs) -> Any:
        """内部加载模型函数"""
        key = self._get_model_key(model_type, model_name)
        
        # 获取加载函数
        loader = self._loaders.get(model_type)
        if loader is None:
            raise RuntimeError(f"No loader registered for {model_type.value}")
        
        logger.info(f"Loading model {key}...")
        start_time = time.time()
        
        try:
            # 调用加载函数
            model_instance = loader(model_name, **kwargs)
            
            # 记录模型信息
            vram_usage = self._estimate_model_vram(model_name)
            model_info = ModelInfo(model_type, model_name, model_instance)
            model_info.vram_usage = vram_usage
            
            with self._models_lock:
                self._models[key] = model_info
            
            load_time = time.time() - start_time
            logger.info(f"Model {key} loaded successfully in {load_time:.2f}s, estimated VRAM: {vram_usage:.2f}GB")
            
            return model_instance
            
        except Exception as e:
            logger.error(f"Failed to load model {key}: {e}")
            raise
    
    def _unload_model_internal(self, model_type: ModelType, model_name: str) -> bool:
        """内部卸载模型函数"""
        key = self._get_model_key(model_type, model_name)
        
        with self._models_lock:
            if key not in self._models or self._models[key].model_instance is None:
                return False
            
            model_info = self._models[key]
        
        # 获取卸载函数
        unloader = self._unloaders.get(model_type)
        
        try:
            if unloader:
                logger.info(f"Calling unloader for {key}...")
                unloader(model_name)
            else:
                # 如果没有注册卸载函数，尝试手动清理
                logger.info(f"No unloader registered for {model_type.value}, trying manual cleanup...")
                if hasattr(model_info.model_instance, 'cpu'):
                    model_info.model_instance.cpu()
                del model_info.model_instance
                
                if torch.cuda.is_available():
                    torch.cuda.empty_cache()
                    torch.cuda.synchronize()
                
                import gc
                gc.collect()
            
            # 从字典中移除
            with self._models_lock:
                if key in self._models:
                    del self._models[key]
            
            logger.info(f"Model {key} unloaded successfully")
            return True
            
        except Exception as e:
            logger.error(f"Failed to unload model {key}: {e}")
            return False
    
    def unload_model(self, model_type: ModelType, model_name: str) -> bool:
        """
        手动卸载模型
        
        Args:
            model_type: 模型类型
            model_name: 模型名称
            
        Returns:
            是否成功卸载
        """
        return self._unload_model_internal(model_type, model_name)
    
    def unload_all_models(self, model_type: Optional[ModelType] = None):
        """
        卸载所有模型
        
        Args:
            model_type: 可选，指定只卸载某种类型的模型
        """
        keys_to_unload = []
        
        with self._models_lock:
            for key, info in self._models.items():
                if info.model_instance is None:
                    continue
                if model_type is None or info.model_type == model_type:
                    keys_to_unload.append((info.model_type, info.model_name))
        
        for model_type_item, model_name in keys_to_unload:
            self._unload_model_internal(model_type_item, model_name)
        
        logger.info(f"Unloaded {len(keys_to_unload)} models")
    
    def get_status(self) -> Dict[str, Any]:
        """获取模型管理器状态"""
        loaded_models = self.get_loaded_models()
        
        status = {
            "gpu_total_memory_gb": self._max_vram_gb,
            "gpu_free_memory_gb": self._get_gpu_free_memory(),
            "loaded_models": {},
            "model_count": len(loaded_models),
        }
        
        for key, info in loaded_models.items():
            status["loaded_models"][key] = {
                "type": info.model_type.value,
                "name": info.model_name,
                "loaded_at": info.loaded_at,
                "last_used": info.last_used,
                "vram_usage_gb": info.vram_usage,
            }
        
        return status


# 全局单例
model_manager = ModelManager()