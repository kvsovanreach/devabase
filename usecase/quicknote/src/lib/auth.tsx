import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from 'react';
import type { AppUser, AppAuthResponse } from 'devabase-sdk';
import { getClient, resetClient } from './client';

interface AuthState {
  user: AppUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  loading: boolean;
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const STORAGE_KEY = 'quicknote_auth';

function saveAuth(data: { user: AppUser; accessToken: string; refreshToken: string }) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function loadAuth(): { user: AppUser; accessToken: string; refreshToken: string } | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function clearAuth() {
  localStorage.removeItem(STORAGE_KEY);
}

function handleAuthResponse(response: AppAuthResponse) {
  const client = getClient();
  client.asUser(response.access_token);
  const data = {
    user: response.user,
    accessToken: response.access_token,
    refreshToken: response.refresh_token,
  };
  saveAuth(data);
  return data;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    accessToken: null,
    refreshToken: null,
    loading: true,
  });

  // Restore session on mount
  useEffect(() => {
    const saved = loadAuth();
    if (saved) {
      const client = getClient();
      client.asUser(saved.accessToken);
      setState({
        user: saved.user,
        accessToken: saved.accessToken,
        refreshToken: saved.refreshToken,
        loading: false,
      });
    } else {
      setState((s) => ({ ...s, loading: false }));
    }
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const client = getClient();
    const response = await client.appAuth.login({ email, password });
    const data = handleAuthResponse(response);
    setState({ ...data, loading: false });
  }, []);

  const register = useCallback(async (email: string, password: string, name: string) => {
    const client = getClient();
    const response = await client.appAuth.register({
      email,
      password,
      name,
      metadata: { app: 'quicknote', theme: 'light' },
    });
    const data = handleAuthResponse(response);
    setState({ ...data, loading: false });
  }, []);

  const logout = useCallback(() => {
    const client = getClient();
    client.appAuth.logout().catch(() => {});
    client.clearUserContext();
    resetClient();
    clearAuth();
    setState({ user: null, accessToken: null, refreshToken: null, loading: false });
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
