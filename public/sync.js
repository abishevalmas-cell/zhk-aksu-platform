// Storage sync layer: bridges localStorage with server API
// Loaded BEFORE the main app to intercept all localStorage calls

// ── STEP 0: Gas billing per month helper ──
// 'zhk-gas-off-months' stores an array of month numbers (1-12) for which gas
// is NOT billed (non-heating season). Empty/missing => gas billed every month.
// Defined here (before the app bundle) so charge calculators can call it.
window.gasOffMonth = function(month) {
  if (month === null || month === undefined || month === '') return false;
  try {
    var arr = JSON.parse(localStorage.getItem('zhk-gas-off-months') || '[]');
    return Array.isArray(arr) && arr.indexOf(Number(month)) !== -1;
  } catch (e) {
    return false;
  }
};

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
    'zhk-global-tariffs', 'zhk-kaspi-phone', 'zhk-utility-bills',
    'zhk-gas-off-months'
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

      var gasBtn = document.createElement('button');
      gasBtn.id = 'gas-months-btn';
      gasBtn.style.cssText = 'width:100%;display:flex;align-items:center;gap:12px;padding:10px 20px;font-size:14px;font-weight:500;color:#94a3b8;background:transparent;border:none;cursor:pointer;font-family:inherit;text-align:left;';
      gasBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M8.5 14.5A2.5 2.5 0 0011 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 11-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 002.5 2.5z"/></svg> Газ по месяцам';
      gasBtn.onmouseover = function() { gasBtn.style.color = '#fff'; gasBtn.style.background = '#1e293b'; };
      gasBtn.onmouseout = function() { gasBtn.style.color = '#94a3b8'; gasBtn.style.background = 'transparent'; };
      gasBtn.onclick = openGasMonthsModal;

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
      nav.appendChild(gasBtn);
      nav.appendChild(logoutBtn);
    });

    var root = document.getElementById('root');
    if (root) obs.observe(root, { childList: true, subtree: true });
  }

  // Modal to choose months when gas is NOT billed (non-heating season)
  function openGasMonthsModal() {
    if (document.getElementById('gas-months-overlay')) return;
    var MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
      'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
    var off = [];
    try { off = JSON.parse(localStorage.getItem('zhk-gas-off-months') || '[]') || []; } catch (e) { off = []; }

    var overlay = document.createElement('div');
    overlay.id = 'gas-months-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:10000;background:rgba(15,23,42,.5);display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif;padding:16px;';

    var box = document.createElement('div');
    box.style.cssText = 'background:#fff;border-radius:16px;max-width:440px;width:100%;max-height:90vh;overflow:auto;box-shadow:0 20px 60px rgba(0,0,0,.3);';

    var monthsHtml = '';
    for (var i = 1; i <= 12; i++) {
      var on = off.indexOf(i) === -1;
      monthsHtml += '<label style="display:flex;align-items:center;gap:10px;padding:9px 12px;border:1px solid #e2e8f0;border-radius:10px;cursor:pointer;font-size:14px;color:#334155;background:' + (on ? '#fff' : '#fef2f2') + '">' +
        '<input type="checkbox" class="gas-month-cb" data-m="' + i + '"' + (on ? ' checked' : '') + ' style="width:16px;height:16px;cursor:pointer">' +
        '<span>' + MONTHS[i - 1] + '</span></label>';
    }

    box.innerHTML =
      '<div style="padding:20px 22px;border-bottom:1px solid #f1f5f9">' +
        '<div style="font-size:17px;font-weight:700;color:#0f172a">Начисление за газ по месяцам</div>' +
        '<div style="font-size:13px;color:#64748b;margin-top:6px;line-height:1.5">Снимите галочку с месяцев, когда газ <b>не начисляется</b> (неотопительный сезон). За эти месяцы газ не попадёт в квитанцию. Настройка сохраняется на сервере и не сбрасывается при обновлении данных.</div>' +
      '</div>' +
      '<div style="padding:16px 22px;display:grid;grid-template-columns:1fr 1fr;gap:8px">' + monthsHtml + '</div>' +
      '<div style="padding:14px 22px 20px;display:flex;gap:10px;justify-content:flex-end">' +
        '<button id="gas-months-cancel" style="padding:9px 16px;border-radius:10px;border:1px solid #e2e8f0;background:#fff;color:#475569;font-size:14px;font-weight:600;cursor:pointer">Отмена</button>' +
        '<button id="gas-months-save" style="padding:9px 16px;border-radius:10px;border:none;background:#0f172a;color:#fff;font-size:14px;font-weight:600;cursor:pointer">Сохранить</button>' +
      '</div>';

    overlay.appendChild(box);
    document.body.appendChild(overlay);

    function close() { overlay.remove(); }
    overlay.addEventListener('click', function(e) { if (e.target === overlay) close(); });
    document.getElementById('gas-months-cancel').onclick = close;
    document.getElementById('gas-months-save').onclick = function() {
      var newOff = [];
      var cbs = box.querySelectorAll('.gas-month-cb');
      for (var j = 0; j < cbs.length; j++) {
        if (!cbs[j].checked) newOff.push(parseInt(cbs[j].getAttribute('data-m'), 10));
      }
      newOff.sort(function(a, b) { return a - b; });
      var saveBtn = document.getElementById('gas-months-save');
      saveBtn.textContent = 'Сохранение...';
      saveBtn.disabled = true;
      localStorage.setItem('zhk-gas-off-months', JSON.stringify(newOff));
      // Push directly so the server has it before we reload the page
      fetch('/api/data', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: { 'zhk-gas-off-months': newOff } }),
      }).catch(function() {}).then(function() { window.location.reload(); });
    };
  }
  window.openGasMonthsModal = openGasMonthsModal;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() { setTimeout(addSidebarExtras, 1000); });
  } else {
    setTimeout(addSidebarExtras, 1000);
  }
})();
