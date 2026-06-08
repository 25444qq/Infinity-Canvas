# 无限画布

多模态 AI 服务平台，集成图像生成、语音合成、文本分析功能，提供基于节点的可视化无限画布前端界面。

## 面向人群：
- **对小说文本进行音频话**： 可用自定义生成音频或用参考音频按照文本生成
- **对小说文本进行标点符号标准化处理**：按照中文标点符号格式进行标准话处理
- **需要简单生成AI图片**：可生成或编辑图片，分辨率为1K或2K，并可把图片放大2x或4x
    
## 功能概览

- **图像生成**: FLUX.2-Klein 文生图、图生图、图像变体
- **图像超分**: Real-ESRGAN 图片放大/超分辨率（纯 PyTorch，完全离线）
- **语音合成**: Qwen3-TTS 文本转语音，支持声音设计、声音克隆、角色语音
- **文本处理**: Qwen3.5-27B 小说文本分析、对话标记、格式化
- **外部 API**: DeepSeek、LM Studio 集成
- **模型管理**: 统一模型加载/卸载管理，支持自定义模型注册

## 项目架构

```
imageGene/
├── main.py                    # 后端入口，Tornado API 服务 (端口 8080)
├── config.py                  # 全局配置
├── start.sh                   # 一键启动脚本
├── requirements.txt           # Python 依赖
├── environment.yml            # Conda 环境定义
├── handlers/                  # API 路由处理器
│   ├── flux2_handler.py       # 图像生成 API
│   ├── qwen_tts_handler.py    # 语音合成 API
│   ├── qwen_novel_handler.py  # 文本分析 API
│   ├── text_complete_handler.py  # 文本补全 API
│   ├── upscale_handler.py     # 图片超分 API
│   ├── deepseek_handler.py    # DeepSeek API
│   ├── lm_studio_handler.py   # LM Studio API
│   └── ...
├── services/                  # 核心服务层
│   ├── flux2_service.py       # FLUX.2 图像生成
│   ├── audio_service.py       # Qwen3-TTS 语音合成
│   ├── novel_service.py       # 文本分析 (llama.cpp)
│   ├── upscale_service.py     # Real-ESRGAN 超分辨率
│   └── model_manager.py       # 统一模型管理器
├── models/                    # 模型存放目录（需手动下载）
├── outputs/                   # 输出文件目录
└── frontend/                  # React 前端 (端口 8090)
    ├── server.py              # 前端服务器（Tornado，托管 dist + API 代理）
    ├── App.tsx                # React 主组件（无限画布）
    ├── components/
    │   ├── Nodes/             # 各类节点组件（TextToImage, AudioGen, NovelLines 等）
    │   └── Settings/          # 设置面板（模型配置、存储管理、导入导出）
    ├── services/              # 前端服务层（API 调用封装）
    └── package.json           # 前端依赖
```

## 快速开始

### 环境要求

- Python 3.10
- Node.js 18+
- CUDA GPU（推荐，用于模型推理）
- ffmpeg（音频处理）

### 安装 & 启动

一键启动：
启动时会自动检测python环境和模型是否正确下载，如果缺失会自动下载。

   ```bash
   bash start.sh
   ```
   后端 API 服务运行在 `http://localhost:8080`，前端界面运行在 `http://localhost:8090`。

1. 安装 Python 依赖：
   ```bash
   pip install -r requirements.txt
   ```

2. 下载模型（按需）：
   ```bash
   python download_model.py            # FLUX.2 图像生成模型
   python download_qwen_tts_model.py   # Qwen3-TTS 语音合成模型
   python download_novel_model.py      # Qwen3.5-27B 文本分析模型
   python download_realesrgan_model.py # Real-ESRGAN 超分模型
   ```

3. 构建前端：
   ```bash
   cd frontend && npm install && npm run build
   ```

## 前端功能

- **无限画布**: 基于节点的可视化工作流编辑器
- **节点类型**: 文本加载、文生图、图生图、音频生成、小说分析、场景展示、角色展示等
- **画布操作**: 拖拽、缩放、连线、框选、节点内容预览
- **设置面板**: 模型配置、本地存储管理、工作流导入导出
- **主题切换**: 支持亮色/暗色主题

## 模型

> 模型文件总约 48GB，由 `.gitignore` 排除，不纳入版本控制。
> 克隆仓库后需运行对应的 `download_*.py` 脚本下载模型。

| 模型 | 用途 | 大小 | 路径 |
|------|------|------|------|
| FLUX.2-klein-4B | 文生图 / 图生图 / 图像变体 | ~23 GB | `models/FLUX.2-klein-4B/` |
| Qwen3-TTS-12Hz-1.7B VoiceDesign | 语音合成（声音描述生成语音） | ~4.3 GB | `models/qwen3_tts_12hz_1_7b_voicedesign/` |
| Qwen3-TTS-12Hz-1.7B Base | 语音合成（声音克隆 / 预设角色） | ~4.3 GB | `models/qwen3_tts_12hz_1_7b_base/` |
| Qwen3.5-27B-Q4_K_M (GGUF) | 小说文本分析 / 对话标记 / 格式化 | ~16 GB | `models/Qwen3.5-27B-Q4_K_M.gguf` |
| Real-ESRGAN x4plus | 图片超分辨率放大（4x） | ~128 MB | `models/realesrgan/`

### 下载模型

```bash
python download_model.py            # FLUX.2-klein-4B (~23G)
python download_qwen_tts_model.py   # Qwen3-TTS Base + VoiceDesign (~8.6G)
python download_novel_model.py      # Qwen3.5-27B GGUF (~16G)
python download_realesrgan_model.py # Real-ESRGAN (~128M)
```

## 详细文档

更多技术细节、API Key 认证说明、TTS 模型选择逻辑等请参阅 [PROJECT.md](./PROJECT.md)。
