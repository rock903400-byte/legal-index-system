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
    let currentQuery = ''; 

    const performSearch = async () => {
        const query = searchInput.value.trim();
        if (!query) return;

        currentQuery = query; 
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
        const pdfHint = document.getElementById('pdf-search-hint');

        // 先重設內容，避免殘留舊文件的畫面
        previewFrame.src = "about:blank";
        docxViewer.innerHTML = "";
        pdfHint.style.display = 'none';

        if (filename.endsWith('.pdf')) {
            docxViewer.style.display = 'none';
            previewFrame.style.display = 'block';
            
            // 顯示 PDF 專屬搜尋提示 (更精準的指示)
            if (currentQuery) {
                pdfHint.style.display = 'inline-block';
                pdfHint.innerHTML = `💡 提示：請先<b>點擊文件內部</b>，再按 <b>Ctrl + F</b> 搜尋「${currentQuery}」`;
            }
            
            let pdfUrl = result.url;
            let params = `#view=FitH&toolbar=0&navpanes=0`;
            if (currentQuery) {
                params = `#search=${encodeURIComponent(currentQuery)}` + params.replace('#', '&');
            }
            
            setTimeout(() => {
                previewFrame.src = pdfUrl + params;
                // 嘗試自動將游標焦點鎖定在 PDF 視窗內
                setTimeout(() => {
                    previewFrame.focus();
                }, 500);
            }, 50);

        } else if (filename.endsWith('.docx')) {
            previewFrame.style.display = 'none';
            docxViewer.style.display = 'block';
            docxViewer.innerHTML = '<div style="text-align: center; padding: 3rem; color: #7f8c8d;">載入 Word 文件中...</div>';
            
            try {
                const response = await fetch(result.url);
                const arrayBuffer = await response.arrayBuffer();
                const renderResult = await mammoth.convertToHtml({arrayBuffer: arrayBuffer});
                
                let html = renderResult.value;
                if (currentQuery) {
                    const regex = new RegExp(`(${currentQuery})`, 'gi');
                    html = html.replace(regex, '<mark class="doc-highlight">$1</mark>');
                }
                
                docxViewer.innerHTML = `<div class="docx-content">${html}</div>`;
                
                setTimeout(() => {
                    const firstMark = docxViewer.querySelector('.doc-highlight');
                    if (firstMark) firstMark.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }, 300);
                
            } catch (err) {
                console.error('DOCX render error:', err);
                docxViewer.innerHTML = `<div style="text-align: center; padding: 3rem; color: #e74c3c;">預覽失敗，建議下載查看。</div>`;
            }
        }
    };

    closePreview.addEventListener('click', () => {
        previewSection.classList.remove('open');
        previewFrame.src = 'about:blank';
        document.getElementById('docx-viewer').innerHTML = '';
    });

    searchBtn.addEventListener('click', performSearch);
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') performSearch();
    });
});
