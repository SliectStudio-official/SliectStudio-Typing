let articles = [];
let categories = [];
let leaderboardData = [];
let currentUser = null;
let currentFilter = '';
let weeklyChart = null;

const adminContent = document.querySelector('.container');
const adminUsername = document.getElementById('admin-username');
const adminLogoutBtn = document.getElementById('admin-logout-btn');

const newCategoryName = document.getElementById('new-category-name');
const addCategoryBtn = document.getElementById('add-category-btn');
const categoryList = document.getElementById('category-list');
const categoryEmpty = document.getElementById('category-empty');

const newTitle = document.getElementById('new-title');
const newCategorySelect = document.getElementById('new-category-select');
const newContent = document.getElementById('new-content');
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
const editDifficultySelect = document.getElementById('edit-difficulty-select');
const editContent = document.getElementById('edit-content');
const editArticleError = document.getElementById('edit-article-error');
const editArticleCancel = document.getElementById('edit-article-cancel');
const editArticleSave = document.getElementById('edit-article-save');
let editingArticleId = null;

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

const lbFilter = document.getElementById('lb-filter');
const lbManageList = document.getElementById('lb-manage-list');
const lbManageEmpty = document.getElementById('lb-manage-empty');
const clearLbBtn = document.getElementById('clear-lb-btn');

const confirmModal = document.getElementById('confirm-modal');
const confirmMsg = document.getElementById('confirm-msg');
const confirmCancel = document.getElementById('confirm-cancel');
const confirmOk = document.getElementById('confirm-ok');

const dashTotalUsers = document.getElementById('dash-total-users');
const dashTodayPractices = document.getElementById('dash-today-practices');
const dashTodayScores = document.getElementById('dash-today-scores');
const dashTotalArticles = document.getElementById('dash-total-articles');
const dashPendingArticles = document.getElementById('dash-pending-articles');
const weeklyUsersChart = document.getElementById('weekly-users-chart');

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

const userList = document.getElementById('user-list');
const userEmpty = document.getElementById('user-empty');
const adminEditUsername = document.getElementById('admin-edit-username');
const adminEditEmail = document.getElementById('admin-edit-email');
const adminCurrentPassword = document.getElementById('admin-current-password');
const adminNewPassword = document.getElementById('admin-new-password');
const saveAdminInfoBtn = document.getElementById('save-admin-info-btn');
const adminInfoMsg = document.getElementById('admin-info-msg');

function getToken() {
  return localStorage.getItem('token');
}

function apiHeaders() {
  const token = getToken();
  const h = { 'Content-Type': 'application/json' };
  if (token) h['Authorization'] = 'Bearer ' + token;
  return h;
}

function showAccessDenied(msg) {
  adminContent.innerHTML =
    '<div style="text-align:center;padding:80px 32px">' +
      '<div style="font-size:48px;margin-bottom:16px">🔒</div>' +
      '<h2 style="margin-bottom:12px;color:var(--ink)">' + msg + '</h2>' +
      '<p style="color:var(--ink-muted-48);margin-bottom:24px">请先在练习页面以管理员账号登录</p>' +
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
      localStorage.removeItem('token');
      showAccessDenied('登录已过期');
      return false;
    }
  } catch (e) {
    showAccessDenied('连接失败');
    return false;
  }
}

adminLogoutBtn.addEventListener('click', () => {
  localStorage.removeItem('token');
  window.location.href = 'index.html';
});

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

    renderWeeklyChart(data.weekly_users || []);
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
        '<div class="preview" style="font-size:12px;color:var(--ink-muted-48)">作者：' + escapeHtml(a.author || '匿名') + '</div>' +
        '<div class="preview">' + escapeHtml(preview) + '</div>' +
      '</div>' +
      '<div class="actions" style="display:flex;gap:8px">' +
        '<button class="btn-primary approve-btn" data-id="' + a.id + '" style="font-size:13px;padding:6px 14px">通过</button>' +
        '<button class="btn-dark-utility reject-btn" data-id="' + a.id + '" style="font-size:13px;padding:6px 14px">拒绝</button>' +
      '</div>';

    div.querySelector('.approve-btn').addEventListener('click', async function() {
      try {
        const res = await fetch('/api/articles/' + this.dataset.id + '/review', {
          method: 'PUT',
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
        const res = await fetch('/api/articles/' + this.dataset.id + '/review', {
          method: 'PUT',
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
          '<div class="preview">' + escapeHtml(item.content) + '</div>' +
          timeRange +
        '</div>' +
        '<div style="display:flex;gap:6px;flex-shrink:0">' +
          '<button class="btn-secondary edit-announcement-btn" data-id="' + item.id + '" style="font-size:12px;padding:4px 10px">编辑</button>' +
          '<button class="btn-secondary delete-announcement-btn" data-id="' + item.id + '" style="font-size:12px;padding:4px 10px;color:var(--semantic-error)">删除</button>' +
        '</div>';
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
          const res = await fetch('/api/admin/announcements/' + btn.dataset.id, {
            method: 'DELETE',
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
  const method = editId ? 'PUT' : 'POST';

  try {
    const res = await fetch(url, {
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
  previewText.textContent = content;
  announcementPreview.style.display = '';
});

cancelAnnouncementBtn.addEventListener('click', resetAnnouncementForm);

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
          '<div class="preview">' + (user.email || '无邮箱') + ' · 注册于 ' + (user.created_at ? user.created_at.split('T')[0] : '') + '</div>' +
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
          const newEmail = prompt('修改邮箱（留空不修改）：', user.email || '');
          if (newEmail === null) return;
          const newPassword = prompt('修改密码（留空不修改，至少6位）：');
          if (newPassword === null) return;
          const newRole = confirm('是否设为管理员？\n确定=管理员，取消=普通用户') ? 'admin' : 'user';
          const body = {};
          if (newUsername.trim()) body.username = newUsername.trim();
          if (newEmail.trim() || newEmail === '') body.email = newEmail.trim();
          if (newPassword.trim()) body.password = newPassword.trim();
          body.role = newRole;
          const updateRes = await fetch('/api/admin/users/' + id, {
            method: 'PUT',
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
          const res = await fetch('/api/admin/users/' + btn.dataset.id, {
            method: 'DELETE',
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
    const res = await fetch('/api/auth/me', {
      method: 'PUT',
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
    const res = await fetch('/api/admin/sensitive-words', {
      method: 'PUT',
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
    const res = await fetch('/api/admin/db/' + encodeURIComponent(currentDatabaseTable) + '/' + encodeURIComponent(row[pk]), {
      method: 'PUT',
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
    const res = await fetch('/api/admin/db/' + encodeURIComponent(currentDatabaseTable) + '/' + encodeURIComponent(row[pk]), {
      method: 'DELETE',
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
    const res = await fetch('/api/admin/db/' + encodeURIComponent(currentDatabaseTable), {
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

async function fetchCategories() {
  const res = await fetch('/api/categories');
  categories = await res.json();
  renderCategories();
  renderCategorySelects();
}

function renderCategories() {
  categoryList.innerHTML = '';
  if (categories.length === 0) {
    categoryEmpty.style.display = 'block';
    return;
  }
  categoryEmpty.style.display = 'none';

  categories.forEach(c => {
    const div = document.createElement('div');
    div.className = 'category-item';
    div.innerHTML =
      '<span class="name">' + escapeHtml(c.name) + '</span>' +
      '<div class="actions">' +
        '<button class="btn-dark-utility edit-cat-btn" data-id="' + c.id + '" data-name="' + escapeHtml(c.name) + '">编辑</button>' +
        '<button class="btn-dark-utility del-cat-btn" data-id="' + c.id + '">删除</button>' +
      '</div>';

    div.querySelector('.edit-cat-btn').addEventListener('click', async function() {
      const newName = prompt('编辑分类名称', this.dataset.name);
      if (newName && newName.trim()) {
        await fetch('/api/categories/' + this.dataset.id, {
          method: 'PUT',
          headers: apiHeaders(),
          body: JSON.stringify({ name: newName.trim() })
        });
        await fetchCategories();
      }
    });

    div.querySelector('.del-cat-btn').addEventListener('click', async function() {
      if (confirm('确定删除该分类吗？')) {
        await fetch('/api/categories/' + this.dataset.id, {
          method: 'DELETE',
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

  categories.forEach(c => {
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
    const res = await fetch('/api/categories', {
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

async function fetchArticles() {
  const params = new URLSearchParams();
  const search = articleSearchInput.value.trim();
  const categoryId = articleCategoryFilter.value;
  const difficulty = articleDifficultyFilter.value;

  if (search) params.set('search', search);
  if (categoryId) params.set('category_id', categoryId);
  if (difficulty) params.set('difficulty', difficulty);

  const url = params.toString() ? '/api/articles?' + params.toString() : '/api/articles';
  const res = await fetch(url, { headers: apiHeaders() });
  articles = await res.json();
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
    div.innerHTML =
      '<div class="info">' +
        '<div class="title">' + escapeHtml(a.title) + catTag + diffTag + '</div>' +
        '<div class="preview">' + escapeHtml(a.content.slice(0, 60)) + '...（' + a.content.length + '字）</div>' +
      '</div>' +
      '<div class="btn-group" style="gap:8px">' +
        '<button class="btn-secondary edit-btn" data-id="' + a.id + '">编辑</button>' +
        '<button class="btn-dark-utility delete-btn" data-id="' + a.id + '">删除</button>' +
      '</div>';
    div.querySelector('.edit-btn').addEventListener('click', function() {
      openEditModal(a);
    });
    div.querySelector('.delete-btn').addEventListener('click', async function() {
      if (confirm('确定删除文章"' + a.title + '"吗？')) {
        await fetch('/api/articles/' + this.dataset.id, { method: 'DELETE', headers: apiHeaders() });
        await fetchArticles();
        await fetchLeaderboard(currentFilter);
      }
    });
    articleList.appendChild(div);
  });
}

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
    const res = await fetch('/api/articles', {
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
  editTitle.value = article.title;
  editContent.value = article.content;
  editArticleError.textContent = '';

  editCategorySelect.innerHTML = '<option value="">-- 请选择分类 --</option>';
  categories.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = c.name;
    if (c.id === article.category_id) opt.selected = true;
    editCategorySelect.appendChild(opt);
  });

  editDifficultySelect.value = article.difficulty || '0';

  editArticleModal.style.display = 'flex';
}

editArticleCancel.addEventListener('click', () => {
  editArticleModal.style.display = 'none';
  editingArticleId = null;
});

editArticleModal.addEventListener('click', (e) => {
  if (e.target === editArticleModal) {
    editArticleModal.style.display = 'none';
    editingArticleId = null;
  }
});

editArticleSave.addEventListener('click', async () => {
  const title = editTitle.value.trim();
  const content = editContent.value.trim();
  const category_id = editCategorySelect.value;
  const difficulty_override = parseInt(editDifficultySelect.value) || 0;

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

  try {
    const res = await fetch('/api/articles/' + editingArticleId, {
      method: 'PUT',
      headers: { ...apiHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, content, category_id: parseInt(category_id), difficulty_override })
    });

    if (res.ok) {
      editArticleModal.style.display = 'none';
      editingArticleId = null;
      await fetchArticles();
    } else {
      const data = await res.json();
      editArticleError.textContent = data.error || '保存失败';
    }
  } catch (e) {
    editArticleError.textContent = '网络错误';
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
  crawlSaveMsg.textContent = '';

  try {
    const res = await fetch('/api/crawl', {
      method: 'POST',
      headers: apiHeaders(),
      body: JSON.stringify({ url })
    });

    const data = await res.json();

    if (data.error) {
      crawlSaveMsg.textContent = '抓取失败：' + data.error;
      crawlSaveMsg.style.color = 'var(--semantic-error)';
    } else {
      crawlEditTitle.value = data.title || '';
      crawlEditContent.value = data.content || '';
      crawlSourceUrl = data._source_url || url;
      crawlSaveCategory.value = '';
      crawlPreview.style.display = 'block';
      crawlSaveMsg.textContent = '';
    }
  } catch (e) {
    crawlSaveMsg.textContent = '请求失败，请检查Python环境';
    crawlSaveMsg.style.color = 'var(--semantic-error)';
  } finally {
    crawlBtn.disabled = false;
    crawlBtn.textContent = '抓取预览';
  }
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
    const res = await fetch('/api/crawl/save', {
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
        await fetch('/api/leaderboard/' + this.dataset.id, { method: 'DELETE', headers: apiHeaders() });
        await fetchLeaderboard(currentFilter);
      }
    });
    lbManageList.appendChild(div);
  });
}

clearLbBtn.addEventListener('click', () => {
  confirmMsg.textContent = '确定要清空整个排行榜吗？此操作不可恢复！';
  confirmModal.style.display = 'flex';
});

confirmCancel.addEventListener('click', () => {
  confirmModal.style.display = 'none';
});

confirmOk.addEventListener('click', async () => {
  try {
    await fetch('/api/leaderboard', { method: 'DELETE', headers: apiHeaders() });
    confirmModal.style.display = 'none';
    await fetchLeaderboard(currentFilter);
  } catch (e) {
    alert('清空失败，请重试');
  }
});

function escapeHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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

async function init() {
  loadVersion();
  const authed = await checkAuth();
  if (!authed) return;
  await Promise.all([
    loadDashboard(),
    loadPendingArticles(),
    loadAnnouncements(),
    loadSensitiveWords(),
    loadDatabaseTables(),
    fetchCategories(),
    fetchArticles(),
    fetchLeaderboard(),
    loadUsers()
  ]);
}

init();

document.querySelectorAll('.admin-sidebar .nav-menu a').forEach(link => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    const section = link.dataset.section;
    document.querySelectorAll('.admin-sidebar .nav-menu a').forEach(l => l.classList.remove('active'));
    link.classList.add('active');
    document.querySelectorAll('.admin-main > .section-card').forEach(card => {
      card.style.display = card.id === 'section-' + section ? '' : 'none';
    });
    history.replaceState(null, null, '#' + section);
  });
});

function showSectionFromHash() {
  const hash = location.hash.slice(1) || 'overview';
  const link = document.querySelector('.admin-sidebar .nav-menu a[data-section="' + hash + '"]');
  if (link) {
    document.querySelectorAll('.admin-sidebar .nav-menu a').forEach(l => l.classList.remove('active'));
    link.classList.add('active');
    document.querySelectorAll('.admin-main > .section-card').forEach(card => {
      card.style.display = card.id === 'section-' + hash ? '' : 'none';
    });
  }
}

window.addEventListener('hashchange', showSectionFromHash);
showSectionFromHash();
