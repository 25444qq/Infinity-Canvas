"""
Real-ESRGAN 图片超分辨率/放大服务 (纯 PyTorch 实现，完全离线)

直接使用 PyTorch 实现 RRDBNet 架构并加载模型权重。
不依赖 realesrgan / basicsr pip 包，无需任何网络请求。

使用方法:
  1. 先用 download_realesrgan_model.py 下载模型权重到 models/realesrgan/
  2. 启动服务即可使用
"""

import os
import base64
import logging
import threading
from typing import Optional, Tuple
from io import BytesIO

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
import torch.nn.init as init
from PIL import Image

from config import CONFIG, OFFLINE_ENV

logger = logging.getLogger(__name__)

# 强制执行离线模式
for _key, _val in OFFLINE_ENV.items():
    os.environ.setdefault(_key, _val)

# 全局模型实例和锁
_model: Optional[nn.Module] = None
_model_lock = threading.Lock()
_current_model_name: Optional[str] = None
_device: Optional[str] = None


# ============== RRDBNet 架构 (来自 Real-ESRGAN) ==============

def _make_layer(basic_block, num_basic_block, **kwarg):
    """Make layers by stacking the same blocks."""
    layers = []
    for _ in range(num_basic_block):
        layers.append(basic_block(**kwarg))
    return nn.Sequential(*layers)


class ResidualDenseBlock(nn.Module):
    """Residual Dense Block."""
    def __init__(self, num_feat=64, num_grow_ch=32):
        super(ResidualDenseBlock, self).__init__()
        self.conv1 = nn.Conv2d(num_feat, num_grow_ch, 3, 1, 1)
        self.conv2 = nn.Conv2d(num_feat + num_grow_ch, num_grow_ch, 3, 1, 1)
        self.conv3 = nn.Conv2d(num_feat + 2 * num_grow_ch, num_grow_ch, 3, 1, 1)
        self.conv4 = nn.Conv2d(num_feat + 3 * num_grow_ch, num_grow_ch, 3, 1, 1)
        self.conv5 = nn.Conv2d(num_feat + 4 * num_grow_ch, num_feat, 3, 1, 1)
        self.lrelu = nn.LeakyReLU(negative_slope=0.2, inplace=True)

        # initialization
        _default_init_weights([self.conv1, self.conv2, self.conv3, self.conv4, self.conv5], 0.1)

    def forward(self, x):
        x1 = self.lrelu(self.conv1(x))
        x2 = self.lrelu(self.conv2(torch.cat((x, x1), 1)))
        x3 = self.lrelu(self.conv3(torch.cat((x, x1, x2), 1)))
        x4 = self.lrelu(self.conv4(torch.cat((x, x1, x2, x3), 1)))
        x5 = self.conv5(torch.cat((x, x1, x2, x3, x4), 1))
        return x5 * 0.2 + x


class RRDB(nn.Module):
    """Residual in Residual Dense Block."""
    def __init__(self, num_feat, num_grow_ch=32):
        super(RRDB, self).__init__()
        self.rdb1 = ResidualDenseBlock(num_feat, num_grow_ch)
        self.rdb2 = ResidualDenseBlock(num_feat, num_grow_ch)
        self.rdb3 = ResidualDenseBlock(num_feat, num_grow_ch)

    def forward(self, x):
        out = self.rdb1(x)
        out = self.rdb2(out)
        out = self.rdb3(out)
        return out * 0.2 + x


class RRDBNet(nn.Module):
    """RRDBNet architecture used in Real-ESRGAN."""
    def __init__(self, num_in_ch, num_out_ch, scale=4, num_feat=64, num_block=23, num_grow_ch=32):
        super(RRDBNet, self).__init__()
        self.scale = scale
        if scale == 2:
            num_in_ch = num_in_ch * 4
        elif scale == 1:
            num_in_ch = num_in_ch * 16
        self.conv_first = nn.Conv2d(num_in_ch, num_feat, 3, 1, 1)
        self.body = _make_layer(RRDB, num_block, num_feat=num_feat, num_grow_ch=num_grow_ch)
        self.conv_body = nn.Conv2d(num_feat, num_feat, 3, 1, 1)
        # upsample
        self.conv_up1 = nn.Conv2d(num_feat, num_feat, 3, 1, 1)
        self.conv_up2 = nn.Conv2d(num_feat, num_feat, 3, 1, 1)
        if scale >= 8:
            self.conv_up3 = nn.Conv2d(num_feat, num_feat, 3, 1, 1)
            self.conv_up4 = nn.Conv2d(num_feat, num_feat, 3, 1, 1)
        self.conv_hr = nn.Conv2d(num_feat, num_feat, 3, 1, 1)
        self.conv_last = nn.Conv2d(num_feat, num_out_ch, 3, 1, 1)

        self.lrelu = nn.LeakyReLU(negative_slope=0.2, inplace=True)

    def forward(self, x):
        if self.scale == 2:
            feat = _pixel_unshuffle(x, scale=2)
        elif self.scale == 1:
            feat = _pixel_unshuffle(x, scale=4)
        else:
            feat = x

        feat = self.conv_first(feat)
        body_feat = self.conv_body(self.body(feat))
        feat = feat + body_feat

        # upsample
        feat = self.lrelu(self.conv_up1(F.interpolate(feat, scale_factor=2, mode='nearest')))
        feat = self.lrelu(self.conv_up2(F.interpolate(feat, scale_factor=2, mode='nearest')))
        if self.scale >= 8:
            feat = self.lrelu(self.conv_up3(F.interpolate(feat, scale_factor=2, mode='nearest')))
            feat = self.lrelu(self.conv_up4(F.interpolate(feat, scale_factor=2, mode='nearest')))

        out = self.conv_last(self.lrelu(self.conv_hr(feat)))
        return out


def _pixel_unshuffle(x, scale):
    """Pixel unshuffle."""
    b, c, hh, hw = x.size()
    out_channel = c * (scale ** 2)
    assert hh % scale == 0 and hw % scale == 0
    h = hh // scale
    w = hw // scale
    x_view = x.view(b, c, h, scale, w, scale)
    return x_view.permute(0, 1, 3, 5, 2, 4).reshape(b, out_channel, h, w)


def _default_init_weights(module_list, scale=1, bias_fill=0, **kwargs):
    """Initialize network weights."""
    if not isinstance(module_list, list):
        module_list = [module_list]
    for module in module_list:
        for m in module.modules():
            if isinstance(m, nn.Conv2d):
                init.kaiming_normal_(m.weight, **kwargs)
                m.weight.data *= scale
                if m.bias is not None:
                    m.bias.data.fill_(bias_fill)
            elif isinstance(m, nn.Linear):
                init.kaiming_normal_(m.weight, **kwargs)
                m.weight.data *= scale
                if m.bias is not None:
                    m.bias.data.fill_(bias_fill)


# ============== 模型加载与推理 ==============

MODEL_CONFIGS = {
    "RealESRGAN_x4plus": {"scale": 4, "num_block": 23},
    "RealESRGAN_x4plus_anime": {"scale": 4, "num_block": 6},
    "RealESRGAN_x2plus": {"scale": 2, "num_block": 23},
}


def _load_model(model_name: str = "RealESRGAN_x4plus"):
    """延迟加载 Real-ESRGAN 模型（纯 PyTorch）"""
    global _model, _current_model_name, _device

    if _model is not None and _current_model_name == model_name:
        return _model

    with _model_lock:
        if _model is not None and _current_model_name == model_name:
            return _model

        if _device is None:
            _device = "cuda" if torch.cuda.is_available() else "cpu"

        cfg = CONFIG["realesrgan"]
        model_dir = cfg["model_path"]

        if model_name not in MODEL_CONFIGS:
            raise ValueError(
                f"Unknown model: {model_name}. "
                f"Available: {list(MODEL_CONFIGS.keys())}"
            )

        model_cfg = MODEL_CONFIGS[model_name]
        scale = model_cfg["scale"]
        num_block = model_cfg["num_block"]

        # 模型文件名映射
        model_file_map = {
            "RealESRGAN_x4plus": "RealESRGAN_x4plus.pth",
            "RealESRGAN_x4plus_anime": "RealESRGAN_x4plus_anime_6B.pth",
            "RealESRGAN_x2plus": "RealESRGAN_x2plus.pth",
        }
        model_file = os.path.join(model_dir, model_file_map[model_name])

        if not os.path.exists(model_file):
            msg = (
                f"模型文件不存在: {model_file}\n"
                f"请先在有网络的机器上运行:\n"
                f"  modelscope download --model chenmingyu/real-esrgan --local_dir {model_dir}\n"
                f"然后将 models/realesrgan/ 目录拷贝到离线机器。"
            )
            logger.error(msg)
            raise FileNotFoundError(msg)

        logger.info(f"Loading Real-ESRGAN model: {model_name} "
                     f"(scale={scale}, blocks={num_block}, device={_device})")
        logger.info(f"Model weights: {model_file}")

        # 创建模型
        model = RRDBNet(
            num_in_ch=3,
            num_out_ch=3,
            scale=scale,
            num_block=num_block,
        )

        # 加载权重
        load_net = torch.load(model_file, map_location=_device, weights_only=True)
        # Real-ESRGAN 权重可能包含 'params' 或 'params_ema' 键
        if "params_ema" in load_net:
            state_dict = load_net["params_ema"]
        elif "params" in load_net:
            state_dict = load_net["params"]
        else:
            state_dict = load_net

        # 移除 "module." 前缀（如果权重来自 DataParallel）
        cleaned = {}
        for k, v in state_dict.items():
            if k.startswith("module."):
                k = k[7:]
            cleaned[k] = v

        model.load_state_dict(cleaned, strict=True)
        model.eval()
        model.to(_device)

        _model = model
        _current_model_name = model_name

        logger.info(f"Real-ESRGAN model loaded: {model_name}, scale={scale}")

    return _model


# ============== 图片超分辨率推理 ==============

def base64_to_pil_image(b64_str: str) -> Image.Image:
    """将 base64 字符串转为 PIL Image"""
    if b64_str.startswith("data:"):
        b64_str = b64_str.split(",", 1)[1]
    image_bytes = base64.b64decode(b64_str)
    return Image.open(BytesIO(image_bytes))


def pil_to_base64(image: Image.Image, fmt: str = "PNG") -> str:
    """将 PIL Image 转为 base64 字符串"""
    buffer = BytesIO()
    image.save(buffer, format=fmt)
    b64_str = base64.b64encode(buffer.getvalue()).decode("utf-8")
    return f"data:image/png;base64,{b64_str}"


def _pad_img(img: np.ndarray, tile_size: int, tile_pad: int) -> Tuple[np.ndarray, int, int, int, int]:
    """对图片进行 padding 以适配分块处理"""
    h, w = img.shape[:2]
    pad_h = (tile_size - h % tile_size) % tile_size + tile_pad * 2
    pad_w = (tile_size - w % tile_size) % tile_size + tile_pad * 2
    return np.pad(img, ((tile_pad, pad_h), (tile_pad, pad_w), (0, 0)), mode='reflect'), \
           pad_h, pad_w, tile_pad, tile_pad + h


def _tile_process(model: nn.Module, img: np.ndarray, tile_size: int, tile_pad: int,
                  scale: int) -> np.ndarray:
    """分块处理大图片，避免显存溢出"""
    h, w, c = img.shape
    output_h = h * scale
    output_w = w * scale
    output = np.zeros((output_h, output_w, c), dtype=np.uint8)

    # 确保 tile_size 是 scale 的倍数
    assert tile_size % scale == 0, f"tile_size ({tile_size}) must be divisible by scale ({scale})"

    for y in range(0, h, tile_size):
        for x in range(0, w, tile_size):
            # 提取 tile（包含 padding）
            y_start = max(0, y - tile_pad)
            y_end = min(h, y + tile_size + tile_pad)
            x_start = max(0, x - tile_pad)
            x_end = min(w, x + tile_size + tile_pad)

            tile = img[y_start:y_end, x_start:x_end].copy()

            # 推理
            tile_tensor = torch.from_numpy(tile).float().permute(2, 0, 1).unsqueeze(0).to(_device) / 255.0
            with torch.no_grad():
                result = model(tile_tensor)
            result = result.squeeze(0).permute(1, 2, 0).clamp(0, 1).cpu().numpy()
            result = (result * 255).astype(np.uint8)

            # 计算有效的裁剪区域
            pad_top = (y - y_start) * scale
            pad_left = (x - x_start) * scale
            eff_h = min(tile_size * scale, output_h - y * scale)
            eff_w = min(tile_size * scale, output_w - x * scale)

            output[y * scale: y * scale + eff_h,
                   x * scale: x * scale + eff_w] = result[pad_top: pad_top + eff_h,
                                                          pad_left: pad_left + eff_w]

    return output


def upscale_image(
    image_data: str,
    scale: int = 4,
    model_name: str = "RealESRGAN_x4plus",
    denoise_strength: float = 0.5,
    tile_size: int = 512,
    tile_pad: int = 10,
) -> Tuple[str, dict]:
    """
    图片超分辨率放大

    Args:
        image_data: base64 编码的图片
        scale: 放大倍数 (必须与模型匹配)
        model_name: 模型名称
        denoise_strength: 降噪强度 (0.0-1.0)
        tile_size: 分块大小
        tile_pad: 分块重叠 padding

    Returns:
        (base64_img, info_dict)
    """
    global _device
    if _device is None:
        _device = "cuda" if torch.cuda.is_available() else "cpu"

    # 加载模型
    model = _load_model(model_name)
    model_scale = MODEL_CONFIGS[model_name]["scale"]

    if scale > model_scale:
        logger.warning(f"Requested scale ({scale}) > model scale ({model_scale}), "
                       f"clamping to {model_scale}")
        scale = model_scale
    elif scale != model_scale:
        logger.info(f"Using requested scale {scale} (model supports up to {model_scale})")

    # 解码图片
    pil_img = base64_to_pil_image(image_data)
    pil_img = pil_img.convert("RGB")
    original_size = pil_img.size
    logger.info(f"Upscaling image: {original_size}, scale={scale}, model={model_name}")

    # 转为 numpy
    img_np = np.array(pil_img)

    # 根据图片大小决定是否分块处理
    h, w = img_np.shape[:2]
    if h * w > 1024 * 1024:  # 大于 1MP 使用分块
        logger.info(f"Using tiled processing: tile_size={tile_size}, tile_pad={tile_pad}")
        result = _tile_process(model, img_np, tile_size, tile_pad, scale)
    else:
        # 直接推理
        img_tensor = torch.from_numpy(img_np).float().permute(2, 0, 1).unsqueeze(0).to(_device) / 255.0
        with torch.no_grad():
            result_tensor = model(img_tensor)
        result = result_tensor.squeeze(0).permute(1, 2, 0).clamp(0, 1).cpu().numpy()
        result = (result * 255).astype(np.uint8)

    # 转回 PIL
    result_img = Image.fromarray(result)
    result_size = result_img.size

    logger.info(f"Upscale complete: {original_size} -> {result_size}")

    result_b64 = pil_to_base64(result_img)

    info = {
        "original_width": original_size[0],
        "original_height": original_size[1],
        "result_width": result_size[0],
        "result_height": result_size[1],
        "scale": scale,
        "model": model_name,
    }

    return result_b64, info


def get_available_models() -> list:
    """获取可用的 Real-ESRGAN 模型列表"""
    return [
        {
            "name": "RealESRGAN_x4plus",
            "display": "Real-ESRGAN x4 Plus (通用 4x 放大)",
            "scale": 4,
            "description": "通用图片放大，适用于照片、风景、产品等",
        },
        {
            "name": "RealESRGAN_x2plus",
            "display": "Real-ESRGAN x2 Plus (通用 2x 放大)",
            "scale": 2,
            "description": "2倍通用图片放大，适合轻度放大需求",
        },
    ]
