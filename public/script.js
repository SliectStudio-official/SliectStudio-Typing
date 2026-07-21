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
let currentSegmentIndex = 0;
let segmentInputs = [];
let segmentInputValues = [];

const RENDER_BUFFER_BEFORE = 50;
const RENDER_BUFFER_AFTER = 100;
const VIRTUAL_THRESHOLD = 200;

const articleSelect = document.getElementById('article-select');
const categoryFilter = document.getElementById('category-filter');
const difficultyFilter = document.getElementById('difficulty-filter');
const articleInfo = document.getElementById('article-info');
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
const lbSidebar = document.getElementById('lb-sidebar');
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

const announcementBar = document.getElementById('announcement-bar');
const announcementBadge = document.getElementById('announcement-badge');
const announcementTitle = document.getElementById('announcement-title');
const announcementText = document.getElementById('announcement-text');
const announcementClose = document.getElementById('announcement-close');

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
      currentUser = await res.json();
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
    const data = await res.json();
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
    const data = await res.json();
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

const LEVEL_LABELS = {
  'notification': '通知',
  'site-wide': '全站',
  'warning': '警告'
};

let currentAnnouncementId = null;

async function loadAnnouncement() {
  try {
    const res = await fetch('/api/announcement');
    if (!res.ok) return;
    const data = await res.json();
    if (!data) {
      announcementBar.style.display = 'none';
      return;
    }
    currentAnnouncementId = data.id;
    const closedKey = 'announcement_closed_' + data.id;
    if (localStorage.getItem(closedKey)) {
      announcementBar.style.display = 'none';
      return;
    }
    announcementBar.className = 'announcement-bar level-' + (data.level || 'notification');
    announcementBadge.textContent = LEVEL_LABELS[data.level] || '通知';
    announcementTitle.textContent = data.title || '';
    announcementTitle.style.display = data.title ? '' : 'none';
    announcementText.textContent = data.content || '';
    if (data.allow_close === 0 || data.allow_close === false) {
      announcementClose.style.display = 'none';
    } else {
      announcementClose.style.display = '';
    }
    announcementBar.style.display = 'flex';
  } catch (e) {}
}

announcementClose.addEventListener('click', () => {
  if (currentAnnouncementId !== null) {
    announcementBar.style.display = 'none';
    localStorage.setItem('announcement_closed_' + currentAnnouncementId, '1');
  }
});

setInterval(loadAnnouncement, 60000);

async function fetchCategories() {
  const res = await fetch('/api/categories');
  categories = await res.json();
  renderCategoryFilter();
  renderLbCategoryFilter();
  renderSubmitCategorySelect();
}

function renderCategoryFilter() {
  categoryFilter.innerHTML = '<option value="">全部分类</option>';
  categories.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = c.name;
    categoryFilter.appendChild(opt);
  });
}

function renderLbCategoryFilter() {
  lbCategoryFilter.innerHTML = '<option value="">全部分类</option>';
  categories.forEach(c => {
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

categoryFilter.addEventListener('change', () => {
  fetchArticles(categoryFilter.value, difficultyFilter.value);
});

difficultyFilter.addEventListener('change', () => {
  fetchArticles(categoryFilter.value, difficultyFilter.value);
});

async function fetchArticles(categoryId, difficulty) {
  let url = '/api/articles?';
  const params = [];
  if (categoryId) params.push('category_id=' + categoryId);
  if (difficulty) params.push('difficulty=' + difficulty);
  url += params.join('&');
  if (params.length === 0) url = '/api/articles';
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    articles = await res.json();
    isOfflineArticles = false;
  } catch (e) {
    // 后端不可达，回退到 SW 缓存的离线文章
    const cached = await getCachedArticlesFromSW();
    const seen = new Set();
    articles = cached.filter(a => {
      if (a.id == null || seen.has(a.id)) return false;
      seen.add(a.id);
      return true;
    });
    isOfflineArticles = articles.length > 0;
  }
  renderArticleSelect();
}

function getDifficultyLabel(d) {
  if (d === 1) return '简单';
  if (d === 2) return '中等';
  if (d === 3) return '困难';
  return '';
}

function splitTextIntoSegments(text) {
  const maxLineLength = 32; // 桌面端一行约 32 个字符，确保视觉上一行
  const breakChars = /[\s，。！？、；：""''（）【】《》.,!?;:'"()\[\]{}]/;
  const segs = [];
  let start = 0;
  while (start < text.length) {
    // 剩余文字不足一行，直接作为最后一段
    if (start + maxLineLength >= text.length) {
      segs.push(text.slice(start));
      break;
    }
    let end = start + maxLineLength;
    // 强制限制长度，避免某一段过长导致换行
    let breakAt = end;
    // 向前查找合适的断点（至少保留一半长度，避免某行太短）
    const minBreakAt = start + Math.floor(maxLineLength * 0.65);
    for (let i = end; i >= minBreakAt; i--) {
      if (breakChars.test(text[i])) {
        breakAt = i + 1;
        break;
      }
    }
    segs.push(text.slice(start, breakAt));
    start = breakAt;
  }
  return segs;
}

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

function renderArticleSelect() {
  const offlineSuffix = isOfflineArticles ? '（离线）' : '';
  articleSelect.innerHTML = '<option value="">-- 请选择 --</option>';
  const list = [];

  articles.forEach(a => {
    const catName = a.category_name || '未分类';
    const diffLabel = getDifficultyLabel(a.difficulty);
    const suffix = diffLabel ? ' [' + diffLabel + ']' : '';
    const title = (categories.length > 0 && !categoryFilter.value)
      ? catName + '｜' + a.title + '（' + a.content.length + '字）' + suffix + offlineSuffix
      : a.title + '（' + a.content.length + '字）' + suffix + offlineSuffix;
    list.push({ id: a.id, text: title });
  });

  list.forEach(item => {
    const opt = document.createElement('option');
    opt.value = item.id;
    opt.textContent = item.text;
    articleSelect.appendChild(opt);
  });
}

articleSelect.addEventListener('change', () => {
  const id = articleSelect.value;
  if (!id) {
    currentArticle = null;
    originalText = '';
    articleInfo.textContent = '';
    hideTypingArea();
    return;
  }
  currentArticle = articles.find(a => String(a.id) === String(id));
  originalText = currentArticle.content;
  const catName = currentArticle.category_name || '未分类';
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
  segments = splitTextIntoSegments(originalText);
  segmentInputs = [];
  segmentInputValues = new Array(segments.length).fill('');

  statsCard.style.display = 'block';
  typingCard.style.display = 'block';
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

function resetPractice() {
  isStarted = false;
  isFinished = false;
  startTime = null;
  charStates = [];
  prevInputLen = 0;
  prevInputValue = '';
  cachedCorrect = 0;
  cachedWrong = 0;
  segments = [];
  currentSegmentIndex = 0;
  segmentInputs = [];
  segmentInputValues = [];
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
  let offset = 0;
  for (let i = 0; i < segmentIndex; i++) {
    offset += segments[i].length;
  }
  return offset;
}

function focusCurrentSegment() {
  const input = segmentInputs[currentSegmentIndex];
  if (input && !input.disabled) {
    input.focus();
  }
}

function renderTypingPages() {
  typingPages.innerHTML = '';
  segmentInputs = [];

  segments.forEach((segment, index) => {
    const page = document.createElement('div');
    page.className = 'typing-page' + (index === currentSegmentIndex ? ' active' : '') + (index < currentSegmentIndex ? ' completed' : '');

    const textEl = document.createElement('div');
    textEl.className = 'typing-line-text';
    textEl.id = 'typing-text-' + index;
    page.appendChild(textEl);

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'typing-line-input' + (index < currentSegmentIndex ? ' completed' : '');
    input.disabled = index !== currentSegmentIndex || !isStarted || isFinished;
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

  // 设置当前光标位置
  if (inputLen < segmentLen) {
    charStates[offset + inputLen] = 'current';
  } else if (segmentIndex < segments.length - 1) {
    charStates[offset + segmentLen] = 'current';
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
  if (segmentIndex !== currentSegmentIndex) return;

  const segment = segments[segmentIndex];

  // 防止输入超过本段长度（最后一行除外）
  if (inputValue.length > segment.length) {
    inputValue = inputValue.slice(0, segment.length);
    segmentInputs[segmentIndex].value = inputValue;
  }

  updateSegmentStates(segmentIndex, inputValue);
  renderSegmentText(segmentIndex);
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

  // 当前段完成，自动翻页
  if (inputValue.length >= segment.length) {
    const allCorrect = segment.split('').every((c, i) => inputValue[i] === c);
    if (allCorrect && segmentIndex < segments.length - 1) {
      moveToNextSegment();
    } else if (allCorrect && segmentIndex === segments.length - 1) {
      finishPractice();
    }
  }

  if (mode === 'full') {
    const pct = Math.min(100, (prevInputLen / originalText.length) * 100);
    textProgress.style.width = pct + '%';
  }
}

function moveToNextSegment() {
  const prevInput = segmentInputs[currentSegmentIndex];
  if (prevInput) {
    prevInput.disabled = true;
    prevInput.classList.add('completed');
  }

  const prevPage = typingPages.children[currentSegmentIndex];
  if (prevPage) {
    prevPage.classList.remove('active');
    prevPage.classList.add('completed');
  }

  currentSegmentIndex++;

  const nextInput = segmentInputs[currentSegmentIndex];
  if (nextInput) {
    nextInput.disabled = false;
    const nextPage = typingPages.children[currentSegmentIndex];
    if (nextPage) {
      nextPage.classList.add('active');
      nextPage.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    nextInput.focus();
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
  isFinished = true;
  isStarted = false;
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

  if (currentUser && currentArticle && currentArticle.id) {
    const errors = [];
    const inputVal = segmentInputValues.join('');
    for (let i = 0; i < inputVal.length && i < originalText.length; i++) {
      if (charStates[i] === 'wrong') {
        errors.push({
          expected_char: originalText[i],
          typed_char: inputVal[i]
        });
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
      const data = await res.json();
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
      const scores = await res.json();
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
        '<span class="speed-val">' + s.speed + ' 字/分</span>' +
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
      privateArticles = await res.json();
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
  if (!originalText) {
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

lbOverlay.addEventListener('click', () => {
  closeLeaderboard();
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

function openLeaderboard() {
  lbOverlay.classList.add('show');
  lbSidebar.classList.add('show');
  fetchLeaderboard();
}

function closeLeaderboard() {
  lbOverlay.classList.remove('show');
  lbSidebar.classList.remove('show');
}

async function fetchLeaderboard() {
  try {
    let url;
    if (currentLbPeriod === 'guest') {
      url = '/api/leaderboard?guest=true';
    } else {
      const params = ['period=' + currentLbPeriod];
      if (currentLbCategory) params.push('category_id=' + currentLbCategory);
      url = '/api/leaderboard?' + params.join('&');
    }
    const res = await fetch(url);
    const data = await res.json();
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
    lbEmpty.textContent = '暂无记录';
    return;
  }
  lbEmpty.style.display = 'none';

  records.forEach((r, idx) => {
    const tr = document.createElement('tr');
    const dateStr = new Date(r.created_at).toLocaleDateString('zh-CN');
    const avatarHtml = r.avatar
      ? '<img src="' + escapeHtml(r.avatar) + '" class="lb-avatar" style="width:24px;height:24px;border-radius:50%;vertical-align:middle;margin-right:4px">'
      : '';
    const guestBadge = r.user_id ? '' : '<span class="guest-badge">游客</span>';
    tr.innerHTML =
      '<td class="lb-rank">' + (idx + 1) + '</td>' +
      '<td>' + avatarHtml + escapeHtml(r.nickname) + guestBadge + '</td>' +
      '<td>' + r.speed + ' 字/分</td>' +
      '<td>' + r.accuracy + '%</td>' +
      '<td>' + escapeHtml(r.article_title || '') + '</td>' +
      '<td>' + dateStr + '</td>';
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
    const data = await res.json();
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
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function getSWController() {
  if (!('serviceWorker' in navigator)) return null;
  try {
    await navigator.serviceWorker.ready;
    return navigator.serviceWorker.controller;
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
    const title = params.get('title') || '错字练习';
    const content = params.get('content') || '';
    if (content) {
      currentArticle = { id: null, title: decodeURIComponent(title), content: decodeURIComponent(content) };
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
    const data = await res.json();
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
    const data = await res.json();
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
  loadVersion();
  updateOfflineStatus();
  const isBootstrapping = await loadBootstrapStatus();
  if (isBootstrapping) return;
  await checkAuth();
  await fetchCategories();
  await fetchArticles();
  loadAnnouncement();
  checkErrorPracticeMode();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('service-worker.js').catch(() => {});
  }
}

init();
