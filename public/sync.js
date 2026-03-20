// Storage sync layer: bridges localStorage with server API
// Loaded BEFORE the main app to intercept all localStorage calls

(function() {
  'use strict';

  // ── Intercept setTimeout to delay app init until data is loaded ──
  // App scripts use setTimeout(initFn, 300-800) to initialize.
  // We queue those until server data is in localStorage.
  const _origSetTimeout = window.setTimeout.bind(window);
  const _origClearTimeout = window.clearTimeout.bind(window);
  const _queuedInits = [];
  let _dataLoaded = false;

  window.setTimeout = function(fn, delay) {
    if (!_dataLoaded && typeof fn === 'function' && delay >= 200) {
      _queuedInits.push(fn);
      return -1;
    }
    return _origSetTimeout(fn, delay);
  };

  function releaseQueuedInits() {
    _dataLoaded = true;
    window.setTimeout = _origSetTimeout;
    _queuedInits.forEach(function(fn) { _origSetTimeout(fn, 0); });
    _queuedInits.length = 0;
  }

  // ── Config ──
  const SYNC_KEYS = [
    'zhk-apartments', 'zhk-meters', 'zhk-payments',
    'zhk-employees', 'zhk-salary', 'zhk-expenses',
    'zhk-requests', 'zhk-common-meters', 'zhk-common-meter-defs',
    'zhk-global-tariffs', 'zhk-kaspi-phone'
  ];

  const GREEN_API_KEYS = ['greenapi-id', 'greenapi-token'];

  let syncTimer = null;
  let pendingWrites = {};
  let initialized = false;

  // Debounced sync to server
  function scheduleSyncToServer(key, value) {
    if (!SYNC_KEYS.includes(key) && !GREEN_API_KEYS.includes(key)) return;

    pendingWrites[key] = value;

    if (syncTimer) _origClearTimeout(syncTimer);
    syncTimer = _origSetTimeout(flushToServer, 800);
  }

  async function flushToServer() {
    const writes = { ...pendingWrites };
    pendingWrites = {};

    if (Object.keys(writes).length === 0) return;

    try {
      // Parse JSON strings back to objects for server storage
      const data = {};
      for (const [key, value] of Object.entries(writes)) {
        try {
          data[key] = JSON.parse(value);
        } catch {
          data[key] = value;
        }
      }

      await fetch('/api/data', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data }),
      });

      // Update indicator
      showSyncStatus('saved');
    } catch (err) {
      console.error('Sync error:', err);
      showSyncStatus('error');
    }
  }

  // Override localStorage.setItem to intercept writes
  const originalSetItem = localStorage.setItem.bind(localStorage);

  localStorage.setItem = function(key, value) {
    originalSetItem(key, value);
    scheduleSyncToServer(key, value);
  };

  // Sync indicator UI
  function showSyncStatus(status) {
    let el = document.getElementById('sync-indicator');
    if (!el) {
      el = document.createElement('div');
      el.id = 'sync-indicator';
      el.style.cssText = 'position:fixed;bottom:12px;right:12px;z-index:9999;padding:6px 14px;border-radius:10px;font-size:12px;font-weight:600;font-family:system-ui,sans-serif;transition:all .3s;pointer-events:none;';
      document.body.appendChild(el);
    }

    if (status === 'saved') {
      el.style.background = '#ecfdf5';
      el.style.color = '#059669';
      el.textContent = '☁ Сохранено';
      el.style.opacity = '1';
      _origSetTimeout(function() { el.style.opacity = '0'; }, 2000);
    } else if (status === 'loading') {
      el.style.background = '#eff6ff';
      el.style.color = '#2563eb';
      el.textContent = '↻ Загрузка...';
      el.style.opacity = '1';
    } else if (status === 'error') {
      el.style.background = '#fef2f2';
      el.style.color = '#dc2626';
      el.textContent = '⚠ Ошибка синхронизации';
      el.style.opacity = '1';
      _origSetTimeout(function() { el.style.opacity = '0'; }, 5000);
    }
  }

  // Load all data from server on startup
  async function loadFromServer() {
    showSyncStatus('loading');

    try {
      const res = await fetch('/api/data');
      const data = await res.json();

      for (const [key, value] of Object.entries(data)) {
        if (value !== null && value !== undefined) {
          const strValue = typeof value === 'string' ? value : JSON.stringify(value);
          originalSetItem(key, strValue);
        }
      }

      initialized = true;
      showSyncStatus('saved');
    } catch (err) {
      console.error('Failed to load from server:', err);
      showSyncStatus('error');
    }

    // Release queued app init functions now that data is in localStorage
    releaseQueuedInits();
  }

  // Poll for changes from other users every 30 seconds
  function startPolling() {
    setInterval(async () => {
      if (Object.keys(pendingWrites).length > 0) return; // Don't poll while writing

      try {
        const res = await fetch('/api/data');
        const data = await res.json();

        for (const [key, value] of Object.entries(data)) {
          if (value !== null && value !== undefined) {
            const strValue = typeof value === 'string' ? value : JSON.stringify(value);
            const currentValue = localStorage.getItem(key);
            if (currentValue !== strValue) {
              originalSetItem(key, strValue);
            }
          }
        }
      } catch (err) {
        // Silent fail for polling
      }
    }, 30000);
  }

  // Add sidebar buttons (logout, import, online indicator)
  function addSidebarExtras() {
    const obs = new MutationObserver(function() {
      const sidebar = document.querySelector('.fixed.left-0.top-0.h-full.w-56');
      if (!sidebar || document.getElementById('logout-btn')) return;

      const nav = sidebar.querySelector('nav');
      if (!nav) return;

      // Online indicator
      const onlineDiv = document.createElement('div');
      onlineDiv.id = 'online-indicator';
      onlineDiv.style.cssText = 'display:flex;align-items:center;gap:6px;padding:8px 20px;font-size:11px;color:#94a3b8;';
      onlineDiv.innerHTML = '<span style="width:6px;height:6px;border-radius:50%;background:#22c55e;display:inline-block;animation:pulse 2s infinite"></span> Онлайн · Данные на сервере';

      // Import/Export button
      const importBtn = document.createElement('button');
      importBtn.id = 'import-nav-btn';
      importBtn.style.cssText = 'width:100%;display:flex;align-items:center;gap:12px;padding:10px 20px;font-size:14px;font-weight:500;color:#94a3b8;background:transparent;border:none;cursor:pointer;font-family:inherit;text-align:left;';
      importBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Импорт данных';
      importBtn.onmouseover = () => { importBtn.style.color = '#fff'; importBtn.style.background = '#1e293b'; };
      importBtn.onmouseout = () => { importBtn.style.color = '#94a3b8'; importBtn.style.background = 'transparent'; };
      importBtn.onclick = () => { window.location.href = '/import'; };

      // Logout button
      const logoutBtn = document.createElement('button');
      logoutBtn.id = 'logout-btn';
      logoutBtn.style.cssText = 'width:100%;display:flex;align-items:center;gap:12px;padding:10px 20px;font-size:14px;font-weight:500;color:#94a3b8;background:transparent;border:none;cursor:pointer;font-family:inherit;text-align:left;';
      logoutBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg> Выход';
      logoutBtn.onmouseover = () => { logoutBtn.style.color = '#fff'; logoutBtn.style.background = '#1e293b'; };
      logoutBtn.onmouseout = () => { logoutBtn.style.color = '#94a3b8'; logoutBtn.style.background = 'transparent'; };
      logoutBtn.onclick = () => {
        document.cookie = 'zhk-auth=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
        window.location.href = '/login';
      };

      nav.appendChild(onlineDiv);
      nav.appendChild(importBtn);
      nav.appendChild(logoutBtn);
    });

    const root = document.getElementById('root');
    if (root) obs.observe(root, { childList: true, subtree: true });
  }

  // Safety: if fetch takes too long (5s), release inits anyway
  _origSetTimeout(function() {
    if (!_dataLoaded) {
      console.warn('Sync timeout, releasing app init');
      releaseQueuedInits();
    }
  }, 5000);

  // Initialize
  window.__zhkSyncReady = loadFromServer().then(() => {
    startPolling();
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', addSidebarExtras);
    } else {
      _origSetTimeout(addSidebarExtras, 1000);
    }
  });
})();
