# ImageGene

多模态 AI 服务平台，集成图像生成、语音合成、文本分析功能，提供基于节点的可视化无限画布前端界面。

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

4. 一键启动：
   ```bash
   bash start.sh
   ```
   后端 API 服务运行在 `http://localhost:8080`，前端界面运行在 `http://localhost:8090`。

## API 端点

### 图像 `/image/*`
| 端点 | 方法 | 功能 |
|------|------|------|
| `/image/models` | GET | 列出图像模型 |
| `/image/generate` | POST | 文生图 |
| `/image/edit` | POST | 图像编辑 |
| `/image/variations` | POST | 图像变体 |
| `/image/upscale` | POST | 图片超分辨率放大 |
| `/image/upscale/models` | GET | 超分模型列表 |

### 音频 `/audio/*`
| 端点 | 方法 | 功能 |
|------|------|------|
| `/audio/models` | GET | 列出音频模型 |
| `/audio/tts` | POST | 文本转语音 |
| `/audio/voices` | GET | 列出可用声音 |
| `/audio/merge` | POST | 合并音频文件 |

### 文本 `/text/*`
| 端点 | 方法 | 功能 |
|------|------|------|
| `/text/models` | GET | 列出文本模型 |
| `/text/analyze` | POST | 小说文本分析 |
| `/text/lines/process` | POST | 对话标记处理 |
| `/text/complete` | POST | 文本补全 |
| `/text/format` | POST | 文本格式化 |

### 前端代理 `/api/*`（端口 8090）
前端服务器将所有 `/api/*` 请求转发到后端 `http://localhost:8080`，同时提供模型管理、配置等 API。

## 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `HOST` | 服务地址 | `0.0.0.0` |
| `PORT` | 后端端口 | `8080` |
| `DEBUG` | 调试模式 | `false` |
| `DEEPSEEK_ENABLED` | 启用 DeepSeek | `false` |
| `DEEPSEEK_API_KEY` | DeepSeek API Key | - |
| `LM_STUDIO_ENABLED` | 启用 LM Studio | `false` |
| `REALESRGAN_ENABLED` | 启用图片超分 | `true` |

## 前端功能

- **无限画布**: 基于节点的可视化工作流编辑器
- **节点类型**: 文本加载、文生图、图生图、音频生成、小说分析、场景展示、角色展示等
- **画布操作**: 拖拽、缩放、连线、框选、节点内容预览
- **设置面板**: 模型配置、本地存储管理、工作流导入导出
- **主题切换**: 支持亮色/暗色主题

## 模型

| 模型 | 用途 | 文件 |
|------|------|------|
| FLUX.2-klein-4B | 图像生成 | `models/FLUX.2-klein-4B/` |
| Qwen3-TTS-12Hz-1.7B | 语音合成 | `models/qwen3_tts_12hz_1_7b_voicedesign/` |
| Qwen3-TTS-12Hz-1.7B-Base | 声音克隆 | `models/qwen3_tts_12hz_1_7b_base/` |
| Qwen3.5-27B-Q4_K_M | 文本分析 | `models/Qwen3.5-27B-Q4_K_M.gguf` |
| Real-ESRGAN x4plus | 图片超分 | `models/realesrgan/` |

## 详细文档

更多技术细节、API Key 认证说明、TTS 模型选择逻辑等请参阅 [PROJECT.md](./PROJECT.md)。
