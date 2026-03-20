'use client';
import { useState } from 'react';

export default function ImportPage() {
  const [status, setStatus] = useState('');
  const [jsonText, setJsonText] = useState('');

  const handleImport = async () => {
    try {
      const data = JSON.parse(jsonText);
      setStatus('Загружаю на сервер...');

      const res = await fetch('/api/data', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data }),
      });

      if (res.ok) {
        setStatus(`✅ Успешно импортировано ${Object.keys(data).length} записей! Перенаправляю...`);
        setTimeout(() => { window.location.href = '/'; }, 2000);
      } else {
        setStatus('❌ Ошибка сервера');
      }
    } catch (e) {
      setStatus('❌ Ошибка: невалидный JSON — ' + e.message);
    }
  };

  const handleExportFromBrowser = () => {
    const keys = [
      'zhk-apartments', 'zhk-meters', 'zhk-payments',
      'zhk-employees', 'zhk-salary', 'zhk-expenses',
      'zhk-requests', 'zhk-common-meters', 'zhk-common-meter-defs',
      'zhk-global-tariffs', 'zhk-kaspi-phone'
    ];
    const data = {};
    for (const key of keys) {
      const val = localStorage.getItem(key);
      if (val) {
        try { data[key] = JSON.parse(val); } catch { data[key] = val; }
      }
    }
    setJsonText(JSON.stringify(data, null, 2));
    setStatus(`📋 Экспортировано ${Object.keys(data).length} записей из браузера`);
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: '#f8fafc',
      fontFamily: "'DM Sans', system-ui, sans-serif",
      padding: '40px 20px',
    }}>
      <div style={{ maxWidth: 700, margin: '0 auto' }}>
        <h1 style={{ fontSize: 24, fontWeight: 900, color: '#0f172a', marginBottom: 8 }}>
          📥 Импорт данных ЖК АКСУ
        </h1>
        <p style={{ color: '#64748b', fontSize: 14, marginBottom: 24 }}>
          Перенесите данные из старого HTML-файла на онлайн платформу.
        </p>

        <div style={{
          background: '#eff6ff', border: '1px solid #bfdbfe',
          borderRadius: 12, padding: 16, marginBottom: 20, fontSize: 13,
        }}>
          <b style={{ color: '#1d4ed8' }}>Как импортировать:</b>
          <ol style={{ margin: '8px 0 0 20px', color: '#1e40af', lineHeight: 1.8 }}>
            <li>Откройте <b>старый HTML-файл</b> в браузере</li>
            <li>Откройте консоль (<code>F12</code> → Console)</li>
            <li>Вставьте эту команду и нажмите Enter:</li>
          </ol>
          <pre style={{
            background: '#1e293b', color: '#e2e8f0', padding: 12,
            borderRadius: 8, fontSize: 12, marginTop: 8, overflowX: 'auto',
            lineHeight: 1.5,
          }}>
{`var keys=['zhk-apartments','zhk-meters','zhk-payments','zhk-employees','zhk-salary','zhk-expenses','zhk-requests','zhk-common-meters','zhk-common-meter-defs','zhk-global-tariffs','zhk-kaspi-phone'];var d={};keys.forEach(function(k){var v=localStorage.getItem(k);if(v)try{d[k]=JSON.parse(v)}catch(e){d[k]=v}});copy(JSON.stringify(d,null,2));alert('Скопировано! Вставьте в поле на странице импорта.')`}
          </pre>
          <div style={{ marginTop: 8, color: '#3b82f6', fontSize: 12 }}>
            4. Вставьте скопированный текст в поле ниже
          </div>
        </div>

        <textarea
          value={jsonText}
          onChange={(e) => setJsonText(e.target.value)}
          placeholder='{"zhk-apartments": [...], "zhk-meters": [...], ...}'
          style={{
            width: '100%', height: 250, border: '2px solid #e2e8f0',
            borderRadius: 12, padding: 14, fontSize: 13, fontFamily: 'monospace',
            resize: 'vertical', outline: 'none', boxSizing: 'border-box',
          }}
          onFocus={(e) => e.target.style.borderColor = '#3b82f6'}
          onBlur={(e) => e.target.style.borderColor = '#e2e8f0'}
        />

        <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
          <button
            onClick={handleImport}
            disabled={!jsonText.trim()}
            style={{
              flex: 1, padding: 14, background: jsonText.trim() ? '#1e40af' : '#94a3b8',
              color: '#fff', border: 'none', borderRadius: 12,
              fontSize: 15, fontWeight: 700, cursor: jsonText.trim() ? 'pointer' : 'not-allowed',
            }}
          >
            📥 Импортировать на сервер
          </button>

          <button
            onClick={handleExportFromBrowser}
            style={{
              padding: '14px 20px', background: '#f1f5f9', color: '#475569',
              border: '1px solid #e2e8f0', borderRadius: 12,
              fontSize: 14, fontWeight: 600, cursor: 'pointer',
            }}
          >
            📤 Из этого браузера
          </button>

          <a
            href="/"
            style={{
              padding: '14px 20px', background: '#f1f5f9', color: '#475569',
              border: '1px solid #e2e8f0', borderRadius: 12, textDecoration: 'none',
              fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center',
            }}
          >
            ← Назад
          </a>
        </div>

        {status && (
          <div style={{
            marginTop: 16, padding: '12px 16px', borderRadius: 10,
            fontSize: 14, fontWeight: 600,
            background: status.includes('✅') ? '#ecfdf5' : status.includes('❌') ? '#fef2f2' : '#eff6ff',
            color: status.includes('✅') ? '#059669' : status.includes('❌') ? '#dc2626' : '#2563eb',
          }}>
            {status}
          </div>
        )}
      </div>
    </div>
  );
}
