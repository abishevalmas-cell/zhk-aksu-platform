// Full data export to Excel (.xlsx), built in the browser from the data the
// app already loaded from the server into localStorage. Loaded on demand by the
// "Выгрузить в Excel" sidebar button (see sync.js). Uses SheetJS from cdnjs.
(function() {
  'use strict';

  var MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
    'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
  var METHODS = { cash: 'Наличные', transfer: 'Перевод', card: 'Карта' };

  function get(key, def) {
    try {
      var v = localStorage.getItem(key);
      return v ? JSON.parse(v) : def;
    } catch (e) {
      return def;
    }
  }
  function num(x) { var n = Number(x); return isFinite(n) ? n : 0; }
  function r2(x) { return Math.round(num(x) * 100) / 100; }

  // Same rules as the charge calculators in app.html (incl. gas by month and ODN by period)
  function calcCharges(apt, meter, month, year) {
    var t = apt.tariffs || {};
    var gasOff = typeof window.gasOffMonth === 'function' && window.gasOffMonth(month);
    var odn = typeof window.odnForApt === 'function' ? window.odnForApt(t.odn, month, year) : num(t.odn);
    var c = {
      electricity: meter ? r2(num(meter.electricity) * num(t.electricity)) : 0,
      electricityStorage: meter ? r2(num(meter.electricityStorage) * num(t.electricity)) : 0,
      autoCharge: meter ? r2(num(meter.autoCharge) * num(t.autoCharge)) : 0,
      gas: apt.hasGas && !gasOff ? r2(num(apt.area) * num(t.gas)) : 0,
      cleaning: num(t.cleaning),
      trash: num(t.trash),
      intercom: apt.hasIntercom ? num(t.intercom) : 0,
      security: num(t.security),
      elevator: apt.hasElevator ? num(t.elevator) : 0,
      odn: num(odn),
      salary: num(t.salary),
      internet: apt.hasInternet ? num(t.internet) : 0
    };
    return c;
  }
  var CHARGE_COLS = [
    ['electricity', 'Электроэнергия'], ['electricityStorage', 'Эл-во (кладовка)'],
    ['autoCharge', 'Авто зарядка'], ['gas', 'Газ'], ['cleaning', 'Уборка'],
    ['trash', 'Вывоз ТБО'], ['intercom', 'Домофон'], ['security', 'Охрана'],
    ['elevator', 'Лифт'], ['odn', 'ОДН'], ['salary', 'Зарплата ЖК'], ['internet', 'Интернет']
  ];

  function colLetter(i) {
    var s = '';
    i++;
    while (i > 0) { var m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); }
    return s;
  }

  // Build a sheet from a header row and data rows. A cell may be a plain value
  // or {v, f} for a formula with its precomputed value.
  function makeSheet(XLSX, header, rows, widths) {
    var ws = XLSX.utils.aoa_to_sheet([header].concat(rows.map(function(r) {
      return r.map(function(c) { return (c && typeof c === 'object' && 'f' in c) ? c.v : c; });
    })));
    rows.forEach(function(r, ri) {
      r.forEach(function(c, ci) {
        if (c && typeof c === 'object' && 'f' in c) {
          var ref = colLetter(ci) + (ri + 2);
          ws[ref] = { t: 'n', v: c.v, f: c.f };
        }
      });
    });
    ws['!cols'] = header.map(function(h, i) { return { wch: (widths && widths[i]) || Math.max(10, String(h).length + 2) }; });
    if (rows.length) ws['!autofilter'] = { ref: 'A1:' + colLetter(header.length - 1) + (rows.length + 1) };
    return ws;
  }

  // Generic dump of an array of records: every field becomes a column.
  function genericSheet(XLSX, records, aptName, empName) {
    if (!Array.isArray(records) || !records.length) return makeSheet(XLSX, ['Нет данных'], []);
    var keys = [];
    records.forEach(function(r) {
      Object.keys(r || {}).forEach(function(k) { if (keys.indexOf(k) === -1) keys.push(k); });
    });
    var header = [];
    keys.forEach(function(k) {
      header.push(k);
      if (k === 'apartmentId') header.push('Квартира');
      if (k === 'employeeId') header.push('Сотрудник');
    });
    var rows = records.map(function(r) {
      var row = [];
      keys.forEach(function(k) {
        var v = r ? r[k] : '';
        row.push(v !== null && typeof v === 'object' ? JSON.stringify(v) : (v === undefined ? '' : v));
        if (k === 'apartmentId') row.push(aptName(v));
        if (k === 'employeeId') row.push(empName(v));
      });
      return row;
    });
    return makeSheet(XLSX, header, rows);
  }

  function build(XLSX) {
    var apts = get('zhk-apartments', []) || [];
    var meters = get('zhk-meters', []) || [];
    var payments = get('zhk-payments', []) || [];
    var employees = get('zhk-employees', []) || [];

    var aptById = {};
    apts.forEach(function(a) { aptById[a.id] = a; });
    function aptName(id) { var a = aptById[id]; return a ? a.number : (id || ''); }
    function aptOwner(id) { var a = aptById[id]; return a ? a.owner : ''; }
    var empById = {};
    employees.forEach(function(e) { empById[e.id] = e; });
    function empName(id) { var e = empById[id]; return e ? (e.name || e.fullName || id) : (id || ''); }
    function periodKey(y, m) { return y + '-' + (m < 10 ? '0' : '') + m; }

    var wb = XLSX.utils.book_new();

    // ── Начисления: каждая квартира × каждый период с показаниями или оплатой
    // (как в истории квартиры на сайте)
    var chHeader = ['Квартира', 'Владелец', 'Год', 'Месяц', 'Период', 'кВт эл-во', 'кВт кладовка', 'кВт авто']
      .concat(CHARGE_COLS.map(function(c) { return c[1]; }))
      .concat(['Итого начислено', 'Оплачено', 'Долг (+) / переплата (−)']);
    var chRows = [];
    var compStart = 8, compEnd = compStart + CHARGE_COLS.length - 1;
    apts.forEach(function(apt) {
      var mm = {};
      meters.filter(function(m) { return m.apartmentId === apt.id; }).forEach(function(m) {
        var k = periodKey(m.year, m.month);
        if (!mm[k]) mm[k] = { year: m.year, month: m.month, meter: null, paid: 0 };
        mm[k].meter = m;
      });
      payments.filter(function(p) { return p.apartmentId === apt.id; }).forEach(function(p) {
        var k = periodKey(p.year, p.month);
        if (!mm[k]) mm[k] = { year: p.year, month: p.month, meter: null, paid: 0 };
        mm[k].paid += num(p.amount);
      });
      Object.keys(mm).sort().forEach(function(k) {
        var d = mm[k];
        var c = calcCharges(apt, d.meter, d.month, d.year);
        var rowNum = chRows.length + 2;
        var total = 0;
        var row = [apt.number, apt.owner, d.year, d.month, (MONTHS[d.month - 1] || d.month) + ' ' + d.year,
          d.meter ? num(d.meter.electricity) : '', d.meter ? num(d.meter.electricityStorage) : '', d.meter ? num(d.meter.autoCharge) : ''];
        CHARGE_COLS.forEach(function(cc) { row.push(c[cc[0]]); total += c[cc[0]]; });
        total = r2(total);
        var totalCol = colLetter(compEnd + 1), paidCol = colLetter(compEnd + 2);
        row.push({ v: total, f: 'SUM(' + colLetter(compStart) + rowNum + ':' + colLetter(compEnd) + rowNum + ')' });
        row.push(r2(d.paid));
        row.push({ v: r2(total - d.paid), f: totalCol + rowNum + '-' + paidCol + rowNum });
        chRows.push(row);
      });
    });
    var chLast = chRows.length + 1;

    // ── Оплаты
    var payHeader = ['Дата оплаты', 'Квартира', 'Владелец', 'Год', 'Месяц', 'За период', 'Сумма', 'Способ', 'Примечание'];
    var payRows = payments.slice().sort(function(a, b) {
      return String(a.paidAt || '').localeCompare(String(b.paidAt || '')) || periodKey(a.year, a.month).localeCompare(periodKey(b.year, b.month));
    }).map(function(p) {
      return [p.paidAt || '', aptName(p.apartmentId), aptOwner(p.apartmentId), p.year, p.month,
        (MONTHS[p.month - 1] || p.month) + ' ' + p.year, num(p.amount), METHODS[p.method] || p.method || '', p.note || ''];
    });
    var payLast = payRows.length + 1;

    // ── Сводка по квартирам (формулы ссылаются на листы «Начисления» и «Оплаты»)
    var totals = {};
    chRows.forEach(function(r) {
      var t = r[compEnd + 1].v;
      totals[r[0]] = (totals[r[0]] || 0) + t;
    });
    var paidTotals = {};
    payRows.forEach(function(r) { paidTotals[r[1]] = (paidTotals[r[1]] || 0) + r[6]; });
    var sumHeader = ['Квартира', 'Владелец', 'Площадь, м²', 'Начислено всего', 'Оплачено всего', 'Долг (+) / переплата (−)'];
    var totalColCh = colLetter(compEnd + 1);
    var sumRows = apts.map(function(a, i) {
      var rn = i + 2;
      var ch = r2(totals[a.number] || 0), pd = r2(paidTotals[a.number] || 0);
      return [a.number, a.owner, num(a.area),
        { v: ch, f: 'SUMIFS(\'Начисления\'!$' + totalColCh + '$2:$' + totalColCh + '$' + Math.max(chLast, 2) + ',\'Начисления\'!$A$2:$A$' + Math.max(chLast, 2) + ',A' + rn + ')' },
        { v: pd, f: 'SUMIFS(\'Оплаты\'!$G$2:$G$' + Math.max(payLast, 2) + ',\'Оплаты\'!$B$2:$B$' + Math.max(payLast, 2) + ',A' + rn + ')' },
        { v: r2(ch - pd), f: 'D' + rn + '-E' + rn }];
    });
    var n = sumRows.length;
    if (n) {
      sumRows.push(['ИТОГО', '', { v: r2(apts.reduce(function(s, a) { return s + num(a.area); }, 0)), f: 'SUM(C2:C' + (n + 1) + ')' },
        { v: r2(sumRows.reduce(function(s, r) { return s + r[3].v; }, 0)), f: 'SUM(D2:D' + (n + 1) + ')' },
        { v: r2(sumRows.reduce(function(s, r) { return s + r[4].v; }, 0)), f: 'SUM(E2:E' + (n + 1) + ')' },
        { v: r2(sumRows.reduce(function(s, r) { return s + r[5].v; }, 0)), f: 'SUM(F2:F' + (n + 1) + ')' }]);
    }

    XLSX.utils.book_append_sheet(wb, makeSheet(XLSX, sumHeader, sumRows, [16, 24, 12, 18, 18, 24]), 'Сводка');
    XLSX.utils.book_append_sheet(wb, makeSheet(XLSX, chHeader, chRows), 'Начисления');
    XLSX.utils.book_append_sheet(wb, makeSheet(XLSX, payHeader, payRows, [14, 14, 22, 8, 8, 16, 12, 12, 30]), 'Оплаты');

    // ── Показания счётчиков
    var mHeader = ['Квартира', 'Владелец', 'Год', 'Месяц', 'Период', 'Эл-во, кВт', 'Кладовка, кВт', 'Авто зарядка, кВт', 'Примечание'];
    var mRows = meters.slice().sort(function(a, b) {
      return aptName(a.apartmentId).localeCompare(aptName(b.apartmentId)) || periodKey(a.year, a.month).localeCompare(periodKey(b.year, b.month));
    }).map(function(m) {
      return [aptName(m.apartmentId), aptOwner(m.apartmentId), m.year, m.month, (MONTHS[m.month - 1] || m.month) + ' ' + m.year,
        num(m.electricity), num(m.electricityStorage), num(m.autoCharge), m.note || ''];
    });
    XLSX.utils.book_append_sheet(wb, makeSheet(XLSX, mHeader, mRows), 'Показания');

    // ── Квартиры и их тарифы
    var tKeys = ['electricity', 'autoCharge', 'gas', 'cleaning', 'trash', 'intercom', 'security', 'elevator', 'odn', 'salary', 'internet'];
    var tNames = ['Тариф эл-во, тг/кВт', 'Тариф авто, тг/кВт', 'Газ, тг/м²', 'Уборка', 'Вывоз ТБО', 'Домофон', 'Охрана', 'Лифт', 'ОДН (базовый)', 'Зарплата ЖК', 'Интернет'];
    function yn(b) { return b ? 'да' : 'нет'; }
    var aHeader = ['Квартира', 'Владелец', 'Площадь, м²', 'Газ', 'Отопление', 'Интернет', 'Лифт', 'Домофон'].concat(tNames);
    var aRows = apts.map(function(a) {
      var t = a.tariffs || {};
      return [a.number, a.owner, num(a.area), yn(a.hasGas), yn(a.hasHeating), yn(a.hasInternet), yn(a.hasElevator), yn(a.hasIntercom)]
        .concat(tKeys.map(function(k) { return num(t[k]); }));
    });
    XLSX.utils.book_append_sheet(wb, makeSheet(XLSX, aHeader, aRows), 'Квартиры');

    // ── Остальные разделы как есть
    var expenses = get('zhk-expenses', []);
    if (Array.isArray(expenses) && expenses.length) {
      var eRows = expenses.map(function(e) {
        return [e.date || '', e.year, e.month, (MONTHS[e.month - 1] || e.month) + ' ' + e.year, e.category || '', e.description || '', num(e.amount)];
      });
      XLSX.utils.book_append_sheet(wb, makeSheet(XLSX, ['Дата', 'Год', 'Месяц', 'Период', 'Категория', 'Описание', 'Сумма'], eRows, [12, 8, 8, 16, 18, 36, 12]), 'Расходы');
    } else {
      XLSX.utils.book_append_sheet(wb, genericSheet(XLSX, expenses, aptName, empName), 'Расходы');
    }
    XLSX.utils.book_append_sheet(wb, genericSheet(XLSX, get('zhk-salary', []), aptName, empName), 'Зарплата');
    XLSX.utils.book_append_sheet(wb, genericSheet(XLSX, employees, aptName, empName), 'Сотрудники');
    XLSX.utils.book_append_sheet(wb, genericSheet(XLSX, get('zhk-requests', []), aptName, empName), 'Заявки');
    XLSX.utils.book_append_sheet(wb, genericSheet(XLSX, get('zhk-common-meters', []), aptName, empName), 'Общие счётчики');
    XLSX.utils.book_append_sheet(wb, genericSheet(XLSX, get('zhk-utility-bills', []), aptName, empName), 'Счета ЖКХ');

    // ── Настройки и пояснения
    var gt = get('zhk-global-tariffs', {}) || {};
    var off = get('zhk-gas-off-months', []) || [];
    var odnMap = get('zhk-odn-periods', {}) || {};
    var info = [
      ['Выгрузка ЖК АКСУ', new Date().toLocaleString('ru-RU')],
      ['', ''],
      ['Как считаются начисления', 'Так же, как квитанции на сайте: по тарифам квартиры, показаниям счётчиков, с учётом газа по месяцам и ОДН по периодам.'],
      ['Какие месяцы в «Начислениях»', 'Для каждой квартиры — месяцы, где есть показания или оплата (как в истории квартиры на сайте).'],
      ['Долг', 'Начислено минус оплачено. Минус — переплата.'],
      ['', ''],
      ['Газ не начисляется в месяцы', off.length ? off.map(function(m) { return MONTHS[m - 1]; }).join(', ') : 'нет (газ каждый месяц)'],
      ['', ''],
      ['Глобальные тарифы', '']
    ];
    Object.keys(gt).forEach(function(k) { info.push(['  ' + k, num(gt[k])]); });
    info.push(['', '']);
    info.push(['ОДН по периодам', 'Общая сумма / на квартиру / квартир']);
    Object.keys(odnMap).sort().forEach(function(k) {
      var v = odnMap[k], parts = k.split('-');
      var label = (MONTHS[Number(parts[1]) - 1] || parts[1]) + ' ' + parts[0];
      info.push(['  ' + label, typeof v === 'object' ? (num(v.total) + ' / ' + num(v.per) + ' / ' + num(v.n)) : String(v)]);
    });
    var wsInfo = XLSX.utils.aoa_to_sheet(info);
    wsInfo['!cols'] = [{ wch: 32 }, { wch: 90 }];
    XLSX.utils.book_append_sheet(wb, wsInfo, 'Пояснения');

    XLSX.writeFile(wb, 'ZhK_AKSU_vse_dannye_' + new Date().toISOString().slice(0, 10) + '.xlsx');
  }

  function loadSheetJS(cb) {
    if (window.XLSX) return cb(window.XLSX);
    var s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    s.onload = function() { cb(window.XLSX); };
    s.onerror = function() { alert('Не удалось загрузить модуль Excel. Проверьте интернет и попробуйте ещё раз.'); };
    document.head.appendChild(s);
  }

  window.exportAllToExcel = function() {
    loadSheetJS(function(XLSX) {
      try { build(XLSX); } catch (e) { console.error(e); alert('Ошибка выгрузки: ' + e.message); }
    });
  };
})();
