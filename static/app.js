document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('search-input');
    const searchBtn = document.getElementById('search-btn');
    const resultsList = document.getElementById('results-list');
    const countSpan = document.getElementById('count');
    const previewSection = document.getElementById('preview-section');
    const previewFrame = document.getElementById('preview-frame');
    const previewTitle = document.getElementById('preview-title');
    const closePreview = document.getElementById('close-preview');
    const categoryList = document.getElementById('category-list');

    let allResults = [];
    let activeCategory = 'all';
    let currentQuery = ''; // 紀錄目前搜尋的字串

    const performSearch = async () => {
        const query = searchInput.value.trim();
        if (!query) return;

        currentQuery = query; // 儲存關鍵字供高亮使用
        resultsList.innerHTML = '<div class="empty-state">搜尋中...</div>';
        
        try {
            const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
            allResults = await response.json();
            renderResults();
            updateCategories();
        } catch (error) {
            console.error('Search error:', error);
            resultsList.innerHTML = '<div class="empty-state">搜尋出錯，請稍後再試</div>';
        }
    };

    const renderResults = () => {
        const filtered = activeCategory === 'all' 
            ? allResults 
            : allResults.filter(r => r.category === activeCategory);

        countSpan.textContent = filtered.length;

        if (filtered.length === 0) {
            resultsList.innerHTML = '<div class="empty-state">找不到符合的法規</div>';
            return;
        }

        resultsList.innerHTML = filtered.map((result, index) => `
            <div class="result-card" data-index="${index}">
                <div class="result-header">
                    <div class="result-title">${result.title}</div>
                    <div class="badge">${result.category}</div>
                </div>
                <div class="result-preview">${result.preview}</div>
            </div>
        `).join('');

        // 綁定點擊事件
        document.querySelectorAll('.result-card').forEach(card => {
            card.addEventListener('click', (e) => {
                e.preventDefault();
                const index = card.getAttribute('data-index');
                const result = filtered[index];
                openPreview(result);
            });
        });
    };

    const updateCategories = () => {
        const cats = ['all', ...new Set(allResults.map(r => r.category))];
        categoryList.innerHTML = cats.map(cat => `
            <li class="${cat === activeCategory ? 'active' : ''}" data-cat="${cat}">
                ${cat === 'all' ? '全部法規' : cat}
            </li>
        `).join('');

        categoryList.querySelectorAll('li').forEach(li => {
            li.addEventListener('click', () => {
                activeCategory = li.getAttribute('data-cat');
                categoryList.querySelectorAll('li').forEach(el => el.classList.remove('active'));
                li.classList.add('active');
                renderResults();
            });
        });
    };

    const openPreview = async (result) => {
        const filename = result.filename.toLowerCase();
        previewTitle.textContent = result.title;
        
        document.querySelector('.preview-placeholder').style.display = 'none';
        previewSection.classList.add('open');
        
        const docxViewer = document.getElementById('docx-viewer');

        if (filename.endsWith('.pdf')) {
            docxViewer.style.display = 'none';
            previewFrame.style.display = 'block';
            previewFrame.style.width = '100%';
            previewFrame.style.height = '100%';
            // PDF 高亮：使用 #search="keyword" (僅 Chrome/Edge 支援) 
            // 同時加入 toolbar=0 隱藏多餘工具列
            const highlightParam = currentQuery ? `&search="${encodeURIComponent(currentQuery)}"` : '';
            previewFrame.src = result.url + `#toolbar=0&navpanes=0&view=FitH${highlightParam}`;
        } else if (filename.endsWith('.docx')) {
            previewFrame.style.display = 'none';
            previewFrame.src = '';
            docxViewer.style.display = 'block';
            docxViewer.innerHTML = '<div style="text-align: center; padding: 3rem; color: #7f8c8d;">載入 Word 文件中，請稍候...</div>';
            
            try {
                const response = await fetch(result.url);
                const arrayBuffer = await response.arrayBuffer();
                const renderResult = await mammoth.convertToHtml({arrayBuffer: arrayBuffer});
                
                let html = renderResult.value;
                // Word 高亮：手動替換文字內容
                if (currentQuery) {
                    const regex = new RegExp(`(${currentQuery})`, 'gi');
                    html = html.replace(regex, '<mark class="doc-highlight">$1</mark>');
                }
                
                docxViewer.innerHTML = `<div class="docx-content">${html}</div>`;
                // 自動捲動到第一個高亮點
                setTimeout(() => {
                    const firstMark = docxViewer.querySelector('.doc-highlight');
                    if (firstMark) firstMark.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }, 500);
                
            } catch (err) {
                console.error('DOCX render error:', err);
                docxViewer.innerHTML = `
                    <div style="text-align: center; padding: 3rem;">
                        <p style="color: #e74c3c; margin-bottom: 1rem;">線上預覽失敗，此文件可能包含複雜格式。</p>
                        <a href="${result.url}" target="_blank" style="display: inline-block; padding: 0.5rem 1rem; background: var(--accent); color: white; text-decoration: none; border-radius: 4px;">點此下載檔案</a>
                    </div>`;
            }
        } else {
            window.open(result.url, '_blank');
        }
    };

    closePreview.addEventListener('click', () => {
        previewSection.classList.remove('open');
        previewFrame.src = '';
        document.getElementById('docx-viewer').innerHTML = '';
    });

    searchBtn.addEventListener('click', performSearch);
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') performSearch();
    });
});
