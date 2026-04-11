from fastapi import FastAPI, Query
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
import sqlite3
import os

app = FastAPI(title="協會法規智慧索引系統")

# 允許跨來源請求 (開發測試用)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# 取得目前檔案所在的目錄
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
# 設定相對路徑：法規檔案放在同目錄下的 data 資料夾
SOURCE_DIR = os.path.join(BASE_DIR, "data")
DB_PATH = os.path.join(BASE_DIR, "legal_index.db")
STATIC_DIR = os.path.join(BASE_DIR, "static")

def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

# 掛載法規檔案目錄
app.mount("/files", StaticFiles(directory=SOURCE_DIR), name="files")

# 搜尋 API
@app.get("/api/search")
async def search(q: str = Query(None, min_length=1)):
    if not q:
        return []
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # 針對中文處理：使用 LIKE 搜尋與手動產生預覽，避免 SQLite FTS5 預設分詞器對中文支援較弱的問題
    query = """
        SELECT 
            title, 
            category, 
            path, 
            filename,
            content
        FROM docs 
        WHERE title LIKE ? OR content LIKE ?
        LIMIT 50
    """
    
    results = cursor.execute(query, (f'%{q}%', f'%{q}%')).fetchall()
    
    output = []
    for row in results:
        content = row["content"] if row["content"] else ""
        title = row["title"] if row["title"] else ""
        
        # 手動產生 preview snippet
        idx = content.find(q)
        if idx == -1:
            preview = title
        else:
            start = max(0, idx - 30)
            end = min(len(content), idx + len(q) + 30)
            snippet = content[start:end]
            # 替換換行符號避免排版問題
            snippet = snippet.replace('\n', ' ').replace('\r', '')
            preview = snippet.replace(q, f"<mark>{q}</mark>")
            if start > 0:
                preview = "..." + preview
            if end < len(content):
                preview = preview + "..."
                
        output.append({
            "title": row["title"],
            "category": row["category"],
            "filename": row["filename"],
            "preview": preview,
            "url": f"/files/{row['filename']}"
        })
    
    conn.close()
    return output

@app.get("/api/categories")
async def get_categories():
    conn = get_db_connection()
    categories = conn.execute("SELECT DISTINCT category FROM docs").fetchall()
    conn.close()
    return [c["category"] for c in categories]

# 掛載前端網頁
if os.path.exists(STATIC_DIR):
    app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
else:
    print(f"Warning: Static directory not found at {STATIC_DIR}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
