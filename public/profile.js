let currentUser = null;
let currentPage = 1;
let statsChart = null;

const navUsername = document.getElementById('nav-username');
const logoutBtn = document.getElementById('logout-btn');
const adminNavItem = document.getElementById('admin-nav-item');
const accessDenied = document.getElementById('access-denied');
const profileContent = document.getElementById('profile-content');

const avatarImg = document.getElementById('profile-avatar-img');
const avatarOverlay = document.getElementById('avatar-overlay');
const avatarInput = document.getElementById('avatar-input');
const avatarCropOverlay = document.getElementById('avatar-crop-overlay');
const avatarCropCanvas = document.getElementById('avatar-crop-canvas');
const avatarCropPreview = document.getElementById('avatar-crop-preview');
const avatarCropZoom = document.getElementById('avatar-crop-zoom');
const avatarCropMsg = document.getElementById('avatar-crop-msg');
const avatarCropConfirm = document.getElementById('avatar-crop-confirm');
const avatarCropCancel = document.getElementById('avatar-crop-cancel');
const avatarCropReselect = document.getElementById('avatar-crop-reselect');
const CROP_SIZE = 320;
const avatarCrop = {
  source: null, objectUrl: null, width: 0, height: 0, zoom: 1,
  baseScale: 1, drawW: 0, drawH: 0, offsetX: 0, offsetY: 0,
  drag: null, uploading: false, loadToken: 0
};
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
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
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
      await showProfile();
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


/* ---------- P30：个人中心面板切换 / 侧栏折叠 ---------- */
var PROFILE_TABS = ['overview', 'race-history', 'practice-history', 'errors', 'submissions', 'private', 'offline', 'account'];
function activateProfileTab(tab, updateHash) {
  if (PROFILE_TABS.indexOf(tab) < 0) tab = 'overview';
  document.querySelectorAll('.profile-sidebar .nav-menu a[data-tab]').forEach(function (link) {
    link.classList.toggle('active', link.dataset.tab === tab);
  });
  document.querySelectorAll('.profile-main .profile-section').forEach(function (panel) {
    panel.classList.toggle('profile-section-active', panel.id === 'panel-' + tab);
  });
  if (updateHash && location.hash !== '#' + tab) {
    try { history.replaceState(null, '', '#' + tab); } catch (e) { location.hash = tab; }
  }
  if (tab === 'overview' && statsChart) {
    setTimeout(function () { try { statsChart.resize(); } catch (e) {} }, 0);
  }
  if (tab === 'race-history' && typeof loadRaceHistory === 'function') loadRaceHistory(1);
}
function initProfileTabs() {
  var sidebar = document.getElementById('profile-sidebar');
  var toggle = document.getElementById('profile-sidebar-toggle');
  if (toggle && sidebar) {
    toggle.addEventListener('click', function () {
      var collapsed = sidebar.classList.toggle('collapsed');
      sidebar.classList.toggle('expanded', !collapsed);
      toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    });
  }
  document.querySelectorAll('.profile-sidebar .nav-menu a[data-tab]').forEach(function (link) {
    link.addEventListener('click', function (e) {
      e.preventDefault();
      activateProfileTab(link.dataset.tab, true);
    });
  });
  window.addEventListener('hashchange', function () {
    activateProfileTab(location.hash.slice(1), false);
  });
  activateProfileTab(location.hash.slice(1), false);
  var profileLogout = document.getElementById('profile-logout-btn');
  if (profileLogout) {
    profileLogout.addEventListener('click', function () {
      if (logoutBtn) logoutBtn.click();
    });
  }
}

async function showProfile() {
  accessDenied.style.display = 'none';
  profileContent.style.display = '';

  navUsername.textContent = currentUser.nickname || currentUser.username;
  if (currentUser.role === 'admin') {
    adminNavItem.style.display = '';
  }

  await Promise.all([loadProfile(), loadHistory(1)]);
  activateProfileTab(location.hash.slice(1), false);
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

function releaseCropSource() {
  if (avatarCrop.source && typeof avatarCrop.source.close === 'function') {
    try { avatarCrop.source.close(); } catch (e) {}
  }
  avatarCrop.source = null;
  if (avatarCrop.objectUrl) {
    try { URL.revokeObjectURL(avatarCrop.objectUrl); } catch (e) {}
    avatarCrop.objectUrl = null;
  }
}

function clampCropOffsets() {
  const minX = CROP_SIZE - avatarCrop.drawW;
  const minY = CROP_SIZE - avatarCrop.drawH;
  avatarCrop.offsetX = Math.min(0, Math.max(minX, avatarCrop.offsetX));
  avatarCrop.offsetY = Math.min(0, Math.max(minY, avatarCrop.offsetY));
}

function drawCrop() {
  const ctx = avatarCropCanvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, CROP_SIZE, CROP_SIZE);
  if (!avatarCrop.source) return;
  clampCropOffsets();
  ctx.drawImage(avatarCrop.source, avatarCrop.offsetX, avatarCrop.offsetY, avatarCrop.drawW, avatarCrop.drawH);
}

function updateCropGeometry(center) {
  if (!avatarCrop.source) return;
  const fit = Math.max(CROP_SIZE / avatarCrop.width, CROP_SIZE / avatarCrop.height);
  avatarCrop.drawW = avatarCrop.width * fit * avatarCrop.zoom;
  avatarCrop.drawH = avatarCrop.height * fit * avatarCrop.zoom;
  if (center) {
    avatarCrop.offsetX = (CROP_SIZE - avatarCrop.drawW) / 2;
    avatarCrop.offsetY = (CROP_SIZE - avatarCrop.drawH) / 2;
  }
  drawCrop();
}

function createCropSource(file) {
  if (window.createImageBitmap) {
    return createImageBitmap(file, { imageOrientation: 'from-image' })
      .then(function (bitmap) { return { source: bitmap, url: null }; })
      .catch(function () { return createCropSourceFallback(file); });
  }
  return createCropSourceFallback(file);
}

function createCropSourceFallback(file) {
  return new Promise(function (resolve, reject) {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = function () { resolve({ source: img, url: url }); };
    img.onerror = function () {
      try { URL.revokeObjectURL(url); } catch (e) {}
      reject(new Error('图片加载失败，请换一张图片'));
    };
    img.src = url;
  });
}

function openAvatarCrop(file) {
  const token = ++avatarCrop.loadToken;
  releaseCropSource();
  avatarCrop.zoom = 1;
  avatarCrop.drag = null;
  avatarCropUploadReset();
  avatarCropOverlay.style.display = 'flex';
  avatarCropZoom.value = '1';
  avatarCropMsg.textContent = '';
  avatarCropMsg.style.color = '';
  createCropSource(file).then(function (result) {
    if (token !== avatarCrop.loadToken) {
      if (result.source && typeof result.source.close === 'function') result.source.close();
      if (result.url) URL.revokeObjectURL(result.url);
      return;
    }
    avatarCrop.source = result.source;
    avatarCrop.objectUrl = result.url;
    avatarCrop.width = result.source.width || result.source.naturalWidth;
    avatarCrop.height = result.source.height || result.source.naturalHeight;
    updateCropGeometry(true);
    avatarCropCanvas.focus();
  }).catch(function (e) {
    if (token === avatarCrop.loadToken) {
      avatarCropMsg.textContent = e.message || '图片加载失败，请换一张图片';
      avatarCropMsg.style.color = 'var(--semantic-error)';
    }
  });
}

function avatarCropUploadReset() {
  avatarCrop.uploading = false;
  avatarCropConfirm.disabled = false;
  avatarCropConfirm.textContent = '确认裁剪';
  avatarCropCancel.disabled = false;
  avatarCropReselect.disabled = false;
}

function closeAvatarCrop() {
  if (avatarCrop.uploading) return;
  avatarCrop.loadToken += 1;
  avatarCropOverlay.style.display = 'none';
  releaseCropSource();
  avatarCrop.drag = null;
  avatarCrop.zoom = 1;
  avatarCropMsg.textContent = '';
  avatarCropMsg.style.color = '';
  avatarCropUploadReset();
  avatarInput.value = '';
}

function cropToBlob() {
  return new Promise(function (resolve, reject) {
    const out = document.createElement('canvas');
    out.width = 256;
    out.height = 256;
    const ctx = out.getContext('2d');
    if (!ctx || !avatarCrop.source) { reject(new Error('导出图片失败')); return; }
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, 256, 256);
    const k = 256 / CROP_SIZE;
    ctx.drawImage(avatarCrop.source, avatarCrop.offsetX * k, avatarCrop.offsetY * k, avatarCrop.drawW * k, avatarCrop.drawH * k);
    out.toBlob(function (blob) {
      if (blob) resolve(blob);
      else reject(new Error('导出图片失败'));
    }, 'image/jpeg', 0.9);
  });
}

async function confirmAvatarCrop() {
  if (!avatarCrop.source || avatarCrop.uploading) return;
  avatarCrop.uploading = true;
  avatarCropConfirm.disabled = true;
  avatarCropConfirm.textContent = '上传中…';
  avatarCropCancel.disabled = true;
  avatarCropReselect.disabled = true;
  avatarCropMsg.textContent = '';
  avatarCropMsg.style.color = '';
  try {
    const blob = await cropToBlob();
    if (blob.size > 5 * 1024 * 1024) throw new Error('图片不能超过 5MB');
    const formData = new FormData();
    formData.append('avatar', blob, 'avatar.jpg');
    const res = await fetch('/api/user/avatar', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + getToken() },
      body: formData
    });
    const data = await res.json().catch(function () { return {}; });
    if (!res.ok) throw new Error(data.error || '上传失败');
    avatarImg.src = data.avatar + '?t=' + Date.now();
    avatarImg.classList.remove('avatar-placeholder');
    avatarCrop.uploading = false;
    closeAvatarCrop();
    return;
  } catch (e) {
    avatarCropMsg.textContent = e.message || '上传失败';
    avatarCropMsg.style.color = 'var(--semantic-error)';
  }
  avatarCrop.uploading = false;
  avatarCropUploadReset();
}

avatarInput.addEventListener('change', () => {
  const file = avatarInput.files[0];
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) {
    alert('图片不能超过 5MB（当前 ' + (file.size / 1024 / 1024).toFixed(1) + ' MB）');
    avatarInput.value = '';
    return;
  }
  const allowed = ['image/jpeg', 'image/png', 'image/webp'];
  if (!allowed.includes(file.type)) {
    alert('仅支持 JPG/PNG/WebP');
    avatarInput.value = '';
    return;
  }
  openAvatarCrop(file);
});

avatarCropZoom.addEventListener('input', function () {
  avatarCrop.zoom = Math.min(3, Math.max(1, Number(avatarCropZoom.value) || 1));
  updateCropGeometry(false);
});
avatarCropCanvas.addEventListener('wheel', function (e) {
  if (!avatarCrop.source) return;
  e.preventDefault();
  avatarCrop.zoom = Math.min(3, Math.max(1, avatarCrop.zoom - e.deltaY * 0.001));
  avatarCropZoom.value = String(avatarCrop.zoom);
  updateCropGeometry(false);
}, { passive: false });
avatarCropCanvas.addEventListener('pointerdown', function (e) {
  if (!avatarCrop.source || avatarCrop.uploading) return;
  avatarCrop.drag = { id: e.pointerId, x: e.clientX, y: e.clientY, ox: avatarCrop.offsetX, oy: avatarCrop.offsetY };
  avatarCropPreview.classList.add('dragging');
  try { avatarCropCanvas.setPointerCapture(e.pointerId); } catch (err) {}
});
avatarCropCanvas.addEventListener('pointermove', function (e) {
  const drag = avatarCrop.drag;
  if (!drag || drag.id !== e.pointerId) return;
  const rect = avatarCropCanvas.getBoundingClientRect();
  const k = CROP_SIZE / Math.max(1, rect.width);
  avatarCrop.offsetX = drag.ox + (e.clientX - drag.x) * k;
  avatarCrop.offsetY = drag.oy + (e.clientY - drag.y) * k;
  drawCrop();
});
function endCropDrag(e) {
  if (!avatarCrop.drag) return;
  if (e && e.pointerId !== avatarCrop.drag.id) return;
  avatarCrop.drag = null;
  avatarCropPreview.classList.remove('dragging');
}
avatarCropCanvas.addEventListener('pointerup', endCropDrag);
avatarCropCanvas.addEventListener('pointercancel', endCropDrag);
avatarCropConfirm.addEventListener('click', confirmAvatarCrop);
avatarCropCancel.addEventListener('click', closeAvatarCrop);
avatarCropReselect.addEventListener('click', function () {
  if (avatarCrop.uploading) return;
  closeAvatarCrop();
  avatarInput.value = '';
  avatarInput.click();
});
avatarCropOverlay.addEventListener('click', function (e) {
  if (e.target === avatarCropOverlay) closeAvatarCrop();
});
document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape' && avatarCropOverlay.style.display !== 'none') closeAvatarCrop();
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
  } finally {
    if (window.PageLoading) window.PageLoading.done();
  }
}

initProfile();
initProfileTabs();

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
