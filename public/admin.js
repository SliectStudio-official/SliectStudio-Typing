let articles = [];
let categories = [];
let codeCategoryIds = [];
let codeLanguagesAll = [];
let leaderboardData = [];
let currentUser = null;
let currentFilter = '';
let weeklyChart = null;
let adminMode = 'normal';
try { if (localStorage.getItem('adminMode') === 'code') adminMode = 'code'; } catch (e) {}

const adminContent = document.querySelector('.admin-layout') || document.body;
const adminUsername = document.getElementById('admin-username');
const adminLogoutBtn = document.getElementById('logout-btn');

function clearAdminOfflineData() {
  ['user-list', 'article-list', 'offline-article-list', 'pending-articles-list', 'category-list',
    'lb-manage-list', 'announcement-list', 'database-table-list', 'database-table-wrap',
    'race-list-body', 'backup-list-body', 'code-article-list', 'code-lang-list', 'code-lb-list']
    .forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.innerHTML = '';
    });
  ['user-empty', 'article-empty', 'offline-article-empty', 'pending-empty', 'category-empty',
    'lb-manage-empty', 'announcement-empty', 'backup-empty', 'code-article-empty',
    'code-lang-list-empty', 'code-lb-empty'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.style.display = 'block';
    });
  categories = [];
  articles = [];
  leaderboardData = [];
  codeArticles = [];
  codeLbData = [];
}
function showAdminOffline() {
  window.__adminOffline = true;
  clearAdminOfflineData();
  if (document.getElementById('admin-offline-notice')) return;
  var main = document.querySelector('.admin-main');
  if (!main) return;
  var notice = document.createElement('div');
  notice.id = 'admin-offline-notice';
  notice.className = 'admin-offline-notice';
  notice.textContent = '与服务器的连接已断开，请检查网络后刷新';
  main.insertBefore(notice, main.firstChild);
}
const adminFetch = window.fetch.bind(window);
window.fetch = function (input, init) {
  return adminFetch(input, init).then(function (res) {
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    var path = '';
    try { path = new URL(url, location.href).pathname; } catch (e) {}
    if (res.status === 503 && /^\/api\/(admin|user|article)\//.test(path)) {
      showAdminOffline();
      // 等调用方完成自己的 render 后再清一次，避免旧数据被重新画回 DOM
      setTimeout(showAdminOffline, 80);
    } else if (window.__adminOffline) {
      // 离线后其它（可能来自缓存的）接口晚到并重新渲染时，继续清空
      setTimeout(showAdminOffline, 0);
    }
    return res;
  });
};

const newCategoryName = document.getElementById('new-category-name');
const addCategoryBtn = document.getElementById('add-category-btn');
const categoryList = document.getElementById('category-list');
const categoryEmpty = document.getElementById('category-empty');

const newTitle = document.getElementById('new-title');
const newCategorySelect = document.getElementById('new-category-select');
const newContent = document.getElementById('new-content');
const newContentCount = document.getElementById('new-content-count');
const addArticleBtn = document.getElementById('add-article-btn');
const addMsg = document.getElementById('add-msg');
const articleList = document.getElementById('article-list');
const articleEmpty = document.getElementById('article-empty');
const articleSearchInput = document.getElementById('article-search-input');
const articleCategoryFilter = document.getElementById('article-category-filter');
const articleDifficultyFilter = document.getElementById('article-difficulty-filter');
const articleFilterResetBtn = document.getElementById('article-filter-reset-btn');
const articleFilterSummary = document.getElementById('article-filter-summary');

const editArticleModal = document.getElementById('edit-article-modal');
const editTitle = document.getElementById('edit-title');
const editCategorySelect = document.getElementById('edit-category-select');
const editCategoryLabel = document.getElementById('edit-category-label');
const editDifficultySelect = document.getElementById('edit-difficulty-select');
const editContent = document.getElementById('edit-content');
const editContentCount = document.getElementById('edit-content-count');
const editArticleError = document.getElementById('edit-article-error');
const editArticleCancel = document.getElementById('edit-article-cancel');
const editArticleSave = document.getElementById('edit-article-save');
let editingArticleId = null;
let editingArticleIsCode = false;

const codeNewTitle = document.getElementById('code-new-title');
const codeNewCategorySelect = document.getElementById('code-new-category-select');
const codeNewDifficulty = document.getElementById('code-new-difficulty');
const codeNewContent = document.getElementById('code-new-content');
const codeNewCount = document.getElementById('code-new-count');
const codeAddArticleBtn = document.getElementById('code-add-article-btn');
const codeAddMsg = document.getElementById('code-add-msg');
const codeArticleList = document.getElementById('code-article-list');
const codeArticleEmpty = document.getElementById('code-article-empty');
const codeArticleSummary = document.getElementById('code-article-summary');
const codeArticleMsg = document.getElementById('code-article-msg');
const codeLbList = document.getElementById('code-lb-list');
const codeLbEmpty = document.getElementById('code-lb-empty');
const codeLbMsg = document.getElementById('code-lb-msg');
let codeArticles = [];
let codeLbData = [];

const crawlUrl = document.getElementById('crawl-url');
const crawlBtn = document.getElementById('crawl-btn');
const crawlPreview = document.getElementById('crawl-preview');
const crawlEditTitle = document.getElementById('crawl-edit-title');
const crawlEditContent = document.getElementById('crawl-edit-content');
const crawlSaveCategory = document.getElementById('crawl-save-category');
const crawlSaveBtn = document.getElementById('crawl-save-btn');
const crawlCancelBtn = document.getElementById('crawl-cancel-btn');
const crawlPreviewClose = document.getElementById('crawl-preview-close');
const crawlSaveMsg = document.getElementById('crawl-save-msg');
let crawlSourceUrl = '';

// 关键词检索相关
const crawlModeUrlBtn = document.getElementById('crawl-mode-url');
const crawlModeSearchBtn = document.getElementById('crawl-mode-search');
const crawlUrlPanel = document.getElementById('crawl-url-panel');
const crawlSearchPanel = document.getElementById('crawl-search-panel');
const crawlKeyword = document.getElementById('crawl-keyword');
const crawlSearchBtn = document.getElementById('crawl-search-btn');
const crawlSearchResults = document.getElementById('crawl-search-results');

const lbFilter = document.getElementById('lb-filter');
const lbManageList = document.getElementById('lb-manage-list');
const lbManageEmpty = document.getElementById('lb-manage-empty');
const clearLbBtn = document.getElementById('clear-lb-btn');

const confirmModal = document.getElementById('confirm-modal');
const confirmMsg = document.getElementById('confirm-msg');
const confirmCancel = document.getElementById('confirm-cancel');
const confirmOk = document.getElementById('confirm-ok');
let confirmAction = null;

const dashTotalUsers = document.getElementById('dash-total-users');
const dashTodayPractices = document.getElementById('dash-today-practices');
const dashTodayScores = document.getElementById('dash-today-scores');
const dashTotalArticles = document.getElementById('dash-total-articles');
const dashPendingArticles = document.getElementById('dash-pending-articles');
const weeklyUsersChart = document.getElementById('weekly-users-chart');

const backupIncludeConfig = document.getElementById('backup-include-config');
const backupIncludeAvatars = document.getElementById('backup-include-avatars');
const backupCreateBtn = document.getElementById('backup-create-btn');
const backupCreateMsg = document.getElementById('backup-create-msg');
const backupTableWrap = document.getElementById('backup-table-wrap');
const backupListBody = document.getElementById('backup-list-body');
const backupEmpty = document.getElementById('backup-empty');
const backupListMsg = document.getElementById('backup-list-msg');
const backupPendingBanner = document.getElementById('backup-pending-banner');
const backupPendingText = document.getElementById('backup-pending-text');
const backupCancelRestoreBtn = document.getElementById('backup-cancel-restore-btn');
const backupRestoreFile = document.getElementById('backup-restore-file');
const backupRestoreBtn = document.getElementById('backup-restore-btn');
const backupRestoreMsg = document.getElementById('backup-restore-msg');
const backupRestoreModal = document.getElementById('backup-restore-modal');
const backupRestoreSummary = document.getElementById('backup-restore-summary');
const backupRestoreInput = document.getElementById('backup-restore-input');
const backupRestoreModalMsg = document.getElementById('backup-restore-modal-msg');
const backupRestoreCancel = document.getElementById('backup-restore-cancel');
const backupRestoreConfirm = document.getElementById('backup-restore-confirm');
let backupList = [];
let backupRestoreTarget = null;
let backupBusy = false;

const pendingArticlesList = document.getElementById('pending-articles-list');
const pendingEmpty = document.getElementById('pending-empty');

const announcementContent = document.getElementById('announcement-content');
const announcementTitleInput = document.getElementById('announcement-title-input');
const announcementLevel = document.getElementById('announcement-level');
const announcementActive = document.getElementById('announcement-active');
const announcementAllowClose = document.getElementById('announcement-allow-close');
const announcementStart = document.getElementById('announcement-start');
const announcementEnd = document.getElementById('announcement-end');
const announcementEditId = document.getElementById('announcement-edit-id');
const saveAnnouncementBtn = document.getElementById('save-announcement-btn');
const previewAnnouncementBtn = document.getElementById('preview-announcement-btn');
const cancelAnnouncementBtn = document.getElementById('cancel-announcement-btn');
const announcementMsg = document.getElementById('announcement-msg');
const announcementList = document.getElementById('announcement-list');
const announcementEmpty = document.getElementById('announcement-empty');
const announcementPreview = document.getElementById('announcement-preview');
const insertLinkBtn = document.getElementById('announcement-insert-link');
const previewBar = document.getElementById('preview-bar');
const previewBadge = document.getElementById('preview-badge');
const previewTitle = document.getElementById('preview-title');
const previewText = document.getElementById('preview-text');

const sensitiveWordsText = document.getElementById('sensitive-words-text');
const saveSensitiveWordsBtn = document.getElementById('save-sensitive-words-btn');
const sensitiveWordsMsg = document.getElementById('sensitive-words-msg');

const databaseTableList = document.getElementById('database-table-list');
const databaseSearchInput = document.getElementById('database-search-input');
const databaseRefreshBtn = document.getElementById('database-refresh-btn');
const databaseAddRowBtn = document.getElementById('database-add-row-btn');
const databaseMeta = document.getElementById('database-meta');
const databaseTableWrap = document.getElementById('database-table-wrap');
const databasePagination = document.getElementById('database-pagination');
const databasePrevPage = document.getElementById('database-prev-page');
const databaseNextPage = document.getElementById('database-next-page');
const databasePageInfo = document.getElementById('database-page-info');
const databaseMsg = document.getElementById('database-msg');
let databaseTables = [];
let currentDatabaseTable = '';
let currentDatabasePage = 1;
let currentDatabaseData = null;
let currentDbType = 'sqlite';

const dbTypeSqliteBtn = document.getElementById('db-type-sqlite');
const dbTypeMysqlBtn = document.getElementById('db-type-mysql');
const mysqlConfigFields = document.getElementById('mysql-config-fields');
const dbTestBtn = document.getElementById('db-test-btn');
const dbSaveConfigBtn = document.getElementById('db-save-config-btn');
const dbConfigMsg = document.getElementById('db-config-msg');
const mysqlHost = document.getElementById('mysql-host');
const mysqlPort = document.getElementById('mysql-port');
const mysqlUser = document.getElementById('mysql-user');
const mysqlPassword = document.getElementById('mysql-password');
const mysqlDatabase = document.getElementById('mysql-database');
const mysqlCharset = document.getElementById('mysql-charset');

async function loadDbConfig() {
  try {
    const res = await fetch('/api/admin/db-config', { headers: apiHeaders() });
    if (!res.ok) return;
    const config = await res.json();
    currentDbType = config.type || 'sqlite';
    updateDbTypeUI();
    if (config.mysql) {
      mysqlHost.value = config.mysql.host || 'localhost';
      mysqlPort.value = config.mysql.port || 3306;
      mysqlUser.value = config.mysql.user || 'root';
      mysqlPassword.value = config.mysql.password ? '••••••' : '';
      mysqlDatabase.value = config.mysql.database || 'typing';
      mysqlCharset.value = config.mysql.charset || 'utf8mb4';
    }
  } catch (e) {}
}

function updateDbTypeUI() {
  dbTypeSqliteBtn.classList.toggle('active', currentDbType === 'sqlite');
  dbTypeMysqlBtn.classList.toggle('active', currentDbType === 'mysql');
  mysqlConfigFields.style.display = currentDbType === 'mysql' ? 'flex' : 'none';
}

function getMysqlConfigFromForm() {
  return {
    host: mysqlHost.value.trim(),
    port: parseInt(mysqlPort.value) || 3306,
    user: mysqlUser.value.trim(),
    password: mysqlPassword.value === '••••••' ? undefined : mysqlPassword.value,
    database: mysqlDatabase.value.trim(),
    charset: mysqlCharset.value.trim() || 'utf8mb4'
  };
}

dbTypeSqliteBtn.addEventListener('click', () => { currentDbType = 'sqlite'; updateDbTypeUI(); });
dbTypeMysqlBtn.addEventListener('click', () => { currentDbType = 'mysql'; updateDbTypeUI(); });

dbTestBtn.addEventListener('click', async () => {
  dbTestBtn.disabled = true;
  dbTestBtn.textContent = '测试中...';
  dbConfigMsg.textContent = '';
  try {
    const res = await apiWrite('/api/admin/db-config/test', {
      method: 'POST',
      headers: apiHeaders(),
      body: JSON.stringify({ type: currentDbType, mysql: getMysqlConfigFromForm() })
    });
    const data = await res.json();
    if (res.ok) {
      dbConfigMsg.textContent = data.message || '连接成功';
      dbConfigMsg.style.color = 'var(--semantic-success)';
    } else {
      dbConfigMsg.textContent = data.error || '连接失败';
      dbConfigMsg.style.color = 'var(--semantic-error)';
    }
  } catch (e) {
    dbConfigMsg.textContent = '请求失败';
    dbConfigMsg.style.color = 'var(--semantic-error)';
  } finally {
    dbTestBtn.disabled = false;
    dbTestBtn.textContent = '测试连接';
  }
});

dbSaveConfigBtn.addEventListener('click', async () => {
  dbSaveConfigBtn.disabled = true;
  dbSaveConfigBtn.textContent = '保存中...';
  dbConfigMsg.textContent = '';
  try {
    const res = await apiWrite('/api/admin/db-config', {
      method: METHOD_PUT,
      headers: apiHeaders(),
      body: JSON.stringify({ type: currentDbType, mysql: getMysqlConfigFromForm() })
    });
    const data = await res.json();
    if (res.ok) {
      dbConfigMsg.textContent = data.message || '配置已保存';
      dbConfigMsg.style.color = 'var(--semantic-success)';
      if (data.needsRestart) {
        dbConfigMsg.textContent += ' 需要重启服务器后生效。';
      }
    } else {
      dbConfigMsg.textContent = data.error || '保存失败';
      dbConfigMsg.style.color = 'var(--semantic-error)';
    }
  } catch (e) {
    dbConfigMsg.textContent = '请求失败';
    dbConfigMsg.style.color = 'var(--semantic-error)';
  } finally {
    dbSaveConfigBtn.disabled = false;
    dbSaveConfigBtn.textContent = '保存配置';
  }
});

const userList = document.getElementById('user-list');
const userEmpty = document.getElementById('user-empty');
const adminEditUsername = document.getElementById('admin-edit-username');
const adminEditEmail = document.getElementById('admin-edit-email');
const adminCurrentPassword = document.getElementById('admin-current-password');
const adminNewPassword = document.getElementById('admin-new-password');
const saveAdminInfoBtn = document.getElementById('save-admin-info-btn');
const adminInfoMsg = document.getElementById('admin-info-msg');

const offlineStatsBar = document.getElementById('offline-stats-bar');
const offlineMarkedCount = document.getElementById('offline-marked-count');
const offlineCachedCount = document.getElementById('offline-cached-count');
const offlineSyncHint = document.getElementById('offline-sync-hint');
const offlineSyncBtn = document.getElementById('offline-sync-btn');
const offlineRefreshBtn = document.getElementById('offline-refresh-btn');
const offlineSearch = document.getElementById('offline-search');
const offlineSelectAll = document.getElementById('offline-select-all');
const offlineBatchAdd = document.getElementById('offline-batch-add');
const offlineBatchRemove = document.getElementById('offline-batch-remove');
const offlineBatchCount = document.getElementById('offline-batch-count');
const offlineFilterSummary = document.getElementById('offline-filter-summary');
const offlineArticleList = document.getElementById('offline-article-list');
const offlineArticleEmpty = document.getElementById('offline-article-empty');

let allOfflineArticles = [];
let offlineCachedIds = new Set();
let offlineSelectedIds = new Set();
let allArticlesForAdd = [];

function getToken() {
  return localStorage.getItem('token');
}

function apiHeaders() {
  const token = getToken();
  const h = { 'Content-Type': 'application/json' };
  if (token) h['Authorization'] = 'Bearer ' + token;
  return h;
}

const METHOD_PUT = 'PUT';
const METHOD_PATCH = 'PATCH';
const METHOD_DELETE = 'DELETE';

async function apiWrite(url, options) {
  const opts = Object.assign({}, options || {});
  const original = String(opts.method || 'POST').toUpperCase();
  const headers = Object.assign({}, opts.headers || {});
  if (original === 'PUT' || original === 'PATCH' || original === 'DELETE') {
    headers['x-http-method-override'] = original;
    opts.method = 'POST';
  }
  opts.headers = headers;
  return fetch(url, opts);
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

async function sendCacheArticleSW(article, source) {
  const ctrl = await getSWController();
  if (!ctrl) return;
  ctrl.postMessage({ type: 'CACHE_ARTICLE', article, source });
}

async function sendDeleteCachedArticleSW(id, source) {
  const ctrl = await getSWController();
  if (!ctrl) return;
  ctrl.postMessage({ type: 'DELETE_CACHED_ARTICLE', id, source });
}

function showAccessDenied(msg) {
  adminContent.innerHTML =
    '<div style="text-align:center;padding:80px 32px">' +
      '<div style="font-size:48px;margin-bottom:16px">🔒</div>' +
      '<h2 style="margin-bottom:12px;color:var(--ink)">' + msg + '</h2>' +
      '<p style="color:var(--muted);margin-bottom:24px">请先在练习页面以管理员账号登录</p>' +
      '<a href="index.html" class="btn-primary" style="display:inline-flex;text-decoration:none">返回练习页面</a>' +
    '</div>';
}

async function checkAuth() {
  const token = getToken();
  if (!token) {
    showAccessDenied('未登录');
    return false;
  }
  try {
    const res = await fetch('/api/auth/me', { headers: { 'Authorization': 'Bearer ' + token } });
    if (res.ok) {
      currentUser = await res.json();
      if (currentUser.role !== 'admin') {
        showAccessDenied('权限不足');
        return false;
      }
      adminUsername.textContent = currentUser.nickname || currentUser.username;
      return true;
    } else {
      if (res.status === 503) {
        showAdminOffline();
        return false;
      }
      localStorage.removeItem('token');
      showAccessDenied('登录已过期');
      return false;
    }
  } catch (e) {
    showAdminOffline();
    return false;
  }
}

adminLogoutBtn.addEventListener('click', () => {
  localStorage.removeItem('token');
  window.location.href = 'index.html';
});

let chartJsPromise = null;
function ensureChartJS() {
  if (typeof Chart !== 'undefined') return Promise.resolve();
  if (chartJsPromise) return chartJsPromise;
  chartJsPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/chart.js';
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => {
      chartJsPromise = null;
      reject(new Error('Chart.js 加载失败'));
    };
    document.head.appendChild(script);
  });
  return chartJsPromise;
}

async function loadDashboard() {
  try {
    const res = await fetch('/api/admin/dashboard', { headers: apiHeaders() });
    if (!res.ok) return;
    const data = await res.json();

    dashTotalUsers.textContent = data.total_users ?? 0;
    dashTodayPractices.textContent = data.today_practices ?? 0;
    dashTodayScores.textContent = data.today_scores ?? 0;
    dashTotalArticles.textContent = data.total_articles ?? 0;
    dashPendingArticles.textContent = data.pending_articles ?? 0;

    try {
      await ensureChartJS();
      renderWeeklyChart(data.weekly_users || []);
    } catch (chartErr) {
      console.error('图表加载失败', chartErr);
    }
  } catch (e) {
    dashTotalUsers.textContent = '-';
    dashTodayPractices.textContent = '-';
    dashTodayScores.textContent = '-';
    dashTotalArticles.textContent = '-';
    dashPendingArticles.textContent = '-';
  }
}

function renderWeeklyChart(weeklyData) {
  if (typeof Chart === 'undefined') {
    console.error('Chart.js is not loaded');
    return;
  }

  if (weeklyChart) {
    weeklyChart.destroy();
  }

  const labels = [];
  const values = [];
  const now = new Date();

  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const month = d.getMonth() + 1;
    const day = d.getDate();
    labels.push(month + '/' + day);
    const dateStr = d.toISOString().slice(0, 10);
    const found = weeklyData.find(function(item) { return item.date === dateStr; });
    values.push(found ? found.count : 0);
  }

  const ctx = weeklyUsersChart.getContext('2d');
  weeklyChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: '新增用户',
        data: values,
        backgroundColor: 'rgba(245, 78, 0, 0.75)',
        borderColor: '#f54e00',
        borderWidth: 1,
        borderRadius: 6,
        maxBarThickness: 40
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#1a1a1a',
          titleFont: { family: 'Inter', size: 13 },
          bodyFont: { family: 'Inter', size: 12 },
          cornerRadius: 8,
          padding: 10
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            font: { family: 'Inter', size: 12 },
            color: '#999'
          }
        },
        y: {
          beginAtZero: true,
          grid: { color: 'rgba(0,0,0,0.06)' },
          ticks: {
            font: { family: 'Inter', size: 12 },
            color: '#999',
            stepSize: 1
          }
        }
      }
    }
  });
}

async function loadPendingArticles() {
  try {
    const res = await fetch('/api/articles/pending', { headers: apiHeaders() });
    if (!res.ok) return;
    const data = await res.json();
    renderPendingArticles(data);
  } catch (e) {
    renderPendingArticles([]);
  }
}

function renderPendingArticles(list) {
  pendingArticlesList.innerHTML = '';
  if (!list || list.length === 0) {
    pendingEmpty.style.display = 'block';
    return;
  }
  pendingEmpty.style.display = 'none';

  list.forEach(function(a) {
    const div = document.createElement('div');
    div.className = 'article-item';
    const preview = a.content.length > 80 ? a.content.slice(0, 80) + '...' : a.content;
    div.innerHTML =
      '<div class="info">' +
        '<div class="title">' + escapeHtml(a.title) +
          (a.category_name ? '<span class="category-tag">' + escapeHtml(a.category_name) + '</span>' : '') +
        '</div>' +
        '<div class="preview" style="font-size:12px;color:var(--muted)">作者：' + escapeHtml(a.author_name || '匿名') + '</div>' +
        '<div class="preview">' + escapeHtml(preview) + '</div>' +
      '</div>' +
      '<div class="actions" style="display:flex;gap:8px">' +
        '<button class="btn-primary approve-btn" data-id="' + a.id + '" style="font-size:13px;padding:6px 14px">通过</button>' +
        '<button class="btn-dark-utility reject-btn" data-id="' + a.id + '" style="font-size:13px;padding:6px 14px">拒绝</button>' +
      '</div>';

    div.querySelector('.approve-btn').addEventListener('click', async function() {
      try {
        const res = await apiWrite('/api/articles/' + this.dataset.id + '/review', {
          method: METHOD_PUT,
          headers: apiHeaders(),
          body: JSON.stringify({ status: 'approved' })
        });
        if (res.ok) {
          await loadPendingArticles();
          await loadDashboard();
        } else {
          const data = await res.json();
          alert(data.error || '操作失败');
        }
      } catch (e) {
        alert('网络错误');
      }
    });

    div.querySelector('.reject-btn').addEventListener('click', async function() {
      const reason = prompt('请输入拒绝原因（可选）：');
      if (reason === null) return;
      try {
        const res = await apiWrite('/api/articles/' + this.dataset.id + '/review', {
          method: METHOD_PUT,
          headers: apiHeaders(),
          body: JSON.stringify({ status: 'rejected', review_msg: reason })
        });
        if (res.ok) {
          await loadPendingArticles();
          await loadDashboard();
        } else {
          const data = await res.json();
          alert(data.error || '操作失败');
        }
      } catch (e) {
        alert('网络错误');
      }
    });

    pendingArticlesList.appendChild(div);
  });
}

const LEVEL_LABELS = { 'notification': '通知', 'site-wide': '全站', 'warning': '警告' };
const LEVEL_CLASSES = { 'notification': 'level-notification', 'site-wide': 'level-site-wide', 'warning': 'level-warning' };

function resetAnnouncementForm() {
  announcementEditId.value = '';
  announcementTitleInput.value = '';
  announcementContent.value = '';
  announcementLevel.value = 'notification';
  announcementActive.checked = true;
  announcementAllowClose.checked = true;
  announcementStart.value = '';
  announcementEnd.value = '';
  cancelAnnouncementBtn.style.display = 'none';
  saveAnnouncementBtn.textContent = '保存公告';
  announcementPreview.style.display = 'none';
}

function formatDateTimeLocal(dt) {
  if (!dt) return '';
  const d = new Date(dt);
  if (isNaN(d.getTime())) return '';
  const pad = n => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + pad(d.getMonth()+1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}

async function loadAnnouncements() {
  try {
    const res = await fetch('/api/admin/announcements', { headers: apiHeaders() });
    const data = await res.json().catch(() => []);
    if (!res.ok) {
      announcementList.innerHTML = '';
      announcementEmpty.style.display = '';
      announcementEmpty.textContent = data.error || '公告列表加载失败';
      return;
    }
    announcementList.innerHTML = '';
    announcementEmpty.textContent = '暂无公告';
    if (!data || data.length === 0) {
      announcementEmpty.style.display = '';
      return;
    }
    announcementEmpty.style.display = 'none';
    data.forEach(item => {
      const div = document.createElement('div');
      div.className = 'article-item';
      div.style.alignItems = 'flex-start';
      const levelClass = LEVEL_CLASSES[item.level] || 'level-notification';
      const badge = '<span class="announcement-level-badge" style="background:rgba(0,0,0,0.15);color:#fff;padding:1px 6px;border-radius:4px;font-size:11px;margin-right:6px">' + (LEVEL_LABELS[item.level] || '通知') + '</span>';
      const timeRange = (item.start_time || item.end_time) ? ('<span style="color:var(--muted);font-size:12px">' + (item.start_time ? formatDateTimeLocal(item.start_time) : '永久') + ' ~ ' + (item.end_time ? formatDateTimeLocal(item.end_time) : '永久') + '</span>') : '';
      div.innerHTML =
        '<div class="info" style="flex:1">' +
          '<div class="title" style="display:flex;align-items:center;gap:4px;flex-wrap:wrap">' + badge + escapeHtml(item.title || '(无标题)') + (item.is_active ? '' : ' <span style="color:var(--muted);font-size:12px">[已停用]</span>') + '</div>' +
          '<div class="preview"></div>' +
          timeRange +
        '</div>' +
        '<div style="display:flex;gap:6px;flex-shrink:0">' +
          '<button class="btn-secondary edit-announcement-btn" data-id="' + item.id + '" style="font-size:12px;padding:4px 10px">编辑</button>' +
          '<button class="btn-secondary delete-announcement-btn" data-id="' + item.id + '" style="font-size:12px;padding:4px 10px;color:var(--semantic-error)">删除</button>' +
        '</div>';
      const previewEl = div.querySelector('.preview');
      if (previewEl) {
        if (window.AnnounceText) window.AnnounceText.render(previewEl, item.content || '');
        else previewEl.textContent = item.content || '';
      }
      announcementList.appendChild(div);
    });

    announcementList.querySelectorAll('.edit-announcement-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        try {
          const res = await fetch('/api/admin/announcements', { headers: apiHeaders() });
          const all = await res.json();
          const item = all.find(a => String(a.id) === id);
          if (!item) return;
          announcementEditId.value = item.id;
          announcementTitleInput.value = item.title || '';
          announcementContent.value = item.content || '';
          announcementLevel.value = item.level || 'notification';
          announcementActive.checked = item.is_active === 1 || item.is_active === true;
          announcementAllowClose.checked = item.allow_close === 1 || item.allow_close === true;
          announcementStart.value = item.start_time ? formatDateTimeLocal(item.start_time) : '';
          announcementEnd.value = item.end_time ? formatDateTimeLocal(item.end_time) : '';
          cancelAnnouncementBtn.style.display = '';
          saveAnnouncementBtn.textContent = '更新公告';
          announcementMsg.textContent = '';
        } catch (e) {}
      });
    });

    announcementList.querySelectorAll('.delete-announcement-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('确定删除该公告？')) return;
        try {
          const res = await apiWrite('/api/admin/announcements/' + btn.dataset.id, {
            method: METHOD_DELETE,
            headers: apiHeaders()
          });
          if (res.ok) {
            resetAnnouncementForm();
            loadAnnouncements();
          }
        } catch (e) {}
      });
    });
  } catch (e) {
    announcementList.innerHTML = '';
    announcementEmpty.style.display = '';
    announcementEmpty.textContent = '公告列表加载失败：' + (e.message || '网络错误');
  }
}

saveAnnouncementBtn.addEventListener('click', async () => {
  const content = announcementContent.value.trim();
  if (!content) {
    announcementMsg.textContent = '公告内容不能为空';
    announcementMsg.style.color = 'var(--semantic-error)';
    setTimeout(() => announcementMsg.textContent = '', 3000);
    return;
  }
  const body = {
    title: announcementTitleInput.value.trim(),
    content: content,
    level: announcementLevel.value,
    is_active: announcementActive.checked,
    allow_close: announcementAllowClose.checked,
    start_time: announcementStart.value || null,
    end_time: announcementEnd.value || null
  };
  const editId = announcementEditId.value;
  const url = editId ? '/api/admin/announcements/' + editId : '/api/admin/announcements';
  const method = editId ? METHOD_PUT : 'POST';

  try {
    const res = await apiWrite(url, {
      method: method,
      headers: apiHeaders(),
      body: JSON.stringify(body)
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      announcementMsg.textContent = editId ? '公告已更新' : '公告已创建';
      announcementMsg.style.color = 'var(--semantic-success)';
      resetAnnouncementForm();
      loadAnnouncements();
    } else {
      announcementMsg.textContent = '保存失败：' + (data.error || res.statusText || '未知错误');
      announcementMsg.style.color = 'var(--semantic-error)';
    }
  } catch (e) {
    announcementMsg.textContent = '请求失败：' + (e.message || '网络错误');
    announcementMsg.style.color = 'var(--semantic-error)';
  }
  setTimeout(() => announcementMsg.textContent = '', 3000);
});

previewAnnouncementBtn.addEventListener('click', () => {
  const content = announcementContent.value.trim();
  if (!content) {
    announcementMsg.textContent = '请先输入公告内容';
    announcementMsg.style.color = 'var(--semantic-error)';
    setTimeout(() => announcementMsg.textContent = '', 3000);
    return;
  }
  const level = announcementLevel.value || 'notification';
  previewBar.className = 'announcement-bar ' + (LEVEL_CLASSES[level] || 'level-notification');
  previewBadge.textContent = LEVEL_LABELS[level] || '通知';
  previewTitle.textContent = announcementTitleInput.value.trim();
  previewTitle.style.display = announcementTitleInput.value.trim() ? '' : 'none';
  if (window.AnnounceText) window.AnnounceText.render(previewText, content);
  else previewText.textContent = content;
  announcementPreview.style.display = '';
});

cancelAnnouncementBtn.addEventListener('click', resetAnnouncementForm);

function showAnnouncementEditorMsg(text, isError) {
  announcementMsg.textContent = text;
  announcementMsg.style.color = isError ? 'var(--semantic-error)' : 'var(--semantic-success)';
  setTimeout(() => {
    if (announcementMsg.textContent === text) announcementMsg.textContent = '';
  }, 3000);
}

if (insertLinkBtn) insertLinkBtn.addEventListener('click', () => {
  const start = announcementContent.selectionStart;
  const end = announcementContent.selectionEnd;
  const selected = announcementContent.value.slice(start, end);
  if (!selected) {
    showAnnouncementEditorMsg('请先在公告内容里选中要变成链接的文字', true);
    return;
  }
  const input = window.prompt('请输入链接地址（http://、https:// 或以 / 开头的站内路径）', 'https://');
  if (input === null) return;
  const url = input.trim();
  if (!/^https?:\/\//.test(url) && !/^\/[^\s]*$/.test(url)) {
    showAnnouncementEditorMsg('链接必须以 http:// 或 https:// 开头，或以 / 开头的站内路径', true);
    return;
  }
  const replacement = '[' + selected + '](' + url + ')';
  if (typeof announcementContent.setRangeText === 'function') {
    announcementContent.setRangeText(replacement, start, end, 'end');
  } else {
    announcementContent.value = announcementContent.value.slice(0, start) + replacement + announcementContent.value.slice(end);
  }
  const cursor = start + replacement.length;
  announcementContent.selectionStart = cursor;
  announcementContent.selectionEnd = cursor;
  announcementContent.focus();
  announcementMsg.textContent = '';
});

async function loadUsers() {
  try {
    const res = await fetch('/api/admin/users', { headers: apiHeaders() });
    if (!res.ok) return;
    const data = await res.json();
    userList.innerHTML = '';
    if (!data || data.length === 0) {
      userEmpty.style.display = '';
      return;
    }
    userEmpty.style.display = 'none';
    data.forEach(user => {
      const div = document.createElement('div');
      div.className = 'article-item';
      div.style.alignItems = 'flex-start';
      const roleBadge = user.role === 'admin' ? '<span style="background:var(--primary-lightest);color:var(--primary);padding:1px 8px;border-radius:4px;font-size:11px;margin-left:6px">管理员</span>' : '';
      div.innerHTML =
        '<div class="info" style="flex:1">' +
          '<div class="title">' + escapeHtml(user.username) + roleBadge + '</div>' +
          '<div class="preview">' + escapeHtml(user.email || '无邮箱') + ' · 注册于 ' + (user.created_at ? user.created_at.split('T')[0] : '') + '</div>' +
        '</div>' +
        '<div style="display:flex;gap:6px;flex-shrink:0">' +
          '<button class="btn-secondary edit-user-btn" data-id="' + user.id + '" style="font-size:12px;padding:4px 10px">编辑</button>' +
          '<button class="btn-secondary delete-user-btn" data-id="' + user.id + '" style="font-size:12px;padding:4px 10px;color:var(--semantic-error)">删除</button>' +
        '</div>';
      userList.appendChild(div);
    });

    userList.querySelectorAll('.edit-user-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        try {
          const res = await fetch('/api/admin/users', { headers: apiHeaders() });
          const all = await res.json();
          const user = all.find(u => String(u.id) === id);
          if (!user) return;
          const newUsername = prompt('修改用户名（留空不修改）：', user.username);
          if (newUsername === null) return;
          const newEmail = prompt('修改邮箱（留空不修改，输入 - 清空）：', user.email || '');
          if (newEmail === null) return;
          const newPassword = prompt('修改密码（留空不修改，至少6位）：');
          if (newPassword === null) return;
          const newRole = prompt('角色（admin / user，留空不修改）：', user.role);
          if (newRole === null) return;
          const roleValue = newRole.trim();
          if (roleValue && roleValue !== 'admin' && roleValue !== 'user') {
            alert('角色只能是 admin 或 user');
            return;
          }
          const body = {};
          if (newUsername.trim()) body.username = newUsername.trim();
          const emailValue = newEmail.trim();
          if (emailValue === '-') {
            body.email = '';
          } else if (emailValue) {
            body.email = emailValue;
          }
          if (newPassword.trim()) body.password = newPassword.trim();
          if (roleValue) body.role = roleValue;
          const updateRes = await apiWrite('/api/admin/users/' + id, {
            method: METHOD_PUT,
            headers: apiHeaders(),
            body: JSON.stringify(body)
          });
          if (updateRes.ok) {
            loadUsers();
          } else {
            const err = await updateRes.json();
            alert('更新失败：' + (err.error || '未知错误'));
          }
        } catch (e) {}
      });
    });

    userList.querySelectorAll('.delete-user-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('确定删除该用户？此操作不可恢复！')) return;
        try {
          const res = await apiWrite('/api/admin/users/' + btn.dataset.id, {
            method: METHOD_DELETE,
            headers: apiHeaders()
          });
          if (res.ok) {
            loadUsers();
          } else {
            const err = await res.json();
            alert('删除失败：' + (err.error || '未知错误'));
          }
        } catch (e) {}
      });
    });
  } catch (e) {}
}

saveAdminInfoBtn.addEventListener('click', async () => {
  const body = {};
  if (adminEditUsername.value.trim()) body.username = adminEditUsername.value.trim();
  if (adminEditEmail.value.trim() || adminEditEmail.value === '') body.email = adminEditEmail.value.trim();
  if (adminNewPassword.value) {
    if (!adminCurrentPassword.value) {
      adminInfoMsg.textContent = '修改密码需要提供当前密码';
      adminInfoMsg.style.color = 'var(--semantic-error)';
      setTimeout(() => adminInfoMsg.textContent = '', 3000);
      return;
    }
    body.currentPassword = adminCurrentPassword.value;
    body.newPassword = adminNewPassword.value;
  }
  if (!body.username && body.email === undefined && !body.newPassword) {
    adminInfoMsg.textContent = '没有要修改的内容';
    adminInfoMsg.style.color = 'var(--semantic-error)';
    setTimeout(() => adminInfoMsg.textContent = '', 3000);
    return;
  }

  try {
    const res = await apiWrite('/api/auth/me', {
      method: METHOD_PUT,
      headers: apiHeaders(),
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (res.ok) {
      adminInfoMsg.textContent = '信息已更新';
      adminInfoMsg.style.color = 'var(--semantic-success)';
      if (data.token) {
        localStorage.setItem('token', data.token);
        if (data.user && data.user.username) {
          adminUsername.textContent = data.user.username;
        }
      }
      adminEditUsername.value = '';
      adminEditEmail.value = '';
      adminCurrentPassword.value = '';
      adminNewPassword.value = '';
    } else {
      adminInfoMsg.textContent = '更新失败：' + (data.error || '未知错误');
      adminInfoMsg.style.color = 'var(--semantic-error)';
    }
  } catch (e) {
    adminInfoMsg.textContent = '网络错误';
    adminInfoMsg.style.color = 'var(--semantic-error)';
  }
  setTimeout(() => adminInfoMsg.textContent = '', 3000);
});

async function loadSensitiveWords() {
  try {
    const res = await fetch('/api/admin/sensitive-words', { headers: apiHeaders() });
    if (!res.ok) return;
    const data = await res.json();
    const words = Array.isArray(data.words) ? data.words : [];
    sensitiveWordsText.value = words.join('\n');
  } catch (e) {}
}

saveSensitiveWordsBtn.addEventListener('click', async () => {
  const raw = sensitiveWordsText.value;
  const words = raw.split('\n').map(function(w) { return w.trim(); }).filter(function(w) { return w.length > 0; });

  try {
    const res = await apiWrite('/api/admin/sensitive-words', {
      method: METHOD_PUT,
      headers: apiHeaders(),
      body: JSON.stringify({ words: words })
    });
    if (res.ok) {
      sensitiveWordsMsg.textContent = '敏感词已保存，共 ' + words.length + ' 个';
      sensitiveWordsMsg.style.color = 'var(--primary)';
    } else {
      const data = await res.json();
      sensitiveWordsMsg.textContent = '保存失败：' + (data.error || '未知错误');
      sensitiveWordsMsg.style.color = '#e00';
    }
  } catch (e) {
    sensitiveWordsMsg.textContent = '网络错误';
    sensitiveWordsMsg.style.color = '#e00';
  }
  setTimeout(function() { sensitiveWordsMsg.textContent = ''; }, 3000);
});

async function loadDatabaseTables() {
  try {
    const res = await fetch('/api/admin/db/tables', { headers: apiHeaders() });
    if (!res.ok) return;
    databaseTables = await res.json();
    renderDatabaseTables();
    if (!currentDatabaseTable && databaseTables.length > 0) {
      currentDatabaseTable = databaseTables[0].name;
      currentDatabasePage = 1;
      await loadDatabaseTable();
    }
  } catch (e) {
    databaseMsg.textContent = '数据库表加载失败';
    databaseMsg.style.color = 'var(--semantic-error)';
  }
}

function renderDatabaseTables() {
  databaseTableList.innerHTML = '';
  if (!databaseTables.length) {
    databaseTableList.innerHTML = '<div class="empty-msg" style="padding:24px 0">暂无数据表</div>';
    return;
  }
  databaseTables.forEach(table => {
    const btn = document.createElement('button');
    btn.className = 'database-table-btn' + (table.name === currentDatabaseTable ? ' active' : '');
    btn.innerHTML = '<span>' + escapeHtml(table.name) + '</span><span class="database-table-count">' + table.count + '</span>';
    btn.addEventListener('click', async () => {
      currentDatabaseTable = table.name;
      currentDatabasePage = 1;
      databaseSearchInput.value = '';
      renderDatabaseTables();
      await loadDatabaseTable();
    });
    databaseTableList.appendChild(btn);
  });
}

async function loadDatabaseTable() {
  if (!currentDatabaseTable) return;
  const params = new URLSearchParams();
  params.set('page', currentDatabasePage);
  params.set('limit', '20');
  const search = databaseSearchInput.value.trim();
  if (search) params.set('search', search);

  databaseMsg.textContent = '';
  try {
    const res = await fetch('/api/admin/db/' + encodeURIComponent(currentDatabaseTable) + '?' + params.toString(), { headers: apiHeaders() });
    const data = await res.json();
    if (!res.ok) {
      databaseMsg.textContent = data.error || '加载失败';
      databaseMsg.style.color = 'var(--semantic-error)';
      return;
    }
    currentDatabaseData = data;
    renderDatabaseRows(data);
  } catch (e) {
    databaseMsg.textContent = '数据库数据加载失败';
    databaseMsg.style.color = 'var(--semantic-error)';
  }
}

function isSensitiveDatabaseColumn(name) {
  return /password|hash|token|secret/i.test(name);
}

function formatDatabaseCell(value, columnName) {
  if (value === null || value === undefined) return '';
  if (isSensitiveDatabaseColumn(columnName)) return '••••••';
  const text = String(value);
  return text.length > 120 ? text.slice(0, 120) + '…' : text;
}

function getDatabaseColumnDefault(column) {
  if (/created_at|updated_at/i.test(column.name)) return '';
  if (column.name === 'content') return '新内容';
  if (column.name === 'title') return '新标题';
  if (column.name === 'level') return 'notification';
  if (column.name === 'is_active' || column.name === 'allow_close') return '1';
  if (column.name === 'status') return 'approved';
  if (column.name === 'difficulty') return '1';
  if (column.name === 'difficulty_score') return '0';
  if (column.name === 'name') return '新名称';
  if (column.notnull && !column.defaultValue) {
    const type = String(column.type || '').toUpperCase();
    return type.includes('INT') || type.includes('REAL') || type.includes('NUM') ? '0' : '';
  }
  return '';
}

async function collectNewDatabaseRowPayload() {
  if (!currentDatabaseData || !currentDatabaseData.columns) return null;
  const pk = currentDatabaseData.primaryKey;
  const payload = {};
  for (const column of currentDatabaseData.columns) {
    if (column.name === pk || isSensitiveDatabaseColumn(column.name) || /created_at|updated_at/i.test(column.name)) continue;
    const defaultValue = getDatabaseColumnDefault(column);
    const value = prompt('新增记录字段：' + column.name + (column.notnull ? '（必填）' : ''), defaultValue);
    if (value === null) return null;
    if (value !== '') payload[column.name] = value;
  }
  return payload;
}

function renderDatabaseRows(data) {
  const totalPages = data.pagination.totalPages || 1;
  databaseMeta.textContent = data.table + ' · 共 ' + data.pagination.total + ' 条记录 · 第 ' + data.pagination.page + ' / ' + totalPages + ' 页';
  databasePagination.style.display = data.pagination.total > 0 ? 'flex' : 'none';
  databasePageInfo.textContent = '第 ' + data.pagination.page + ' / ' + totalPages + ' 页';
  databasePrevPage.disabled = data.pagination.page <= 1;
  databaseNextPage.disabled = data.pagination.page >= totalPages;

  if (!data.rows.length) {
    databaseTableWrap.innerHTML = '<div class="empty-msg">暂无记录</div>';
    return;
  }

  const columns = data.columns;
  const pk = data.primaryKey;
  const table = document.createElement('table');
  table.className = 'database-table';
  table.innerHTML = '<thead><tr>' + columns.map(column => '<th>' + escapeHtml(column.name) + '</th>').join('') + '<th>操作</th></tr></thead><tbody></tbody>';
  const tbody = table.querySelector('tbody');

  data.rows.forEach(row => {
    const tr = document.createElement('tr');
    columns.forEach(column => {
      const td = document.createElement('td');
      td.textContent = formatDatabaseCell(row[column.name], column.name);
      td.title = isSensitiveDatabaseColumn(column.name) ? '敏感字段已隐藏' : String(row[column.name] ?? '');
      if (canEditDatabaseCell(column, pk, row)) {
        td.classList.add('database-editable-cell');
        td.title = '点击编辑 ' + column.name;
        td.addEventListener('click', () => editDatabaseCell(row, column));
      }
      tr.appendChild(td);
    });

    const actionTd = document.createElement('td');
    actionTd.className = 'database-actions';
    const canModify = pk && row[pk] !== undefined && row[pk] !== null;
    actionTd.innerHTML = canModify
      ? '<button class="btn-secondary database-edit-btn">编辑</button><button class="btn-secondary database-delete-btn">删除</button>'
      : '<span class="note">无主键</span>';
    if (canModify) {
      actionTd.querySelector('.database-edit-btn').addEventListener('click', () => openDatabaseEdit(row));
      actionTd.querySelector('.database-delete-btn').addEventListener('click', () => deleteDatabaseRow(row));
    }
    tr.appendChild(actionTd);
    tbody.appendChild(tr);
  });

  databaseTableWrap.innerHTML = '';
  databaseTableWrap.appendChild(table);
}

function canEditDatabaseCell(column, pk, row) {
  return pk && row[pk] !== undefined && row[pk] !== null && column.name !== pk && !isSensitiveDatabaseColumn(column.name);
}

async function updateDatabaseRowField(row, columnName, value) {
  if (!currentDatabaseData || !currentDatabaseData.primaryKey) return false;
  const pk = currentDatabaseData.primaryKey;
  try {
    const res = await apiWrite('/api/admin/db/' + encodeURIComponent(currentDatabaseTable) + '/' + encodeURIComponent(row[pk]), {
      method: METHOD_PUT,
      headers: apiHeaders(),
      body: JSON.stringify({ [columnName]: value })
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      databaseMsg.textContent = columnName + ' 已更新';
      databaseMsg.style.color = 'var(--semantic-success)';
      await loadDatabaseTables();
      await loadDatabaseTable();
      return true;
    }
    databaseMsg.textContent = data.error || '更新失败';
    databaseMsg.style.color = 'var(--semantic-error)';
  } catch (e) {
    databaseMsg.textContent = '请求失败：' + (e.message || '网络错误');
    databaseMsg.style.color = 'var(--semantic-error)';
  }
  return false;
}

async function editDatabaseCell(row, column) {
  const currentValue = row[column.name] === null || row[column.name] === undefined ? '' : String(row[column.name]);
  const nextValue = prompt('编辑 ' + column.name, currentValue);
  if (nextValue === null || nextValue === currentValue) return;
  await updateDatabaseRowField(row, column.name, nextValue);
}

async function openDatabaseEdit(row) {
  if (!currentDatabaseData || !currentDatabaseData.primaryKey) return;
  const pk = currentDatabaseData.primaryKey;
  const editableColumns = currentDatabaseData.columns.filter(column => canEditDatabaseCell(column, pk, row));
  if (editableColumns.length === 0) {
    databaseMsg.textContent = '该记录没有可编辑字段';
    databaseMsg.style.color = 'var(--muted)';
    setTimeout(() => databaseMsg.textContent = '', 3000);
    return;
  }

  const columnNames = editableColumns.map(column => column.name).join(', ');
  const columnName = prompt('请输入要编辑的字段名：' + columnNames, editableColumns[0].name);
  if (columnName === null) return;
  const column = editableColumns.find(item => item.name === columnName.trim());
  if (!column) {
    databaseMsg.textContent = '字段不存在或不可编辑';
    databaseMsg.style.color = 'var(--semantic-error)';
    setTimeout(() => databaseMsg.textContent = '', 3000);
    return;
  }
  await editDatabaseCell(row, column);
}

async function deleteDatabaseRow(row) {
  if (!currentDatabaseData || !currentDatabaseData.primaryKey) return;
  const pk = currentDatabaseData.primaryKey;
  if (!confirm('确定删除 ' + currentDatabaseTable + ' 中主键为 ' + row[pk] + ' 的记录吗？')) return;

  try {
    const res = await apiWrite('/api/admin/db/' + encodeURIComponent(currentDatabaseTable) + '/' + encodeURIComponent(row[pk]), {
      method: METHOD_DELETE,
      headers: apiHeaders()
    });
    const data = await res.json();
    if (res.ok) {
      databaseMsg.textContent = '记录已删除';
      databaseMsg.style.color = 'var(--semantic-success)';
      await loadDatabaseTables();
      await loadDatabaseTable();
    } else {
      databaseMsg.textContent = data.error || '删除失败';
      databaseMsg.style.color = 'var(--semantic-error)';
    }
  } catch (e) {
    databaseMsg.textContent = '网络错误';
    databaseMsg.style.color = 'var(--semantic-error)';
  }
}

let databaseSearchTimer = null;
databaseSearchInput.addEventListener('input', () => {
  if (databaseSearchTimer) clearTimeout(databaseSearchTimer);
  databaseSearchTimer = setTimeout(() => {
    currentDatabasePage = 1;
    loadDatabaseTable();
  }, 300);
});

databaseRefreshBtn.addEventListener('click', async () => {
  await loadDatabaseTables();
  await loadDatabaseTable();
});

databaseAddRowBtn.addEventListener('click', async () => {
  if (!currentDatabaseTable) {
    databaseMsg.textContent = '请先选择数据表';
    databaseMsg.style.color = 'var(--semantic-error)';
    return;
  }
  const payload = await collectNewDatabaseRowPayload();
  if (payload === null) return;
  databaseAddRowBtn.disabled = true;
  databaseAddRowBtn.textContent = '新增中...';
  try {
    const res = await apiWrite('/api/admin/db/' + encodeURIComponent(currentDatabaseTable), {
      method: 'POST',
      headers: apiHeaders(),
      body: JSON.stringify(payload)
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      databaseMsg.textContent = '新增记录成功，可点击单元格继续编辑';
      databaseMsg.style.color = 'var(--semantic-success)';
      currentDatabasePage = 1;
      await loadDatabaseTables();
      await loadDatabaseTable();
    } else {
      databaseMsg.textContent = data.error || '新增失败';
      databaseMsg.style.color = 'var(--semantic-error)';
    }
  } catch (e) {
    databaseMsg.textContent = '请求失败：' + (e.message || '网络错误');
    databaseMsg.style.color = 'var(--semantic-error)';
  } finally {
    databaseAddRowBtn.disabled = false;
    databaseAddRowBtn.textContent = '新增空行';
  }
});

databasePrevPage.addEventListener('click', () => {
  if (currentDatabasePage <= 1) return;
  currentDatabasePage--;
  loadDatabaseTable();
});

databaseNextPage.addEventListener('click', () => {
  if (!currentDatabaseData || currentDatabasePage >= currentDatabaseData.pagination.totalPages) return;
  currentDatabasePage++;
  loadDatabaseTable();
});

function isCodeCategoryClient(id) {
  return codeCategoryIds.indexOf(String(id)) >= 0;
}

function isCodeArticleClient(article) {
  return !!(article && article.category_id != null && isCodeCategoryClient(article.category_id));
}

function categoryArticleCount(id) {
  const row = codeLanguagesAll.find(r => String(r.id) === String(id));
  return row && row.articleCount != null ? Number(row.articleCount) : null;
}

async function fetchCodeLanguages() {
  const res = await fetch('/api/admin/code-languages', { headers: apiHeaders() });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || '加载语言分类失败');
  }
  const data = await res.json();
  codeLanguagesAll = Array.isArray(data.all) ? data.all : [];
  codeCategoryIds = (Array.isArray(data.selected) ? data.selected : []).map(String);
  renderCodeLanguagePanel();
  renderCodeLanguageSelects();
  return data;
}

function renderCodeLanguagePanel() {
  const list = document.getElementById('code-lang-list');
  if (!list) return;
  const empty = document.getElementById('code-lang-list-empty');
  list.innerHTML = '';
  if (codeLanguagesAll.length === 0) {
    if (empty) empty.style.display = 'block';
    return;
  }
  if (empty) empty.style.display = 'none';

  codeLanguagesAll.forEach(c => {
    const selected = isCodeCategoryClient(c.id);
    const count = Number(c.articleCount) || 0;
    const tr = document.createElement('tr');
    tr.innerHTML =
      '<td><span class="code-lang-name">' + escapeHtml(c.name) + '</span></td>' +
      '<td>' + count + '</td>' +
      '<td><button type="button" class="admin-switch" role="switch" aria-checked="' + (selected ? 'true' : 'false') + '" aria-label="把 ' + escapeHtml(c.name) + ' 设为代码语言" data-id="' + c.id + '"' + (codeLanguageBusy ? ' disabled' : '') + '></button></td>' +
      '<td>' + (selected && count > 0 ? '<span class="code-lang-warning">该分类下的 ' + count + ' 篇文章会被当作代码素材</span>' : '') + '</td>';
    tr.querySelector('.admin-switch').addEventListener('click', function() {
      toggleCodeLanguage(c);
    });
    list.appendChild(tr);
  });
}

let codeLanguageBusy = false;
async function toggleCodeLanguage(category) {
  if (codeLanguageBusy) return;
  const id = String(category.id);
  const selected = isCodeCategoryClient(id);
  const next = codeCategoryIds.filter(x => x !== id);
  if (!selected) next.push(id);
  codeLanguageBusy = true;
  renderCodeLanguagePanel();
  try {
    const res = await apiWrite('/api/admin/code-languages', {
      method: METHOD_PUT,
      headers: apiHeaders(),
      body: JSON.stringify({ ids: next.map(Number) })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || '保存失败');
    codeCategoryIds = (Array.isArray(data.selected) ? data.selected : []).map(String);
    const msg = document.getElementById('code-lang-msg');
    if (msg) msg.textContent = '已生效，练习页与匹配的分流会在下次进入时使用新设置';
    adminToast('已更新代码语言分类', 'success');
    renderCategories();
    renderCategorySelects();
    renderCodeLanguageSelects();
    if (articles.length) fetchArticles();
    if (loadedSections.has('code-articles')) fetchCodeArticles();
    if (loadedSections.has('code-lb')) fetchCodeLeaderboard();
  } catch (e) {
    adminToast(e.message || '保存代码语言分类失败', 'error');
  } finally {
    codeLanguageBusy = false;
    renderCodeLanguagePanel();
  }
}

function renderCodeLanguageSelects() {
  if (!codeNewCategorySelect) return;
  const previous = codeNewCategorySelect.value;
  codeNewCategorySelect.innerHTML = '<option value="">-- 请选择语言 --</option>';
  categories.filter(c => isCodeCategoryClient(c.id)).forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = c.name;
    codeNewCategorySelect.appendChild(opt);
  });
  if (previous && [...codeNewCategorySelect.options].some(o => o.value === previous)) {
    codeNewCategorySelect.value = previous;
  }
  const hasLanguages = codeCategoryIds.length > 0;
  if (codeAddArticleBtn) codeAddArticleBtn.disabled = !hasLanguages;
  const hint = document.getElementById('code-article-hint');
  if (hint) {
    hint.textContent = hasLanguages
      ? '代码素材只出现在代码模式练习与代码房间。'
      : '还没有可用的语言分类，请先到「语言分类」勾选。';
  }
}

async function fetchCategories() {
  const res = await fetch('/api/categories');
  categories = await res.json();
  renderCategories();
  renderCategorySelects();
  renderCodeLanguageSelects();
}

function renderCategories() {
  categoryList.innerHTML = '';
  const normalCategories = categories.filter(c => !isCodeCategoryClient(c.id));
  if (normalCategories.length === 0) {
    categoryEmpty.style.display = 'block';
    return;
  }
  categoryEmpty.style.display = 'none';

  normalCategories.forEach(c => {
    const div = document.createElement('div');
    div.className = 'category-item';
    const count = categoryArticleCount(c.id);
    const emptyNote = (c.name === '代码' && count === 0)
      ? '<span class="category-empty-note">（空分类，可删除）</span>'
      : '';
    div.innerHTML =
      '<span class="name">' + escapeHtml(c.name) + emptyNote + '</span>' +
      '<div class="actions">' +
        '<button class="btn-dark-utility edit-cat-btn" data-id="' + c.id + '" data-name="' + escapeHtml(c.name) + '">编辑</button>' +
        '<button class="btn-dark-utility del-cat-btn" data-id="' + c.id + '">删除</button>' +
      '</div>';

    div.querySelector('.edit-cat-btn').addEventListener('click', async function() {
      const newName = prompt('编辑分类名称', this.dataset.name);
      if (newName && newName.trim()) {
        await apiWrite('/api/categories/' + this.dataset.id, {
          method: METHOD_PUT,
          headers: apiHeaders(),
          body: JSON.stringify({ name: newName.trim() })
        });
        await fetchCategories();
      }
    });

    div.querySelector('.del-cat-btn').addEventListener('click', async function() {
      if (confirm('确定删除该分类吗？')) {
        await apiWrite('/api/categories/' + this.dataset.id, {
          method: METHOD_DELETE,
          headers: apiHeaders()
        });
        await fetchCategories();
      }
    });

    categoryList.appendChild(div);
  });
}

function renderCategorySelects() {
  newCategorySelect.innerHTML = '<option value="">-- 请选择分类 --</option>';
  articleCategoryFilter.innerHTML = '<option value="">全部分类</option>';
  crawlSaveCategory.innerHTML = '<option value="">-- 选择分类 --</option>';
  lbFilter.innerHTML = '<option value="">全部文章</option>';

  categories.filter(c => !isCodeCategoryClient(c.id)).forEach(c => {
    const opt1 = document.createElement('option');
    opt1.value = c.id;
    opt1.textContent = c.name;
    newCategorySelect.appendChild(opt1);

    const optFilter = document.createElement('option');
    optFilter.value = c.id;
    optFilter.textContent = c.name;
    articleCategoryFilter.appendChild(optFilter);

    const opt2 = document.createElement('option');
    opt2.value = c.id;
    opt2.textContent = c.name;
    crawlSaveCategory.appendChild(opt2);

    const opt3 = document.createElement('option');
    opt3.value = c.id;
    opt3.textContent = c.name;
    lbFilter.appendChild(opt3);
  });
}

addCategoryBtn.addEventListener('click', async () => {
  const name = newCategoryName.value.trim();
  if (!name) {
    alert('请输入分类名称');
    return;
  }
  try {
    const res = await apiWrite('/api/categories', {
      method: 'POST',
      headers: apiHeaders(),
      body: JSON.stringify({ name })
    });
    if (res.ok) {
      newCategoryName.value = '';
      await fetchCategories();
    } else {
      const data = await res.json();
      alert(data.error || '添加失败');
    }
  } catch (e) {
    alert('网络错误');
  }
});

async function fetchArticleDetail(id) {
  try {
    const res = await fetch('/api/articles/' + id, { headers: apiHeaders() });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  } catch (e) {
    return null;
  }
}

async function fetchArticles() {
  const params = new URLSearchParams();
  params.set('brief', '1');
  const search = articleSearchInput.value.trim();
  const categoryId = articleCategoryFilter.value;
  const difficulty = articleDifficultyFilter.value;

  if (search) params.set('search', search);
  if (categoryId) params.set('category_id', categoryId);
  if (difficulty) params.set('difficulty', difficulty);

  const url = '/api/articles?' + params.toString();
  const res = await fetch(url, { headers: apiHeaders() });
  const list = await res.json();
  articles = (Array.isArray(list) ? list : []).filter(a => !isCodeArticleClient(a));
  renderArticles();
}

function renderArticles() {
  articleList.innerHTML = '';
  articleFilterSummary.textContent = '共 ' + articles.length + ' 篇文章';
  if (articles.length === 0) {
    articleEmpty.style.display = 'block';
    return;
  }
  articleEmpty.style.display = 'none';

  articles.forEach(a => {
    const div = document.createElement('div');
    div.className = 'article-item';
    const catTag = a.category_name ? '<span class="category-tag">' + escapeHtml(a.category_name) + '</span>' : '';
    const diffTag = a.difficulty ? '<span class="difficulty-badge diff-' + a.difficulty + '">' + (a.difficulty === 1 ? '简单' : a.difficulty === 2 ? '中等' : '困难') + '</span>' : '';
    const offlineBtn = a.is_offline
      ? '<button class="btn-secondary offline-toggle-btn active" data-id="' + a.id + '" data-offline="1">已离线</button>'
      : '<button class="btn-dark-utility offline-toggle-btn" data-id="' + a.id + '" data-offline="0">加入离线</button>';
    const preview = a.content_preview != null ? a.content_preview : (a.content ? a.content.slice(0, 60) : '');
    const charCount = a.content_length != null ? a.content_length : (a.content ? a.content.length : 0);
    div.innerHTML =
      '<div class="info">' +
        '<div class="title">' + escapeHtml(a.title) + catTag + diffTag + '</div>' +
        '<div class="preview">' + escapeHtml(preview) + '...（' + charCount + '字）</div>' +
      '</div>' +
      '<div class="btn-group" style="gap:8px">' +
        offlineBtn +
        '<button class="btn-secondary edit-btn" data-id="' + a.id + '">编辑</button>' +
        '<button class="btn-dark-utility delete-btn" data-id="' + a.id + '">删除</button>' +
      '</div>';
    div.querySelector('.offline-toggle-btn').addEventListener('click', async function() {
      const id = this.dataset.id;
      const newOffline = this.dataset.offline === '0' ? 1 : 0;
      try {
        const res = await apiWrite('/api/articles/' + id + '/offline', {
          method: METHOD_PUT,
          headers: apiHeaders(),
          body: JSON.stringify({ is_offline: newOffline })
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          alert(err.error || '操作失败');
          return;
        }
        if (newOffline === 1) {
          const article = articles.find(a => String(a.id) === String(id));
          let fullArticle = article && article.content ? article : null;
          if (!fullArticle) {
            fullArticle = await fetchArticleDetail(id);
          }
          if (fullArticle) await sendCacheArticleSW(fullArticle, 'global');
        } else {
          await sendDeleteCachedArticleSW(parseInt(id), 'global');
        }
        await fetchArticles();
      } catch (e) {
        alert('网络错误，操作失败');
      }
    });
    div.querySelector('.edit-btn').addEventListener('click', async function() {
      const id = this.dataset.id;
      const article = a.content ? a : await fetchArticleDetail(id);
      if (!article) {
        alert('文章详情加载失败');
        return;
      }
      openEditModal(article);
    });
    div.querySelector('.delete-btn').addEventListener('click', async function() {
      if (confirm('确定删除文章"' + a.title + '"吗？')) {
        await apiWrite('/api/articles/' + this.dataset.id, { method: METHOD_DELETE, headers: apiHeaders() });
        await fetchArticles();
        await fetchLeaderboard(currentFilter);
      }
    });
    articleList.appendChild(div);
  });
}

async function loadAllArticlesForOffline() {
  try {
    const [res, cached] = await Promise.all([
      fetch('/api/articles?brief=1').then(r => r.ok ? r.json() : []),
      getCachedArticlesFromSW()
    ]);
    allOfflineArticles = Array.isArray(res) ? res : [];
    offlineCachedIds = new Set(cached.filter(a => a.source === 'global').map(a => a.id));
    renderOfflineArticleList();
    updateOfflineStats();
  } catch (e) {
    allOfflineArticles = [];
    renderOfflineArticleList();
    updateOfflineStats();
  }
}

function updateOfflineStats() {
  const markedCount = allOfflineArticles.filter(a => a.is_offline).length;
  offlineMarkedCount.textContent = markedCount;
  offlineCachedCount.textContent = offlineCachedIds.size;
  const inconsistent = allOfflineArticles.some(a => a.is_offline && !offlineCachedIds.has(a.id));
  offlineSyncHint.style.display = inconsistent ? '' : 'none';
}

function renderOfflineArticleList() {
  const q = offlineSearch.value.trim().toLowerCase();
  const list = q
    ? allOfflineArticles.filter(a => {
        const text = (a.content_preview || a.content || '').toLowerCase();
        return (a.title || '').toLowerCase().includes(q) || text.includes(q);
      })
    : allOfflineArticles;

  offlineFilterSummary.textContent = '共 ' + list.length + ' 篇文章';
  offlineArticleList.innerHTML = '';
  offlineSelectAll.checked = false;
  offlineSelectedIds.clear();
  updateBatchBar();

  if (list.length === 0) {
    offlineArticleEmpty.style.display = 'block';
    offlineArticleEmpty.textContent = q ? '未找到匹配文章' : '暂无文章';
    return;
  }
  offlineArticleEmpty.style.display = 'none';

  list.forEach(a => {
    const div = document.createElement('div');
    div.className = 'article-item';
    const catTag = a.category_name ? '<span class="category-tag">' + escapeHtml(a.category_name) + '</span>' : '';
    const diffTag = a.difficulty ? '<span class="difficulty-badge diff-' + a.difficulty + '">' + (a.difficulty === 1 ? '简单' : a.difficulty === 2 ? '中等' : '困难') + '</span>' : '';
    const statusBadge = a.is_offline
      ? (offlineCachedIds.has(a.id) ? '<span class="offline-source-badge global">已离线·已缓存</span>' : '<span class="offline-mode-badge">已离线·未缓存</span>')
      : '';
    const toggleBtn = a.is_offline
      ? '<button class="btn-dark-utility offline-toggle-one" data-id="' + a.id + '">取消离线</button>'
      : '<button class="btn-secondary offline-toggle-one" data-id="' + a.id + '">加入离线</button>';
    const preview = a.content_preview != null ? a.content_preview : (a.content ? a.content.slice(0, 60) : '');
    const charCount = a.content_length != null ? a.content_length : (a.content ? a.content.length : 0);
    div.innerHTML =
      '<div class="info" style="display:flex;align-items:center;gap:10px">' +
        '<input type="checkbox" class="offline-item-check" data-id="' + a.id + '" data-offline="' + (a.is_offline ? 1 : 0) + '">' +
        '<div>' +
          '<div class="title">' + escapeHtml(a.title) + catTag + diffTag + statusBadge + '</div>' +
          '<div class="preview">' + escapeHtml(preview) + '...（' + charCount + '字）</div>' +
        '</div>' +
      '</div>' +
      '<div class="btn-group" style="gap:8px">' + toggleBtn + '</div>';
    div.querySelector('.offline-item-check').addEventListener('change', function() {
      const id = parseInt(this.dataset.id);
      if (this.checked) offlineSelectedIds.add(id); else offlineSelectedIds.delete(id);
      updateBatchBar();
    });
    div.querySelector('.offline-toggle-one').addEventListener('click', async function() {
      await toggleOfflineArticle(this.dataset.id);
    });
    offlineArticleList.appendChild(div);
  });
}

function updateBatchBar() {
  const selected = offlineSelectedIds.size;
  const selectedOffline = Array.from(offlineSelectedIds).filter(id => {
    const a = allOfflineArticles.find(x => x.id === id);
    return a && a.is_offline;
  }).length;
  const selectedNonOffline = selected - selectedOffline;
  offlineBatchAdd.disabled = selectedNonOffline === 0;
  offlineBatchRemove.disabled = selectedOffline === 0;
  offlineBatchCount.textContent = selected > 0 ? '已选 ' + selected + ' 篇' : '';
  const allCheckable = offlineArticleList.querySelectorAll('.offline-item-check');
  offlineSelectAll.checked = allCheckable.length > 0 && selected === allCheckable.length;
}

async function toggleOfflineArticle(id) {
  const article = allOfflineArticles.find(a => String(a.id) === String(id));
  if (!article) return;
  const newOffline = article.is_offline ? 0 : 1;
  try {
    const res = await apiWrite('/api/articles/' + id + '/offline', {
      method: METHOD_PUT, headers: apiHeaders(), body: JSON.stringify({ is_offline: newOffline })
    });
    if (!res.ok) { const err = await res.json().catch(() => ({})); alert(err.error || '操作失败'); return; }
    if (newOffline === 1) {
      const fullArticle = article.content ? article : await fetchArticleDetail(id);
      if (fullArticle) await sendCacheArticleSW(fullArticle, 'global');
    } else {
      await sendDeleteCachedArticleSW(parseInt(id), 'global');
    }
    const ctrl = await getSWController();
    if (ctrl) ctrl.postMessage({ type: 'SYNC_OFFLINE_ARTICLES' });
    await loadAllArticlesForOffline();
  } catch (e) {
    alert('网络错误，操作失败');
  }
}

async function batchAddOffline() {
  const ids = Array.from(offlineSelectedIds).filter(id => {
    const a = allOfflineArticles.find(x => x.id === id);
    return a && !a.is_offline;
  });
  if (ids.length === 0) return;
  if (!confirm('确定将 ' + ids.length + ' 篇文章加入离线吗？')) return;
  offlineBatchAdd.disabled = true;
  offlineBatchAdd.textContent = '处理中...';
  try {
    for (const id of ids) {
      const article = allOfflineArticles.find(a => a.id === id);
      await apiWrite('/api/articles/' + id + '/offline', {
        method: METHOD_PUT, headers: apiHeaders(), body: JSON.stringify({ is_offline: 1 })
      });
      const fullArticle = article && article.content ? article : await fetchArticleDetail(id);
      if (fullArticle) await sendCacheArticleSW(fullArticle, 'global');
    }
    const ctrl = await getSWController();
    if (ctrl) ctrl.postMessage({ type: 'SYNC_OFFLINE_ARTICLES' });
    await loadAllArticlesForOffline();
  } catch (e) {
    alert('部分操作失败，请刷新后重试');
  } finally {
    offlineBatchAdd.disabled = false;
    offlineBatchAdd.textContent = '批量加入离线';
  }
}

async function batchRemoveOffline() {
  const ids = Array.from(offlineSelectedIds).filter(id => {
    const a = allOfflineArticles.find(x => x.id === id);
    return a && a.is_offline;
  });
  if (ids.length === 0) return;
  if (!confirm('确定取消 ' + ids.length + ' 篇文章的离线标记吗？')) return;
  offlineBatchRemove.disabled = true;
  offlineBatchRemove.textContent = '处理中...';
  try {
    for (const id of ids) {
      await apiWrite('/api/articles/' + id + '/offline', {
        method: METHOD_PUT, headers: apiHeaders(), body: JSON.stringify({ is_offline: 0 })
      });
      await sendDeleteCachedArticleSW(id, 'global');
    }
    const ctrl = await getSWController();
    if (ctrl) ctrl.postMessage({ type: 'SYNC_OFFLINE_ARTICLES' });
    await loadAllArticlesForOffline();
  } catch (e) {
    alert('部分操作失败，请刷新后重试');
  } finally {
    offlineBatchRemove.disabled = false;
    offlineBatchRemove.textContent = '批量取消离线';
  }
}

async function syncOfflineCache() {
  const ctrl = await getSWController();
  if (!ctrl) { alert('Service Worker 未就绪'); return; }
  offlineSyncBtn.disabled = true;
  offlineSyncBtn.textContent = '同步中...';
  ctrl.postMessage({ type: 'SYNC_OFFLINE_ARTICLES' });
  setTimeout(async () => {
    await loadAllArticlesForOffline();
    offlineSyncBtn.disabled = false;
    offlineSyncBtn.textContent = '立即同步缓存';
  }, 1500);
}

offlineSyncBtn.addEventListener('click', syncOfflineCache);
offlineRefreshBtn.addEventListener('click', loadAllArticlesForOffline);
offlineBatchAdd.addEventListener('click', batchAddOffline);
offlineBatchRemove.addEventListener('click', batchRemoveOffline);
offlineSelectAll.addEventListener('change', function() {
  const checks = offlineArticleList.querySelectorAll('.offline-item-check');
  checks.forEach(c => {
    c.checked = this.checked;
    const id = parseInt(c.dataset.id);
    if (this.checked) offlineSelectedIds.add(id); else offlineSelectedIds.delete(id);
  });
  updateBatchBar();
});
let offlineSearchTimer = null;
offlineSearch.addEventListener('input', () => {
  if (offlineSearchTimer) clearTimeout(offlineSearchTimer);
  offlineSearchTimer = setTimeout(renderOfflineArticleList, 300);
});

let articleSearchTimer = null;
articleSearchInput.addEventListener('input', () => {
  if (articleSearchTimer) clearTimeout(articleSearchTimer);
  articleSearchTimer = setTimeout(fetchArticles, 300);
});

articleCategoryFilter.addEventListener('change', fetchArticles);
articleDifficultyFilter.addEventListener('change', fetchArticles);

articleFilterResetBtn.addEventListener('click', () => {
  articleSearchInput.value = '';
  articleCategoryFilter.value = '';
  articleDifficultyFilter.value = '';
  fetchArticles();
});

newCategorySelect.addEventListener('change', refreshNewEditorState);
editCategorySelect.addEventListener('change', refreshEditEditorState);
bindCodeTextarea(newContent, newContentCount);
bindCodeTextarea(editContent, editContentCount);
bindCodeTextarea(codeNewContent, codeNewCount);
updateCodeBlockEditor(codeNewContent, codeNewCount, true);

addArticleBtn.addEventListener('click', async () => {
  const title = newTitle.value.trim();
  const content = newContent.value.trim();
  const category_id = newCategorySelect.value;

  if (!title) {
    addMsg.textContent = '请输入标题';
    return;
  }
  if (!category_id) {
    addMsg.textContent = '请选择分类';
    return;
  }
  if (!content) {
    addMsg.textContent = '请输入正文内容';
    return;
  }

  try {
    const res = await apiWrite('/api/articles', {
      method: 'POST',
      headers: apiHeaders(),
      body: JSON.stringify({ title, content, category_id: parseInt(category_id), source: '手动添加' })
    });

    if (res.ok) {
      addMsg.textContent = '文章添加成功';
      newTitle.value = '';
      newContent.value = '';
      newCategorySelect.value = '';
      await fetchArticles();
    } else {
      const data = await res.json();
      addMsg.textContent = '添加失败：' + (data.error || '未知错误');
    }
  } catch (e) {
    addMsg.textContent = '网络错误';
  }
});

function openEditModal(article) {
  editingArticleId = article.id;
  editingArticleIsCode = isCodeArticleClient(article);
  editTitle.value = article.title;
  editContent.value = article.content;
  editArticleError.textContent = '';

  editCategorySelect.innerHTML = '<option value="">-- 请选择分类 --</option>';
  categories
    .filter(c => editingArticleIsCode ? isCodeCategoryClient(c.id) : !isCodeCategoryClient(c.id))
    .forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.name;
      if (c.id === article.category_id) opt.selected = true;
      editCategorySelect.appendChild(opt);
    });

  editDifficultySelect.value = article.difficulty || '0';

  refreshEditEditorState();
  editArticleModal.style.display = 'flex';
}

editArticleCancel.addEventListener('click', () => {
  editArticleModal.style.display = 'none';
  editingArticleId = null;
  editingArticleIsCode = false;
});

editArticleModal.addEventListener('click', (e) => {
  if (e.target === editArticleModal) {
    editArticleModal.style.display = 'none';
    editingArticleId = null;
    editingArticleIsCode = false;
  }
});

editArticleSave.addEventListener('click', async () => {
  const title = editTitle.value.trim();
  const content = editContent.value.trim();
  const category_id = editCategorySelect.value;
  const difficulty_override = parseInt(editDifficultySelect.value) || 0;
  const isCodeContent = selectedCategoryIsCode(editCategorySelect);

  if (!title) {
    editArticleError.textContent = '请输入标题';
    return;
  }
  if (!category_id) {
    editArticleError.textContent = '请选择分类';
    return;
  }
  if (!content) {
    editArticleError.textContent = '请输入正文内容';
    return;
  }
  if (isCodeContent) warnIfTab(editContent.value);

  try {
    const res = await apiWrite('/api/articles/' + editingArticleId, {
      method: METHOD_PUT,
      headers: { ...apiHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, content, category_id: parseInt(category_id), difficulty_override })
    });

    if (res.ok) {
      editArticleModal.style.display = 'none';
      editingArticleId = null;
      editingArticleIsCode = false;
      await fetchArticles();
      if (loadedSections.has('code-articles')) fetchCodeArticles();
    } else {
      const data = await res.json();
      editArticleError.textContent = data.error || '保存失败';
    }
  } catch (e) {
    editArticleError.textContent = '网络错误';
  }
});

async function fetchCodeArticles() {
  if (!codeLanguagesAll.length) {
    await fetchCodeLanguages().catch(() => {});
  }
  const res = await fetch('/api/articles?brief=1', { headers: apiHeaders() });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || '加载代码素材失败');
  }
  const list = await res.json();
  codeArticles = (Array.isArray(list) ? list : []).filter(a => isCodeArticleClient(a));
  renderCodeArticles();
}

function codeDifficultyText(difficulty) {
  return difficulty === 1 ? '简单' : difficulty === 2 ? '中等' : difficulty === 3 ? '困难' : '自动';
}

function codeStatusText(status) {
  return status === 'approved' ? '已上架' : status === 'pending' ? '已下架' : '已拒绝';
}

function renderCodeArticles() {
  if (!codeArticleList) return;
  codeArticleList.innerHTML = '';
  codeArticleSummary.textContent = '共 ' + codeArticles.length + ' 篇代码素材';
  if (codeArticles.length === 0) {
    codeArticleEmpty.style.display = 'block';
    codeArticleEmpty.innerHTML = codeCategoryIds.length
      ? '还没有代码素材，点上方新增 · <a href="#code-langs">去语言分类</a>'
      : '还没有代码语言分类，请先到「语言分类」勾选 · <a href="#code-langs">去语言分类</a>';
    return;
  }
  codeArticleEmpty.style.display = 'none';

  codeArticles.forEach(a => {
    const tr = document.createElement('tr');
    const statusClass = a.status === 'approved' ? 'is-approved' : (a.status === 'pending' ? 'is-pending' : '');
    const nextAction = a.status === 'approved' ? '下架' : '上架';
    tr.innerHTML =
      '<td>' + escapeHtml(a.title) + '</td>' +
      '<td>' + escapeHtml(a.category_name || '') + '</td>' +
      '<td>' + (a.content_length != null ? a.content_length : '?') + '</td>' +
      '<td>' + codeDifficultyText(a.difficulty) + '</td>' +
      '<td><span class="code-status ' + statusClass + '">' + codeStatusText(a.status) + '</span></td>' +
      '<td><div class="code-article-actions">' +
        '<button type="button" class="btn-secondary code-edit-btn" data-id="' + a.id + '">编辑</button>' +
        '<button type="button" class="btn-secondary code-toggle-btn" data-id="' + a.id + '">' + nextAction + '</button>' +
        '<button type="button" class="btn-dark-utility code-delete-btn" data-id="' + a.id + '">删除</button>' +
      '</div></td>';

    tr.querySelector('.code-edit-btn').addEventListener('click', async function() {
      const article = a.content ? a : await fetchArticleDetail(a.id);
      if (!article) {
        codeArticleMsg.textContent = '文章详情加载失败';
        return;
      }
      openEditModal(article);
    });
    tr.querySelector('.code-toggle-btn').addEventListener('click', function() {
      toggleCodeArticleStatus(a);
    });
    tr.querySelector('.code-delete-btn').addEventListener('click', function() {
      deleteCodeArticle(a);
    });
    codeArticleList.appendChild(tr);
  });
}

async function toggleCodeArticleStatus(article) {
  const next = article.status === 'approved' ? 'pending' : 'approved';
  const actionText = next === 'approved' ? '上架' : '下架';
  if (!confirm('确定' + actionText + '「' + article.title + '」吗？')) return;
  codeArticleMsg.textContent = '';
  try {
    const detail = await fetchArticleDetail(article.id);
    if (!detail) throw new Error('文章详情加载失败');
    const res = await apiWrite('/api/articles/' + article.id, {
      method: METHOD_PUT,
      headers: { ...apiHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: detail.title,
        content: detail.content,
        category_id: detail.category_id,
        difficulty_override: detail.difficulty,
        status: next
      })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || '操作失败');
    adminToast('已' + actionText, 'success');
    await fetchCodeArticles();
    if (loadedSections.has('articles')) fetchArticles();
  } catch (e) {
    codeArticleMsg.textContent = '操作失败：' + e.message;
  }
}

async function deleteCodeArticle(article) {
  if (!confirm('确定删除代码素材「' + article.title + '」吗？其成绩也会一并删除。')) return;
  codeArticleMsg.textContent = '';
  try {
    const res = await apiWrite('/api/articles/' + article.id, { method: METHOD_DELETE, headers: apiHeaders() });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || '删除失败');
    adminToast('已删除代码素材', 'success');
    await fetchCodeArticles();
    if (loadedSections.has('articles')) fetchArticles();
    if (loadedSections.has('code-lb')) fetchCodeLeaderboard();
  } catch (e) {
    codeArticleMsg.textContent = '删除失败：' + e.message;
  }
}

async function fetchCodeLeaderboard() {
  const res = await fetch('/api/leaderboard?category=code', { headers: apiHeaders() });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || '加载代码榜失败');
  }
  const data = await res.json();
  codeLbData = Array.isArray(data) ? data : [];
  renderCodeLeaderboard();
}

function codeSourceText(source) {
  if (source === 'race') return '比赛';
  if (source === 'race_guest') return '游客比赛';
  if (source === 'normal') return '练习';
  return source || '—';
}

function renderCodeLeaderboard() {
  if (!codeLbList) return;
  codeLbList.innerHTML = '';
  if (codeLbData.length === 0) {
    codeLbEmpty.style.display = 'block';
    return;
  }
  codeLbEmpty.style.display = 'none';
  codeLbData.forEach(r => {
    const tr = document.createElement('tr');
    const dateText = new Date(r.created_at).toLocaleString('zh-CN');
    tr.innerHTML =
      '<td>' + escapeHtml(r.nickname) + (r.user_id ? '' : ' <span class="guest-badge">游客</span>') + '</td>' +
      '<td>' + escapeHtml(r.article_title || '') + '</td>' +
      '<td>' + r.speed + ' 字/分</td>' +
      '<td>' + r.accuracy + '%</td>' +
      '<td>' + (r.time_seconds != null ? r.time_seconds + ' 秒' : '—') + '</td>' +
      '<td>' + codeSourceText(r.source) + '</td>' +
      '<td>' + escapeHtml(dateText) + '</td>' +
      '<td><button type="button" class="btn-dark-utility code-lb-delete" data-id="' + r.id + '">删除</button></td>';
    tr.querySelector('.code-lb-delete').addEventListener('click', async function() {
      if (!confirm('确定删除该代码榜记录吗？')) return;
      try {
        const res = await apiWrite('/api/leaderboard/' + r.id, { method: METHOD_DELETE, headers: apiHeaders() });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || '删除失败');
        adminToast('已删除记录', 'success');
        await fetchCodeLeaderboard();
        if (loadedSections.has('leaderboard')) fetchLeaderboard(currentFilter);
      } catch (e) {
        codeLbMsg.textContent = '删除失败：' + e.message;
      }
    });
    codeLbList.appendChild(tr);
  });
}

codeAddArticleBtn.addEventListener('click', async () => {
  const title = codeNewTitle.value.trim();
  const content = codeNewContent.value;
  const categoryId = codeNewCategorySelect.value;
  const difficulty = parseInt(codeNewDifficulty.value, 10);
  if (!title) { codeAddMsg.textContent = '请输入标题'; return; }
  if (!categoryId) { codeAddMsg.textContent = '请选择语言'; return; }
  if (!content.trim()) { codeAddMsg.textContent = '请输入正文内容'; return; }
  warnIfTab(content);
  codeAddMsg.textContent = '';
  try {
    const res = await apiWrite('/api/articles', {
      method: 'POST',
      headers: apiHeaders(),
      body: JSON.stringify({ title, content, category_id: parseInt(categoryId, 10), source: '代码素材' })
    });
    const created = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(created.error || '添加失败');
    if (Number.isInteger(difficulty) && difficulty >= 1 && difficulty <= 3) {
      const putRes = await apiWrite('/api/articles/' + created.id, {
        method: METHOD_PUT,
        headers: { ...apiHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, content, category_id: parseInt(categoryId, 10), difficulty_override: difficulty })
      });
      if (!putRes.ok) {
        const err = await putRes.json().catch(() => ({}));
        throw new Error('素材已创建，但难度设置失败：' + (err.error || '未知错误'));
      }
    }
    codeAddMsg.textContent = '代码素材添加成功';
    adminToast('已添加代码素材', 'success');
    codeNewTitle.value = '';
    codeNewContent.value = '';
    updateCodeBlockEditor(codeNewContent, codeNewCount, true);
    await fetchCodeArticles();
  } catch (e) {
    codeAddMsg.textContent = '添加失败：' + e.message;
  }
});

// 模式切换：URL直抓 / 关键词检索
function switchCrawlMode(mode) {
  if (mode === 'search') {
    crawlUrlPanel.style.display = 'none';
    crawlSearchPanel.style.display = 'block';
    crawlModeUrlBtn.classList.remove('active');
    crawlModeSearchBtn.classList.add('active');
    crawlModeUrlBtn.classList.remove('btn-primary');
    crawlModeUrlBtn.classList.add('btn-secondary');
    crawlModeSearchBtn.classList.remove('btn-secondary');
    crawlModeSearchBtn.classList.add('btn-primary');
  } else {
    crawlUrlPanel.style.display = 'block';
    crawlSearchPanel.style.display = 'none';
    crawlModeUrlBtn.classList.add('active');
    crawlModeSearchBtn.classList.remove('active');
    crawlModeUrlBtn.classList.add('btn-primary');
    crawlModeUrlBtn.classList.remove('btn-secondary');
    crawlModeSearchBtn.classList.add('btn-secondary');
    crawlModeSearchBtn.classList.remove('btn-primary');
  }
}
crawlModeUrlBtn.addEventListener('click', () => switchCrawlMode('url'));
crawlModeSearchBtn.addEventListener('click', () => switchCrawlMode('search'));

// 从 URL 抓取（搜索结果点击或 URL 直抓共用）
async function fetchArticleByUrl(targetUrl) {
  crawlSaveMsg.textContent = '抓取中，请稍候...';
  crawlSaveMsg.style.color = 'var(--text-muted, #888)';
  try {
    const res = await apiWrite('/api/crawl', {
      method: 'POST',
      headers: apiHeaders(),
      body: JSON.stringify({ url: targetUrl })
    });
    const data = await res.json();
    if (data.error) {
      crawlSaveMsg.textContent = '抓取失败：' + data.error;
      crawlSaveMsg.style.color = 'var(--semantic-error)';
      return false;
    }
    crawlEditTitle.value = data.title || '';
    crawlEditContent.value = data.content || '';
    crawlSourceUrl = data._source_url || targetUrl;
    crawlSaveCategory.value = '';
    crawlPreview.style.display = 'block';
    crawlSaveMsg.textContent = data.warning ? ('⚠ ' + data.warning) : '';
    crawlSaveMsg.style.color = data.warning ? 'var(--semantic-warning, #e67e22)' : '';
    crawlPreview.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    return true;
  } catch (e) {
    crawlSaveMsg.textContent = '请求失败，请检查Python环境';
    crawlSaveMsg.style.color = 'var(--semantic-error)';
    return false;
  }
}

// 关键词搜索
crawlSearchBtn.addEventListener('click', async () => {
  const kw = crawlKeyword.value.trim();
  if (!kw) {
    crawlSearchResults.innerHTML = '<p class="note" style="color:var(--semantic-error)">请输入关键词</p>';
    return;
  }
  crawlSearchBtn.disabled = true;
  crawlSearchBtn.textContent = '搜索中...';
  crawlSearchResults.innerHTML = '<p class="note">正在检索互联网文章...</p>';

  try {
    const res = await apiWrite('/api/crawl/search', {
      method: 'POST',
      headers: apiHeaders(),
      body: JSON.stringify({ keyword: kw })
    });
    const data = await res.json();
    if (data.error) {
      crawlSearchResults.innerHTML = '<p class="note" style="color:var(--semantic-error)">搜索失败：' + escapeHtml(data.error) + '</p>';
      return;
    }
    const results = data.results || [];
    if (results.length === 0) {
      crawlSearchResults.innerHTML = '<p class="note">未找到相关文章，请尝试其他关键词</p>';
      return;
    }
    const modeLabel = data.mode === 'AND' ? '（AND 精确匹配）' : (data.mode === 'OR' ? '（OR 模糊匹配）' : '');
    crawlSearchResults.innerHTML = '<p class="note" style="margin-bottom:8px">找到 ' + results.length + ' 篇相关文章' + modeLabel + '，点击"抓取"按钮抓取对应文章：</p>';
    const list = document.createElement('div');
    list.className = 'crawl-search-list';
    results.forEach(item => {
      const card = document.createElement('div');
      card.className = 'crawl-search-item';
      const main = document.createElement('div');
      main.className = 'crawl-search-item-main';
      const title = document.createElement('div');
      title.className = 'crawl-search-item-title';
      title.textContent = item.title || '(无标题)';
      const url = document.createElement('div');
      url.className = 'crawl-search-item-url';
      const urlIcon = document.createElement('span');
      urlIcon.className = 'url-icon';
      urlIcon.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>';
      const urlText = document.createElement('span');
      urlText.className = 'url-text';
      urlText.textContent = item.url;
      url.appendChild(urlIcon);
      url.appendChild(urlText);
      const snippet = document.createElement('div');
      snippet.className = 'crawl-search-item-snippet';
      snippet.textContent = item.snippet || '';
      const btn = document.createElement('button');
      btn.className = 'btn-secondary crawl-search-item-btn';
      btn.textContent = '抓取';
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        btn.textContent = '抓取中...';
        const ok = await fetchArticleByUrl(item.url);
        btn.disabled = false;
        btn.textContent = '抓取';
        if (ok) {
          crawlUrl.value = item.url;
          switchCrawlMode('url');
        }
      });
      main.appendChild(title);
      main.appendChild(url);
      if (item.snippet) main.appendChild(snippet);
      card.appendChild(main);
      card.appendChild(btn);
      list.appendChild(card);
    });
    crawlSearchResults.appendChild(list);
  } catch (e) {
    crawlSearchResults.innerHTML = '<p class="note" style="color:var(--semantic-error)">网络错误</p>';
  } finally {
    crawlSearchBtn.disabled = false;
    crawlSearchBtn.textContent = '搜索';
  }
});

crawlKeyword.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    crawlSearchBtn.click();
  }
});

crawlBtn.addEventListener('click', async () => {
  const url = crawlUrl.value.trim();

  if (!url) {
    crawlSaveMsg.textContent = '请输入URL';
    crawlSaveMsg.style.color = 'var(--semantic-error)';
    setTimeout(() => crawlSaveMsg.textContent = '', 3000);
    return;
  }
  if (!/^https?:\/\//i.test(url)) {
    crawlSaveMsg.textContent = 'URL必须以http://或https://开头';
    crawlSaveMsg.style.color = 'var(--semantic-error)';
    setTimeout(() => crawlSaveMsg.textContent = '', 3000);
    return;
  }

  crawlBtn.disabled = true;
  crawlBtn.textContent = '抓取中...';
  await fetchArticleByUrl(url);
  crawlBtn.disabled = false;
  crawlBtn.textContent = '抓取预览';
});

crawlSaveBtn.addEventListener('click', async () => {
  const title = crawlEditTitle.value.trim();
  const content = crawlEditContent.value.trim();
  const category_id = crawlSaveCategory.value;

  if (!title) {
    crawlSaveMsg.textContent = '标题不能为空';
    crawlSaveMsg.style.color = 'var(--semantic-error)';
    setTimeout(() => crawlSaveMsg.textContent = '', 3000);
    return;
  }
  if (!content) {
    crawlSaveMsg.textContent = '内容不能为空';
    crawlSaveMsg.style.color = 'var(--semantic-error)';
    setTimeout(() => crawlSaveMsg.textContent = '', 3000);
    return;
  }
  if (!category_id) {
    crawlSaveMsg.textContent = '请选择分类';
    crawlSaveMsg.style.color = 'var(--semantic-error)';
    setTimeout(() => crawlSaveMsg.textContent = '', 3000);
    return;
  }

  crawlSaveBtn.disabled = true;
  crawlSaveBtn.textContent = '保存中...';

  try {
    const res = await apiWrite('/api/crawl/save', {
      method: 'POST',
      headers: apiHeaders(),
      body: JSON.stringify({
        title,
        content,
        category_id: parseInt(category_id),
        source: crawlSourceUrl
      })
    });

    const data = await res.json();

    if (res.ok) {
      crawlSaveMsg.textContent = '入库成功！';
      crawlSaveMsg.style.color = 'var(--semantic-success)';
      crawlPreview.style.display = 'none';
      crawlUrl.value = '';
      crawlEditTitle.value = '';
      crawlEditContent.value = '';
      crawlSaveCategory.value = '';
      crawlSourceUrl = '';
      await fetchArticles();
      await loadDashboard();
      setTimeout(() => crawlSaveMsg.textContent = '', 3000);
    } else {
      crawlSaveMsg.textContent = '入库失败：' + (data.error || '未知错误');
      crawlSaveMsg.style.color = 'var(--semantic-error)';
    }
  } catch (e) {
    crawlSaveMsg.textContent = '网络错误';
    crawlSaveMsg.style.color = 'var(--semantic-error)';
  } finally {
    crawlSaveBtn.disabled = false;
    crawlSaveBtn.textContent = '确认入库';
  }
});

crawlCancelBtn.addEventListener('click', () => {
  crawlPreview.style.display = 'none';
  crawlEditTitle.value = '';
  crawlEditContent.value = '';
  crawlSaveCategory.value = '';
  crawlSaveMsg.textContent = '';
});

crawlPreviewClose.addEventListener('click', () => {
  crawlPreview.style.display = 'none';
  crawlSaveMsg.textContent = '';
});

lbFilter.addEventListener('change', () => {
  currentFilter = lbFilter.value;
  fetchLeaderboard(currentFilter);
});

async function fetchLeaderboard(articleId) {
  const url = articleId ? '/api/leaderboard?article_id=' + articleId : '/api/leaderboard';
  const res = await fetch(url);
  leaderboardData = await res.json();
  renderLeaderboardManage();
}

function renderLeaderboardManage() {
  lbManageList.innerHTML = '';
  if (leaderboardData.length === 0) {
    lbManageEmpty.style.display = 'block';
    lbManageEmpty.textContent = '暂无记录';
    return;
  }
  lbManageEmpty.style.display = 'none';

  leaderboardData.forEach((r) => {
    const div = document.createElement('div');
    div.className = 'lb-item';
    const dateStr = new Date(r.created_at).toLocaleDateString('zh-CN');
    const guestBadge = r.user_id ? '' : '<span class="guest-badge">游客</span>';
    div.innerHTML =
      '<div class="info">' +
        '<span class="nickname">' + escapeHtml(r.nickname) + guestBadge + '</span>' +
        '<span class="speed-val">' + r.speed + ' 字/分</span>' +
        '<span class="acc-val">' + r.accuracy + '%</span>' +
        '<span>' + escapeHtml(r.article_title || '') + '</span>' +
        '<span class="date-val">' + dateStr + '</span>' +
      '</div>' +
      '<button class="btn-dark-utility" data-id="' + r.id + '">删除</button>';

    div.querySelector('button').addEventListener('click', async function() {
      if (confirm('确定删除该记录吗？')) {
        await apiWrite('/api/leaderboard/' + this.dataset.id, { method: METHOD_DELETE, headers: apiHeaders() });
        await fetchLeaderboard(currentFilter);
      }
    });
    lbManageList.appendChild(div);
  });
}

function openConfirmModal(message, okText, action) {
  confirmMsg.textContent = message;
  confirmOk.textContent = okText || '确认';
  confirmAction = action;
  confirmModal.style.display = 'flex';
}

clearLbBtn.addEventListener('click', () => {
  openConfirmModal('确定要清空整个排行榜吗？此操作不可恢复！', '确认清空', async () => {
    await apiWrite('/api/leaderboard', { method: METHOD_DELETE, headers: apiHeaders() });
    await fetchLeaderboard(currentFilter);
    if (loadedSections.has('code-lb')) fetchCodeLeaderboard();
    adminToast('排行榜已清空', 'success');
  });
});

document.getElementById('code-lb-refresh').addEventListener('click', () => {
  fetchCodeLeaderboard().catch(e => { codeLbMsg.textContent = '加载失败：' + e.message; });
});

document.getElementById('clear-code-lb-btn').addEventListener('click', () => {
  openConfirmModal('只清空代码榜，不影响总榜。确定吗？', '确认清空代码榜', async () => {
    const res = await apiWrite('/api/leaderboard?category=code', { method: METHOD_DELETE, headers: apiHeaders() });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || '清空失败');
    await fetchCodeLeaderboard();
    if (loadedSections.has('leaderboard')) fetchLeaderboard(currentFilter);
    adminToast('代码榜已清空', 'success');
  });
});

confirmCancel.addEventListener('click', () => {
  confirmAction = null;
  confirmModal.style.display = 'none';
});

confirmOk.addEventListener('click', async () => {
  const action = confirmAction;
  if (!action) {
    confirmModal.style.display = 'none';
    return;
  }
  confirmOk.disabled = true;
  try {
    await action();
    confirmModal.style.display = 'none';
  } catch (e) {
    adminToast(e.message || '操作失败', 'error');
  } finally {
    confirmOk.disabled = false;
    confirmAction = null;
    confirmModal.style.display = 'none';
  }
});

function escapeHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function adminToast(message, type) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const el = document.createElement('div');
  el.className = 'toast toast-' + (type || 'info');
  const icon = document.createElement('span');
  icon.className = 'toast-icon';
  icon.textContent = type === 'success' ? '✓' : (type === 'error' ? '!' : 'i');
  const text = document.createElement('span');
  text.textContent = message;
  const progress = document.createElement('span');
  progress.className = 'toast-progress';
  el.appendChild(icon);
  el.appendChild(text);
  el.appendChild(progress);
  container.appendChild(el);
  setTimeout(function () {
    el.classList.add('toast-exit');
    setTimeout(function () { el.remove(); }, 260);
  }, 3000);
}

function updateCodeBlockEditor(textarea, counter, isCode) {
  if (!textarea) return;
  textarea.classList.toggle('code-block-input', !!isCode);
  textarea.wrap = isCode ? 'off' : 'soft';
  if (counter) {
    counter.style.display = isCode ? 'block' : 'none';
    counter.textContent = textarea.value.length + ' 字符';
  }
}

function bindCodeTextarea(textarea, counter) {
  if (!textarea) return;
  textarea.addEventListener('input', function () {
    if (counter && textarea.classList.contains('code-block-input')) {
      counter.textContent = textarea.value.length + ' 字符';
    }
  });
  textarea.addEventListener('keydown', function (e) {
    if (e.key !== 'Tab' || !textarea.classList.contains('code-block-input')) return;
    e.preventDefault();
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    textarea.value = textarea.value.slice(0, start) + '  ' + textarea.value.slice(end);
    textarea.selectionStart = textarea.selectionEnd = start + 2;
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function selectedCategoryIsCode(select) {
  const opt = select && select.selectedOptions && select.selectedOptions[0];
  return !!(opt && opt.value && isCodeCategoryClient(opt.value));
}

function refreshNewEditorState() {
  updateCodeBlockEditor(newContent, newContentCount, selectedCategoryIsCode(newCategorySelect));
}

function refreshEditEditorState() {
  updateCodeBlockEditor(editContent, editContentCount, selectedCategoryIsCode(editCategorySelect));
  if (editCategoryLabel) editCategoryLabel.textContent = editingArticleIsCode ? '语言' : '分类';
}

function warnIfTab(content) {
  if (content.indexOf('\t') >= 0) {
    adminToast('代码素材请用 2 个空格缩进，不要用 Tab', 'warning');
  }
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

let raceRoomsCache = [];
let raceMembersCode = null;
let raceSettingsCache = { maxRooms: 20, enabled: true, maxTotalPlayers: 200, maxDurationMinutes: 180 };

function setRaceListMsg(text, isError) {
  const el = document.getElementById('race-list-msg');
  if (!el) return;
  el.textContent = text || '';
  el.style.color = isError ? 'var(--semantic-error)' : '';
}

function setRaceSettingsMsg(text, isError) {
  const el = document.getElementById('race-settings-msg');
  if (!el) return;
  el.textContent = text || '';
  el.style.color = isError ? 'var(--semantic-error)' : 'var(--semantic-success)';
}

function formatRaceTime(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}

function raceStatusText(status) {
  return ({ waiting: '等待中', countdown: '倒计时', racing: '比赛中', finished: '已结束', cancelled: '已取消' }[status] || status || '—');
}

function renderRaceSummary() {
  const totalPlayers = raceRoomsCache.reduce((sum, r) => sum + (r.playerCount || 0), 0);
  const maxPlayers = raceRoomsCache.reduce((max, r) => Math.max(max, r.playerCount || 0), 0);
  const totalSeats = raceRoomsCache.reduce((sum, r) => sum + (r.maxPlayers || 0), 0);
  const set = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };
  set('race-stat-rooms', raceRoomsCache.length);
  set('race-stat-players', totalPlayers);
  set('race-stat-max-players', maxPlayers);
  set('race-stat-limit', raceSettingsCache.maxRooms);
  set('race-stat-seats', totalSeats + ' / ' + (raceSettingsCache.maxTotalPlayers || 200));
}

function renderRaceRooms() {
  const tbody = document.getElementById('race-list-body');
  const empty = document.getElementById('race-empty');
  const wrap = document.getElementById('race-list-wrap');
  if (!tbody || !empty || !wrap) return;
  tbody.innerHTML = '';
  if (!raceRoomsCache.length) {
    empty.style.display = 'block';
    wrap.style.display = 'none';
    hideRaceMembers();
    return;
  }
  empty.style.display = 'none';
  wrap.style.display = 'block';
  raceRoomsCache.forEach(room => {
    const tr = document.createElement('tr');
    tr.innerHTML =
      '<td>' + escapeHtml(room.code) + '</td>' +
      '<td>' + escapeHtml(room.hostNickname) + '</td>' +
      '<td title="' + escapeHtml(room.articleTitle) + '">' + escapeHtml(room.articleTitle) + '</td>' +
      '<td>' + (room.playerCount || 0) + '/' + (room.maxPlayers || 0) + '</td>' +
      '<td>' + escapeHtml(raceStatusText(room.status)) + '</td>' +
      '<td>' + (room.isPublic ? '公开' : '私人') + '</td>' +
      '<td>' + escapeHtml(formatRaceTime(room.createdAt)) + '</td>' +
      '<td><div class="race-admin-actions"></div></td>';
    const actions = tr.querySelector('.race-admin-actions');
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn-secondary';
    cancelBtn.textContent = '解散';
    cancelBtn.onclick = function () { cancelRaceRoom(room.code); };
    const membersBtn = document.createElement('button');
    membersBtn.className = 'btn-secondary';
    membersBtn.textContent = '成员';
    membersBtn.onclick = function () { renderRaceMembers(room.code); };
    actions.appendChild(cancelBtn);
    actions.appendChild(membersBtn);
    tbody.appendChild(tr);
  });
}

async function loadRaceRooms() {
  setRaceListMsg('正在加载…', false);
  await loadRaceSettings();
  try {
    const res = await fetch('/api/admin/races', { headers: apiHeaders() });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error((data && data.error) || ('HTTP ' + res.status));
    if (!Array.isArray(data)) throw new Error('比赛房间数据格式异常');
    // 管理界面只展示进行中的房间；已结束/已取消的房间留在库里供追溯，不占界面
    raceRoomsCache = data.filter(r => r.status === 'waiting' || r.status === 'countdown' || r.status === 'racing');
    setRaceListMsg('', false);
    renderRaceSummary();
    renderRaceRooms();
    if (raceMembersCode) renderRaceMembers(raceMembersCode);
  } catch (e) {
    raceRoomsCache = [];
    const tbody = document.getElementById('race-list-body');
    const empty = document.getElementById('race-empty');
    const wrap = document.getElementById('race-list-wrap');
    if (tbody) tbody.innerHTML = '';
    if (empty) empty.style.display = 'none';
    if (wrap) wrap.style.display = 'none';
    hideRaceMembers();
    ['race-stat-rooms', 'race-stat-players', 'race-stat-max-players', 'race-stat-limit', 'race-stat-seats'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = '—';
    });
    setRaceListMsg('加载比赛房间失败：' + e.message, true);
  }
}

function renderRacePoolHint(pool) {
  const hint = document.getElementById('race-pool-hint');
  if (!hint) return;
  if (!pool) {
    hint.textContent = '';
    return;
  }
  const normal = Number(pool.normal) || 0;
  const code = Number(pool.code) || 0;
  if (normal + code === 0) {
    hint.textContent = '当前范围内没有可匹配的文章，匹配会直接提示“暂无可用文章”';
    hint.style.color = 'var(--semantic-warning)';
  } else {
    hint.textContent = '当前范围内：普通文章 ' + normal + ' 篇 / 代码素材 ' + code + ' 篇';
    hint.style.color = 'var(--muted)';
  }
}

async function loadRaceSettings() {
  try {
    const res = await fetch('/api/admin/race-settings', { headers: apiHeaders() });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error((data && data.error) || ('HTTP ' + res.status));
    raceSettingsCache = { maxRooms: data.maxRooms, enabled: data.enabled !== false, maxTotalPlayers: data.maxTotalPlayers || 200, maxDurationMinutes: data.maxDurationMinutes || 180, articleMinLen: data.articleMinLen || 100, articleMaxLen: data.articleMaxLen || 800 };
    const input = document.getElementById('race-max-rooms');
    const totalInput = document.getElementById('race-max-total');
    const durationInput = document.getElementById('race-max-duration');
    const minInput = document.getElementById('race-article-min-len');
    const maxInput = document.getElementById('race-article-max-len');
    const check = document.getElementById('race-enabled');
    if (input) input.value = raceSettingsCache.maxRooms;
    if (totalInput) totalInput.value = raceSettingsCache.maxTotalPlayers;
    if (durationInput) durationInput.value = raceSettingsCache.maxDurationMinutes;
    if (minInput) minInput.value = raceSettingsCache.articleMinLen;
    if (maxInput) maxInput.value = raceSettingsCache.articleMaxLen;
    if (check) check.checked = raceSettingsCache.enabled;
    renderRacePoolHint(data.pool);
    setRaceSettingsMsg('', false);
  } catch (e) {
    setRaceSettingsMsg('读取比赛设置失败：' + e.message, true);
  }
}

async function saveRaceSettings() {
  const input = document.getElementById('race-max-rooms');
  const totalInput = document.getElementById('race-max-total');
  const durationInput = document.getElementById('race-max-duration');
  const minInput = document.getElementById('race-article-min-len');
  const maxInput = document.getElementById('race-article-max-len');
  const check = document.getElementById('race-enabled');
  const maxRooms = Number(input && input.value);
  const maxTotalPlayers = Number(totalInput && totalInput.value);
  const maxDurationMinutes = Number(durationInput && durationInput.value);
  const articleMinLen = Number(minInput && minInput.value);
  const articleMaxLen = Number(maxInput && maxInput.value);
  if (!Number.isInteger(maxRooms) || maxRooms < 1 || maxRooms > 50) {
    setRaceSettingsMsg('房间数上限必须在 1 到 50 之间', true);
    return;
  }
  if (!Number.isInteger(maxTotalPlayers) || maxTotalPlayers < 1 || maxTotalPlayers > 500) {
    setRaceSettingsMsg('总席位上限必须在 1 到 500 之间', true);
    return;
  }
  if (!Number.isInteger(maxDurationMinutes) || maxDurationMinutes < 1 || maxDurationMinutes > 180) {
    setRaceSettingsMsg('房间最长时长必须在 1 到 180 分钟之间', true);
    return;
  }
  if (!Number.isInteger(articleMinLen) || articleMinLen < 20 || articleMinLen > 2000) {
    setRaceSettingsMsg('文章最短字数必须在 20 到 2000 之间', true);
    return;
  }
  if (!Number.isInteger(articleMaxLen) || articleMaxLen < 20 || articleMaxLen > 2000) {
    setRaceSettingsMsg('文章最长字数必须在 20 到 2000 之间', true);
    return;
  }
  if (articleMinLen >= articleMaxLen) {
    setRaceSettingsMsg('最短字数必须小于最长字数', true);
    return;
  }
  try {
    const res = await apiWrite('/api/admin/race-settings', {
      method: METHOD_PUT, headers: apiHeaders(),
      body: JSON.stringify({ maxRooms: maxRooms, enabled: !!(check && check.checked), maxTotalPlayers: maxTotalPlayers, maxDurationMinutes: maxDurationMinutes, articleMinLen: articleMinLen, articleMaxLen: articleMaxLen })
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error((data && data.error) || ('HTTP ' + res.status));
    raceSettingsCache = { maxRooms: data.maxRooms, enabled: data.enabled !== false, maxTotalPlayers: data.maxTotalPlayers || 200, maxDurationMinutes: data.maxDurationMinutes || 180, articleMinLen: data.articleMinLen || 100, articleMaxLen: data.articleMaxLen || 800 };
    if (input) input.value = raceSettingsCache.maxRooms;
    if (totalInput) totalInput.value = raceSettingsCache.maxTotalPlayers;
    if (durationInput) durationInput.value = raceSettingsCache.maxDurationMinutes;
    if (minInput) minInput.value = raceSettingsCache.articleMinLen;
    if (maxInput) maxInput.value = raceSettingsCache.articleMaxLen;
    if (check) check.checked = raceSettingsCache.enabled;
    renderRacePoolHint(data.pool);
    renderRaceSummary();
    setRaceSettingsMsg('设置已保存', false);
  } catch (e) {
    setRaceSettingsMsg('保存失败：' + e.message, true);
  }
}

async function cancelRaceRoom(code) {
  if (!confirm('确定解散房间 ' + code + '？房间内所有参与者会被移出。')) return;
  try {
    const res = await apiWrite('/api/admin/races/' + encodeURIComponent(code) + '/cancel', { method: 'POST', headers: apiHeaders() });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error((data && data.error) || ('HTTP ' + res.status));
    await loadRaceRooms();
    setRaceListMsg('已解散房间 ' + code, false);
  } catch (e) {
    setRaceListMsg('解散失败：' + e.message, true);
  }
}

function hideRaceMembers() {
  raceMembersCode = null;
  const panel = document.getElementById('race-members-panel');
  if (panel) panel.style.display = 'none';
  const body = document.getElementById('race-members-body');
  if (body) body.innerHTML = '';
  const msg = document.getElementById('race-members-msg');
  if (msg) msg.textContent = '';
}

function renderRaceMembers(code) {
  const room = raceRoomsCache.find(r => r.code === code);
  const panel = document.getElementById('race-members-panel');
  const title = document.getElementById('race-members-title');
  const body = document.getElementById('race-members-body');
  const msg = document.getElementById('race-members-msg');
  if (!room || !panel || !title || !body) { hideRaceMembers(); return; }
  raceMembersCode = code;
  panel.style.display = 'block';
  title.textContent = '房间 ' + code + ' 成员（' + room.players.length + ' 人）';
  if (msg) msg.textContent = '';
  body.innerHTML = '';
  if (!room.players.length) {
    body.innerHTML = '<div class="race-admin-empty">该房间还没有成员</div>';
    return;
  }
  room.players.forEach(p => {
    const isHost = p.userId !== null && p.userId !== undefined && p.userId === room.hostUserId;
    const row = document.createElement('div');
    row.className = 'race-admin-member-row';
    row.innerHTML =
      '<span class="race-admin-member-name">' + escapeHtml(p.nickname) + '</span>' +
      (isHost ? '<span class="race-admin-member-tag">房主</span>' : '') +
      (p.isGuest ? '<span class="race-admin-member-tag">游客</span>' : '') +
      '<span class="race-admin-member-meta">' + (p.ready ? '已准备' : '未准备') + '</span>' +
      '<span class="race-admin-member-meta">进度 ' + (p.progress || 0) + '/' + (room.charCount || 0) + '</span>' +
      '<span class="race-admin-member-meta">' + (p.rank ? '第 ' + p.rank + ' 名' : '') + '</span>';
    const kickBtn = document.createElement('button');
    kickBtn.className = 'btn-secondary';
    kickBtn.textContent = '踢出';
    kickBtn.onclick = function () { kickRaceMember(room.code, p); };
    row.appendChild(kickBtn);
    body.appendChild(row);
  });
}

async function kickRaceMember(code, player) {
  if (!confirm('把 ' + player.nickname + ' 移出房间？')) return;
  const payload = player.isGuest ? { guestId: player.guestId } : { userId: player.userId };
  try {
    const res = await apiWrite('/api/admin/races/' + encodeURIComponent(code) + '/kick', {
      method: 'POST', headers: apiHeaders(), body: JSON.stringify(payload)
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error((data && data.error) || ('HTTP ' + res.status));
    await loadRaceRooms();
    renderRaceMembers(code);
    const msg = document.getElementById('race-members-msg');
    if (msg) msg.textContent = '已踢出 ' + player.nickname;
  } catch (e) {
    const msg = document.getElementById('race-members-msg');
    if (msg) { msg.textContent = '踢出失败：' + e.message; msg.style.color = 'var(--semantic-error)'; }
  }
}

const raceSettingsSaveBtn = document.getElementById('race-settings-save');
if (raceSettingsSaveBtn) raceSettingsSaveBtn.addEventListener('click', saveRaceSettings);
const raceMembersCloseBtn = document.getElementById('race-members-close');
if (raceMembersCloseBtn) raceMembersCloseBtn.addEventListener('click', hideRaceMembers);

function formatBackupBytes(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  return (n / 1024 / 1024).toFixed(2) + ' MB';
}
function setBackupNote(el, text, isError) {
  if (!el) return;
  el.textContent = text || '';
  el.style.color = isError ? 'var(--semantic-error)' : '';
}
async function backupRequest(url, options) {
  const res = await apiWrite(url, options || {});
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error((data && data.error) || ('HTTP ' + res.status));
  return data;
}
function renderBackupList() {
  if (!backupListBody) return;
  backupTableWrap.style.display = backupList.length ? 'block' : 'none';
  backupEmpty.style.display = backupList.length ? 'none' : 'block';
  backupListBody.innerHTML = '';
  backupList.forEach(function (item) {
    const tr = document.createElement('tr');
    tr.innerHTML =
      '<td data-label="文件名"><span class="backup-file-name">' + escapeHtml(item.name) + '</span>' +
        (item.preRestore ? ' <span class="race-admin-member-tag">pre-restore</span>' : '') + '</td>' +
      '<td data-label="创建时间">' + escapeHtml(item.createdAt) + '</td>' +
      '<td data-label="大小">' + formatBackupBytes(item.bytes) + '</td>' +
      '<td data-label="版本">' + escapeHtml(item.version || '—') + '</td>' +
      '<td data-label="含配置">' + (item.includesDbConfig ? '是' : '否') + (item.includesAvatars ? '（含头像）' : '') + '</td>' +
      '<td data-label="操作"><div class="backup-actions">' +
        '<button class="btn-secondary" data-backup-action="download" data-name="' + escapeHtml(item.name) + '">下载</button>' +
        '<button class="btn-secondary" data-backup-action="restore" data-name="' + escapeHtml(item.name) + '">恢复</button>' +
        '<button class="btn-secondary" data-backup-action="delete" data-name="' + escapeHtml(item.name) + '">删除</button>' +
      '</div></td>';
    backupListBody.appendChild(tr);
  });
}
async function loadBackups() {
  try {
    setBackupNote(backupListMsg, '');
    const data = await backupRequest('/api/admin/backup/list', { headers: apiHeaders() });
    backupList = Array.isArray(data.backups) ? data.backups : [];
    renderBackupList();
    if (data.pendingRestore) {
      backupPendingText.textContent = '已排队 1 份恢复，重启服务后生效';
      backupPendingBanner.style.display = 'flex';
    } else {
      backupPendingBanner.style.display = 'none';
    }
  } catch (e) {
    console.error('读取备份列表失败', e);
    setBackupNote(backupListMsg, '读取备份列表失败：' + e.message, true);
  }
}
async function createBackup() {
  if (backupBusy) return;
  backupBusy = true;
  const oldText = backupCreateBtn.textContent;
  backupCreateBtn.disabled = true;
  backupCreateBtn.textContent = '备份中…';
  setBackupNote(backupCreateMsg, '正在生成一致性快照并打包…');
  try {
    const meta = await backupRequest('/api/admin/backup/create', {
      method: 'POST', headers: apiHeaders(),
      body: JSON.stringify({
        includeDbConfig: !!(backupIncludeConfig && backupIncludeConfig.checked),
        includeAvatars: !!(backupIncludeAvatars && backupIncludeAvatars.checked)
      })
    });
    setBackupNote(backupCreateMsg, '已生成 ' + meta.name + '（' + formatBackupBytes(meta.bytes) + '）');
    await loadBackups();
  } catch (e) {
    setBackupNote(backupCreateMsg, '备份失败：' + e.message, true);
  } finally {
    backupBusy = false;
    backupCreateBtn.disabled = false;
    backupCreateBtn.textContent = oldText;
  }
}
async function downloadBackup(name) {
  setBackupNote(backupListMsg, '正在下载 ' + name + '…');
  const token = getToken();
  const res = await fetch('/api/admin/backup/download/' + encodeURIComponent(name), {
    headers: token ? { Authorization: 'Bearer ' + token } : {}
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error((data && data.error) || ('HTTP ' + res.status));
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  setBackupNote(backupListMsg, '已下载 ' + name);
}
async function restoreFromBackup(name) {
  setBackupNote(backupListMsg, '正在读取备份 ' + name + '…');
  const token = getToken();
  const res = await fetch('/api/admin/backup/download/' + encodeURIComponent(name), {
    headers: token ? { Authorization: 'Bearer ' + token } : {}
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error((data && data.error) || ('HTTP ' + res.status));
  }
  const blob = await res.blob();
  openBackupRestoreModal(new File([blob], name, { type: 'application/zip' }), name);
  setBackupNote(backupListMsg, '');
}
function syncBackupRestoreButton() {
  backupRestoreConfirm.disabled = backupBusy || backupRestoreInput.value.trim() !== '恢复';
}
function openBackupRestoreModal(file, label) {
  backupRestoreTarget = file;
  backupRestoreSummary.textContent = '将恢复：' + label + '（' + formatBackupBytes(file.size) + '）。恢复会先自动备份当前数据库，重启服务后生效。';
  backupRestoreInput.value = '';
  backupRestoreModalMsg.textContent = '';
  syncBackupRestoreButton();
  backupRestoreModal.style.display = 'flex';
  backupRestoreInput.focus();
}
function closeBackupRestoreModal() {
  backupRestoreTarget = null;
  backupRestoreInput.value = '';
  backupRestoreModalMsg.textContent = '';
  backupRestoreModal.style.display = 'none';
}
async function uploadBackupRestore() {
  if (backupBusy || !backupRestoreTarget || backupRestoreInput.value.trim() !== '恢复') return;
  backupBusy = true;
  backupRestoreConfirm.disabled = true;
  backupRestoreCancel.disabled = true;
  backupRestoreConfirm.textContent = '恢复中…';
  backupRestoreModalMsg.textContent = '';
  setBackupNote(backupRestoreMsg, '正在上传并校验备份…');
  try {
    const fd = new FormData();
    fd.append('file', backupRestoreTarget);
    const token = getToken();
    const data = await backupRequest('/api/admin/backup/restore', {
      method: 'POST',
      headers: token ? { Authorization: 'Bearer ' + token } : {},
      body: fd
    });
    closeBackupRestoreModal();
    setBackupNote(backupRestoreMsg, data.message || '恢复已排队，重启服务后生效');
    await loadBackups();
  } catch (e) {
    backupRestoreModalMsg.textContent = '恢复失败：' + e.message;
    setBackupNote(backupRestoreMsg, '恢复失败：' + e.message, true);
  } finally {
    backupBusy = false;
    backupRestoreCancel.disabled = false;
    backupRestoreConfirm.textContent = '确认恢复';
    syncBackupRestoreButton();
  }
}
async function cancelPendingRestore() {
  if (backupBusy) return;
  if (!confirm('确定取消已排队的恢复？重启后仍会使用当前数据库。')) return;
  const oldText = backupCancelRestoreBtn.textContent;
  backupCancelRestoreBtn.disabled = true;
  backupCancelRestoreBtn.textContent = '取消中…';
  try {
    await backupRequest('/api/admin/backup/restore/cancel', { method: 'POST', headers: apiHeaders(), body: '{}' });
    setBackupNote(backupListMsg, '已取消排队恢复');
    await loadBackups();
  } catch (e) {
    setBackupNote(backupListMsg, '取消恢复失败：' + e.message, true);
  } finally {
    backupCancelRestoreBtn.disabled = false;
    backupCancelRestoreBtn.textContent = oldText;
  }
}
if (backupCreateBtn) backupCreateBtn.addEventListener('click', createBackup);
if (backupRestoreBtn) backupRestoreBtn.addEventListener('click', function () {
  if (backupBusy) return;
  const file = backupRestoreFile.files && backupRestoreFile.files[0];
  if (!file) { setBackupNote(backupRestoreMsg, '请先选择 .zip 备份文件', true); return; }
  if (!/\.zip$/i.test(file.name)) { setBackupNote(backupRestoreMsg, '仅支持 .zip 备份文件', true); return; }
  if (file.size > 100 * 1024 * 1024) { setBackupNote(backupRestoreMsg, '备份文件不能超过 100 MB', true); return; }
  openBackupRestoreModal(file, file.name);
});
if (backupRestoreInput) backupRestoreInput.addEventListener('input', syncBackupRestoreButton);
if (backupRestoreCancel) backupRestoreCancel.addEventListener('click', closeBackupRestoreModal);
if (backupRestoreConfirm) backupRestoreConfirm.addEventListener('click', uploadBackupRestore);
if (backupCancelRestoreBtn) backupCancelRestoreBtn.addEventListener('click', cancelPendingRestore);
if (backupListBody) backupListBody.addEventListener('click', function (e) {
  const btn = e.target.closest('button[data-backup-action]');
  if (!btn || backupBusy) return;
  const name = btn.dataset.name;
  const action = btn.dataset.backupAction;
  const oldText = btn.textContent;
  btn.disabled = true;
  btn.textContent = '处理中…';
  (async function () {
    try {
      if (action === 'download') await downloadBackup(name);
      else if (action === 'restore') await restoreFromBackup(name);
      else if (action === 'delete') {
        if (!confirm('确定删除备份 ' + name + '？此操作不可恢复。')) return;
        await backupRequest('/api/admin/backup/' + encodeURIComponent(name), { method: METHOD_DELETE, headers: apiHeaders() });
        setBackupNote(backupListMsg, '已删除 ' + name);
        await loadBackups();
      }
    } catch (err) {
      setBackupNote(backupListMsg, '操作失败：' + err.message, true);
    } finally {
      if (btn.isConnected) { btn.disabled = false; btn.textContent = oldText; }
    }
  })();
});

const sectionLoaders = {
  overview: () => loadDashboard(),
  users: () => loadUsers(),
  articles: () => fetchArticles(),
  offline: () => loadAllArticlesForOffline(),
  review: () => loadPendingArticles(),
  categories: () => fetchCategories(),
  leaderboard: () => fetchLeaderboard(currentFilter),
  announcements: () => loadAnnouncements(),
  sensitive: () => loadSensitiveWords(),
  database: async () => {
    await loadDbConfig();
    await loadDatabaseTables();
  },
  races: () => loadRaceRooms(),
  backup: () => loadBackups(),
  crawler: () => Promise.resolve(),
  'code-articles': () => fetchCodeArticles(),
  'code-langs': async () => {
    await fetchCodeLanguages();
    if (categories.length) {
      renderCategories();
      renderCategorySelects();
    }
  },
  'code-lb': () => fetchCodeLeaderboard()
};
const loadedSections = new Set();

const ADMIN_CODE_SECTIONS = new Set(['code-articles', 'code-langs', 'code-lb']);

function isCodeSection(section) {
  return ADMIN_CODE_SECTIONS.has(section);
}

function defaultSectionForMode(mode) {
  return mode === 'code' ? 'code-articles' : 'overview';
}

function applyAdminMode(mode) {
  adminMode = mode === 'code' ? 'code' : 'normal';
  document.body.classList.toggle('admin-mode-code', adminMode === 'code');
  document.body.classList.toggle('admin-mode-normal', adminMode === 'normal');
  const normalRadio = document.getElementById('admin-mode-normal');
  const codeRadio = document.getElementById('admin-mode-code');
  if (normalRadio) normalRadio.checked = adminMode === 'normal';
  if (codeRadio) codeRadio.checked = adminMode === 'code';
}

async function switchAdminMode(mode) {
  applyAdminMode(mode);
  try { localStorage.setItem('adminMode', adminMode); } catch (e) {}
  const target = defaultSectionForMode(adminMode);
  activateSection(target);
  history.replaceState(null, null, '#' + target);
  await loadSectionData(target);
}

async function loadSectionData(section) {
  // 比赛房间是实时内存数据，每次切回该区块都重新拉取
  if (section === 'races') {
    await loadRaceRooms();
    return;
  }
  if (loadedSections.has(section)) return;
  const loader = sectionLoaders[section];
  if (!loader) return;
  try {
    await loader();
    loadedSections.add(section);
  } catch (e) {
    console.error('加载 section 失败', section, e);
  }
}

function activateSection(section) {
  document.querySelectorAll('.admin-sidebar .nav-menu a').forEach(l => l.classList.remove('active'));
  const link = document.querySelector('.admin-sidebar .nav-menu a[data-section="' + section + '"]');
  if (link) link.classList.add('active');
  document.querySelectorAll('.admin-main > [id^="section-"]').forEach(el => {
    el.classList.toggle('admin-section-active', el.id === 'section-' + section);
  });
}

async function init() {
  try {
    loadVersion();
    const authed = await checkAuth();
    if (!authed) return;
    // 代码分类先就绪，普通文章/分类过滤才能正确排除代码素材
    await fetchCodeLanguages().catch(() => {});
    // 首屏只加载概览和分类，其余 section 按需加载
    await Promise.all([
      loadDashboard().catch(() => {}),
      fetchCategories().catch(() => {})
    ]);
    loadedSections.add('overview');
    loadedSections.add('categories');
  } catch (e) {
    console.error('管理后台初始化失败', e);
  } finally {
    if (window.PageLoading) window.PageLoading.done();
  }
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('service-worker.js').catch(() => {});
}

init();

document.querySelectorAll('.admin-sidebar .nav-menu a').forEach(link => {
  link.addEventListener('click', async (e) => {
    e.preventDefault();
    const section = link.dataset.section;
    activateSection(section);
    history.replaceState(null, null, '#' + section);
    await loadSectionData(section);
  });
});

document.getElementById('admin-mode-normal').addEventListener('change', function () {
  if (this.checked) switchAdminMode('normal');
});
document.getElementById('admin-mode-code').addEventListener('change', function () {
  if (this.checked) switchAdminMode('code');
});

async function showSectionFromHash() {
  let hash = location.hash.slice(1);
  // 处理 hash 以 "section-" 开头的情况（如 #section-overview → overview）
  if (hash.indexOf('section-') === 0) {
    hash = hash.slice(8);
  }
  let link = document.querySelector('.admin-sidebar .nav-menu a[data-section="' + hash + '"]');
  // fallback: 找不到匹配的链接时按当前模式进入默认区块
  if (!link) {
    hash = defaultSectionForMode(adminMode);
    link = document.querySelector('.admin-sidebar .nav-menu a[data-section="' + hash + '"]');
  }
  if (link) {
    applyAdminMode(isCodeSection(hash) ? 'code' : 'normal');
    try { localStorage.setItem('adminMode', adminMode); } catch (e) {}
    activateSection(hash);
    await loadSectionData(hash);
  }
}

window.addEventListener('hashchange', showSectionFromHash);
showSectionFromHash();
