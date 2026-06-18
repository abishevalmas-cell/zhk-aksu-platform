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

// 'zhk-odn-periods' stores per-period ОДН: { "<year>-<month>": { total, per, n } }.
// 'per' is the per-apartment ОДН for that period (total split equally between the
// apartments that normally pay ОДН). If a period has an entry, every paying
// apartment (base tariff odn > 0) uses 'per'; apartments with base odn 0 stay 0.
// Without an entry for the period, the apartment's own tariff odn is used (as before).
window.odnForApt = function(baseOdn, month, year) {
  baseOdn = Number(baseOdn) || 0;
  if (month === null || month === undefined || year === null || year === undefined) return baseOdn;
  try {
    var map = JSON.parse(localStorage.getItem('zhk-odn-periods') || '{}');
    var v = map ? map[year + '-' + month] : null;
    if (v === null || v === undefined) return baseOdn;
    var per = (typeof v === 'object') ? v.per : v;
    if (per === null || per === undefined || per === '') return baseOdn;
    return baseOdn > 0 ? Number(per) : 0;
  } catch (e) {
    return baseOdn;
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
    'zhk-gas-off-months', 'zhk-odn-periods'
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

      var odnBtn = document.createElement('button');
      odnBtn.id = 'odn-periods-btn';
      odnBtn.style.cssText = 'width:100%;display:flex;align-items:center;gap:12px;padding:10px 20px;font-size:14px;font-weight:500;color:#94a3b8;background:transparent;border:none;cursor:pointer;font-family:inherit;text-align:left;';
      odnBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18"/><path d="M5 21V7l7-4 7 4v14"/><path d="M9 21v-6h6v6"/></svg> ОДН по периодам';
      odnBtn.onmouseover = function() { odnBtn.style.color = '#fff'; odnBtn.style.background = '#1e293b'; };
      odnBtn.onmouseout = function() { odnBtn.style.color = '#94a3b8'; odnBtn.style.background = 'transparent'; };
      odnBtn.onclick = openOdnPeriodsModal;

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
      nav.appendChild(odnBtn);
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

  // Modal to set ОДН per period: one total per month, split equally between
  // the apartments that pay ОДН. Stored per period, independent of other months.
  function openOdnPeriodsModal() {
    if (document.getElementById('odn-periods-overlay')) return;
    var MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
      'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];

    function loadMap() {
      try { return JSON.parse(localStorage.getItem('zhk-odn-periods') || '{}') || {}; } catch (e) { return {}; }
    }
    function payingCount() {
      try {
        var apts = JSON.parse(localStorage.getItem('zhk-apartments') || '[]') || [];
        return apts.filter(function(a) { return a && a.tariffs && Number(a.tariffs.odn) > 0; }).length;
      } catch (e) { return 0; }
    }

    var now = new Date();
    var curM = now.getMonth() + 1, curY = now.getFullYear();
    var n = payingCount();

    var overlay = document.createElement('div');
    overlay.id = 'odn-periods-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:10000;background:rgba(15,23,42,.5);display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif;padding:16px;';

    var box = document.createElement('div');
    box.style.cssText = 'background:#fff;border-radius:16px;max-width:460px;width:100%;max-height:90vh;overflow:auto;box-shadow:0 20px 60px rgba(0,0,0,.3);';

    var monthOpts = '';
    for (var i = 1; i <= 12; i++) monthOpts += '<option value="' + i + '"' + (i === curM ? ' selected' : '') + '>' + MONTHS[i - 1] + '</option>';

    box.innerHTML =
      '<div style="padding:20px 22px;border-bottom:1px solid #f1f5f9">' +
        '<div style="font-size:17px;font-weight:700;color:#0f172a">ОДН по периодам</div>' +
        '<div style="font-size:13px;color:#64748b;margin-top:6px;line-height:1.5">Введите общую сумму ОДН (общедомовые) за месяц — она разделится поровну между квартирами, которые платят ОДН. Сумма сохраняется отдельно для каждого периода и не сбрасывается при обновлении данных. Если поле пустое и сохранено — для этого месяца берётся обычный тариф квартиры.</div>' +
      '</div>' +
      '<div style="padding:18px 22px;display:flex;flex-direction:column;gap:14px">' +
        '<div style="display:flex;gap:10px">' +
          '<div style="flex:1"><label style="display:block;font-size:12px;font-weight:600;color:#475569;margin-bottom:4px">Месяц</label>' +
            '<select id="odn-month" style="width:100%;padding:9px 10px;border:1px solid #e2e8f0;border-radius:10px;font-size:14px;background:#fff">' + monthOpts + '</select></div>' +
          '<div style="width:110px"><label style="display:block;font-size:12px;font-weight:600;color:#475569;margin-bottom:4px">Год</label>' +
            '<input id="odn-year" type="number" value="' + curY + '" style="width:100%;padding:9px 10px;border:1px solid #e2e8f0;border-radius:10px;font-size:14px"></div>' +
        '</div>' +
        '<div><label style="display:block;font-size:12px;font-weight:600;color:#475569;margin-bottom:4px">Общая сумма ОДН за месяц (тг)</label>' +
          '<input id="odn-total" type="number" placeholder="например, 426300" style="width:100%;padding:10px 12px;border:1px solid #e2e8f0;border-radius:10px;font-size:15px"></div>' +
        '<div id="odn-calc" style="font-size:13px;color:#334155;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:10px 12px;line-height:1.6"></div>' +
      '</div>' +
      '<div style="padding:6px 22px 20px;display:flex;gap:10px;justify-content:flex-end">' +
        '<button id="odn-clear" style="padding:9px 16px;border-radius:10px;border:1px solid #fecaca;background:#fff;color:#dc2626;font-size:14px;font-weight:600;cursor:pointer">Сбросить период</button>' +
        '<button id="odn-cancel" style="padding:9px 16px;border-radius:10px;border:1px solid #e2e8f0;background:#fff;color:#475569;font-size:14px;font-weight:600;cursor:pointer">Отмена</button>' +
        '<button id="odn-save" style="padding:9px 16px;border-radius:10px;border:none;background:#0f172a;color:#fff;font-size:14px;font-weight:600;cursor:pointer">Сохранить</button>' +
      '</div>';

    overlay.appendChild(box);
    document.body.appendChild(overlay);

    var mSel = document.getElementById('odn-month');
    var ySel = document.getElementById('odn-year');
    var totalInp = document.getElementById('odn-total');
    var calcEl = document.getElementById('odn-calc');

    function curKey() { return ySel.value + '-' + mSel.value; }
    function fmt(x) { return Number(x).toLocaleString('ru-RU'); }

    function refresh() {
      var t = parseFloat(totalInp.value);
      if (!n) {
        calcEl.innerHTML = '<span style="color:#dc2626">Нет квартир с включённым ОДН — распределять не на кого.</span>';
        return;
      }
      if (!t || t <= 0) {
        calcEl.innerHTML = 'Платят ОДН: <b>' + n + '</b> квартир. Введите общую сумму, чтобы увидеть расчёт на квартиру.';
        return;
      }
      var per = Math.round(t / n);
      calcEl.innerHTML = 'Платят ОДН: <b>' + n + '</b> квартир.<br>На каждую квартиру: <b>' + fmt(per) + ' тг</b> (' + fmt(t) + ' ÷ ' + n + ').';
    }

    function loadPeriod() {
      var v = loadMap()[curKey()];
      if (v && typeof v === 'object') totalInp.value = (v.total != null ? v.total : '');
      else if (v != null && v !== '') totalInp.value = (Number(v) * (n || 1)); // legacy: stored per-apartment
      else totalInp.value = '';
      refresh();
    }

    mSel.onchange = loadPeriod;
    ySel.onchange = loadPeriod;
    totalInp.oninput = refresh;
    loadPeriod();

    function close() { overlay.remove(); }
    overlay.addEventListener('click', function(e) { if (e.target === overlay) close(); });
    document.getElementById('odn-cancel').onclick = close;

    function persist(map, btn) {
      localStorage.setItem('zhk-odn-periods', JSON.stringify(map));
      btn.textContent = '...'; btn.disabled = true;
      fetch('/api/data', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: { 'zhk-odn-periods': map } }),
      }).catch(function() {}).then(function() { window.location.reload(); });
    }

    document.getElementById('odn-save').onclick = function() {
      var t = parseFloat(totalInp.value);
      var map = loadMap();
      if (!t || t <= 0) { delete map[curKey()]; }
      else { map[curKey()] = { total: t, per: (n ? Math.round(t / n) : 0), n: n }; }
      persist(map, this);
    };
    document.getElementById('odn-clear').onclick = function() {
      var map = loadMap();
      delete map[curKey()];
      persist(map, this);
    };
  }
  window.openOdnPeriodsModal = openOdnPeriodsModal;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() { setTimeout(addSidebarExtras, 1000); });
  } else {
    setTimeout(addSidebarExtras, 1000);
  }
})();
