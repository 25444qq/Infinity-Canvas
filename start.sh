#!/bin/bash

# Infinity Canvas 启动脚本
# 使用项目内置 .venv (Python 3.10)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "============================================================"
echo "Infinity Canvas 启动脚本"
echo "============================================================"

# 检查并创建 venv
VENV_DIR="$SCRIPT_DIR/.venv"
if [ ! -f "$VENV_DIR/bin/python" ]; then
    echo "未找到 .venv，正在创建虚拟环境..."
    PYTHON_BIN=""
    for py in python3.10 python3 python; do
        if command -v $py &> /dev/null; then
            VER=$($py --version 2>&1 | grep -oP '\d+\.\d+')
            if [ "$VER" = "3.10" ]; then
                PYTHON_BIN=$py
                break
            fi
        fi
    done
    if [ -z "$PYTHON_BIN" ]; then
        echo "错误: 未找到 Python 3.10，请先安装"
        exit 1
    fi
    echo "使用: $($PYTHON_BIN --version)"
    $PYTHON_BIN -m venv "$VENV_DIR"
    echo "虚拟环境创建成功"
fi

# 激活 venv
PYTHON="$VENV_DIR/bin/python"
PIP="$VENV_DIR/bin/pip"

echo "Python: $($PYTHON --version)"

# 检查并安装缺失的 Python 依赖
echo ""
echo "检查 Python 依赖..."
if [ -f "requirements.txt" ]; then
    MISSING_COUNT=0
    MISSING_PKGS=""
    while IFS= read -r line; do
        [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]] && continue
        PKG_NAME=$(echo "$line" | sed 's/[><=!~].*//' | xargs)
        PKG_VER=$(echo "$line" | grep -oP '[><=!~]=\s*\K[0-9].*' | head -1)
        if [ -z "$PKG_NAME" ]; then continue; fi
        INSTALLED_VER=$($PIP show "$PKG_NAME" 2>/dev/null | grep "^Version:" | awk '{print $2}')
        if [ -z "$INSTALLED_VER" ]; then
            MISSING_PKGS="$MISSING_PKGS$line\n"
            ((MISSING_COUNT++))
        elif [ -n "$PKG_VER" ] && [ "$INSTALLED_VER" != "$PKG_VER" ]; then
            MISSING_PKGS="$MISSING_PKGS$line\n"
            ((MISSING_COUNT++))
        fi
    done < requirements.txt

    if [ -n "$MISSING_PKGS" ]; then
        echo "发现 $MISSING_COUNT 个缺失或版本不匹配的包，正在安装..."
        echo -e "$MISSING_PKGS" | while IFS= read -r pkg; do
            [ -n "$pkg" ] && $PIP install "$pkg" 2>&1 | tail -1
        done
        echo "依赖安装完成"
    else
        echo "所有依赖已就绪"
    fi
else
    echo "警告: 未找到 requirements.txt，跳过依赖检查"
fi

# 检查 llama_cpp_python（可能需要手动复制）
if ! $PYTHON -c "import llama_cpp" 2>/dev/null; then
    echo "警告: llama_cpp_python 未安装，非小说处理功能可能不可用"
fi

# 检查前端是否已构建
if [ ! -d "frontend/dist" ]; then
    echo ""
    echo "前端未构建，正在构建..."
    cd frontend
    npm install
    npm run build
    cd ..
    echo "前端构建完成"
fi

# 清理旧端口占用
echo ""
echo "清理端口占用..."
lsof -ti:8080 2>/dev/null | xargs kill 2>/dev/null || true
lsof -ti:8090 2>/dev/null | xargs kill 2>/dev/null || true
sleep 1

# ============================================================
# 模型文件检测
# ============================================================
echo ""
echo "检测模型文件..."

MODEL_DIR="$SCRIPT_DIR/models"
MODELS_MISSING=0

check_model_dir() {
    local name="$1"
    local path="$2"
    if [ -d "$path" ] && [ "$(ls -A "$path" 2>/dev/null)" ]; then
        echo "  ✓ $name"
    else
        echo "  ✗ $name (缺失)"
        MODELS_MISSING=$((MODELS_MISSING + 1))
    fi
}

check_model_file() {
    local name="$1"
    local path="$2"
    if [ -f "$path" ]; then
        echo "  ✓ $name"
    else
        echo "  ✗ $name (缺失)"
        MODELS_MISSING=$((MODELS_MISSING + 1))
    fi
}

check_model_dir  "FLUX.2-klein-4B"                    "$MODEL_DIR/FLUX.2-klein-4B"
check_model_dir  "Qwen3-TTS Base"                     "$MODEL_DIR/qwen3_tts_12hz_1_7b_base"
check_model_dir  "Qwen3-TTS VoiceDesign"              "$MODEL_DIR/qwen3_tts_12hz_1_7b_voicedesign"
check_model_file "Qwen3.5-27B-Q4_K_M (GGUF)"          "$MODEL_DIR/Qwen3.5-27B-Q4_K_M.gguf"
check_model_dir  "Real-ESRGAN"                        "$MODEL_DIR/realesrgan"

if [ "$MODELS_MISSING" -gt 0 ]; then
    echo ""
    echo "警告: $MODELS_MISSING 个模型缺失"
    echo "请在启动前先下载模型:"
    echo "  python download_model.py               # FLUX.2-klein-4B (~23G)"
    echo "  python download_qwen_tts_model.py       # Qwen3-TTS (~8.6G)"
    echo "  python download_novel_model.py          # Qwen3.5-27B GGUF (~16G)"
    echo "  python download_realesrgan_model.py     # Real-ESRGAN (~128M)"
    echo ""
    read -p "是否继续启动? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
else
    echo "所有模型已就绪"
fi

# API Key 环境变量配置
# 可直接修改以下默认值，或通过命令行设置: API_KEY=xxx bash start.sh
export API_KEY="${API_KEY:-sk-api-000000}"
export IMAGE_API_KEY="${IMAGE_API_KEY:-sk-image-000000}"
export AUDIO_API_KEY="${AUDIO_API_KEY:-sk-audio-000000}"
export TEXT_API_KEY="${TEXT_API_KEY:-sk-text-000000}"
export VIDEO_API_KEY="${VIDEO_API_KEY:-sk-video-000000}"
export DEFAULT_API_BASE_URL="${DEFAULT_API_BASE_URL:-http://localhost:8080}"

# 启动后端服务器
echo ""
echo "============================================================"
echo "启动后端服务器 (端口 8080)..."
echo "============================================================"
$PYTHON main.py &
BACKEND_PID=$!
echo "后端服务器 PID: $BACKEND_PID"

# 等待后端就绪
sleep 3
if ! kill -0 $BACKEND_PID 2>/dev/null; then
    echo "错误: 后端服务器启动失败"
    exit 1
fi

# 启动前端代理服务器
echo ""
echo "============================================================"
echo "启动前端代理服务器 (端口 8090)..."
echo "============================================================"
cd frontend
$PYTHON server.py &
FRONTEND_PID=$!
cd ..
echo "前端服务器 PID: $FRONTEND_PID"

echo ""
echo "============================================================"
echo "服务已启动"
echo "  后端 API:  http://localhost:8080"
echo "  前端界面:  http://localhost:8090"
echo "============================================================"
echo ""
echo "按 Ctrl+C 停止所有服务"

# 捕获退出信号，清理进程
cleanup() {
    echo ""
    echo "正在停止服务..."
    kill $BACKEND_PID 2>/dev/null
    kill $FRONTEND_PID 2>/dev/null
    lsof -ti:8080 2>/dev/null | xargs kill 2>/dev/null || true
    lsof -ti:8090 2>/dev/null | xargs kill 2>/dev/null || true
    echo "已停止"
    exit 0
}
trap cleanup SIGINT SIGTERM

# 等待子进程
wait
