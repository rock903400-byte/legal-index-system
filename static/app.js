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
    const docxViewer = document.getElementById('docx-viewer');
    const pdfViewer = document.getElementById('pdf-viewer');
    const pdfHint = document.getElementById('pdf-search-hint');

    // 初始化 PDF.js
    const pdfjsLib = window['pdfjs-dist/build/pdf'];
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

    let allResults = [];
    let activeCategory = 'all';
    let currentQuery = ''; 
    let currentPdfDoc = null; // 儲存目前的 PDF 實例

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
        
        // 隱藏所有視窗，準備載入
        previewFrame.style.display = 'none';
        docxViewer.style.display = 'none';
        pdfViewer.style.display = 'none';
        pdfHint.style.display = 'none';
        
        previewFrame.src = "about:blank";
        docxViewer.innerHTML = "";
        pdfViewer.innerHTML = "";

        if (filename.endsWith('.pdf')) {
            pdfViewer.style.display = 'block';
            renderPdfDocument(result.url, currentQuery);
        } else if (filename.endsWith('.docx')) {
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

    // --- 解法二：自訂 PDF 閱讀器核心邏輯 ---
    async function renderPdfDocument(url, query) {
        pdfViewer.innerHTML = '<div style="text-align: center; padding: 3rem; color: #7f8c8d; font-size: 1.1rem;">載入 PDF 中，正在建立高亮索引...</div>';
        window.hasScrolledToPdfMatch = false; 
        
        try {
            const loadingTask = pdfjsLib.getDocument(url);
            currentPdfDoc = await loadingTask.promise;
            pdfViewer.innerHTML = ''; // 清空載入中文字
            
            // 建立每一頁的容器
            for (let pageNum = 1; pageNum <= currentPdfDoc.numPages; pageNum++) {
                const pageWrapper = document.createElement('div');
                pageWrapper.className = 'pdf-page-container';
                pageWrapper.setAttribute('data-page-number', pageNum);
                
                // Canvas 負責渲染 PDF 畫面
                const canvas = document.createElement('canvas');
                pageWrapper.appendChild(canvas);
                
                // TextLayer 負責文字選取與高亮
                const textLayerDiv = document.createElement('div');
                textLayerDiv.className = 'textLayer';
                pageWrapper.appendChild(textLayerDiv);
                
                pdfViewer.appendChild(pageWrapper);
                
                // 懶加載 (Lazy Loading)：當捲動到該頁時才開始渲染，避免卡頓
                const observer = new IntersectionObserver((entries) => {
                    entries.forEach(entry => {
                        if (entry.isIntersecting) {
                            observer.unobserve(pageWrapper); // 渲染一次後解除觀察
                            renderPdfPage(pageNum, pageWrapper, canvas, textLayerDiv, query);
                        }
                    });
                }, { root: pdfViewer, rootMargin: '100% 0px' }); // 預先渲染前後一頁
                
                observer.observe(pageWrapper);
            }
        } catch (e) {
            console.error('PDF render error:', e);
            pdfViewer.innerHTML = '<div style="text-align: center; padding: 3rem; color: #e74c3c;">PDF 載入失敗。</div>';
        }
    }

    async function renderPdfPage(pageNum, wrapper, canvas, textLayerDiv, query) {
        if (!currentPdfDoc) return;
        const page = await currentPdfDoc.getPage(pageNum);
        
        // 根據視窗寬度動態計算 PDF 縮放比例
        const isMobile = window.innerWidth <= 768;
        const containerWidth = wrapper.parentElement.clientWidth - (isMobile ? 0 : 40); 
        const unscaledViewport = page.getViewport({ scale: 1.0 });
        let scale = containerWidth / unscaledViewport.width;
        if (scale > 2.5) scale = 2.5; // 稍微放寬最大縮放
        if (scale < 0.5) scale = 0.5;
        
        const viewport = page.getViewport({ scale: scale });
        
        // 取得設備像素比 (解決模糊與殘影問題的關鍵)
        const outputScale = window.devicePixelRatio || 1;
        
        // 設定 Canvas 的「實際解析度」 (乘上像素比，讓畫質變細緻)
        canvas.width = Math.floor(viewport.width * outputScale);
        canvas.height = Math.floor(viewport.height * outputScale);
        
        // 設定 Canvas 的「CSS 顯示大小」
        canvas.style.width = Math.floor(viewport.width) + "px";
        canvas.style.height = Math.floor(viewport.height) + "px";
        
        wrapper.style.width = Math.floor(viewport.width) + 'px';
        wrapper.style.height = Math.floor(viewport.height) + 'px';
        
        const ctx = canvas.getContext('2d');
        // 將繪圖內容放大以匹配高解析度畫布
        ctx.scale(outputScale, outputScale);
        
        const renderContext = {
            canvasContext: ctx,
            viewport: viewport
        };
        
        // 渲染畫面
        await page.render(renderContext).promise;
        
        // 渲染文字層 (TextLayer)
        const textContent = await page.getTextContent();
        textLayerDiv.style.width = viewport.width + 'px';
        textLayerDiv.style.height = viewport.height + 'px';
        textLayerDiv.style.setProperty('--scale-factor', viewport.scale);
        
        await pdfjsLib.renderTextLayer({
            textContentSource: textContent,
            container: textLayerDiv,
            viewport: viewport,
            textDivs: []
        }).promise;
        
        // 如果有關鍵字，進行高亮處理
        if (query) {
            highlightPdfText(textLayerDiv, query);
        }
    }

    function highlightPdfText(textLayerDiv, query) {
        // 利用 TreeWalker 尋找所有文字節點
        const regex = new RegExp(`(${query})`, 'gi');
        const walker = document.createTreeWalker(textLayerDiv, NodeFilter.SHOW_TEXT, null, false);
        const nodes = [];
        let node;
        while (node = walker.nextNode()) nodes.push(node);
        
        let hasMatch = false;
        nodes.forEach(textNode => {
            const text = textNode.nodeValue;
            if (regex.test(text)) {
                hasMatch = true;
                const span = document.createElement('span');
                span.innerHTML = text.replace(regex, '<mark class="doc-highlight">$1</mark>');
                textNode.parentNode.replaceChild(span, textNode);
            }
        });
        
        // 自動捲動到第一個找到的關鍵字 (僅觸發一次)
        if (hasMatch && !window.hasScrolledToPdfMatch) {
            window.hasScrolledToPdfMatch = true;
            const firstMark = textLayerDiv.querySelector('.doc-highlight');
            if (firstMark) {
                // 稍微延遲捲動，確保渲染完成
                setTimeout(() => {
                    firstMark.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }, 100);
            }
        }
    }

    closePreview.addEventListener('click', () => {
        previewSection.classList.remove('open');
        previewFrame.src = 'about:blank';
        docxViewer.innerHTML = '';
        pdfViewer.innerHTML = '';
        currentPdfDoc = null;
    });

    searchBtn.addEventListener('click', performSearch);
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') performSearch();
    });
});
