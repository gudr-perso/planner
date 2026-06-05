import { createContext, useContext } from 'react';

export type AuthUser = { id: string; email: string; name: string; role: 'admin' | 'user'; client_code?: string | null };

export type AuthContextValue = {
  user: AuthUser | null;
  setUser: (u: AuthUser | null) => void;
};

export const AuthContext = createContext<AuthContextValue>({ user: null, setUser: () => {} });

export function useAuth() {
  return useContext(AuthContext);
}

type LogoutFn = () => void;
let _logout: LogoutFn = () => {};
export function _registerLogout(fn: LogoutFn) { _logout = fn; }

/** Wrapper fetch qui déconnecte automatiquement sur 401 */
export async function apiFetch(url: string, options?: RequestInit): Promise<Response> {
  const res = await fetch(url, options);
  if (res.status === 401) {
    _logout();
  }
  return res;
}
