import { useState } from 'react';
import type { AuthUser } from '../store/useAuthStore';

export function SetupPage({ onDone }: { onDone: (user: AuthUser) => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (password !== confirm) { setError('Les mots de passe ne correspondent pas'); return; }
    if (password.length < 10) { setError('Le mot de passe doit contenir au moins 10 caractères'); return; }
    setLoading(true);
    try {
      const res = await fetch('/api/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Erreur'); return; }
      onDone(data.user);
    } catch {
      setError('Erreur réseau');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg-deep)',
    }}>
      <div style={{
        width: 400, background: 'var(--bg-elev)', border: '1px solid var(--border)',
        borderRadius: 12, padding: 32,
      }}>
        <h1 style={{ margin: '0 0 6px', fontSize: 20, fontWeight: 700, color: 'var(--text)' }}>
          Configuration initiale
        </h1>
        <p style={{ margin: '0 0 24px', fontSize: 13, color: 'var(--text-muted)' }}>
          Créez le premier compte administrateur.
        </p>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={labelStyle}>Nom</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} required autoFocus style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Mot de passe (min. 10 caractères)</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Confirmer le mot de passe</label>
            <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} required style={inputStyle} />
          </div>
          {error && <p style={{ margin: 0, fontSize: 13, color: 'var(--color-error, #e05)' }}>{error}</p>}
          <button
            type="submit" disabled={loading}
            style={{
              marginTop: 8, padding: '10px 0', borderRadius: 8, border: 'none',
              background: 'var(--accent)', color: '#fff', fontWeight: 600, fontSize: 14,
              cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? 'Création…' : 'Créer le compte administrateur'}
          </button>
        </form>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = { fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 };
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px', borderRadius: 6,
  border: '1px solid var(--border-soft)', background: 'var(--bg)',
  color: 'var(--text)', fontSize: 14, boxSizing: 'border-box',
};
