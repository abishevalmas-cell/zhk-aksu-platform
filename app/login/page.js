'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });

    if (res.ok) {
      router.push('/');
      router.refresh();
    } else {
      setError('Неверный пароль');
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: "'DM Sans', system-ui, sans-serif",
      padding: '20px',
    }}>
      <div style={{
        background: '#fff',
        borderRadius: 24,
        padding: '48px 40px',
        maxWidth: 400,
        width: '100%',
        boxShadow: '0 25px 60px rgba(0,0,0,0.4)',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            width: 64, height: 64, borderRadius: 16,
            background: 'linear-gradient(135deg, #1e40af, #3b82f6)',
            margin: '0 auto 16px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontWeight: 900, fontSize: 24,
          }}>А</div>
          <h1 style={{ fontSize: 22, fontWeight: 900, color: '#0f172a', margin: 0 }}>
            ЖК АКСУ
          </h1>
          <p style={{ fontSize: 13, color: '#94a3b8', marginTop: 4 }}>
            Платформа управления
          </p>
        </div>

        <form onSubmit={handleLogin}>
          <div style={{ marginBottom: 16 }}>
            <label style={{
              display: 'block', fontSize: 12, fontWeight: 700,
              color: '#475569', marginBottom: 6,
            }}>Пароль</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Введите пароль"
              autoFocus
              style={{
                width: '100%', padding: '14px 16px',
                border: '2px solid #e2e8f0', borderRadius: 12,
                fontSize: 15, outline: 'none', boxSizing: 'border-box',
                transition: 'border-color 0.2s',
              }}
              onFocus={(e) => e.target.style.borderColor = '#3b82f6'}
              onBlur={(e) => e.target.style.borderColor = '#e2e8f0'}
            />
          </div>

          {error && (
            <div style={{
              background: '#fef2f2', color: '#dc2626',
              padding: '10px 14px', borderRadius: 10,
              fontSize: 13, fontWeight: 600, marginBottom: 16,
              textAlign: 'center',
            }}>{error}</div>
          )}

          <button
            type="submit"
            disabled={loading || !password}
            style={{
              width: '100%', padding: '14px',
              background: loading ? '#94a3b8' : '#1e40af',
              color: '#fff', border: 'none', borderRadius: 12,
              fontSize: 15, fontWeight: 700, cursor: loading ? 'wait' : 'pointer',
              transition: 'background 0.2s',
            }}
          >
            {loading ? 'Вход...' : 'Войти'}
          </button>
        </form>

        <div style={{
          textAlign: 'center', marginTop: 24,
          fontSize: 11, color: '#cbd5e1',
        }}>
          DnA бюро · Платформа управления ЖК
        </div>
      </div>
    </div>
  );
}
