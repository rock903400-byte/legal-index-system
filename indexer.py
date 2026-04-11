import os
import sqlite3
import fitz  # PyMuPDF
from docx import Document
import re

# 設定
# 取得目前檔案所在的目錄
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
# 設定相對路徑：法規檔案放在同目錄下的 data 資料夾
SOURCE_DIR = os.path.join(BASE_DIR, "data")
DB_PATH = os.path.join(BASE_DIR, "legal_index.db")

def get_category(filename):
    categories = {
        "法": "法律",
        "辦法": "辦法",
        "要點": "要點",
        "規則": "規則",
        "章程": "章程",
        "簡則": "簡則",
        "須知": "作業須知",
        "手冊": "手冊",
        "範例": "範例"
    }
    for kw, cat in categories.items():
        if kw in filename:
            return cat
    return "其他"

def extract_text_pdf(path):
    try:
        doc = fitz.open(path)
        text = ""
        for page in doc:
            text += page.get_text()
        doc.close()
        return text
    except Exception as e:
        print(f"Error reading PDF {path}: {e}")
        return ""

def extract_text_docx(path):
    try:
        doc = Document(path)
        return "\n".join([para.text for para in doc.paragraphs])
    except Exception as e:
        print(f"Error reading DOCX {path}: {e}")
        return ""

def init_db():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    # 建立 FTS5 全文檢索虛擬資料表
    cursor.execute("DROP TABLE IF EXISTS docs")
    cursor.execute("""
        CREATE VIRTUAL TABLE docs USING fts5(
            title,
            category,
            content,
            path,
            filename UNINDEXED
        )
    """)
    conn.commit()
    return conn

def run_indexer():
    print("--- Starting indexer ---")
    
    # 【優化重點：檢查資料夾是否存在，不存在就建立】
    if not os.path.exists(SOURCE_DIR):
        print(f"Creating directory: {SOURCE_DIR}")
        os.makedirs(SOURCE_DIR, exist_ok=True)
    
    conn = init_db()
    cursor = conn.cursor()
    
    # 取得檔案清單 (使用 lower() 確保不論副檔名大小寫都能讀到)
    try:
        files = [f for f in os.listdir(SOURCE_DIR) if f.lower().endswith(('.pdf', '.docx'))]
    except Exception as e:
        print(f"Error listing directory: {e}")
        files = []
        
    print(f"Found {len(files)} files to index in {SOURCE_DIR}.")
    
    indexed_count = 0
    for filename in files:
        path = os.path.join(SOURCE_DIR, filename)
        category = get_category(filename)
        title = os.path.splitext(filename)[0]
        
        print(f"[{indexed_count + 1}/{len(files)}] Indexing: {filename}")
        
        try:
            if filename.lower().endswith('.pdf'):
                content = extract_text_pdf(path)
            else:
                content = extract_text_docx(path)
                
            cursor.execute(
                "INSERT INTO docs (title, category, content, path, filename) VALUES (?, ?, ?, ?, ?)",
                (title, category, content, path, filename)
            )
            indexed_count += 1
        except Exception as e:
            # 如果單一檔案出錯，印出錯誤但繼續處理下一個檔案
            print(f"Skipping {filename} due to error: {e}")
        
    conn.commit()
    conn.close()
    print(f"--- Indexing complete! Successfully indexed {indexed_count} files. ---")

if __name__ == "__main__":
    run_indexer()
