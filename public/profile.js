let currentUser = null;
let currentPage = 1;
let statsChart = null;

const navUsername = document.getElementById('nav-username');
const logoutBtn = document.getElementById('logout-btn');
const adminNavItem = document.getElementById('admin-nav-item');
const accessDenied = document.getElementById('access-denied');
const profileContent = document.getElementById('profile-content');

const avatarImg = document.getElementById('avatar-img');
const avatarOverlay = document.getElementById('avatar-overlay');
const avatarInput = document.getElementById('avatar-input');
const profileNickname = document.getElementById('profile-nickname');
const profileUsername = document.getElementById('profile-username');
const profileEmail = document.getElementById('profile-email');
const profileRole = document.getElementById('profile-role');

const nicknameInput = document.getElementById('nickname-input');
const saveNicknameBtn = document.getElementById('save-nickname-btn');
const nicknameMsg = document.getElementById('nickname-msg');

const oldPassword = document.getElementById('old-password');
const newPassword = document.getElementById('new-password');
const confirmPassword = document.getElementById('confirm-password');
const changePasswordBtn = document.getElementById('change-password-btn');
const passwordMsg = document.getElementById('password-msg');

const historyTbody = document.getElementById('history-tbody');
const historyEmpty = document.getElementById('history-empty');
const pagination = document.getElementById('pagination');

const announcementBar = document.getElementById('announcement-bar');
const errorLogTbody = document.getElementById('error-log-tbody');
const errorLogEmpty = document.getElementById('error-log-empty');
const errorLogActions = document.getElementById('error-log-actions');
const generateErrorPracticeBtn = document.getElementById('generate-error-practice-btn');
const submittedArticlesTbody = document.getElementById('submitted-articles-tbody');
const submittedArticlesEmpty = document.getElementById('submitted-articles-empty');
const privateArticlesList = document.getElementById('private-articles-list');
const privateArticlesEmpty = document.getElementById('private-articles-empty');
const privateTitleInput = document.getElementById('private-title-input');
const privateContentInput = document.getElementById('private-content-input');
const addPrivateArticleBtn = document.getElementById('add-private-article-btn');
const privateFileInput = document.getElementById('private-file-input');
const uploadPrivateArticleBtn = document.getElementById('upload-private-article-btn');

const dayRangeBtns = document.querySelectorAll('.day-range-btn');

const offlineManageList = document.getElementById('offline-manage-list');
const offlineManageEmpty = document.getElementById('offline-manage-empty');
let allApprovedArticles = [];
let cachedGlobalIds = new Set();
let cachedPersonalIds = new Set();

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

async function fetchArticleDetail(id) {
  try {
    const res = await fetch('/api/articles/' + id);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  } catch (e) {
    return null;
  }
}

function scheduleIdle(fn) {
  if ('requestIdleCallback' in window) {
    return requestIdleCallback(fn, { timeout: 2000 });
  }
  return setTimeout(fn, 1);
}

function getToken() {
  return localStorage.getItem('token');
}

function apiHeaders() {
  const token = getToken();
  const h = { 'Content-Type': 'application/json' };
  if (token) h['Authorization'] = 'Bearer ' + token;
  return h;
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

function escapeHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeChar(ch) {
  if (ch === ' ') return '空格';
  if (ch === '\n') return '换行';
  if (ch === '\t') return 'Tab';
  if (ch === '\r') return '回车';
  return escapeHtml(ch);
}

async function checkAuth() {
  const token = getToken();
  if (!token) {
    showDenied();
    return;
  }
  try {
    const res = await fetch('/api/auth/me', { headers: { 'Authorization': 'Bearer ' + token } });
    if (res.ok) {
      currentUser = await res.json();
      showProfile();
    } else {
      localStorage.removeItem('token');
      showDenied();
    }
  } catch (e) {
    showDenied();
  }
}

function showDenied() {
  accessDenied.style.display = '';
  profileContent.style.display = 'none';
}

function showProfile() {
  accessDenied.style.display = 'none';
  profileContent.style.display = '';

  navUsername.textContent = currentUser.nickname || currentUser.username;
  if (currentUser.role === 'admin') {
    adminNavItem.style.display = '';
  }

  loadProfile();
  loadAnnouncement();
  loadHistory(1);
  scheduleIdle(() => {
    loadStats(7);
    loadErrorLog();
    loadSubmittedArticles();
    loadPrivateArticles();
    loadOfflineArticlesManage();
  });
}

async function loadProfile() {
  try {
    const res = await fetch('/api/user/profile', { headers: { 'Authorization': 'Bearer ' + getToken() } });
    if (!res.ok) return;
    const data = await res.json();

    if (data.avatar) {
      avatarImg.src = data.avatar + '?t=' + Date.now();
    } else {
      avatarImg.src = '';
      avatarImg.classList.add('avatar-placeholder');
    }

    profileNickname.textContent = data.nickname || data.username;
    profileUsername.textContent = data.username;
    profileEmail.textContent = data.email ? '邮箱：' + data.email : '';
    profileRole.textContent = data.role === 'admin' ? '管理员' : '普通用户';
    nicknameInput.value = data.nickname || data.username;
  } catch (e) {
    console.error('Failed to load profile:', e);
  }
}

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
    const badge = announcementBar.querySelector('.announcement-level-badge');
    const title = announcementBar.querySelector('.announcement-title');
    const text = announcementBar.querySelector('.announcement-text');
    const closeBtn = announcementBar.querySelector('.announcement-close');
    if (badge) badge.textContent = LEVEL_LABELS[data.level] || '通知';
    if (title) { title.textContent = data.title || ''; title.style.display = data.title ? '' : 'none'; }
    if (text) text.textContent = data.content || '';
    if (closeBtn) closeBtn.style.display = (data.allow_close === 0 || data.allow_close === false) ? 'none' : '';
    announcementBar.style.display = 'flex';
  } catch (e) {
    console.error('Failed to load announcement:', e);
  }
}

const announcementCloseBtn = document.getElementById('announcement-close');
if (announcementCloseBtn) {
  announcementCloseBtn.addEventListener('click', () => {
    if (currentAnnouncementId !== null) {
      announcementBar.style.display = 'none';
      localStorage.setItem('announcement_closed_' + currentAnnouncementId, '1');
    }
  });
}

async function loadStats(days) {
  try {
    const res = await fetch('/api/user/stats?days=' + days, {
      headers: { 'Authorization': 'Bearer ' + getToken() }
    });
    if (!res.ok) return;
    const data = await res.json();

    document.getElementById('stat-total-practices').textContent = data.totalPractices || 0;
    document.getElementById('stat-total-keystrokes').textContent = data.totalKeystrokes || 0;
    const totalMinutes = Math.round((data.totalTimeSeconds || 0) / 60);
    document.getElementById('stat-total-time').textContent = totalMinutes + '分钟';

    const labels = (data.dailyStats || []).map(d => d.date);
    const speedData = (data.dailyStats || []).map(d => d.avgSpeed);
    const accuracyData = (data.dailyStats || []).map(d => d.avgAccuracy);

    try {
      await ensureChartJS();
      if (statsChart) {
        statsChart.data.labels = labels;
        statsChart.data.datasets[0].data = speedData;
        statsChart.data.datasets[1].data = accuracyData;
        statsChart.update();
      } else {
        const ctx = document.getElementById('stats-chart').getContext('2d');
        statsChart = new Chart(ctx, {
          type: 'line',
          data: {
            labels: labels,
            datasets: [
              {
                label: '平均速度 (字/分)',
                data: speedData,
                borderColor: '#f54e00',
                backgroundColor: 'transparent',
                fill: false,
                tension: 0.4,
                yAxisID: 'y',
                pointBackgroundColor: '#f54e00',
                pointBorderColor: '#f54e00',
                pointRadius: 3,
                pointHoverRadius: 5
              },
              {
                label: '平均准确率 (%)',
                data: accuracyData,
                borderColor: '#1f8a65',
                backgroundColor: 'transparent',
                fill: false,
                tension: 0.4,
                yAxisID: 'y1',
                pointBackgroundColor: '#1f8a65',
                pointBorderColor: '#1f8a65',
                pointRadius: 3,
                pointHoverRadius: 5
              }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
              mode: 'index',
              intersect: false
            },
            plugins: {
              legend: {
                labels: {
                  font: { family: 'Inter', size: 12 },
                  color: '#5a5852'
                }
              }
            },
            scales: {
              x: {
                grid: { color: '#efeee8' },
                ticks: {
                  font: { family: 'Inter', size: 11 },
                  color: '#807d72'
                }
              },
              y: {
                type: 'linear',
                position: 'left',
                title: {
                  display: true,
                  text: '速度 (字/分)',
                  font: { family: 'Inter', size: 12 },
                  color: '#f54e00'
                },
                grid: { color: '#efeee8' },
                ticks: {
                  font: { family: 'Inter', size: 11 },
                  color: '#807d72'
                }
              },
              y1: {
                type: 'linear',
                position: 'right',
                title: {
                  display: true,
                  text: '准确率 (%)',
                  font: { family: 'Inter', size: 12 },
                  color: '#1f8a65'
                },
                min: 0,
                max: 100,
                grid: { drawOnChartArea: false },
                ticks: {
                  font: { family: 'Inter', size: 11 },
                  color: '#807d72'
                }
              }
            }
          }
        });
      }
    } catch (chartErr) {
      console.error('图表加载失败', chartErr);
    }
  } catch (e) {}
}

dayRangeBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    dayRangeBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    loadStats(parseInt(btn.dataset.days));
  });
});

async function loadErrorLog() {
  try {
    const res = await fetch('/api/user/error-log', {
      headers: { 'Authorization': 'Bearer ' + getToken() }
    });
    if (!res.ok) return;
    const data = await res.json();

    errorLogTbody.innerHTML = '';
    if (!data || data.length === 0) {
      errorLogEmpty.style.display = '';
      errorLogActions.style.display = 'none';
      return;
    }
    errorLogEmpty.style.display = 'none';
    errorLogActions.style.display = '';

    data.forEach(item => {
      const tr = document.createElement('tr');
      tr.innerHTML =
        '<td>' + escapeChar(item.expected_char) + '</td>' +
        '<td>' + escapeChar(item.typed_char) + '</td>' +
        '<td>' + item.count + '</td>';
      errorLogTbody.appendChild(tr);
    });
  } catch (e) {}
}

generateErrorPracticeBtn.addEventListener('click', async () => {
  try {
    const res = await fetch('/api/user/generate-error-practice', {
      method: 'POST',
      headers: apiHeaders()
    });
    if (!res.ok) {
      const err = await res.json();
      alert(err.error || '生成失败');
      return;
    }
    const data = await res.json();
    const title = encodeURIComponent(data.title || '错字练习');
    const content = encodeURIComponent(data.content || '');
    window.location.href = 'index.html?error_practice=1&title=' + title + '&content=' + content;
  } catch (e) {
    alert('生成失败，请重试');
  }
});

async function loadSubmittedArticles() {
  try {
    const res = await fetch('/api/user/submitted-articles', {
      headers: { 'Authorization': 'Bearer ' + getToken() }
    });
    if (!res.ok) return;
    const data = await res.json();

    submittedArticlesTbody.innerHTML = '';
    if (!data || data.length === 0) {
      submittedArticlesEmpty.style.display = '';
      return;
    }
    submittedArticlesEmpty.style.display = 'none';

    data.forEach(item => {
      const tr = document.createElement('tr');
      let badge = '';
      if (item.status === 'pending') {
        badge = '<span class="status-badge status-pending">待审核</span>';
      } else if (item.status === 'approved') {
        badge = '<span class="status-badge status-approved">已通过</span>';
      } else if (item.status === 'rejected') {
        badge = '<span class="status-badge status-rejected">已拒绝</span>';
      }
      const dateStr = new Date(item.created_at).toLocaleDateString('zh-CN');
      tr.innerHTML =
        '<td>' + escapeHtml(item.title) + '</td>' +
        '<td>' + badge + '</td>' +
        '<td>' + escapeHtml(item.review_msg || '') + '</td>' +
        '<td>' + dateStr + '</td>';
      submittedArticlesTbody.appendChild(tr);
    });
  } catch (e) {}
}

async function loadPrivateArticles() {
  try {
    const res = await fetch('/api/user/private-articles', {
      headers: { 'Authorization': 'Bearer ' + getToken() }
    });
    if (!res.ok) return;
    const data = await res.json();

    privateArticlesList.innerHTML = '';
    if (!data || data.length === 0) {
      privateArticlesEmpty.style.display = '';
      return;
    }
    privateArticlesEmpty.style.display = 'none';

    data.forEach(item => {
      const div = document.createElement('div');
      div.className = 'article-item';
      div.innerHTML =
        '<div class="info">' +
          '<div class="title">' + escapeHtml(item.title) + '</div>' +
          '<div class="preview">' + escapeHtml(item.content ? item.content.substring(0, 80) : '') + '</div>' +
        '</div>' +
        '<button class="btn-secondary delete-private-article-btn" data-id="' + item.id + '">删除</button>';
      privateArticlesList.appendChild(div);
    });

    privateArticlesList.querySelectorAll('.delete-private-article-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('确定删除该文章？')) return;
        try {
          const res = await fetch('/api/user/private-articles/' + btn.dataset.id, {
            method: 'DELETE',
            headers: { 'Authorization': 'Bearer ' + getToken() }
          });
          if (res.ok) {
            loadPrivateArticles();
          } else {
            const err = await res.json();
            alert(err.error || '删除失败');
          }
        } catch (e) {
          alert('删除失败，请重试');
        }
      });
    });
  } catch (e) {}
}

async function loadOfflineArticlesManage() {
  try {
    const res = await fetch('/api/articles?brief=1');
    if (res.ok) {
      allApprovedArticles = await res.json();
    } else {
      allApprovedArticles = [];
    }
  } catch (e) {
    allApprovedArticles = [];
  }

  const cached = await getCachedArticlesFromSW();
  cachedGlobalIds = new Set(cached.filter(a => a.source === 'global').map(a => a.id));
  cachedPersonalIds = new Set(cached.filter(a => a.source === 'personal').map(a => a.id));

  renderOfflineArticlesManage();
}

function renderOfflineArticlesManage() {
  offlineManageList.innerHTML = '';
  if (!allApprovedArticles || allApprovedArticles.length === 0) {
    offlineManageEmpty.style.display = '';
    return;
  }
  offlineManageEmpty.style.display = 'none';

  allApprovedArticles.forEach(a => {
    const isGlobal = cachedGlobalIds.has(a.id);
    const isPersonal = cachedPersonalIds.has(a.id);
    const globalTag = isGlobal ? '<span class="offline-source-badge global">全局离线</span>' : '';

    let btnHtml;
    if (isPersonal) {
      btnHtml = '<button class="btn-dark-utility cancel-personal-offline-btn" data-id="' + a.id + '">取消离线</button>';
    } else if (isGlobal) {
      btnHtml = '<button class="btn-secondary" disabled>已离线</button>';
    } else {
      btnHtml = '<button class="btn-primary add-personal-offline-btn" data-id="' + a.id + '">加入离线</button>';
    }

    const previewText = a.content_preview || (a.content || '').slice(0, 120);
    const preview = escapeHtml(previewText.slice(0, 60));
    const len = a.content_length != null ? a.content_length : (a.content || '').length;

    const div = document.createElement('div');
    div.className = 'article-item';
    div.innerHTML =
      '<div class="info">' +
        '<div class="title">' + escapeHtml(a.title) + globalTag + '</div>' +
        '<div class="preview">' + preview + '...（' + len + '字）</div>' +
      '</div>' +
      '<div class="btn-group">' + btnHtml + '</div>';
    offlineManageList.appendChild(div);
  });

  offlineManageList.querySelectorAll('.add-personal-offline-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = parseInt(btn.dataset.id);
      let article = allApprovedArticles.find(a => a.id === id);
      if (!article) return;
      const detail = await fetchArticleDetail(id);
      if (detail) article = detail;
      if (!article.content) {
        alert('文章正文未加载，请联网后再加入离线缓存');
        return;
      }
      await sendCacheArticleSW(article, 'personal');
      const cached = await getCachedArticlesFromSW();
      cachedPersonalIds = new Set(cached.filter(a => a.source === 'personal').map(a => a.id));
      cachedGlobalIds = new Set(cached.filter(a => a.source === 'global').map(a => a.id));
      renderOfflineArticlesManage();
    });
  });

  offlineManageList.querySelectorAll('.cancel-personal-offline-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = parseInt(btn.dataset.id);
      await sendDeleteCachedArticleSW(id, 'personal');
      const cached = await getCachedArticlesFromSW();
      cachedPersonalIds = new Set(cached.filter(a => a.source === 'personal').map(a => a.id));
      cachedGlobalIds = new Set(cached.filter(a => a.source === 'global').map(a => a.id));
      renderOfflineArticlesManage();
    });
  });
}

addPrivateArticleBtn.addEventListener('click', async () => {
  const title = privateTitleInput.value.trim();
  const content = privateContentInput.value.trim();
  if (!title) { alert('请输入标题'); return; }
  if (!content) { alert('请输入内容'); return; }

  try {
    const res = await fetch('/api/user/private-articles', {
      method: 'POST',
      headers: apiHeaders(),
      body: JSON.stringify({ title, content })
    });
    if (res.ok) {
      privateTitleInput.value = '';
      privateContentInput.value = '';
      loadPrivateArticles();
    } else {
      const err = await res.json();
      alert(err.error || '添加失败');
    }
  } catch (e) {
    alert('添加失败，请重试');
  }
});

uploadPrivateArticleBtn.addEventListener('click', async () => {
  const file = privateFileInput.files[0];
  if (!file) { alert('请选择文件'); return; }

  const formData = new FormData();
  formData.append('file', file);

  try {
    const res = await fetch('/api/user/private-articles/upload', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + getToken() },
      body: formData
    });
    if (res.ok) {
      privateFileInput.value = '';
      loadPrivateArticles();
    } else {
      const err = await res.json();
      alert(err.error || '上传失败');
    }
  } catch (e) {
    alert('上传失败，请重试');
  }
});

avatarOverlay.addEventListener('click', () => {
  avatarInput.click();
});

avatarInput.addEventListener('change', async () => {
  const file = avatarInput.files[0];
  if (!file) return;

  if (file.size > 2 * 1024 * 1024) {
    alert('文件大小不能超过2MB');
    return;
  }

  const allowed = ['image/jpeg', 'image/png', 'image/gif'];
  if (!allowed.includes(file.type)) {
    alert('仅支持 jpg/png/gif 格式');
    return;
  }

  const formData = new FormData();
  formData.append('avatar', file);

  try {
    const res = await fetch('/api/user/avatar', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + getToken() },
      body: formData
    });
    const data = await res.json();
    if (res.ok) {
      avatarImg.src = data.avatar + '?t=' + Date.now();
      avatarImg.classList.remove('avatar-placeholder');
    } else {
      alert(data.error || '上传失败');
    }
  } catch (e) {
    alert('上传失败，请重试');
  }
  avatarInput.value = '';
});

saveNicknameBtn.addEventListener('click', async () => {
  const nickname = nicknameInput.value.trim();
  if (!nickname) {
    nicknameMsg.textContent = '昵称不能为空';
    nicknameMsg.style.color = 'var(--semantic-error)';
    return;
  }
  try {
    const res = await fetch('/api/user/profile', {
      method: 'PUT',
      headers: apiHeaders(),
      body: JSON.stringify({ nickname })
    });
    const data = await res.json();
    if (res.ok) {
      nicknameMsg.textContent = '昵称修改成功';
      nicknameMsg.style.color = 'var(--semantic-success)';
      profileNickname.textContent = data.nickname;
      navUsername.textContent = data.nickname;
      const stored = JSON.parse(localStorage.getItem('user') || '{}');
      stored.nickname = data.nickname;
      localStorage.setItem('user', JSON.stringify(stored));
    } else {
      nicknameMsg.textContent = data.error || '修改失败';
      nicknameMsg.style.color = 'var(--semantic-error)';
    }
  } catch (e) {
    nicknameMsg.textContent = '网络错误';
    nicknameMsg.style.color = 'var(--semantic-error)';
  }
});

changePasswordBtn.addEventListener('click', async () => {
  const oldPwd = oldPassword.value;
  const newPwd = newPassword.value;
  const confirmPwd = confirmPassword.value;

  if (!oldPwd || !newPwd || !confirmPwd) {
    passwordMsg.textContent = '请填写所有密码字段';
    passwordMsg.style.color = 'var(--semantic-error)';
    return;
  }
  if (newPwd.length < 6) {
    passwordMsg.textContent = '新密码至少6位';
    passwordMsg.style.color = 'var(--semantic-error)';
    return;
  }
  if (newPwd !== confirmPwd) {
    passwordMsg.textContent = '两次输入的新密码不一致';
    passwordMsg.style.color = 'var(--semantic-error)';
    return;
  }

  try {
    const res = await fetch('/api/user/password', {
      method: 'PUT',
      headers: apiHeaders(),
      body: JSON.stringify({ oldPassword: oldPwd, newPassword: newPwd })
    });
    const data = await res.json();
    if (res.ok) {
      passwordMsg.textContent = '密码修改成功';
      passwordMsg.style.color = 'var(--semantic-success)';
      oldPassword.value = '';
      newPassword.value = '';
      confirmPassword.value = '';
    } else {
      passwordMsg.textContent = data.error || '修改失败';
      passwordMsg.style.color = 'var(--semantic-error)';
    }
  } catch (e) {
    passwordMsg.textContent = '网络错误';
    passwordMsg.style.color = 'var(--semantic-error)';
  }
});

logoutBtn.addEventListener('click', () => {
  localStorage.removeItem('token');
  window.location.href = 'index.html';
});

async function loadHistory(page) {
  currentPage = page;
  try {
    const res = await fetch('/api/user/history?page=' + page + '&limit=10', {
      headers: { 'Authorization': 'Bearer ' + getToken() }
    });
    if (!res.ok) return;
    const data = await res.json();

    historyTbody.innerHTML = '';
    if (data.scores.length === 0) {
      historyEmpty.style.display = '';
      pagination.innerHTML = '';
      return;
    }
    historyEmpty.style.display = 'none';

    data.scores.forEach(s => {
      const tr = document.createElement('tr');
      const dateStr = new Date(s.created_at).toLocaleDateString('zh-CN');
      tr.innerHTML =
        '<td>' + escapeHtml(s.article_title || '未知文章') + '</td>' +
        '<td>' + s.speed + ' 字/分</td>' +
        '<td>' + s.accuracy + '%</td>' +
        '<td>' + s.time_seconds + '秒</td>' +
        '<td>' + dateStr + '</td>';
      historyTbody.appendChild(tr);
    });

    renderPagination(data.pagination);
  } catch (e) {}
}

function renderPagination(p) {
  pagination.innerHTML = '';
  if (p.totalPages <= 1) return;

  const prevBtn = document.createElement('button');
  prevBtn.textContent = '上一页';
  prevBtn.className = 'page-btn';
  prevBtn.disabled = p.page <= 1;
  prevBtn.addEventListener('click', () => loadHistory(p.page - 1));
  pagination.appendChild(prevBtn);

  const info = document.createElement('span');
  info.className = 'page-info';
  info.textContent = p.page + ' / ' + p.totalPages;
  pagination.appendChild(info);

  const nextBtn = document.createElement('button');
  nextBtn.textContent = '下一页';
  nextBtn.className = 'page-btn';
  nextBtn.disabled = p.page >= p.totalPages;
  nextBtn.addEventListener('click', () => loadHistory(p.page + 1));
  pagination.appendChild(nextBtn);
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

async function initProfile() {
  try {
    loadVersion();
    await checkAuth();
  } catch (e) {
    console.error('个人中心初始化失败', e);
  }
}

initProfile();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('service-worker.js').catch(() => {});
}

// 离线状态检测：服务器不可达时显示红色横幅
const offlineBanner = document.getElementById('offline-banner');
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
async function updateOfflineStatus() {
  if (!navigator.onLine) {
    setOfflineBanner(true);
    return;
  }
  const reachable = await checkServerReachable();
  setOfflineBanner(!reachable);
}
window.addEventListener('offline', updateOfflineStatus);
window.addEventListener('online', updateOfflineStatus);
updateOfflineStatus();
setInterval(updateOfflineStatus, 30000);
