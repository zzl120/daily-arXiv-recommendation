/**
 * Daily arXiv AI Enhanced - Modern Frontend JavaScript
 * 结合 daily-arxiv-main 和 daily-arXiv-recommendation-main 的功能
 */

// =================== 全局状态 ==================== //
const state = {
    currentSection: 'overview',
    currentPage: 1,
    papersPerPage: 20,
    selectedCategory: '',
    searchQuery: '',
    allPapers: [],
    allCategories: [],
    currentDate: new Date(),
    availableDates: [],
    theme: localStorage.getItem('theme') || 'light',

    // 过滤相关
    activeKeywords: [],
    userKeywords: [],
    activeAuthors: [],
    userAuthors: [],
    currentPaperIndex: 0,
    currentFilteredPapers: [],
    textSearchQuery: '',
    previousActiveKeywords: null,
    previousActiveAuthors: null
};

// ==================== 初始化 ==================== //
document.addEventListener('DOMContentLoaded', async function() {
    initTheme();
    initNavigation();
    initCalendar();
    initEventListeners();
    initFlatpickr();
    loadScrollBehavior();
    loadMobileMenu();

    // 加载用户关键词设置
    loadUserKeywords();
    loadUserAuthors();

    // 加载数据
    await fetchAvailableDates();
    if (state.availableDates.length > 0) {
        await loadPapersByDate(state.availableDates[0]);
    }

    // 更新统计信息
    updateStats();
});

// ==================== 主题切换 ==================== //
function initTheme() {
    const html = document.documentElement;
    html.setAttribute('data-theme', state.theme);

    const themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) {
        const icon = themeToggle.querySelector('i');
        if (icon) {
            icon.className = state.theme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
        }
        themeToggle.addEventListener('click', toggleTheme);
    }
}

function toggleTheme() {
    state.theme = state.theme === 'light' ? 'dark' : 'light';
    localStorage.setItem('theme', state.theme);
    initTheme();
}

// ==================== 导航 ==================== //
function initNavigation() {
    const navItems = document.querySelectorAll('.nav-item');

    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const section = item.dataset.section;
            navigateToSection(section);
        });
    });

    // 处理链接点击
    document.querySelectorAll('[data-section]').forEach(link => {
        link.addEventListener('click', (e) => {
            const section = link.dataset.section;
            if (section) {
                e.preventDefault();
                navigateToSection(section);
            }
        });
    });
}

function navigateToSection(sectionName) {
    state.currentSection = sectionName;

    // 更新导航栏
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.toggle('active', item.dataset.section === sectionName);
    });

    // 切换内容区域
    document.querySelectorAll('.content-section').forEach(section => {
        section.classList.toggle('active', section.id === `${sectionName}-section`);
    });

    // 关闭移动端菜单
    closeMobileMenu();

    // 滚动到顶部
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ==================== 移动端菜单 ==================== //
function loadMobileMenu() {
    const mobileBtn = document.getElementById('mobile-menu-btn');
    const sidebar = document.getElementById('sidebar');
    const sidebarToggle = document.getElementById('sidebar-toggle-btn');

    if (mobileBtn) {
        mobileBtn.addEventListener('click', toggleMobileMenu);
    }

    if (sidebarToggle) {
        sidebarToggle.addEventListener('click', closeMobileMenu);
    }

    document.addEventListener('click', (e) => {
        if (sidebar && sidebar.classList.contains('open')) {
            if (!sidebar.contains(e.target) && !mobileBtn.contains(e.target)) {
                closeMobileMenu();
            }
        }
    });
}

function toggleMobileMenu() {
    const sidebar = document.getElementById('sidebar');
    sidebar.classList.toggle('open');
}

function closeMobileMenu() {
    const sidebar = document.getElementById('sidebar');
    sidebar.classList.remove('open');
}

// ==================== 日历 ==================== //
function initCalendar() {
    renderCalendar(state.currentDate);

    document.getElementById('prev-month')?.addEventListener('click', () => {
        state.currentDate.setMonth(state.currentDate.getMonth() - 1);
        renderCalendar(state.currentDate);
    });

    document.getElementById('next-month')?.addEventListener('click', () => {
        state.currentDate.setMonth(state.currentDate.getMonth() + 1);
        renderCalendar(state.currentDate);
    });
}

function renderCalendar(date) {
    const year = date.getFullYear();
    const month = date.getMonth();

    const monthNames = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];
    const monthElement = document.getElementById('current-month');
    if (monthElement) {
        monthElement.textContent = `${year}年${monthNames[month]}`;
    }

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDay = firstDay.getDay();
    const totalDays = lastDay.getDate();

    const calendarBody = document.getElementById('calendar-body');
    if (!calendarBody) return;

    calendarBody.innerHTML = '';

    const weekDays = ['日', '一', '二', '三', '四', '五', '六'];
    weekDays.forEach(day => {
        const dayHeader = document.createElement('div');
        dayHeader.className = 'calendar-day';
        dayHeader.style.cssText = 'font-weight: 600; color: var(--text-secondary); text-align: center; font-size: 0.75rem;';
        dayHeader.textContent = day;
        calendarBody.appendChild(dayHeader);
    });

    for (let i = 0; i < startDay; i++) {
        const emptyDay = document.createElement('div');
        emptyDay.className = 'calendar-day empty';
        calendarBody.appendChild(emptyDay);
    }

    const today = new Date();
    for (let day = 1; day <= totalDays; day++) {
        const dayElement = document.createElement('div');
        dayElement.className = 'calendar-day';
        dayElement.textContent = day;

        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

        if (year === today.getFullYear() && month === today.getMonth() && day === today.getDate()) {
            dayElement.classList.add('active');
        }

        if (state.availableDates.includes(dateStr)) {
            dayElement.classList.add('has-data');
        }

        dayElement.addEventListener('click', () => {
            loadPapersByDate(dateStr);
        });

        calendarBody.appendChild(dayElement);
    }
}

// ==================== Flatpickr 日期选择 ==================== //
function initFlatpickr() {
    const datepicker = document.getElementById('datepicker');
    if (!datepicker) return;

    flatpickr(datepicker, {
        defaultDate: state.availableDates[0] || new Date(),
        enable: state.availableDates,
        dateFormat: "Y-m-d",
        onChange: function(selectedDates, dateStr) {
            if (dateStr) {
                loadPapersByDate(dateStr);
            }
        }
    });
}

// ==================== 数据加载 ==================== //
async function fetchAvailableDates() {
    try {
        const fileListUrl = DATA_CONFIG.getDataUrl('assets/file-list.txt');
        const response = await fetch(fileListUrl);
        if (!response.ok) {
            console.error('Error fetching file list:', response.status);
            return [];
        }
        const text = await response.text();
        const files = text.trim().split('\n');

        const dateRegex = /(\d{4}-\d{2}-\d{2})_AI_enhanced_(English|Chinese)\.jsonl/;
        const dateLanguageMap = new Map();
        const dates = [];

        files.forEach(file => {
            const match = file.match(dateRegex);
            if (match && match[1] && match[2]) {
                const date = match[1];
                const language = match[2];

                if (!dateLanguageMap.has(date)) {
                    dateLanguageMap.set(date, []);
                    dates.push(date);
                }
                dateLanguageMap.get(date).push(language);
            }
        });

        window.dateLanguageMap = dateLanguageMap;
        state.availableDates = [...new Set(dates)];
        state.availableDates.sort((a, b) => new Date(b) - new Date(a));

        return state.availableDates;
    } catch (error) {
        console.error('获取可用日期失败:', error);
    }
}

async function loadPapersByDate(date) {
    state.currentDate = new Date(date);

    const currentDateElement = document.getElementById('currentDate');
    if (currentDateElement) {
        currentDateElement.textContent = formatDate(date);
    }

    const container = document.getElementById('papers-list') || document.getElementById('featured-papers');
    if (container) {
        container.innerHTML = `
            <div class="loading-container">
                <div class="loading-spinner"></div>
                <p>Loading papers...</p>
            </div>
        `;
    }

    try {
        const selectedLanguage = selectLanguageForDate(date);
        const dataUrl = DATA_CONFIG.getDataUrl(`data/${date}_AI_enhanced_${selectedLanguage}.jsonl`);
        const response = await fetch(dataUrl);

        if (!response.ok) {
            if (response.status === 404) {
                container.innerHTML = '<div class="loading-container"><p>No papers found for this date.</p></div>';
                state.allPapers = [];
                return;
            }
            throw new Error(`HTTP ${response.status}`);
        }

        const text = await response.text();
        if (!text || text.trim() === '') {
            container.innerHTML = '<div class="loading-container"><p>No papers found for this date.</p></div>';
            state.allPapers = [];
            return;
        }

        state.allPapers = parseJsonlData(text, date);

        const categories = getAllCategories(state.allPapers);
        renderCategoryFilter(categories);
        renderCategoryList(categories);

        renderPapers();
        renderFeaturedPapers();

    } catch (error) {
        console.error('加载论文数据失败:', error);
        container.innerHTML = `
            <div class="loading-container">
                <p>Loading data fails. Please retry.</p>
                <p>Error messages: ${error.message}</p>
            </div>
        `;
    }
}

function selectLanguageForDate(date, preferredLanguage = null) {
    const availableLanguages = window.dateLanguageMap?.get(date) || [];

    if (availableLanguages.length === 0) {
        return 'Chinese';
    }

    const preferred = preferredLanguage || getPreferredLanguage();

    if (availableLanguages.includes(preferred)) {
        return preferred;
    }

    return availableLanguages.includes('Chinese') ? 'Chinese' : availableLanguages[0];
}

function getPreferredLanguage() {
    const browserLang = navigator.language || navigator.userLanguage;
    if (browserLang.startsWith('zh')) {
        return 'Chinese';
    }
    return 'Chinese';
}

function parseJsonlData(jsonlText, date) {
    const result = {};
    const lines = jsonlText.trim().split('\n');

    lines.forEach(line => {
        try {
            const paper = JSON.parse(line);

            if (!paper.categories) {
                return;
            }

            let allCategories = Array.isArray(paper.categories) ? paper.categories : [paper.categories];
            const primaryCategory = allCategories[0];

            if (!result[primaryCategory]) {
                result[primaryCategory] = [];
            }

            const summary = paper.AI && paper.AI.tldr ? paper.AI.tldr : paper.summary;

            result[primaryCategory].push({
                title: paper.title,
                url: paper.abs || paper.pdf || `https://arxiv.org/abs/${paper.id}`,
                authors: Array.isArray(paper.authors) ? paper.authors.join(', ') : paper.authors,
                category: allCategories,
                summary: summary,
                details: paper.summary || '',
                date: date,
                id: paper.id,
                motivation: paper.AI && paper.AI.motivation ? paper.AI.motivation : '',
                method: paper.AI && paper.AI.method ? paper.AI.method : '',
                result: paper.AI && paper.AI.result ? paper.AI.result : '',
                conclusion: paper.AI && paper.AI.conclusion ? paper.AI.conclusion : '',
                code_url: paper.code_url || '',
                code_stars: paper.code_stars || 0,
                code_last_update: paper.code_last_update || ''
            });
        } catch (error) {
            console.error('解析JSON行失败:', error);
        }
    });

    return result;
}

function getAllCategories(data) {
    const categories = Object.keys(data);
    const categoryCounts = {};

    categories.forEach(category => {
        categoryCounts[category] = data[category] ? data[category].length : 0;
    });

    return {
        sortedCategories: categories.sort((a, b) => a.localeCompare(b)),
        categoryCounts
    };
}

// ==================== 渲染函数 ==================== //
function renderPapers() {
    const container = document.getElementById('papers-list');
    if (!container) return;

    container.innerHTML = '';

    let papers = [];
    if (state.selectedCategory === 'all' || !state.selectedCategory) {
        const { sortedCategories } = getAllCategories(state.allPapers);
        sortedCategories.forEach(category => {
            if (state.allPapers[category]) {
                papers = papers.concat(state.allPapers[category]);
            }
        });
    } else if (state.allPapers[state.selectedCategory]) {
        papers = state.allPapers[state.selectedCategory];
    }

    papers = filterAndSortPapers(papers);
    state.currentFilteredPapers = [...papers];

    if (papers.length === 0) {
        container.innerHTML = '<div class="loading-container"><p>No paper found.</p></div>';
        return;
    }

    papers.forEach((paper, index) => {
        const paperCard = createPaperCard(paper, index);
        container.appendChild(paperCard);
    });

    renderPagination(papers.length);
}

function renderFeaturedPapers() {
    const container = document.getElementById('featured-papers');
    if (!container) return;

    let papers = [];
    const { sortedCategories } = getAllCategories(state.allPapers);
    sortedCategories.forEach(category => {
        if (state.allPapers[category]) {
            papers = papers.concat(state.allPapers[category]);
        }
    });

    if (papers.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: var(--text-secondary);">暂无论文</p>';
        return;
    }

    // 只显示前5篇
    papers = papers.slice(0, 5);

    container.innerHTML = papers.map((paper, index) => `
        <div class="paper-card fade-in" onclick="showPaperDetails(${index})">
            <h4 class="paper-card-title">
                <a href="${paper.url}" target="_blank">${escapeHtml(paper.title)}</a>
            </h4>
            <p class="paper-card-summary">${escapeHtml(paper.summary || '')}</p>
        </div>
    `).join('');
}

function createPaperCard(paper, index) {
    const card = document.createElement('div');
    card.className = 'paper-card fade-in';
    card.onclick = () => showPaperDetails(paper, index);

    const categoryTags = paper.category.map(cat =>
        `<span class="category-tag">${cat}</span>`
    ).join('');

    card.innerHTML = `
        <div class="paper-card-header">
            <h3 class="paper-card-title">${escapeHtml(paper.title)}</h3>
            <p class="paper-card-authors">${escapeHtml(paper.authors)}</p>
        </div>
        <div class="paper-card-categories">
            ${categoryTags}
        </div>
        <p class="paper-card-summary">${escapeHtml(paper.summary || '')}</p>
        <div class="paper-card-footer">
            <span class="paper-card-date">${formatDate(paper.date)}</span>
            <span class="paper-card-link">Details <i class="fas fa-arrow-right"></i></span>
        </div>
    `;

    return card;
}

function renderCategoryFilter(categories) {
    const { sortedCategories, categoryCounts } = categories;

    const container = document.getElementById('paper-category-filter');
    if (!container) return;

    let totalPapers = Object.values(categoryCounts).reduce((a, b) => a + b, 0);

    container.innerHTML = `<option value="all">全部类别 (${totalPapers})</option>` +
        sortedCategories.map(cat =>
            `<option value="${cat}">${cat} (${categoryCounts[cat]})</option>`
        ).join('');

    container.addEventListener('change', (e) => {
        state.selectedCategory = e.target.value;
        renderPapers();
    });
}

function renderCategoryList(categories) {
    const { sortedCategories, categoryCounts } = categories;
    const container = document.getElementById('category-list');
    if (!container) return;

    container.innerHTML = sortedCategories.slice(0, 10).map(cat => `
        <div class="category-item ${state.selectedCategory === cat ? 'active' : ''}"
             data-category="${cat}">
            <span class="category-name">${cat}</span>
            <span class="category-count">${categoryCounts[cat]}</span>
        </div>
    `).join('');

    container.querySelectorAll('.category-item').forEach(item => {
        item.addEventListener('click', () => {
            const category = item.dataset.category;
            state.selectedCategory = state.selectedCategory === category ? '' : category;

            document.querySelectorAll('.category-item').forEach(i => {
                i.classList.toggle('active', i.dataset.category === state.selectedCategory);
            });

            const select = document.getElementById('paper-category-filter');
            if (select) {
                select.value = state.selectedCategory || 'all';
            }

            renderPapers();
        });
    });
}

function renderPagination(totalItems) {
    const container = document.getElementById('pagination');
    if (!container) return;

    const totalPages = Math.ceil(totalItems / state.papersPerPage);

    if (totalPages <= 1) {
        container.innerHTML = '';
        return;
    }

    let html = '';

    html += `<li class="page-item ${state.currentPage === 1 ? 'disabled' : ''}">
        <a class="page-link" href="#" data-page="${state.currentPage - 1}">
            <i class="fas fa-chevron-left"></i>
        </a>
    </li>`;

    for (let i = 1; i <= totalPages; i++) {
        html += `<li class="page-item ${i === state.currentPage ? 'active' : ''}">
            <a class="page-link" href="#" data-page="${i}">${i}</a>
        </li>`;
    }

    html += `<li class="page-item ${state.currentPage === totalPages ? 'disabled' : ''}">
        <a class="page-link" href="#" data-page="${state.currentPage + 1}">
            <i class="fas fa-chevron-right"></i>
        </a>
    </li>`;

    container.innerHTML = html;

    container.querySelectorAll('.page-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const page = parseInt(link.dataset.page);
            if (page > 0 && page <= totalPages) {
                state.currentPage = page;
                renderPapers();
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
        });
    });
}

// ==================== 论文详情 ==================== //
function showPaperDetails(paper, paperIndex) {
    const modal = document.getElementById('paperModal');
    const modalTitle = document.getElementById('modalTitle');
    const modalBody = document.getElementById('modalBody');

    if (!modal || !modalTitle || !modalBody) return;

    state.currentPaperIndex = paperIndex;

    modalTitle.textContent = paper.title;

    const modalContent = `
        <div class="paper-details">
            <p><strong>Authors:</strong> ${escapeHtml(paper.authors)}</p>
            <p><strong>Categories:</strong> ${paper.category.join(', ')}</p>
            <p><strong>Date:</strong> ${formatDate(paper.date)}</p>

            <h3>TL;DR</h3>
            <p>${escapeHtml(paper.summary || '')}</p>

            ${paper.motivation ? `<div class="paper-section"><h4>Motivation</h4><p>${escapeHtml(paper.motivation)}</p></div>` : ''}
            ${paper.method ? `<div class="paper-section"><h4>Method</h4><p>${escapeHtml(paper.method)}</p></div>` : ''}
            ${paper.result ? `<div class="paper-section"><h4>Result</h4><p>${escapeHtml(paper.result)}</p></div>` : ''}
            ${paper.conclusion ? `<div class="paper-section"><h4>Conclusion</h4><p>${escapeHtml(paper.conclusion)}</p></div>` : ''}

            ${paper.details ? `<h3>Abstract</h3><p class="original-abstract">${escapeHtml(paper.details)}</p>` : ''}

            <div class="pdf-preview-section">
                <div class="pdf-header">
                    <h3>PDF Preview</h3>
                    <button class="pdf-expand-btn" onclick="togglePdfSize(this)">
                        <i class="fas fa-expand"></i>
                    </button>
                </div>
                <div class="pdf-container">
                    <iframe src="${paper.url.replace('abs', 'pdf')}" width="100%" height="600px" frameborder="0"></iframe>
                </div>
            </div>
        </div>
    `;

    modalBody.innerHTML = modalContent;

    // 更新底部链接
    document.getElementById('paperLink').href = paper.url;
    document.getElementById('pdfLink').href = paper.url.replace('abs', 'pdf');
    document.getElementById('htmlLink').href = paper.url.replace('abs', 'html');

    // GitHub 链接
    const githubLink = document.getElementById('githubLink');
    if (paper.code_url) {
        githubLink.href = paper.code_url;
        githubLink.style.display = 'inline-flex';
    } else {
        githubLink.style.display = 'none';
    }

    // Kimi 链接
    const kimiLink = document.getElementById('kimiChatLink');
    if (kimiLink) {
        const prompt = `请你阅读这篇文章${paper.url.replace('abs', 'pdf')},总结一下这篇文章解决的问题、相关工作、研究方法、做了什么实验及其结果、结论`;
        kimiLink.href = `https://www.kimi.com/_prefill_chat?prefill_prompt=${encodeURIComponent(prompt)}&system_prompt=你是一个学术助手`;
    }

    // 更新位置信息
    const paperPosition = document.getElementById('paperPosition');
    if (paperPosition) {
        paperPosition.textContent = `${state.currentPaperIndex + 1} / ${state.currentFilteredPapers.length}`;
    }

    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeModal() {
    const modal = document.getElementById('paperModal');
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }
}

function togglePdfSize(button) {
    const pdfContainer = button.closest('.pdf-preview-section').querySelector('.pdf-container');
    const iframe = pdfContainer.querySelector('iframe');

    if (pdfContainer.classList.contains('expanded')) {
        pdfContainer.classList.remove('expanded');
        iframe.style.height = '600px';

        const overlay = document.querySelector('.pdf-overlay');
        if (overlay) overlay.remove();
    } else {
        pdfContainer.classList.add('expanded');
        iframe.style.height = '90vh';

        const overlay = document.createElement('div');
        overlay.className = 'pdf-overlay';
        document.body.appendChild(overlay);
        overlay.addEventListener('click', () => togglePdfSize(button));
    }
}

// ==================== 过滤和搜索 ==================== //
function filterAndSortPapers(papers) {
    let filtered = [...papers];

    // 关键词和作者匹配
    if (state.activeKeywords.length > 0 || state.activeAuthors.length > 0) {
        filtered.sort((a, b) => {
            const aMatchesKeyword = state.activeKeywords.length > 0 ?
                state.activeKeywords.some(keyword =>
                    `${a.title} ${a.summary}`.toLowerCase().includes(keyword.toLowerCase())
                ) : false;

            const aMatchesAuthor = state.activeAuthors.length > 0 ?
                state.activeAuthors.some(author =>
                    a.authors.toLowerCase().includes(author.toLowerCase())
                ) : false;

            const bMatchesKeyword = state.activeKeywords.length > 0 ?
                state.activeKeywords.some(keyword =>
                    `${b.title} ${b.summary}`.toLowerCase().includes(keyword.toLowerCase())
                ) : false;

            const bMatchesAuthor = state.activeAuthors.length > 0 ?
                state.activeAuthors.some(author =>
                    b.authors.toLowerCase().includes(author.toLowerCase())
                ) : false;

            const aMatches = aMatchesKeyword || aMatchesAuthor;
            const bMatches = bMatchesKeyword || bMatchesAuthor;

            if (aMatches && !bMatches) return -1;
            if (!aMatches && bMatches) return 1;
            return 0;
        });
    }

    // 文本搜索
    if (state.textSearchQuery && state.textSearchQuery.trim().length > 0) {
        const q = state.textSearchQuery.toLowerCase();
        filtered.sort((a, b) => {
            const hayA = `${a.title} ${a.authors} ${a.summary}`.toLowerCase();
            const hayB = `${b.title} ${b.authors} ${b.summary}`.toLowerCase();
            const am = hayA.includes(q);
            const bm = hayB.includes(q);
            if (am && !bm) return -1;
            if (!am && bm) return 1;
            return 0;
        });
    }

    return filtered;
}

// ==================== 用户关键词设置 ==================== //
function loadUserKeywords() {
    const savedKeywords = localStorage.getItem('preferredKeywords');
    if (savedKeywords) {
        try {
            state.userKeywords = JSON.parse(savedKeywords);
            state.activeKeywords = [...state.userKeywords];
        } catch (error) {
            state.userKeywords = [];
            state.activeKeywords = [];
        }
    }
    renderFilterTags();
}

function loadUserAuthors() {
    const savedAuthors = localStorage.getItem('preferredAuthors');
    if (savedAuthors) {
        try {
            state.userAuthors = JSON.parse(savedAuthors);
            state.activeAuthors = [...state.userAuthors];
        } catch (error) {
            state.userAuthors = [];
            state.activeAuthors = [];
        }
    }
    renderFilterTags();
}

function renderFilterTags() {
    const filterTagsElement = document.getElementById('filterTags');
    if (!filterTagsElement) return;

    if ((!state.userAuthors || state.userAuthors.length === 0) &&
        (!state.userKeywords || state.userKeywords.length === 0)) {
        filterTagsElement.innerHTML = '<p style="color: var(--text-tertiary); font-size: 0.875rem;">暂无过滤标签，请在设置页面添加</p>';
        return;
    }

    filterTagsElement.innerHTML = '';

    if (state.userAuthors && state.userAuthors.length > 0) {
        state.userAuthors.forEach(author => {
            const tag = document.createElement('span');
            tag.className = `filter-tag ${state.activeAuthors.includes(author) ? 'active' : ''}`;
            tag.textContent = author;
            tag.dataset.author = author;
            tag.title = "匹配作者姓名";
            tag.onclick = () => toggleAuthorFilter(author);
            filterTagsElement.appendChild(tag);
        });
    }

    if (state.userKeywords && state.userKeywords.length > 0) {
        state.userKeywords.forEach(keyword => {
            const tag = document.createElement('span');
            tag.className = `filter-tag ${state.activeKeywords.includes(keyword) ? 'active' : ''}`;
            tag.textContent = keyword;
            tag.dataset.keyword = keyword;
            tag.title = "匹配标题和摘要中的关键词";
            tag.onclick = () => toggleKeywordFilter(keyword);
            filterTagsElement.appendChild(tag);
        });
    }
}

function toggleKeywordFilter(keyword) {
    const index = state.activeKeywords.indexOf(keyword);
    if (index === -1) {
        state.activeKeywords.push(keyword);
    } else {
        state.activeKeywords.splice(index, 1);
    }
    renderFilterTags();
    renderPapers();
}

function toggleAuthorFilter(author) {
    const index = state.activeAuthors.indexOf(author);
    if (index === -1) {
        state.activeAuthors.push(author);
    } else {
        state.activeAuthors.splice(index, 1);
    }
    renderFilterTags();
    renderPapers();
}

// ==================== 事件监听 ==================== //
function initEventListeners() {
    // 搜索
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        let searchTimeout;
        searchInput.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                state.textSearchQuery = e.target.value;
                renderPapers();
            }, 300);
        });
    }

    // 排序
    const sortSelect = document.getElementById('paper-sort');
    if (sortSelect) {
        sortSelect.addEventListener('change', (e) => {
            sortPapers(e.target.value);
        });
    }

    // 模态框关闭
    document.getElementById('closeModal')?.addEventListener('click', closeModal);

    document.querySelector('.paper-modal')?.addEventListener('click', (event) => {
        if (event.target.classList.contains('paper-modal')) {
            closeModal();
        }
    });

    // 键盘导航
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            const modal = document.getElementById('paperModal');
            if (modal && modal.classList.contains('active')) {
                closeModal();
            }
        } else if (event.key === 'ArrowLeft') {
            navigateToPreviousPaper();
        } else if (event.key === 'ArrowRight') {
            navigateToNextPaper();
        } else if (event.key === ' ' || event.key === 'Spacebar') {
            showRandomPaper();
        }
    });
}

function sortPapers(sortBy) {
    let papers = [];
    const { sortedCategories } = getAllCategories(state.allPapers);
    sortedCategories.forEach(category => {
        if (state.allPapers[category]) {
            papers = papers.concat(state.allPapers[category]);
        }
    });

    if (sortBy === 'date') {
        papers.sort((a, b) => new Date(b.date) - new Date(a.date));
    } else if (sortBy === 'title') {
        papers.sort((a, b) => a.title.localeCompare(b.title));
    }

    state.allPapers = {};
    papers.forEach(paper => {
        const cat = paper.category[0];
        if (!state.allPapers[cat]) {
            state.allPapers[cat] = [];
        }
        state.allPapers[cat].push(paper);
    });

    renderPapers();
}

function navigateToPreviousPaper() {
    if (state.currentFilteredPapers.length === 0) return;
    state.currentPaperIndex = state.currentPaperIndex > 0 ? state.currentPaperIndex - 1 : state.currentFilteredPapers.length - 1;
    showPaperDetails(state.currentFilteredPapers[state.currentPaperIndex], state.currentPaperIndex);
}

function navigateToNextPaper() {
    if (state.currentFilteredPapers.length === 0) return;
    state.currentPaperIndex = state.currentPaperIndex < state.currentFilteredPapers.length - 1 ? state.currentPaperIndex + 1 : 0;
    showPaperDetails(state.currentFilteredPapers[state.currentPaperIndex], state.currentPaperIndex);
}

function showRandomPaper() {
    if (state.currentFilteredPapers.length === 0) return;
    const randomIndex = Math.floor(Math.random() * state.currentFilteredPapers.length);
    state.currentPaperIndex = randomIndex;
    showPaperDetails(state.currentFilteredPapers[randomIndex], randomIndex);
}

// ==================== 滚动行为 ==================== //
function loadScrollBehavior() {
    const backToTop = document.getElementById('back-to-top');

    window.addEventListener('scroll', () => {
        if (window.pageYOffset > 300) {
            backToTop?.classList.add('visible');
        } else {
            backToTop?.classList.remove('visible');
        }
    });

    backToTop?.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });
}

// ==================== 统计信息 ==================== //
function updateStats() {
    // 更新论文数量
    const totalPapers = document.getElementById('total-papers');
    if (totalPapers) {
        let count = 0;
        Object.values(state.allPapers).forEach(papers => {
            count += papers.length;
        });
        totalPapers.textContent = count;
    }

    // 更新类别数量
    const totalCategories = document.getElementById('total-categories');
    if (totalCategories) {
        totalCategories.textContent = Object.keys(state.allPapers).length;
    }

    // 更新分析数量
    const totalAnalyzed = document.getElementById('total-analyzed');
    if (totalAnalyzed) {
        totalAnalyzed.textContent = state.availableDates.length;
    }

    // 更新时间
    const updateTime = document.getElementById('update-time');
    if (updateTime && state.availableDates.length > 0) {
        updateTime.textContent = formatDate(state.availableDates[0]);
    }
}

// ==================== 工具函数 ==================== //
function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'numeric',
        day: 'numeric'
    });
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ==================== 导出 ==================== //
window.dailyArxiv = {
    navigateToSection,
    showPaperDetails,
    togglePdfSize,
    toggleTheme,
    toggleKeywordFilter,
    toggleAuthorFilter
};
