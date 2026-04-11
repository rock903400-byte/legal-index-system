import os
import sqlite3
from fastapi import FastAPI, Query
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="協會法規智慧索引系統")

# 允許跨域請求 (生產環境建議縮小範圍，目前為方便設為 *)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# 取得目前檔案所在的目錄
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
SOURCE_DIR = os.path.join(BASE_DIR, "data")
DB_PATH = os.path.join(BASE_DIR, "legal_index.db")
STATIC_DIR = os.path.join(BASE_DIR, "static")

# 確保必要的資料夾存在
if not os.path.exists(SOURCE_DIR):
    os.makedirs(SOURCE_DIR)

def get_db():
    # 建立與資料庫的連線
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row # 讓結果可以用 row["column_name"] 存取
    return conn

@app.get("/api/search")
async def search(q: str = Query(...)):
    # 每次搜尋開啟新連線以確保穩定性
    conn = get_db()
    cursor = conn.cursor()
    
    # 搜尋標題或內容 (使用 LIKE 優化中文匹配)
    query = """
        SELECT title, category, content, filename 
        FROM docs 
        WHERE title LIKE ? OR content LIKE ?
    """
    search_term = f"%{q}%"
    cursor.execute(query, (search_term, search_term))
    results = cursor.fetchall()
    
    output = []
    for row in results:
        content = row["content"]
        # 尋找關鍵字在內文的位置以產生預覽片段
        match_pos = content.lower().find(q.lower())
        if match_pos == -1: match_pos = 0
        
        start = max(0, match_pos - 30)
        end = min(len(content), match_pos + 50)
        preview = content[start:end].replace("\n", " ").replace("\r", "")
        
        # 高亮關鍵字 (預覽用)
        highlighted_preview = preview.replace(q, f"<mark>{q}</mark>")
        
        output.append({
            "title": row["title"],
            "category": row["category"],
            "preview": f"...{highlighted_preview}...",
            "filename": row["filename"],
            "url": f"/files/{row['filename']}"
        })
    
    conn.close()
    return output

# 掛載法規原始檔案服務
if os.path.exists(SOURCE_DIR):
    app.mount("/files", StaticFiles(directory=SOURCE_DIR), name="data")

# 掛載前端網頁 (必須放在最後，因為它是根路徑 /)
if os.path.exists(STATIC_DIR):
    app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    # 動態取得 Render 分配的 PORT，如果是本地執行則預設 8000
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
