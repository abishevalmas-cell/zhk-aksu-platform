// Parser for meter readings pasted as free text (the format they arrive in
// WhatsApp), used by «Массовый ввод показаний» on the meters page.
//
// Understands lines like:
//   Кв1 537            Кв 15 1064          Кв14  18565
//   Кв3 021170 кл1089  Кв12 21111 кл 1823  (кл / клад / кладовая = кладовка)
//   Кв5 52425 э к 982167                   (э к / эк / э/к / зарядка = третий счётчик, «Авто зарядка»)
//   Офис11 39691       12/12 1 353         12.12-3 5982        TH-01 100
//   Освещения об 16029 Освещения 12/12 3099  (общедомовые — по названию счётчика)
//
// window.parseMeterText(text, ctx) -> array of rows for the preview list.
// ctx: { apts, defs, prevApt(aptId), prevCommon(defId) }
(function() {
  'use strict';

  function lc(s) { return String(s || '').toLowerCase().replace(/ё/g, 'е'); }

  // Apartment number like "кв-11 Офис" -> 11; "12.12-3" -> "12.12-3"; "TH-01" -> "th1"
  function aptKey(number) {
    var n = lc(number).replace(/\s+/g, ' ').trim();
    var m = n.match(/^(?:кв|квартира|офис|оф)\.?\s*-?\s*(\d+)/);
    if (m) return 'flat:' + Number(m[1]);
    m = n.match(/^12\s*[\/.\-]\s*12\s*[\-\s]\s*(\d+)/);
    if (m) return 'b1212:' + Number(m[1]);
    m = n.match(/^th\s*-?\s*0*(\d+)/);
    if (m) return 'th:' + Number(m[1]);
    return 'raw:' + n.replace(/\s+/g, '');
  }

  function nameTokens(s) {
    return lc(s).split(/\s+/).map(function(t) { return t.replace(/[^а-яa-z0-9]/g, ''); })
      .filter(Boolean).map(function(t) { return /^\d+$/.test(t) ? t : t.slice(0, 4); });
  }
  function findDef(defs, name) {
    var it = nameTokens(name);
    var hit = defs.find(function(d) {
      var dt = nameTokens(d.name);
      if (dt.length !== it.length) return false;
      return dt.every(function(t, i) { return t.indexOf(it[i]) === 0 || it[i].indexOf(t) === 0; });
    });
    if (hit) return hit;
    var flat = lc(name).replace(/[\s\/\-.]/g, '');
    return defs.find(function(d) {
      var n = lc(d.name).replace(/[\s\/\-.]/g, '');
      return n === flat || n.indexOf(flat) !== -1 || flat.indexOf(n) !== -1;
    }) || null;
  }

  function usage(val, prev) {
    if (prev === undefined || prev === null) return { text: String(val), warn: false };
    if (val < prev) return { text: '0 (показание меньше прошлого ' + prev + ')', warn: true };
    return { text: String(val - prev), warn: false };
  }

  window.parseMeterText = function(text, ctx) {
    var apts = ctx.apts || [], defs = ctx.defs || [];
    var byKey = {};
    apts.forEach(function(a) { byKey[aptKey(a.number)] = a; });
    var aptRows = [], commonRows = [], seen = {};

    String(text || '').split('\n').forEach(function(raw) {
      var line = raw.trim();
      if (!line) return;
      var s = ' ' + lc(line).replace(/\s+/g, ' ') + ' ';

      // кладовка
      var storageVal, acVal, m;
      m = s.match(/\sкл(?:ад(?:овая|овка|овк)?)?\.?\s*[:\-=]?\s*(\d+)/);
      if (m) { storageVal = parseFloat(m[1]); s = s.replace(m[0], ' '); }
      // третий счётчик: «э к», «эк», «э/к», «зарядка», «авто»
      m = s.match(/\s(?:э\s*[\/.]?\s*к|зарядк[а-я]*|авто[а-я]*)\.?\s*[:\-=]?\s*(\d+)/);
      if (m) { acVal = parseFloat(m[1]); s = s.replace(m[0], ' '); }
      s = s.replace(/\s+/g, ' ').trim();

      var key = null, val;
      if ((m = s.match(/^(?:кв|квартира|офис|оф)\.?\s*-?\s*(\d+)(?:\s*(?:офис|оф))?\s+(\d+)$/))) {
        key = 'flat:' + Number(m[1]); val = parseFloat(m[2]);
      } else if ((m = s.match(/^12\s*[\/.\-]\s*12\s*[\-\s]\s*(\d+)\s+(\d+)$/))) {
        key = 'b1212:' + Number(m[1]); val = parseFloat(m[2]);
      } else if ((m = s.match(/^th\s*-?\s*0*(\d+)\s+(\d+)$/))) {
        key = 'th:' + Number(m[1]); val = parseFloat(m[2]);
      } else if (/^(?:кв|квартира|офис|оф)\.?\s*\d+$/.test(s)) {
        aptRows.push({ apt: line, val: 0, status: '❌ Не указан номер квартиры (одно число) — допишите номер', type: 'apt' });
        return;
      } else if (/^(?:кв|квартира|12\s*[\/.]\s*12|th)/.test(s)) {
        aptRows.push({ apt: line, val: 0, status: '❌ Не распознано', type: 'apt' });
        return;
      }

      if (key) {
        var apt = byKey[key];
        if (!apt) { aptRows.push({ apt: line, val: val, status: '⚠ Квартира не найдена', type: 'apt' }); return; }
        if (seen[apt.id]) {
          aptRows.push({ apt: apt.number, val: val, storageVal: storageVal, acVal: acVal,
            status: '⚠ ' + apt.number + ' указана второй раз — исправьте номер в тексте (эта строка не будет внесена)', type: 'apt' });
          return;
        }
        seen[apt.id] = true;
        var prev = ctx.prevApt ? ctx.prevApt(apt.id) : null;
        var u = usage(val, prev ? prev._rawEl : undefined);
        var parts = [(u.warn ? '⚠' : '✓') + ' расход: ' + u.text + ' кВт'];
        if (prev && prev._rawEl !== undefined) parts.push('(пред: ' + prev._rawEl + ')');
        if (storageVal !== undefined) {
          var us = usage(storageVal, prev ? prev._rawElS : undefined);
          parts.push('📦 кладовка: ' + storageVal + ', расход ' + us.text);
        }
        if (acVal !== undefined) {
          var ua = usage(acVal, prev ? prev._rawAC : undefined);
          parts.push('🔌 э/к (авто зарядка): ' + acVal + ', расход ' + ua.text);
        }
        aptRows.push({ apt: apt.number, val: val, storageVal: storageVal, acVal: acVal,
          status: parts.join(' '), aptId: apt.id, type: 'apt' });
        return;
      }

      // общедомовой счётчик по названию
      m = s.match(/^(.+?)\s+(\d+)$/);
      if (!m) { aptRows.push({ apt: line, val: 0, status: '❌ Не распознано', type: 'apt' }); return; }
      var name = line.replace(/\s+\d+\s*$/, '').trim(), cval = parseFloat(m[2]);
      var def = findDef(defs, name);
      if (!def) {
        commonRows.push({ name: name, val: cval, status: '⚠ Счётчик не найден — создайте его в «Общедомовых»', type: 'common' });
        return;
      }
      if (seen['def:' + def.id]) {
        commonRows.push({ name: name, val: cval, status: '⚠ «' + def.name + '» указан второй раз — эта строка не будет внесена', type: 'common' });
        return;
      }
      seen['def:' + def.id] = true;
      var pc = ctx.prevCommon ? ctx.prevCommon(def.id) : null;
      var uc = usage(cval, pc ? pc._rawVal : undefined);
      commonRows.push({ name: def.name, val: cval, status: (uc.warn ? '⚠' : '✓') + ' расход: ' + uc.text + ' ' + (def.unit || ''), defId: def.id, type: 'common' });
    });

    return commonRows.concat(aptRows);
  };
})();
