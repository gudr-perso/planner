import { useEffect, useState } from 'react';
import { apiFetch, useAuth } from '../store/useAuthStore';

type User = {
  id: string; email: string; name: string; role: string;
  is_active: number; created_at: string; last_login: string | null;
};

type CreateForm = { name: string; email: string; password: string; role: string };

// Module-level cache (survit aux démontages)
let _usersCache: User[] | null = null;
let _usersCacheKey = -1;

export function UsersView({ refreshKey = 0 }: { refreshKey?: number }) {
  const { user: me } = useAuth();
  const [users, setUsers] = useState<User[]>(_usersCache ?? []);
  const [loading, setLoading] = useState(_usersCache === null);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<CreateForm>({ name: '', email: '', password: '', role: 'user' });
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' });
  const [pwError, setPwError] = useState('');
  const [pwSaving, setPwSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await apiFetch('/api/admin/users');
      const data = await res.json();
      if (res.ok) {
        _usersCache = data.users;
        _usersCacheKey = refreshKey;
        setUsers(data.users);
      } else setError(data.error || 'Erreur');
    } catch { setError('Erreur réseau'); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    if (_usersCache !== null && _usersCacheKey === refreshKey) return;
    load();
  }, [refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  async function createUser() {
    setFormError('');
    if (!form.name || !form.email || !form.password) { setFormError('Tous les champs sont requis'); return; }
    if (form.password.length < 10) { setFormError('Mot de passe : 10 caractères minimum'); return; }
    setSaving(true);
    try {
      const res = await apiFetch('/api/admin/users', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) { setFormError(data.error || 'Erreur'); return; }
      setShowCreate(false);
      setForm({ name: '', email: '', password: '', role: 'user' });
      load();
    } catch { setFormError('Erreur réseau'); }
    finally { setSaving(false); }
  }

  async function toggleActive(u: User) {
    await apiFetch(`/api/admin/users/${u.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: u.is_active ? 0 : 1 }),
    });
    load();
  }

  async function deleteUser(u: User) {
    if (!confirm(`Supprimer l'utilisateur ${u.name} ?`)) return;
    await apiFetch(`/api/admin/users/${u.id}`, { method: 'DELETE' });
    load();
  }

  async function revokeSessions(u: User) {
    await apiFetch(`/api/admin/users/${u.id}/sessions`, { method: 'DELETE' });
    alert('Sessions révoquées');
  }

  async function changePassword() {
    setPwError('');
    if (pwForm.next !== pwForm.confirm) { setPwError('Les mots de passe ne correspondent pas'); return; }
    if (pwForm.next.length < 10) { setPwError('10 caractères minimum'); return; }
    setPwSaving(true);
    try {
      const res = await apiFetch('/api/auth/change-password', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ current_password: pwForm.current, new_password: pwForm.next }),
      });
      const data = await res.json();
      if (!res.ok) { setPwError(data.error || 'Erreur'); return; }
      setShowChangePassword(false);
      setPwForm({ current: '', next: '', confirm: '' });
    } catch { setPwError('Erreur réseau'); }
    finally { setPwSaving(false); }
  }

  const formatDate = (d: string | null) => d ? new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';

  return (
    <div style={{ padding: 24, maxWidth: 800, margin: '0 auto', minHeight: '100%', background: 'var(--bg)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>Utilisateurs</h2>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => setShowChangePassword(true)} style={btnSecondary}>
            Changer mon mot de passe
          </button>
          {me?.role === 'admin' && (
            <button onClick={() => setShowCreate(true)} style={btnPrimary}>
              + Nouvel utilisateur
            </button>
          )}
        </div>
      </div>

      {error && <p style={{ color: 'var(--color-error, #e05)', fontSize: 13 }}>{error}</p>}
      {loading ? (
        <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Chargement…</p>
      ) : (
        <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--bg-deep)', color: 'var(--text-muted)' }}>
                {['Nom', 'Email', 'Rôle', 'Statut', 'Dernière connexion', 'Actions'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, fontSize: 12 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map((u, i) => (
                <tr key={u.id} style={{ borderTop: i === 0 ? 'none' : '1px solid var(--border)', background: u.id === me?.id ? 'color-mix(in srgb, var(--accent) 5%, transparent)' : 'transparent' }}>
                  <td style={td}>{u.name}{u.id === me?.id && <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--accent)' }}>moi</span>}</td>
                  <td style={td}>{u.email}</td>
                  <td style={td}>
                    <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: u.role === 'admin' ? 'color-mix(in srgb, var(--accent) 15%, transparent)' : 'color-mix(in srgb, var(--text-muted) 15%, transparent)', color: u.role === 'admin' ? 'var(--accent)' : 'var(--text-muted)' }}>
                      {u.role === 'admin' ? 'Admin' : 'Utilisateur'}
                    </span>
                  </td>
                  <td style={td}>
                    <span style={{ color: u.is_active ? 'var(--color-success, #0a0)' : 'var(--color-error, #e05)', fontSize: 12 }}>
                      {u.is_active ? 'Actif' : 'Inactif'}
                    </span>
                  </td>
                  <td style={{ ...td, color: 'var(--text-muted)' }}>{formatDate(u.last_login)}</td>
                  <td style={td}>
                    {u.id !== me?.id && me?.role === 'admin' && (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => toggleActive(u)} style={btnXs}>{u.is_active ? 'Désactiver' : 'Activer'}</button>
                        <button onClick={() => revokeSessions(u)} style={btnXs}>Révoquer sessions</button>
                        <button onClick={() => deleteUser(u)} style={{ ...btnXs, color: 'var(--color-error, #e05)' }}>Supprimer</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal création utilisateur */}
      {showCreate && (
        <Modal title="Nouvel utilisateur" onClose={() => { setShowCreate(false); setFormError(''); }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {(['name', 'email', 'password'] as const).map(f => (
              <div key={f}>
                <label style={labelStyle}>{f === 'name' ? 'Nom' : f === 'email' ? 'Email' : 'Mot de passe (min. 10 car.)'}</label>
                <input type={f === 'password' ? 'password' : f === 'email' ? 'email' : 'text'}
                  value={form[f]} onChange={e => setForm(p => ({ ...p, [f]: e.target.value }))}
                  style={inputStyle} />
              </div>
            ))}
            <div>
              <label style={labelStyle}>Rôle</label>
              <select value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value }))} style={inputStyle}>
                <option value="user">Utilisateur</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            {formError && <p style={{ margin: 0, fontSize: 12, color: 'var(--color-error, #e05)' }}>{formError}</p>}
            <button onClick={createUser} disabled={saving} style={{ ...btnPrimary, opacity: saving ? 0.7 : 1 }}>
              {saving ? 'Création…' : 'Créer'}
            </button>
          </div>
        </Modal>
      )}

      {/* Modal changement mot de passe */}
      {showChangePassword && (
        <Modal title="Changer mon mot de passe" onClose={() => { setShowChangePassword(false); setPwError(''); }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={labelStyle}>Mot de passe actuel</label>
              <input type="password" value={pwForm.current} onChange={e => setPwForm(p => ({ ...p, current: e.target.value }))} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Nouveau mot de passe (min. 10 car.)</label>
              <input type="password" value={pwForm.next} onChange={e => setPwForm(p => ({ ...p, next: e.target.value }))} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Confirmer le nouveau mot de passe</label>
              <input type="password" value={pwForm.confirm} onChange={e => setPwForm(p => ({ ...p, confirm: e.target.value }))} style={inputStyle} />
            </div>
            {pwError && <p style={{ margin: 0, fontSize: 12, color: 'var(--color-error, #e05)' }}>{pwError}</p>}
            <button onClick={changePassword} disabled={pwSaving} style={{ ...btnPrimary, opacity: pwSaving ? 0.7 : 1 }}>
              {pwSaving ? 'Enregistrement…' : 'Changer le mot de passe'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 28, width: 380, maxWidth: '90vw' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>{title}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 20, lineHeight: 1 }}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

const td: React.CSSProperties = { padding: '10px 14px', color: 'var(--text)', verticalAlign: 'middle' };
const labelStyle: React.CSSProperties = { fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 };
const inputStyle: React.CSSProperties = { width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 13, boxSizing: 'border-box' };
const btnPrimary: React.CSSProperties = { padding: '8px 16px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer' };
const btnSecondary: React.CSSProperties = { padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', fontWeight: 500, fontSize: 13, cursor: 'pointer' };
const btnXs: React.CSSProperties = { padding: '3px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', fontSize: 11, cursor: 'pointer' };
