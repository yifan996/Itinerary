from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import os

# 初始化 FastAPI 应用
app = FastAPI(title="适配自定义目录的静态网页托管")

# 获取当前文件（main.py）的目录（backend/）
backend_dir = os.path.dirname(os.path.abspath(__file__))
# 拼接得到项目根目录（backend/ 的上级目录）
project_root = os.path.dirname(backend_dir)
# 拼接得到前端目录的绝对路径（避免相对路径出错）
frontend_dir = os.path.join(project_root, "frontend")

# 挂载前端静态目录
# 访问前缀 /frontend → 对应本地 frontend/ 目录
app.mount(
    "/frontend",  # 访问静态文件的 URL 前缀（比如 http://localhost:8000/frontend/index.html）
    StaticFiles(directory=frontend_dir),  # 前端目录的绝对路径
    name="frontend"
)

# 根路径直接返回 frontend/index.html
@app.get("/")
async def serve_homepage():
    # 拼接 index.html 的绝对路径
    index_path = os.path.join(frontend_dir, "index.html")
    # 检查文件是否存在，避免报错
    if os.path.exists(index_path):
        return FileResponse(index_path)
    return {"error": "前端首页 index.html 不存在，请检查路径"}

# 可选：如果前端有其他静态资源（如 css/js），放在 frontend/ 下即可
# 例如 frontend/css/style.css → 访问 http://localhost:8000/frontend/css/style.css
