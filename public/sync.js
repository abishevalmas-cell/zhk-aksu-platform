// Storage sync layer: bridges localStorage with server API
// Loaded BEFORE the main app to intercept all localStorage calls

// ── STEP 1: Synchronous load — blocks page until data is in localStorage ──
(function() {
  try {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', '/api/data', false); // synchronous — blocks parsing
    xhr.setRequestHeader('Accept', 'application/json');
    xhr.send();
    if (xhr.status === 200) {
      var data = JSON.parse(xhr.responseText);
      for (var key in data) {
        if (data.hasOwnProperty(key) && data[key] !== null && data[key] !== undefined) {
          var val = typeof data[key] === 'string' ? data[key] : JSON.stringify(data[key]);
          localStorage.setItem(key, val);
        }
      }
    }
  } catch (e) {
    console.error('Sync: initial load failed', e);
  }
})();

// ── STEP 2: Async write-back and polling ──
(function() {
  'use strict';

  var SYNC_KEYS = [
    'zhk-apartments', 'zhk-meters', 'zhk-payments',
    'zhk-employees', 'zhk-salary', 'zhk-expenses',
    'zhk-requests', 'zhk-common-meters', 'zhk-common-meter-defs',
    'zhk-global-tariffs', 'zhk-kaspi-phone'
  ];

  var GREEN_API_KEYS = ['greenapi-id', 'greenapi-token'];

  var syncTimer = null;
  var pendingWrites = {};

  // Override localStorage.setItem to intercept writes
  var originalSetItem = localStorage.setItem.bind(localStorage);

  function scheduleSyncToServer(key, value) {
    if (SYNC_KEYS.indexOf(key) === -1 && GREEN_API_KEYS.indexOf(key) === -1) return;
    pendingWrites[key] = value;
    if (syncTimer) clearTimeout(syncTimer);
    syncTimer = setTimeout(flushToServer, 800);
  }

  async function flushToServer() {
    var writes = Object.assign({}, pendingWrites);
    pendingWrites = {};
    if (Object.keys(writes).length === 0) return;

    try {
      var data = {};
      for (var key in writes) {
        try { data[key] = JSON.parse(writes[key]); }
        catch (e) { data[key] = writes[key]; }
      }
      await fetch('/api/data', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: data }),
      });
      showSyncStatus('saved');
    } catch (err) {
      console.error('Sync error:', err);
      showSyncStatus('error');
    }
  }

  localStorage.setItem = function(key, value) {
    originalSetItem(key, value);
    scheduleSyncToServer(key, value);
  };

  // Sync indicator
  function showSyncStatus(status) {
    var el = document.getElementById('sync-indicator');
    if (!el) {
      el = document.createElement('div');
      el.id = 'sync-indicator';
      el.style.cssText = 'position:fixed;bottom:12px;right:12px;z-index:9999;padding:6px 14px;border-radius:10px;font-size:12px;font-weight:600;font-family:system-ui,sans-serif;transition:all .3s;pointer-events:none;';
      document.body.appendChild(el);
    }
    if (status === 'saved') {
      el.style.background = '#ecfdf5'; el.style.color = '#059669';
      el.textContent = '☁ Сохранено'; el.style.opacity = '1';
      setTimeout(function() { el.style.opacity = '0'; }, 2000);
    } else if (status === 'error') {
      el.style.background = '#fef2f2'; el.style.color = '#dc2626';
      el.textContent = '⚠ Ошибка синхронизации'; el.style.opacity = '1';
      setTimeout(function() { el.style.opacity = '0'; }, 5000);
    }
  }

  // Poll for changes every 30 seconds
  setInterval(async function() {
    if (Object.keys(pendingWrites).length > 0) return;
    try {
      var res = await fetch('/api/data');
      var data = await res.json();
      for (var key in data) {
        if (data[key] !== null && data[key] !== undefined) {
          var strValue = typeof data[key] === 'string' ? data[key] : JSON.stringify(data[key]);
          if (localStorage.getItem(key) !== strValue) {
            originalSetItem(key, strValue);
          }
        }
      }
    } catch (e) { /* silent */ }
  }, 30000);

  // Add sidebar buttons
  function addSidebarExtras() {
    var obs = new MutationObserver(function() {
      var sidebar = document.querySelector('.fixed.left-0.top-0.h-full.w-56');
      if (!sidebar || document.getElementById('logout-btn')) return;
      var nav = sidebar.querySelector('nav');
      if (!nav) return;

      var onlineDiv = document.createElement('div');
      onlineDiv.id = 'online-indicator';
      onlineDiv.style.cssText = 'display:flex;align-items:center;gap:6px;padding:8px 20px;font-size:11px;color:#94a3b8;';
      onlineDiv.innerHTML = '<span style="width:6px;height:6px;border-radius:50%;background:#22c55e;display:inline-block;animation:pulse 2s infinite"></span> Онлайн · Данные на сервере';

      var importBtn = document.createElement('button');
      importBtn.id = 'import-nav-btn';
      importBtn.style.cssText = 'width:100%;display:flex;align-items:center;gap:12px;padding:10px 20px;font-size:14px;font-weight:500;color:#94a3b8;background:transparent;border:none;cursor:pointer;font-family:inherit;text-align:left;';
      importBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Импорт данных';
      importBtn.onmouseover = function() { importBtn.style.color = '#fff'; importBtn.style.background = '#1e293b'; };
      importBtn.onmouseout = function() { importBtn.style.color = '#94a3b8'; importBtn.style.background = 'transparent'; };
      importBtn.onclick = function() { window.location.href = '/import'; };

      var logoutBtn = document.createElement('button');
      logoutBtn.id = 'logout-btn';
      logoutBtn.style.cssText = 'width:100%;display:flex;align-items:center;gap:12px;padding:10px 20px;font-size:14px;font-weight:500;color:#94a3b8;background:transparent;border:none;cursor:pointer;font-family:inherit;text-align:left;';
      logoutBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg> Выход';
      logoutBtn.onmouseover = function() { logoutBtn.style.color = '#fff'; logoutBtn.style.background = '#1e293b'; };
      logoutBtn.onmouseout = function() { logoutBtn.style.color = '#94a3b8'; logoutBtn.style.background = 'transparent'; };
      logoutBtn.onclick = function() {
        document.cookie = 'zhk-auth=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
        window.location.href = '/login';
      };

      nav.appendChild(onlineDiv);
      nav.appendChild(importBtn);
      nav.appendChild(logoutBtn);
    });

    var root = document.getElementById('root');
    if (root) obs.observe(root, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() { setTimeout(addSidebarExtras, 1000); });
  } else {
    setTimeout(addSidebarExtras, 1000);
  }
})();
