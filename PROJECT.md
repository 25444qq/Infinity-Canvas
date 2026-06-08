
## 项目架构

```
imageGene/
├── main.py                 # 主入口，Tornado Web 服务（后端）
├── start_all.py            # 一体化启动脚本（同时启动前后端）
├── start.sh                # Bash 启动脚本
├── config.py               # 全局配置
├── requirements.txt        # Python 依赖
├── handlers/               # API 路由处理器
│   ├── flux2_handler.py    # 图像生成 API
│   ├── qwen_tts_handler.py # 语音合成 API
│   ├── qwen_novel_handler.py # 文本分析 API
│   ├── text_complete_handler.py # 文本补全 API
│   ├── deepseek_handler.py # DeepSeek API
│   ├── lm_studio_handler.py # LM Studio API
│   ├── common_handlers.py  # 通用处理器
│   └── api_handlers.py     # API 文档
├── services/               # 核心服务层
│   ├── flux2_service.py    # FLUX.2 图像生成服务
│   ├── audio_service.py    # Qwen3-TTS 语音合成服务
│   ├── model_manager.py    # 统一模型管理器
│   └── novel_service.py    # 文本分析服务
├── frontend/               # 前端交互页面
│   ├── server.py           # 前端服务器（端口 8090）
│   ├── App.tsx             # React 主组件
│   ├── components/         # React 组件
│   ├── services/           # 前端服务层
│   ├── dist/               # 构建输出目录
│   └── package.json        # 前端依赖
├── models/                  # 模型目录（需下载）
│   ├── FLUX.2-klein-4B/    # 图像生成模型
│   ├── qwen3_tts_12hz_1_7b_voicedesign/ # TTS VoiceDesign 模型
│   ├── qwen3_tts_12hz_1_7b_base/        # TTS Base 模型
│   └── Qwen3.5-27B-Q4_K_M.gguf          # 文本分析模型
└── outputs/                 # 输出文件目录
```

## API 端点

### 图像生成 (/image)
| 端点 | 方法 | 功能 |
|------|------|------|
| `/image/models` | GET | 列出图像模型和状态 |
| `/image/generate` | POST | 文生图 |
| `/image/edit` | POST | 图像编辑 |
| `/image/variations` | POST | 生成图像变体 |

### 语音合成 (/audio)
| 端点 | 方法 | 功能 |
|------|------|------|
| `/audio/models` | GET | 列出音频模型和状态 |
| `/audio/tts` | POST | 文本转语音 |
| `/audio/voices` | GET | 列出可用声音 |
| `/audio/status` | GET | TTS 模型状态 |
| `/audio/merge` | POST | 合并音频文件 |

### 文本处理 (/text)
| 端点 | 方法 | 功能 |
|------|------|------|
| `/text/models` | GET | 列出文本模型和状态 |
| `/text/analyze` | POST | 分析小说文本 |
| `/text/lines/process` | POST | 处理小说行（对话标记） |
| `/text/complete` | POST | 文本补全（LM Studio / DeepSeek） |
| `/text/format` | POST | 小说文本格式化 |

### 其他
| 端点 | 方法 | 功能 |
|------|------|------|
| `/health` | GET | 健康检查 |
| `/docs` | GET | API 文档 |

## 核心服务说明

### 1. FLUX.2 图像生成服务 (flux2_service.py)
- 模型: FLUX.2-klein-4B
- 功能: 文生图、图像编辑、图像变体生成
- 启动时预加载模型

### 2. Qwen3-TTS 语音合成服务 (audio_service.py)
- 模型: Qwen3-TTS-12Hz-1.7B
- 支持三种模型模式:
  - **VoiceDesign**: 基于描述生成语音 (`generate_voice_design`)
  - **CustomVoice**: 使用内置角色生成语音 (`generate_custom_voice`)
  - **Base**: 从参考音频克隆声音 (`generate_voice_clone`)
- 懒加载：首次请求时加载模型
- 智能模型切换：根据请求参数自动选择合适的模型

#### TTS 模型选择逻辑
| 场景 | 模型 | 方法 | 参数 |
|------|------|------|------|
| 有 `ref_audio` | base | `generate_voice_clone` | ref_audio |
| 有 `instruct` | voice_design | `generate_voice_design` | instruct |
| 无 `instruct`，有 `voice` | base | `generate_custom_voice` | speaker |
| 都没有 | voice_design | `generate_voice_design` | 默认描述 |

### 3. 文本分析服务 (novel_service.py)
- 模型: Qwen3.5-27B (GGUF 格式)
- 功能: 小说文本分析、对话标记、文本格式化
- 支持外部 API: LM Studio、DeepSeek

## 配置说明 (config.py)

主要配置项：
```python
CONFIG = {
    # 服务配置
    "host": "0.0.0.0",
    "port": 8080,
    
    # 图像模型
    "flux2_default_model": "FLUX.2-klein-4B",
    
    # TTS 模型
    "qwen_tts_model_path": "models/qwen3_tts_12hz_1_7b_voicedesign",
    "qwen_tts_sample_rate": 24000,
    
    # 文本模型
    "novel_model_path": "models/Qwen3.5-27B-Q4_K_M.gguf",
    
    # 外部 API
    "lm_studio": {"enabled": false, "base_url": "http://localhost:1234/v1"},
    "deepseek": {"enabled": false, "api_key": "", "base_url": "https://api.deepseek.com/v1"},
}
```

## 环境变量

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| HOST | 服务地址 | 0.0.0.0 |
| PORT | 服务端口 | 8080 |
| DEBUG | 调试模式 | false |
| QWEN_TTS_MODEL_PATH | TTS 模型路径 | models/qwen3_tts_12hz_1_7b_voicedesign |
| NOVEL_MODEL_PATH | 文本模型路径 | models/Qwen3.5-27B-Q4_K_M.gguf |
| LM_STUDIO_ENABLED | 启用 LM Studio | false |
| DEEPSEEK_ENABLED | 启用 DeepSeek | false |
| DEEPSEEK_API_KEY | DeepSeek API Key | - |

## API Key 认证

项目支持通过 API Key 对请求进行认证，使用 `Authorization: Bearer <key>` 请求头。

### Key 配置方式

有两种配置方式，**环境变量优先级更高**：

**方式一：通过环境变量（推荐，用于生产环境）**

在 `start_server.sh` 中设置：

```bash
# 全局 key
export API_KEY="sk-api-000000"

# 分类 key（会覆盖全局 key）
export IMAGE_API_KEY="sk-image-123456"
export AUDIO_API_KEY="sk-audio-123456"
export TEXT_API_KEY="sk-text-123456"
export VIDEO_API_KEY="sk-video-123456"
```

**方式二：通过 config.py 默认值**

```python
# config.py
"api_key": os.environ.get("API_KEY", "sk-api-000000"),
"api_keys": {
    "image": os.environ.get("IMAGE_API_KEY", "sk-image-000000"),
    "audio": os.environ.get("AUDIO_API_KEY", "sk-audio-000000"),
    "text": os.environ.get("TEXT_API_KEY", "sk-text-000000"),
    "video": os.environ.get("VIDEO_API_KEY", "sk-video-000000"),
},
```

### Key 匹配规则

| 类别 | 环境变量 | 对应端点 |
|------|---------|----------|
| 全局 | `API_KEY` | 所有端点（被分类 key 覆盖） |
| image | `IMAGE_API_KEY` | `/image/*` |
| audio | `AUDIO_API_KEY` | `/audio/*` |
| text | `TEXT_API_KEY` | `/text/*` |
| video | `VIDEO_API_KEY` | `/video/*` |

### 客户端使用

请求时在 HTTP Header 中添加：

```
Authorization: Bearer sk-image-123456
```

### 禁用认证

如果所有 key 均为空字符串，则跳过认证，所有请求直接放行。

## 启动方式

### 方式一：一体化启动（推荐）

同时启动后端和前端服务器：

```bash
# 安装后端依赖
pip install -r requirements.txt

# 安装前端依赖并构建
cd frontend
npm install
npm run build
cd ..

# 启动所有服务
python start_all.py
# 或
./start.sh
```

启动后：
- **前端页面**: http://localhost:8090
- **后端 API**: http://localhost:8080
- **API 文档**: http://localhost:8080/docs

### 方式二：分别启动

**启动后端服务器**：
```bash
python main.py
```

**启动前端服务器**：
```bash
cd frontend
python server.py
```

## 前端集成说明

### 服务器架构

项目采用**前后端分离**架构，通过两个独立的 Tornado 服务器运行：

1. **后端服务器**（端口 8080）
   - 提供 AI 服务 API
   - 路由：`/image/*`, `/audio/*`, `/text/*`
   - 模型管理和懒加载

2. **前端服务器**（端口 8090）
   - 托管 React 前端静态文件
   - 提供 `/api/*` 路由（调用后端 API）
   - 模型配置管理

### 前端技术栈

- **框架**: React 19 + TypeScript
- **构建工具**: Vite 6
- **UI 组件**: Lucide React
- **服务端**: Tornado（托管静态文件）

### 前端配置

前端通过 `baseUrl` 配置连接后端 API：

```python
# frontend/services/model_config.py
MODEL_REGISTRY = {
    "Flux2": {
        "defaultBaseUrl": "http://localhost:8080",
        "defaultEndpoint": "/image/generate",
    },
    "Qwen3-TTS": {
        "defaultBaseUrl": "http://localhost:8080",
        "defaultEndpoint": "/audio/tts",
    },
}
```

### 前端构建

```bash
cd frontend
npm install        # 安装依赖
npm run build      # 构建生产版本
npm run dev        # 开发模式（端口 3000）
```

构建输出到 `frontend/dist/` 目录。

## 模型下载

```bash
# 下载图像模型
python download_model.py

# 下载 TTS 模型
python download_qwen_tts_model.py

# 下载文本模型
python download_novel_model.py
```

## 技术栈

- **Web 框架**: Tornado
- **图像生成**: FLUX.2 (diffusers)
- **语音合成**: Qwen3-TTS (qwen-tts)
- **文本分析**: llama-cpp-python
- **深度学习**: PyTorch
