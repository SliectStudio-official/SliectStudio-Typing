let articles = [];
let categories = [];
let currentUser = null;
let currentArticle = null;
let originalText = '';
let isStarted = false;
let isFinished = false;
let startTime = null;
let timerInterval = null;
let mode = 'timed';
let timeLimit = 90;
let charStates = [];
let isComposing = false;

let prevInputLen = 0;
let prevInputValue = '';
let cachedCorrect = 0;
let cachedWrong = 0;
let rafId = null;

let privateArticles = [];
let speechEnabled = false;
let currentLbPeriod = 'all';
let currentLbCategory = '';
let errorPracticeMode = false;
let isOfflineArticles = false;
let segments = [];
let segmentOffsets = [];
let currentSegmentIndex = 0;
let segmentInputs = [];
let segmentInputValues = [];
let segmentTotalChars = 0;

let practiceKind = 'normal';
let codeTyping = null;
let codeArticles = [];
let codeCategoryIds = [];
let codeCategories = [];
let allArticles = [];
let codeStatsCache = { typed: 0, correct: 0, wrong: 0 };

const RENDER_BUFFER_BEFORE = 50;
const RENDER_BUFFER_AFTER = 100;
const VIRTUAL_THRESHOLD = 200;

async function readJson(res, url) {
  const ct = (res.headers.get('content-type') || '').toLowerCase();
  if (!ct.includes('application/json')) {
    console.error('[接口] 非 JSON 响应', url || res.url, res.status);
    throw new Error('接口返回异常（HTTP ' + res.status + '），请刷新重试');
  }
  try {
    return await res.json();
  } catch (e) {
    console.error('[接口] JSON 解析失败', url || res.url, res.status);
    throw new Error('接口返回异常（HTTP ' + res.status + '），请刷新重试');
  }
}

const articleSelect = document.getElementById('article-select');
const categoryFilter = document.getElementById('category-filter');
const categoryFilterLabel = document.getElementById('category-filter-label');
const difficultyFilter = document.getElementById('difficulty-filter');
const articleInfo = document.getElementById('article-info');
const practiceKindRadios = document.querySelectorAll('input[name="practice-kind"]');
const practiceKindHint = document.getElementById('practice-kind-hint');
const kindCodeRadio = document.getElementById('kind-code');
const resultCodeNote = document.getElementById('result-code-note');
const startBtn = document.getElementById('start-btn');
const resetBtn = document.getElementById('reset-btn');
const statsCard = document.getElementById('stats-card');
const typingCard = document.getElementById('typing-card');
const resultCard = document.getElementById('result-card');
const historyCard = document.getElementById('history-card');
const typingPages = document.getElementById('typing-pages');
const timerRow = document.getElementById('timer-row');
const timerDisplay = document.getElementById('timer-display');
const timerProgress = document.getElementById('timer-progress');
const textProgressWrap = document.getElementById('text-progress-wrap');
const textProgress = document.getElementById('text-progress');

const statTyped = document.getElementById('stat-typed');
const statCorrect = document.getElementById('stat-correct');
const statWrong = document.getElementById('stat-wrong');
const statSpeed = document.getElementById('stat-speed');
const statAccuracy = document.getElementById('stat-accuracy');

const resultSpeed = document.getElementById('result-speed');
const resultAccuracy = document.getElementById('result-accuracy');
const resultTime = document.getElementById('result-time');
const nicknameInput = document.getElementById('nickname-input');
const submitScoreBtn = document.getElementById('submit-score-btn');
const submitMsg = document.getElementById('submit-msg');

const lbBtn = document.getElementById('lb-btn');
const lbOverlay = document.getElementById('lb-overlay');
const lbModal = document.getElementById('lb-modal');
const lbClose = document.getElementById('lb-close');
const lbTbody = document.getElementById('lb-tbody');
const lbEmpty = document.getElementById('lb-empty');
const lbCategoryFilter = document.getElementById('lb-category-filter');

const timeLimitInput = document.getElementById('time-limit');
const modeRadios = document.querySelectorAll('input[name="mode"]');

const authArea = document.getElementById('auth-area');
const userArea = document.getElementById('user-area');
const displayUsername = document.getElementById('display-username');
const loginBtn = document.getElementById('login-btn');
const registerBtn = document.getElementById('register-btn');
const logoutBtn = document.getElementById('logout-btn');
const adminNavItem = document.getElementById('admin-nav-item');
const profileNavItem = document.getElementById('profile-nav-item');

const authModal = document.getElementById('auth-modal');
const authModalTitle = document.getElementById('auth-modal-title');
const authLoginForm = document.getElementById('auth-login-form');
const authRegisterForm = document.getElementById('auth-register-form');
const loginUsername = document.getElementById('login-username');
const loginPassword = document.getElementById('login-password');
const loginError = document.getElementById('login-error');
const loginSubmit = document.getElementById('login-submit');
const regUsername = document.getElementById('reg-username');
const regEmail = document.getElementById('reg-email');
const regPassword = document.getElementById('reg-password');
const regPasswordConfirm = document.getElementById('reg-password-confirm');
const registerError = document.getElementById('register-error');
const registerSubmit = document.getElementById('register-submit');
const switchToRegister = document.getElementById('switch-to-register');
const switchToLogin = document.getElementById('switch-to-login');

const historyList = document.getElementById('history-list');
const historyEmpty = document.getElementById('history-empty');

const offlineBanner = document.getElementById('offline-banner');

const privateArticlesCard = document.getElementById('private-articles-card');
const privateArticleSelect = document.getElementById('private-article-select');
const privateArticleList = document.getElementById('private-article-list');

const submitArticleBtn = document.getElementById('submit-article-btn');
const submitArticleModal = document.getElementById('submit-article-modal');
const submitTitle = document.getElementById('submit-title');
const submitCategory = document.getElementById('submit-category');
const submitContent = document.getElementById('submit-content');
const submitError = document.getElementById('submit-error');
const submitArticleCancel = document.getElementById('submit-article-cancel');
const submitArticleConfirm = document.getElementById('submit-article-confirm');

const speechToggle = document.getElementById('speech-toggle');

const lbTabs = document.querySelectorAll('.lb-tab');

function getToken() {
  return localStorage.getItem('token');
}

function apiHeaders() {
  const token = getToken();
  const h = { 'Content-Type': 'application/json' };
  if (token) h['Authorization'] = 'Bearer ' + token;
  return h;
}

async function checkAuth() {
  const token = getToken();
  if (!token) {
    currentUser = null;
    updateAuthUI();
    return;
  }
  try {
    const res = await fetch('/api/auth/me', { headers: { 'Authorization': 'Bearer ' + token } });
    if (res.ok) {
      currentUser = await readJson(res);
    } else {
      currentUser = null;
      localStorage.removeItem('token');
    }
  } catch (e) {
    currentUser = null;
  }
  updateAuthUI();
}

function updateAuthUI() {
  if (currentUser) {
    authArea.style.display = 'none';
    userArea.style.display = 'flex';
    displayUsername.textContent = currentUser.nickname || currentUser.username;
    if (currentUser.role === 'admin') {
      adminNavItem.style.display = '';
    } else {
      adminNavItem.style.display = 'none';
    }
    profileNavItem.style.display = '';
    nicknameInput.value = currentUser.username;
    historyCard.style.display = '';
    submitArticleBtn.style.display = '';
    privateArticlesCard.style.display = '';
    fetchMyScores();
    fetchPrivateArticles();
  } else {
    authArea.style.display = 'flex';
    userArea.style.display = 'none';
    adminNavItem.style.display = 'none';
    profileNavItem.style.display = 'none';
    nicknameInput.value = '';
    historyCard.style.display = 'none';
    submitArticleBtn.style.display = 'none';
    privateArticlesCard.style.display = 'none';
  }
}

loginBtn.addEventListener('click', () => {
  authModal.style.display = 'flex';
  authModalTitle.textContent = '登录';
  authLoginForm.style.display = '';
  authRegisterForm.style.display = 'none';
  loginError.textContent = '';
  loginUsername.value = '';
  loginPassword.value = '';
});

registerBtn.addEventListener('click', () => {
  authModal.style.display = 'flex';
  authModalTitle.textContent = '注册';
  authLoginForm.style.display = 'none';
  authRegisterForm.style.display = '';
  registerError.textContent = '';
  regUsername.value = '';
  regEmail.value = '';
  regPassword.value = '';
  regPasswordConfirm.value = '';
});

switchToRegister.addEventListener('click', (e) => {
  e.preventDefault();
  authModalTitle.textContent = '注册';
  authLoginForm.style.display = 'none';
  authRegisterForm.style.display = '';
  registerError.textContent = '';
});

switchToLogin.addEventListener('click', (e) => {
  e.preventDefault();
  authModalTitle.textContent = '登录';
  authLoginForm.style.display = '';
  authRegisterForm.style.display = 'none';
  loginError.textContent = '';
});

authModal.addEventListener('click', (e) => {
  if (e.target === authModal) authModal.style.display = 'none';
});

loginSubmit.addEventListener('click', async () => {
  const username = loginUsername.value.trim();
  const password = loginPassword.value;
  if (!username || !password) {
    loginError.textContent = '请输入用户名和密码';
    return;
  }
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await readJson(res);
    if (res.ok) {
      localStorage.setItem('token', data.token);
      currentUser = data.user;
      authModal.style.display = 'none';
      updateAuthUI();
    } else {
      loginError.textContent = data.error || '登录失败';
    }
  } catch (e) {
    loginError.textContent = '网络错误';
  }
});

registerSubmit.addEventListener('click', async () => {
  const username = regUsername.value.trim();
  const email = regEmail.value.trim();
  const password = regPassword.value;
  const passwordConfirm = regPasswordConfirm.value;
  if (!username || !password) {
    registerError.textContent = '请输入用户名和密码';
    return;
  }
  if (password.length < 6) {
    registerError.textContent = '密码至少6位';
    return;
  }
  if (password !== passwordConfirm) {
    registerError.textContent = '两次输入的密码不一致';
    return;
  }
  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email, password })
    });
    const data = await readJson(res);
    if (res.ok) {
      localStorage.setItem('token', data.token);
      currentUser = data.user;
      authModal.style.display = 'none';
      updateAuthUI();
    } else {
      registerError.textContent = data.error || '注册失败';
    }
  } catch (e) {
    registerError.textContent = '网络错误';
  }
});

logoutBtn.addEventListener('click', () => {
  localStorage.removeItem('token');
  currentUser = null;
  updateAuthUI();
});

async function fetchCategories() {
  const res = await fetch('/api/categories');
  categories = await readJson(res);
  renderCategoryFilter();
  renderLbCategoryFilter();
  renderSubmitCategorySelect();
}

async function fetchCodeCategories() {
  try {
    const res = await fetch('/api/code-categories');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await readJson(res);
    codeCategoryIds = (Array.isArray(data.ids) ? data.ids : []).map(id => String(id));
    codeCategories = Array.isArray(data.categories) ? data.categories : [];
  } catch (e) {
    codeCategoryIds = [];
    codeCategories = [];
    console.warn('[代码分类] 加载代码分类失败', e.message);
  }
  renderCategoryFilter();
  renderLbCategoryFilter();
}

function isCodeCategoryIdClient(id) {
  return codeCategoryIds.indexOf(String(id)) >= 0;
}

function isCodeArticleClient(article) {
  return !!(article && article.category_id != null && isCodeCategoryIdClient(article.category_id));
}

function renderCategoryFilter() {
  const previous = categoryFilter.value;
  categoryFilter.innerHTML = '';
  if (practiceKind === 'code') {
    if (categoryFilterLabel) categoryFilterLabel.textContent = '语言';
    const all = document.createElement('option');
    all.value = '';
    all.textContent = '全部语言';
    categoryFilter.appendChild(all);
    codeCategories.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.name;
      categoryFilter.appendChild(opt);
    });
  } else {
    if (categoryFilterLabel) categoryFilterLabel.textContent = '分类筛选';
    const all = document.createElement('option');
    all.value = '';
    all.textContent = '全部分类';
    categoryFilter.appendChild(all);
    const present = new Set((allArticles.length ? allArticles : articles)
      .filter(a => !a.status || a.status === 'approved')
      .map(a => String(a.category_id)));
    categories.forEach(c => {
      if (!present.has(String(c.id)) || isCodeCategoryIdClient(c.id)) return;
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.name;
      categoryFilter.appendChild(opt);
    });
  }
  if (previous && [...categoryFilter.options].some(o => o.value === previous)) {
    categoryFilter.value = previous;
  } else {
    categoryFilter.value = '';
  }
}

function renderLbCategoryFilter() {
  lbCategoryFilter.innerHTML = '<option value="">全部分类</option>';
  categories.forEach(c => {
    // 代码分类走独立「代码榜」，不再混进总榜分类筛选
    if (isCodeCategoryIdClient(c.id)) return;
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = c.name;
    lbCategoryFilter.appendChild(opt);
  });
}

function renderSubmitCategorySelect() {
  submitCategory.innerHTML = '';
  categories.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = c.name;
    submitCategory.appendChild(opt);
  });
}

function onPracticeFilterChange() {
  if (practiceKind === 'code') {
    currentArticle = null;
    originalText = '';
    articleInfo.textContent = '';
    resetPractice();
    renderArticleSelect();
    return;
  }
  fetchArticles(categoryFilter.value, difficultyFilter.value);
}

categoryFilter.addEventListener('change', onPracticeFilterChange);
difficultyFilter.addEventListener('change', onPracticeFilterChange);

function hideLoadingOverlay() {
  if (window.PageLoading) {
    window.PageLoading.done();
    return;
  }
  document.body.classList.remove('loading');
  const overlay = document.getElementById('page-loading-overlay');
  if (overlay) {
    overlay.classList.add('hidden');
    setTimeout(() => overlay.remove(), 300);
  }
}

async function loadOfflineArticlesFromSW(categoryId, difficulty) {
  const cached = await getCachedArticlesFromSW();
  const seen = new Set();
  articles = cached.filter(a => {
    if (a.id == null || seen.has(a.id)) return false;
    if (a.source && a.source !== 'global') return false;
    if (categoryId && String(a.category_id) !== String(categoryId)) return false;
    if (difficulty && String(a.difficulty) !== String(difficulty)) return false;
    seen.add(a.id);
    return true;
  });
  isOfflineArticles = articles.length > 0;
}

async function fetchArticles(categoryId, difficulty) {
  if (!navigator.onLine) {
    await loadOfflineArticlesFromSW(categoryId, difficulty);
    renderArticleSelect();
    return;
  }

  let url = '/api/articles?brief=1&';
  const params = [];
  if (categoryId) params.push('category_id=' + categoryId);
  if (difficulty) params.push('difficulty=' + difficulty);
  url += params.join('&');
  if (params.length === 0) url = '/api/articles?brief=1';
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    articles = await readJson(res);
    if (!categoryId && !difficulty) allArticles = articles;
    isOfflineArticles = false;
    // 在线时触发 SW 同步离线文章缓存，确保 IndexedDB 与数据库一致
    const ctrl = await getSWController();
    if (ctrl) ctrl.postMessage({ type: 'SYNC_OFFLINE_ARTICLES' });
  } catch (e) {
    // 后端不可达，回退到 SW 缓存的离线文章
    await loadOfflineArticlesFromSW(categoryId, difficulty);
    if (!categoryId && !difficulty) allArticles = articles;
  } finally {
    renderArticleSelect();
    if (!categoryId && !difficulty && practiceKind === 'normal') renderCategoryFilter();
  }
}

async function fetchArticleDetail(id) {
  try {
    const res = await fetch('/api/articles/' + id);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await readJson(res);
  } catch (e) {
    const cached = await getCachedArticlesFromSW();
    const article = cached.find(a => a.id == id && (!a.source || a.source === 'global'));
    return article || null;
  }
}

function getDifficultyLabel(d) {
  if (d === 1) return '简单';
  if (d === 2) return '中等';
  if (d === 3) return '困难';
  return '';
}

const splitTextIntoSegments = window.TypingEngine.splitTextIntoSegments;
const lineRules = window.TypingEngine.lineRules;

function calculateRecommendedTime(text, difficulty) {
  const charCount = text.length;
  if (charCount === 0) return 90;
  // 基础打字速度：3 字/秒（约 180 字/分钟）
  const baseSpeed = 3;
  // 难度系数：简单 1.3（更宽容）、中等 1.0、困难 0.75（更紧张）
  const diffMultiplier = difficulty === 1 ? 1.3 : difficulty === 3 ? 0.75 : 1.0;
  let time = Math.round(charCount / baseSpeed * diffMultiplier);
  // 限制在 10-600 秒
  time = Math.max(10, Math.min(600, time));
  return time;
}

function isCodeModeBlocked() {
  return window.innerWidth <= 767 ||
    ((navigator.maxTouchPoints || 0) > 0 &&
      !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches));
}

async function loadCodeArticles() {
  if (!codeCategoryIds.length) {
    codeArticles = [];
    return false;
  }
  try {
    const res = await fetch('/api/articles?brief=1');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const list = await readJson(res);
    codeArticles = (Array.isArray(list) ? list : [])
      .filter(a => (!a.status || a.status === 'approved') && isCodeArticleClient(a));
  } catch (e) {
    // 离线时退回当前文章列表中的代码条目
    codeArticles = (allArticles.length ? allArticles : articles)
      .filter(a => (!a.status || a.status === 'approved') && isCodeArticleClient(a));
    console.error('[代码模式] 加载代码文章失败', e);
  }
  return codeArticles.length > 0;
}

function updateCodeModeAvailability() {
  if (!kindCodeRadio) return;
  const blocked = isCodeModeBlocked();
  kindCodeRadio.disabled = blocked;
  if (blocked) {
    practiceKindHint.textContent = '代码模式请在电脑上练';
    if (practiceKind === 'code') setPracticeKind('normal', true);
  } else if (practiceKindHint.textContent === '代码模式请在电脑上练') {
    practiceKindHint.textContent = '';
  }
}

async function setPracticeKind(kind, fromAvailability) {
  if (kind === 'code') {
    if (isCodeModeBlocked()) {
      practiceKindHint.textContent = '代码模式请在电脑上练';
      if (kindCodeRadio) kindCodeRadio.checked = false;
      const normal = document.getElementById('kind-normal');
      if (normal) normal.checked = true;
      return;
    }
    const ok = await loadCodeArticles();
    if (!ok) {
      practiceKind = 'normal';
      const normal = document.getElementById('kind-normal');
      if (normal) normal.checked = true;
      articleInfo.textContent = '还没有代码素材';
      practiceKindHint.textContent = '还没有代码素材';
      currentArticle = null;
      originalText = '';
      resetPractice();
      renderArticleSelect();
      return;
    }
    practiceKind = 'code';
    currentArticle = null;
    originalText = '';
    articleSelect.value = '';
    articleInfo.textContent = '代码模式：请在下方选择代码素材';
    if (categoryFilter) { categoryFilter.disabled = false; categoryFilter.value = ''; }
    if (difficultyFilter) { difficultyFilter.disabled = false; difficultyFilter.value = ''; }
    resetPractice();
    renderCategoryFilter();
    renderArticleSelect();
    updateSpeechToggle();
    return;
  }
  practiceKind = 'normal';
  const normalRadio = document.getElementById('kind-normal');
  if (normalRadio) normalRadio.checked = true;
  currentArticle = null;
  originalText = '';
  articleSelect.value = '';
  articleInfo.textContent = '';
  if (categoryFilter) { categoryFilter.disabled = false; categoryFilter.value = ''; }
  if (difficultyFilter) { difficultyFilter.disabled = false; difficultyFilter.value = ''; }
  if (practiceKindHint && practiceKindHint.textContent === '还没有代码素材') practiceKindHint.textContent = '';
  resetPractice();
  renderCategoryFilter();
  renderArticleSelect();
  updateSpeechToggle();
}

practiceKindRadios.forEach(radio => {
  radio.addEventListener('change', () => {
    if (radio.checked) setPracticeKind(radio.value);
  });
});

function renderArticleSelect() {
  const offlineSuffix = isOfflineArticles ? '（离线）' : '';
  articleSelect.innerHTML = '<option value="">-- 请选择 --</option>';
  const list = [];
  let sourceArticles = practiceKind === 'code' ? codeArticles : articles;
  if (practiceKind === 'code') {
    const lang = categoryFilter.value;
    const diff = difficultyFilter.value;
    sourceArticles = sourceArticles.filter(a =>
      (!lang || String(a.category_id) === lang) &&
      (!diff || String(a.difficulty) === diff));
    if (!sourceArticles.length) articleInfo.textContent = '该语言下还没有素材';
  } else {
    sourceArticles = sourceArticles.filter(a => !isCodeArticleClient(a));
  }

  sourceArticles.forEach(a => {
    const catName = a.category_name || '未分类';
    const diffLabel = getDifficultyLabel(a.difficulty);
    const suffix = diffLabel ? ' [' + diffLabel + ']' : '';
    const charCount = a.content_length != null ? a.content_length : (a.content ? a.content.length : 0);
    const title = (categories.length > 0 && !categoryFilter.value)
      ? catName + '｜' + a.title + '（' + charCount + '字）' + suffix + offlineSuffix
      : a.title + '（' + charCount + '字）' + suffix + offlineSuffix;
    list.push({ id: a.id, text: title });
  });

  list.forEach(item => {
    const opt = document.createElement('option');
    opt.value = item.id;
    opt.textContent = item.text;
    articleSelect.appendChild(opt);
  });
  applyArticleQueryParam();
}

function applyArticleQueryParam() {
  const id = new URLSearchParams(location.search).get('article');
  if (!id) return;
  const option = [...articleSelect.options].find(o => o.value === id);
  if (!option) return;
  articleSelect.value = id;
  articleSelect.dispatchEvent(new Event('change', { bubbles: true }));
  try { history.replaceState(null, '', location.pathname + location.hash); } catch (e) {}
}

function applyPageIntent() {
  const params = new URLSearchParams(location.search);
  if (params.get('login') === '1') {
    try { history.replaceState(null, '', location.pathname + location.hash); } catch (e) {}
    loginBtn.click();
  } else if (params.get('submit') === '1') {
    try { history.replaceState(null, '', location.pathname + location.hash); } catch (e) {}
    if (getToken()) submitArticleBtn.click(); else loginBtn.click();
  }
  if (location.hash === '#leaderboard') {
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
    openLeaderboard();
  }
}

articleSelect.addEventListener('change', async () => {
  const id = articleSelect.value;
  if (!id) {
    currentArticle = null;
    originalText = '';
    articleInfo.textContent = '';
    hideTypingArea();
    return;
  }
  const sourceArticles = practiceKind === 'code' ? codeArticles : articles;
  const briefArticle = sourceArticles.find(a => String(a.id) === String(id));
  if (!briefArticle) return;

  // 离线缓存文章通常包含完整 content；在线 brief 列表需要按需拉取详情
  let article = briefArticle;
  if (!isOfflineArticles && !briefArticle.content) {
    const detail = await fetchArticleDetail(id);
    if (articleSelect.value !== id) return;
    if (!detail) {
      alert('文章详情加载失败');
      return;
    }
    article = detail;
    // 更新本地缓存，避免再次选择时重复请求
    const idx = sourceArticles.findIndex(a => String(a.id) === String(id));
    if (idx >= 0) sourceArticles[idx] = detail;
  }

  currentArticle = article;
  originalText = currentArticle.content;
  const catName = practiceKind === 'code' ? '代码' : (currentArticle.category_name || '未分类');
  const diffLabel = getDifficultyLabel(currentArticle.difficulty);
  const diffStr = diffLabel ? ' | 难度：' + diffLabel : '';
  // 根据文章字数和难度动态计算推荐时间
  const recommendedTime = calculateRecommendedTime(originalText, currentArticle.difficulty);
  timeLimitInput.value = recommendedTime;
  timeLimit = recommendedTime;
  const timeStr = ' | 推荐时间：' + recommendedTime + '秒';
  const baseText = '分类：' + catName + ' | 字数：' + originalText.length + '字 | 标题：' + currentArticle.title + diffStr + timeStr;
  if (isOfflineArticles) {
    articleInfo.innerHTML = escapeHtml(baseText) + ' <span class="offline-mode-badge">离线</span>';
  } else {
    articleInfo.textContent = baseText;
  }
  updateSpeechToggle();
  resetPractice();
});

modeRadios.forEach(radio => {
  radio.addEventListener('change', () => {
    mode = radio.value;
    timeLimitInput.style.display = mode === 'timed' ? 'inline-block' : 'none';
  });
});

timeLimitInput.addEventListener('change', () => {
  timeLimit = Math.max(10, Math.min(600, parseInt(timeLimitInput.value) || 90));
  timeLimitInput.value = timeLimit;
});

startBtn.addEventListener('click', () => {
  if (!currentArticle) {
    alert('请先选择一篇文章');
    return;
  }
  startPractice();
});

resetBtn.addEventListener('click', () => {
  resetPractice();
});

function startPractice() {
  if (practiceKind === 'code') {
    startCodePractice();
    return;
  }
  if (currentArticle) {
    try {
      localStorage.setItem('lastPractice', JSON.stringify({
        articleId: currentArticle.id, title: currentArticle.title, at: Date.now()
      }));
    } catch (e) {}
  }
  isStarted = true;
  isFinished = false;
  startTime = Date.now();
  charStates = new Array(originalText.length).fill('pending');
  charStates[0] = 'current';
  prevInputLen = 0;
  prevInputValue = '';
  cachedCorrect = 0;
  cachedWrong = 0;
  currentSegmentIndex = 0;
  typingCard.style.display = 'block';
  statsCard.style.display = 'block';
  const maxLen = window.TypingEngine.measureMaxLen(typingPages) || 32;
  const split = window.TypingEngine.splitTextWithOffsets(originalText, maxLen, true);
  segments = split.segments;
  segmentOffsets = split.offsets;
  segmentInputs = [];
  segmentInputValues = new Array(segments.length).fill('');
  segmentTotalChars = segments.reduce((n, s) => n + s.length, 0);
  resultCard.style.display = 'none';
  startBtn.disabled = true;
  resetBtn.disabled = false;

  renderTypingPages();

  if (mode === 'timed') {
    timerRow.style.display = 'block';
    textProgressWrap.style.display = 'none';
    timeLimit = Math.max(10, Math.min(600, parseInt(timeLimitInput.value) || 90));
    startTimer();
  } else {
    timerRow.style.display = 'none';
    textProgressWrap.style.display = 'block';
  }

  focusCurrentSegment();
  updateStatsFromCache();
}

function startCodePractice() {
  if (!currentArticle || !originalText) {
    alert('请先选择一篇代码素材');
    return;
  }
  if (!window.CodeTyping) {
    alert('代码模式组件未加载，请刷新重试');
    return;
  }
  isStarted = true;
  isFinished = false;
  startTime = Date.now();
  charStates = [];
  segments = [];
  segmentOffsets = [];
  segmentInputs = [];
  segmentInputValues = [];
  segmentTotalChars = 0;
  prevInputLen = 0;
  prevInputValue = '';
  cachedCorrect = 0;
  cachedWrong = 0;
  codeStatsCache = { typed: 0, correct: 0, wrong: 0 };
  typingCard.style.display = 'block';
  statsCard.style.display = 'block';
  resultCard.style.display = 'none';
  resultCodeNote.style.display = 'none';
  startBtn.disabled = true;
  resetBtn.disabled = false;
  try {
    codeTyping = window.CodeTyping.create(typingPages, {
      text: originalText,
      label: currentArticle.title || '代码',
      enabled: true,
      onChange: handleCodeChange,
      onFinish: finishCodePractice
    });
  } catch (e) {
    console.error('[代码模式] 启动失败', e);
    resetPractice();
    alert('代码模式启动失败，请刷新重试');
    return;
  }
  if (mode === 'timed') {
    timerRow.style.display = 'block';
    textProgressWrap.style.display = 'none';
    timeLimit = Math.max(10, Math.min(600, parseInt(timeLimitInput.value) || 90));
    startTimer();
  } else {
    timerRow.style.display = 'none';
    textProgressWrap.style.display = 'block';
    textProgress.style.width = '0%';
  }
  updateStatsFromCache(true);
}

function handleCodeChange(st) {
  if (!isStarted || isFinished) return;
  codeStatsCache = { typed: st.typed, correct: st.correct, wrong: st.wrong };
  prevInputLen = st.typed;
  cachedCorrect = st.correct;
  cachedWrong = st.wrong;
  updateStatsFromCache(true);
  if (mode === 'full') {
    const pct = Math.min(100, ((st.value || '').length / Math.max(1, originalText.length)) * 100);
    textProgress.style.width = pct + '%';
  }
}

function finishCodePractice(st) {
  if (isFinished) return;
  const s = st || (codeTyping ? codeTyping.state() : { typed: 0, correct: 0, wrong: 0 });
  isFinished = true;
  isStarted = false;
  prevInputLen = s.typed;
  cachedCorrect = s.correct;
  cachedWrong = s.wrong;
  if (codeTyping) codeTyping.enable(false);
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
  updateStatsFromCache(true);
  const elapsed = startTime ? (Date.now() - startTime) / 1000 : 0;
  const minutes = elapsed / 60;
  const speed = minutes > 0 ? Math.round(cachedCorrect / minutes) : 0;
  const accuracy = prevInputLen > 0 ? Math.round((cachedCorrect / prevInputLen) * 100) : 100;
  resultSpeed.textContent = speed + ' 字/分';
  resultAccuracy.textContent = accuracy + '%';
  resultTime.textContent = Math.round(elapsed) + '秒';
  resultCodeNote.style.display = 'block';
  resultCard.style.display = 'block';
  statsCard.style.display = 'none';
  typingCard.style.display = 'none';
  startBtn.disabled = false;
  if (currentUser) nicknameInput.value = currentUser.username;
  if (mode === 'full') textProgress.style.width = '100%';
}

function resetPractice() {
  if (codeTyping) {
    try { codeTyping.destroy(); } catch (e) { console.error('[代码模式] 销毁失败', e); }
    codeTyping = null;
  }
  codeStatsCache = { typed: 0, correct: 0, wrong: 0 };
  resultCodeNote.style.display = 'none';
  isStarted = false;
  isFinished = false;
  startTime = null;
  charStates = [];
  prevInputLen = 0;
  prevInputValue = '';
  cachedCorrect = 0;
  cachedWrong = 0;
  segments = [];
  segmentOffsets = [];
  currentSegmentIndex = 0;
  segmentInputs = [];
  segmentInputValues = [];
  segmentTotalChars = 0;
  lastStatUpdate = 0;
  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }

  statsCard.style.display = 'none';
  typingCard.style.display = 'none';
  resultCard.style.display = 'none';
  typingPages.innerHTML = '';
  startBtn.disabled = false;
  resetBtn.disabled = true;
  submitMsg.textContent = '';

  statTyped.textContent = '0';
  statCorrect.textContent = '0';
  statWrong.textContent = '0';
  statSpeed.textContent = '0';
  statAccuracy.textContent = '100%';
}

function hideTypingArea() {
  resetPractice();
}

function startTimer() {
  let remaining = timeLimit;
  timerDisplay.textContent = remaining;
  timerDisplay.classList.remove('warning');
  timerProgress.style.width = '100%';

  timerInterval = setInterval(() => {
    remaining--;
    timerDisplay.textContent = remaining;
    timerProgress.style.width = ((remaining / timeLimit) * 100) + '%';

    if (remaining <= 10) {
      timerDisplay.classList.add('warning');
    }

    updateStatsFromCache();

    if (remaining <= 0) {
      clearInterval(timerInterval);
      timerInterval = null;
      finishPractice();
    }
  }, 1000);
}

let lastSpokenWord = '';

function getSegmentStartOffset(segmentIndex) {
  return segmentOffsets[segmentIndex] || 0;
}

function segmentPage(index) {
  const input = segmentInputs[index];
  return input ? input.parentElement : null;
}

function syncSegmentLine(index) {
  const filled = lineRules.filled(segmentInputValues[index], segments[index].length);
  const page = segmentPage(index);
  if (page) page.classList.toggle('completed', filled);
  if (segmentInputs[index]) segmentInputs[index].classList.toggle('completed', filled);
}

function setCurrentSegment(index) {
  currentSegmentIndex = index;
  for (let i = 0; i < segmentInputs.length; i++) {
    const page = segmentPage(i);
    if (page) page.classList.toggle('active', i === index);
  }
  clearOtherCurrentMarks(index);
  const len = (segmentInputValues[index] || '').length;
  if (len < segments[index].length) {
    charStates[getSegmentStartOffset(index) + len] = 'current';
    renderSegmentText(index);
  }
}

// 光标下划线只留在聚焦行，否则跳行后每行都留一条旧标记
function clearOtherCurrentMarks(exceptIndex) {
  for (let i = 0; i < segments.length; i++) {
    if (i === exceptIndex) continue;
    const len = (segmentInputValues[i] || '').length;
    const pos = getSegmentStartOffset(i) + len;
    if (len < segments[i].length && charStates[pos] === 'current') {
      charStates[pos] = 'pending';
      renderSegmentText(i);
    }
  }
}

function focusSegment(index, caretAtEnd) {
  const input = segmentInputs[index];
  if (!input || input.disabled) return;
  setCurrentSegment(index);
  input.focus();
  const pos = caretAtEnd ? input.value.length : Math.min(input.selectionStart || 0, input.value.length);
  input.setSelectionRange(pos, pos);
  const page = segmentPage(index);
  if (page) page.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function focusCurrentSegment() {
  const input = segmentInputs[currentSegmentIndex];
  if (input && !input.disabled && document.activeElement !== input) {
    input.focus();
  }
}

function onSegmentKeydown(index, e) {
  if (!isStarted || isFinished) return;
  const input = segmentInputs[index];
  if (e.key === 'Backspace' && index > 0 && lineRules.shouldJumpBack(input)) {
    e.preventDefault();
    focusSegment(index - 1, true);
    return;
  }
  if (e.key === 'ArrowUp' && index > 0) {
    e.preventDefault();
    focusSegment(index - 1, false);
    return;
  }
  if (e.key === 'ArrowDown' && index < segmentInputs.length - 1) {
    e.preventDefault();
    focusSegment(index + 1, false);
  }
}

function preventSegmentClipboard(e) { e.preventDefault(); }

function renderTypingPages() {
  typingPages.innerHTML = '';
  segmentInputs = [];

  segments.forEach((segment, index) => {
    const filled = lineRules.filled(segmentInputValues[index], segment.length);
    const page = document.createElement('div');
    page.className = 'typing-page' + (index === currentSegmentIndex ? ' active' : '') + (filled ? ' completed' : '');

    const textEl = document.createElement('div');
    textEl.className = 'typing-line-text';
    textEl.id = 'typing-text-' + index;
    page.appendChild(textEl);

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'typing-line-input' + (filled ? ' completed' : '');
    input.disabled = !isStarted || isFinished;
    input.value = segmentInputValues[index] || '';
    input.spellcheck = false;
    input.autocomplete = 'off';
    input.autocapitalize = 'off';
    input.autocorrect = 'off';
    input.name = 'typing-segment-' + Date.now() + '-' + index;
    input.setAttribute('aria-label', '第 ' + (index + 1) + ' 段输入');

    // 避免浏览器自动填充：渲染后若值非用户输入则清空
    if (!segmentInputValues[index]) {
      requestAnimationFrame(() => {
        if (input.value && input.value !== segmentInputValues[index]) {
          input.value = '';
        }
      });
    }

    input.addEventListener('input', () => {
      if (isComposing) return;
      handleSegmentInput(index, input.value);
    });
    input.addEventListener('compositionstart', () => { isComposing = true; });
    input.addEventListener('compositionend', () => {
      isComposing = false;
      handleSegmentInput(index, input.value);
    });
    input.addEventListener('focus', () => {
      if (isStarted && !isFinished) setCurrentSegment(index);
    });
    input.addEventListener('keydown', (e) => onSegmentKeydown(index, e));
    input.addEventListener('paste', preventSegmentClipboard);
    input.addEventListener('drop', preventSegmentClipboard);

    page.appendChild(input);
    segmentInputs.push(input);
    typingPages.appendChild(page);
  });

  renderSegmentTexts();
}

function renderSegmentTexts() {
  // 渲染所有段落的原文（文字是静态的，渲染开销不大）
  for (let i = 0; i < segments.length; i++) {
    renderSegmentText(i);
  }
}

function renderSegmentText(segmentIndex) {
  const textEl = document.getElementById('typing-text-' + segmentIndex);
  if (!textEl) return;
  const segment = segments[segmentIndex];
  const offset = getSegmentStartOffset(segmentIndex);
  let html = '';
  for (let i = 0; i < segment.length; i++) {
    const globalIndex = offset + i;
    const state = charStates[globalIndex] || 'pending';
    html += '<span class="char ' + state + '">' + escapeChar(segment[i]) + '</span>';
  }
  textEl.innerHTML = html;
}

function updateSegmentStates(segmentIndex, inputValue) {
  const offset = getSegmentStartOffset(segmentIndex);
  const segment = segments[segmentIndex];
  const segmentLen = segment.length;
  const inputLen = inputValue.length;
  const prevValue = segmentInputValues[segmentIndex] || '';
  const prevLen = prevValue.length;
  const minLen = Math.min(prevLen, inputLen);

  // 找到变化起始位置，只更新变化部分
  let changeStart = minLen;
  for (let i = 0; i < minLen; i++) {
    if (inputValue[i] !== prevValue[i]) {
      changeStart = i;
      break;
    }
  }

  // 移除变化位置之后旧状态对缓存的影响
  for (let i = changeStart; i < prevLen && i < segmentLen; i++) {
    const oldState = charStates[offset + i];
    if (oldState === 'correct') cachedCorrect--;
    else if (oldState === 'wrong') cachedWrong--;
  }

  // 清除变化位置之后的状态
  for (let i = changeStart; i < segmentLen; i++) {
    charStates[offset + i] = 'pending';
  }

  // 重新计算变化位置之后的状态
  for (let i = changeStart; i < inputLen && i < segmentLen; i++) {
    if (inputValue[i] === segment[i]) {
      charStates[offset + i] = 'correct';
      cachedCorrect++;
    } else {
      charStates[offset + i] = 'wrong';
      cachedWrong++;
    }
  }

  // 设置当前光标位置（只在本行内，跨行提示由 setCurrentSegment 负责）
  if (inputLen < segmentLen) {
    charStates[offset + inputLen] = 'current';
  }

  segmentInputValues[segmentIndex] = inputValue;

  // 增量更新全局输入长度
  prevInputLen += (inputLen - prevLen);
  // 重建 prevInputValue（仅在需要时，避免频繁字符串拼接）
  if (prevInputLen <= 0) {
    prevInputValue = '';
  } else {
    // 用数组拼接代替多次字符串连接
    prevInputValue = segmentInputValues.join('');
  }
}

function handleSegmentInput(segmentIndex, inputValue) {
  if (!isStarted || isFinished) return;

  const segment = segments[segmentIndex];
  const prevValue = segmentInputValues[segmentIndex] || '';

  // 防止输入超过本段长度
  if (inputValue.length > segment.length) {
    inputValue = inputValue.slice(0, segment.length);
    segmentInputs[segmentIndex].value = inputValue;
  }

  updateSegmentStates(segmentIndex, inputValue);
  renderSegmentText(segmentIndex);
  syncSegmentLine(segmentIndex);
  updateStatsFromCache();

  // 朗读功能
  if (speechEnabled && inputValue.length > 0) {
    const globalPos = getSegmentStartOffset(segmentIndex) + inputValue.length - 1;
    const word = getCurrentWord(globalPos);
    if (word && word !== lastSpokenWord) {
      lastSpokenWord = word;
      const utterance = new SpeechSynthesisUtterance(word);
      utterance.lang = 'en-US';
      utterance.rate = 0.9;
      speechSynthesis.cancel();
      speechSynthesis.speak(utterance);
    }
  }

  const unfilled = lineRules.firstUnfilled(segmentInputValues, segments);

  if (mode === 'full') {
    // 自由跳行后不能再用 offset+本行长度：点第 3 行打 5 个字会虚报成 60%
    const pct = unfilled < 0 ? 100 : Math.min(100, (prevInputLen / Math.max(1, segmentTotalChars)) * 100);
    textProgress.style.width = pct + '%';
  }

  if (unfilled < 0) {
    finishPractice();
    return;
  }

  if (lineRules.shouldAdvance(prevValue, inputValue, segment.length)) {
    let target = lineRules.nextUnfilled(segmentInputValues, segments, segmentIndex);
    if (target < 0) {
      target = unfilled;
      focusSegment(target, true);
      window.TypingEngine.showLineHint(segmentPage(target), '还有 ' + lineRules.unfilledCount(segmentInputValues, segments) + ' 行没打完');
    } else {
      focusSegment(target, true);
    }
  }
}

function getCurrentWord(pos) {
  if (pos < 0 || pos >= originalText.length) return '';
  let start = pos;
  let end = pos;
  while (start > 0 && /[a-zA-Z]/.test(originalText[start - 1])) start--;
  while (end < originalText.length - 1 && /[a-zA-Z]/.test(originalText[end + 1])) end++;
  if (start === end && !/[a-zA-Z]/.test(originalText[start])) return '';
  return originalText.substring(start, end + 1);
}

function scheduleDisplayUpdate() {
  if (rafId) return;
  rafId = requestAnimationFrame(() => {
    rafId = null;
    renderSegmentText(currentSegmentIndex);
  });
}

let lastStatUpdate = 0;
function updateStatsFromCache(force = false) {
  const now = Date.now();
  if (!force && now - lastStatUpdate < 100) return; // 限制统计刷新频率
  lastStatUpdate = now;

  const inputLen = prevInputLen;
  const elapsed = startTime ? (now - startTime) / 1000 : 0;
  const minutes = elapsed / 60;
  const speed = minutes > 0 ? Math.round(cachedCorrect / minutes) : 0;
  const accuracy = inputLen > 0 ? Math.round((cachedCorrect / inputLen) * 100) : 100;

  statTyped.textContent = inputLen;
  statCorrect.textContent = cachedCorrect;
  statWrong.textContent = cachedWrong;
  statSpeed.textContent = speed;
  statAccuracy.textContent = accuracy + '%';
}

function finishPractice() {
  if (practiceKind === 'code') {
    finishCodePractice();
    return;
  }
  isFinished = true;
  isStarted = false;
  resultCodeNote.style.display = 'none';
  segmentInputs.forEach(input => { input.disabled = true; });

  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }

  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }

  updateStatsFromCache(true);
  const inputLen = prevInputLen;
  const elapsed = startTime ? (Date.now() - startTime) / 1000 : 0;
  const minutes = elapsed / 60;
  const speed = minutes > 0 ? Math.round(cachedCorrect / minutes) : 0;
  const accuracy = inputLen > 0 ? Math.round((cachedCorrect / inputLen) * 100) : 100;

  resultSpeed.textContent = speed + ' 字/分';
  resultAccuracy.textContent = accuracy + '%';
  resultTime.textContent = Math.round(elapsed) + '秒';

  resultCard.style.display = 'block';
  statsCard.style.display = 'none';
  typingCard.style.display = 'none';
  startBtn.disabled = false;

  if (currentUser) {
    nicknameInput.value = currentUser.username;
  }

  if (mode === 'full') {
    textProgress.style.width = '100%';
  }

  if (currentUser && currentArticle && currentArticle.id) {
    const errors = [];
    for (let si = 0; si < segments.length; si++) {
      const segment = segments[si];
      const value = segmentInputValues[si] || '';
      const base = segmentOffsets[si] || 0;
      for (let k = 0; k < segment.length; k++) {
        if (charStates[base + k] === 'wrong') {
          errors.push({
            expected_char: segment[k],
            typed_char: value[k]
          });
        }
      }
    }
    if (errors.length > 0) {
      fetch('/api/user/error-log', {
        method: 'POST',
        headers: apiHeaders(),
        body: JSON.stringify({
          article_id: currentArticle.id,
          errors: errors
        })
      }).catch(() => {});
    }
  }
}

submitScoreBtn.addEventListener('click', async () => {
  let nickname = nicknameInput.value.trim();
  if (!nickname) {
    nickname = '游客';
  }

  const inputLen = prevInputLen;
  const elapsed = startTime ? (Date.now() - startTime) / 1000 : 0;
  const minutes = elapsed / 60;
  const speed = minutes > 0 ? Math.round(cachedCorrect / minutes) : 0;
  const accuracy = inputLen > 0 ? Math.round((cachedCorrect / inputLen) * 100) : 100;

  try {
    const res = await fetch('/api/leaderboard', {
      method: 'POST',
      headers: apiHeaders(),
      body: JSON.stringify({
        nickname,
        speed,
        accuracy,
        time_seconds: Math.round(elapsed),
        article_id: currentArticle ? currentArticle.id : null
      })
    });

    if (res.ok) {
      submitMsg.textContent = '成绩提交成功';
      submitScoreBtn.disabled = true;
      if (currentUser) fetchMyScores();
    } else {
      const data = await readJson(res);
      submitMsg.textContent = '提交失败：' + (data.error || '未知错误');
    }
  } catch (e) {
    submitMsg.textContent = '网络错误，请重试';
  }
});

async function fetchMyScores() {
  if (!currentUser) return;
  try {
    const res = await fetch('/api/my-scores', { headers: { 'Authorization': 'Bearer ' + getToken() } });
    if (res.ok) {
      const scores = await readJson(res);
      renderHistory(scores);
    }
  } catch (e) {}
}

function renderHistory(scores) {
  historyList.innerHTML = '';
  if (scores.length === 0) {
    historyEmpty.style.display = 'block';
    return;
  }
  historyEmpty.style.display = 'none';

  scores.forEach(s => {
    const div = document.createElement('div');
    div.className = 'history-item';
    const dateStr = new Date(s.created_at).toLocaleDateString('zh-CN');
    div.innerHTML =
      '<div class="info">' +
        '<span class="article-name">' + escapeHtml(s.article_title || '未知文章') + '</span>' +
        '<span class="speed-val">' + Math.round(Number(s.speed) || 0) + ' 字/分</span>' +
        '<span class="acc-val">' + s.accuracy + '%</span>' +
        '<span class="date-val">' + dateStr + '</span>' +
      '</div>';
    historyList.appendChild(div);
  });
}

async function fetchPrivateArticles() {
  if (!currentUser) return;
  try {
    const res = await fetch('/api/user/private-articles', { headers: { 'Authorization': 'Bearer ' + getToken() } });
    if (res.ok) {
      privateArticles = await readJson(res);
      renderPrivateArticleSelect();
    }
  } catch (e) {}
}

function renderPrivateArticleSelect() {
  privateArticleSelect.innerHTML = '<option value="">-- 选择私人文章 --</option>';
  privateArticles.forEach(a => {
    const opt = document.createElement('option');
    opt.value = a.id;
    opt.textContent = a.title + '（' + a.content.length + '字）';
    privateArticleSelect.appendChild(opt);
  });
}

privateArticleSelect.addEventListener('change', () => {
  const id = privateArticleSelect.value;
  if (!id) return;
  const article = privateArticles.find(a => String(a.id) === String(id));
  if (!article) return;
  currentArticle = article;
  originalText = article.content;
  // 私人文章默认按中等难度计算推荐时间
  const diff = article.difficulty || 2;
  const recommendedTime = calculateRecommendedTime(originalText, diff);
  timeLimitInput.value = recommendedTime;
  timeLimit = recommendedTime;
  const timeStr = ' | 推荐时间：' + recommendedTime + '秒';
  articleInfo.textContent = '私人文章 | 字数：' + originalText.length + '字 | 标题：' + article.title + timeStr;
  articleSelect.value = '';
  updateSpeechToggle();
  resetPractice();
});

function updateSpeechToggle() {
  if (!originalText || practiceKind === 'code') {
    speechToggle.style.display = 'none';
    speechEnabled = false;
    speechToggle.classList.remove('active');
    speechToggle.title = '英文朗读';
    return;
  }
  let asciiCount = 0;
  for (let i = 0; i < originalText.length; i++) {
    if (/[a-zA-Z]/.test(originalText[i])) asciiCount++;
  }
  const ratio = originalText.length > 0 ? asciiCount / originalText.length : 0;
  if (ratio > 0.6) {
    speechToggle.style.display = 'inline-block';
    speechToggle.title = speechEnabled ? '英文朗读：已开启（点击关闭）' : '英文朗读：已关闭（点击开启）';
  } else {
    speechToggle.style.display = 'none';
    speechEnabled = false;
    speechToggle.classList.remove('active');
  }
}

speechToggle.addEventListener('click', () => {
  speechEnabled = !speechEnabled;
  speechToggle.classList.toggle('active', speechEnabled);
  speechToggle.title = speechEnabled ? '英文朗读：已开启（点击关闭）' : '英文朗读：已关闭（点击开启）';
  if (!speechEnabled) {
    speechSynthesis.cancel();
    lastSpokenWord = '';
  }
});

lbBtn.addEventListener('click', () => {
  openLeaderboard();
});

lbOverlay.addEventListener('click', (e) => {
  if (e.target === lbOverlay) closeLeaderboard();
});

lbClose.addEventListener('click', () => {
  closeLeaderboard();
});

lbTabs.forEach(tab => {
  tab.addEventListener('click', () => {
    lbTabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    currentLbPeriod = tab.dataset.period;
    fetchLeaderboard();
  });
});

lbCategoryFilter.addEventListener('change', () => {
  currentLbCategory = lbCategoryFilter.value;
  fetchLeaderboard();
});

let lbReturnFocus = null;
function openLeaderboard() {
  lbReturnFocus = lbBtn;
  lbOverlay.style.display = 'flex';
  lbModal.scrollTop = 0;
  document.body.style.overflow = 'hidden';
  lbClose.focus();
  fetchLeaderboard();
}

function closeLeaderboard() {
  lbOverlay.style.display = 'none';
  document.body.style.overflow = '';
  if (lbReturnFocus && lbReturnFocus.focus) lbReturnFocus.focus();
  lbReturnFocus = null;
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && lbOverlay.style.display === 'flex') {
    e.preventDefault();
    closeLeaderboard();
  }
});

async function fetchLeaderboard() {
  try {
    let url;
    if (currentLbPeriod === 'code') {
      url = '/api/leaderboard?category=code';
    } else if (currentLbPeriod === 'guest') {
      url = '/api/leaderboard?guest=true';
    } else {
      const params = ['period=' + currentLbPeriod];
      if (currentLbCategory) params.push('category_id=' + currentLbCategory);
      url = '/api/leaderboard?' + params.join('&');
    }
    if (lbCategoryFilter) lbCategoryFilter.parentNode.style.display = currentLbPeriod === 'code' ? 'none' : '';
    const res = await fetch(url);
    const data = await readJson(res);
    renderLeaderboard(data);
  } catch (e) {
    lbTbody.innerHTML = '';
    lbEmpty.textContent = '加载失败';
    lbEmpty.style.display = 'block';
  }
}

function renderLeaderboard(records) {
  lbTbody.innerHTML = '';
  if (records.length === 0) {
    lbEmpty.style.display = 'block';
    lbEmpty.textContent = currentLbPeriod === 'code' ? '还没有代码成绩' : '暂无记录';
    return;
  }
  lbEmpty.style.display = 'none';

  records.forEach((r, idx) => {
    const tr = document.createElement('tr');
    const dateStr = new Date(r.created_at).toLocaleDateString('zh-CN');
    const avatarHtml = r.avatar
      ? '<img src="' + escapeHtml(r.avatar) + '" class="lb-avatar" alt="">'
      : '';
    const guestBadge = r.user_id ? '' : '<span class="guest-badge">游客</span>';
    const nickname = escapeHtml(r.nickname || '');
    const article = escapeHtml(r.article_title || '');
    const sourceBadge = currentLbPeriod === 'code'
      ? '<span class="lb-source-badge">' + ((r.source === 'race' || r.source === 'race_guest') ? '比赛' : '练习') + '</span>'
      : '';
    tr.innerHTML =
      '<td class="lb-rank lb-col-rank">' + (idx + 1) + '</td>' +
      '<td class="lb-col-name" title="' + nickname + '">' + avatarHtml +
        '<span class="lb-name-text">' + nickname + '</span>' + guestBadge + '</td>' +
      '<td class="lb-col-speed">' + Math.round(Number(r.speed) || 0) + ' 字/分</td>' +
      '<td class="lb-col-acc">' + r.accuracy + '%</td>' +
      '<td class="lb-col-article" title="' + article + '">' + article + sourceBadge + '</td>' +
      '<td class="lb-col-date">' + dateStr + '</td>';
    lbTbody.appendChild(tr);
  });
}

submitArticleBtn.addEventListener('click', () => {
  submitTitle.value = '';
  submitContent.value = '';
  submitError.textContent = '';
  submitArticleModal.style.display = 'flex';
});

submitArticleCancel.addEventListener('click', () => {
  submitArticleModal.style.display = 'none';
});

submitArticleModal.addEventListener('click', (e) => {
  if (e.target === submitArticleModal) submitArticleModal.style.display = 'none';
});

submitArticleConfirm.addEventListener('click', async () => {
  const title = submitTitle.value.trim();
  const categoryId = submitCategory.value;
  const content = submitContent.value.trim();
  if (!title || !content) {
    submitError.textContent = '标题和正文不能为空';
    return;
  }
  try {
    const res = await fetch('/api/articles/submit', {
      method: 'POST',
      headers: apiHeaders(),
      body: JSON.stringify({ title, category_id: categoryId, content })
    });
    const data = await readJson(res);
    if (res.ok) {
      submitArticleModal.style.display = 'none';
      alert('投稿成功，等待审核');
    } else {
      submitError.textContent = data.error || '投稿失败';
    }
  } catch (e) {
    submitError.textContent = '网络错误，请重试';
  }
});

function escapeChar(c) {
  if (c === '<') return '&lt;';
  if (c === '>') return '&gt;';
  if (c === '&') return '&amp;';
  if (c === ' ') return '&nbsp;';
  if (c === '\n') return '<br>';
  return c;
}

function escapeHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

async function getSWController() {
  if (!('serviceWorker' in navigator)) return null;
  try {
    const reg = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000))
    ]);
    return (reg && reg.active) ? reg.active : navigator.serviceWorker.controller;
  } catch (e) {
    return null;
  }
}

async function getCachedArticlesFromSW() {
  const ctrl = await getSWController();
  if (!ctrl) return [];
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    let settled = false;
    channel.port1.onmessage = (e) => {
      settled = true;
      resolve((e.data && e.data.articles) || []);
    };
    ctrl.postMessage({ type: 'GET_CACHED_ARTICLES' }, [channel.port2]);
    setTimeout(() => { if (!settled) resolve([]); }, 3000);
  });
}

function checkErrorPracticeMode() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('error_practice') === '1') {
    errorPracticeMode = true;
    let title = params.get('title') || '错字练习';
    let content = params.get('content') || '';
    try {
      title = decodeURIComponent(title);
      content = decodeURIComponent(content);
    } catch (e) {
      console.error('错字练习参数解码失败', e);
      return;
    }
    if (content) {
      currentArticle = { id: null, title: title, content: content };
      originalText = currentArticle.content;
      articleInfo.textContent = '错字练习 | 字数：' + originalText.length + '字 | 标题：' + currentArticle.title;
      updateSpeechToggle();
      startPractice();
    }
  }
}

async function loadBootstrapStatus() {
  try {
    const res = await fetch('/api/bootstrap/status');
    const data = await readJson(res);
    if (data.needsBootstrap) {
      window.location.href = 'setup.html';
      return true;
    }
  } catch (e) {}
  return false;
}

async function loadVersion() {
  try {
    const res = await fetch('/api/version');
    const data = await readJson(res);
    const footer = document.getElementById('site-footer');
    if (footer && data.fullName) {
      footer.textContent = data.fullName;
    }
  } catch (e) {}
}

function setOfflineBanner(visible) {
  if (offlineBanner) offlineBanner.style.display = visible ? 'flex' : 'none';
}

async function checkServerReachable() {
  if (!navigator.onLine) return false;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch('/api/version?_t=' + Date.now(), { cache: 'no-cache', signal: controller.signal });
    clearTimeout(timer);
    return res.ok;
  } catch (e) {
    return false;
  }
}

let offlineCheckTimer = null;
async function updateOfflineStatus() {
  if (!navigator.onLine) {
    setOfflineBanner(true);
    return;
  }
  // 主动 ping 服务器，确认服务器可达
  const reachable = await checkServerReachable();
  setOfflineBanner(!reachable);
}

window.addEventListener('offline', updateOfflineStatus);
window.addEventListener('online', updateOfflineStatus);
// 定期检测服务器可达性，服务器恢复后自动隐藏横幅
offlineCheckTimer = setInterval(updateOfflineStatus, 30000);

async function init() {
  try {
    loadVersion();
    updateOfflineStatus();
    const isBootstrapping = await loadBootstrapStatus();
    if (isBootstrapping) return;
    await checkAuth().catch(() => {});
    await fetchCategories().catch(() => {});
    await fetchCodeCategories().catch(() => {});
    // 分类返回后即可移除 loading，文章列表在后台继续加载
    hideLoadingOverlay();
    applyPageIntent();
    fetchArticles().catch(() => {});
    checkErrorPracticeMode();
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('service-worker.js').catch(() => {});
    }
  } catch (e) {
    console.error('练习页面初始化失败', e);
    hideLoadingOverlay();
  }
}

updateCodeModeAvailability();
window.addEventListener('resize', updateCodeModeAvailability);
init();
// 安全网：5秒后强制移除加载遮罩，防止因任何异常导致页面永久卡在加载状态
setTimeout(hideLoadingOverlay, 5000);
