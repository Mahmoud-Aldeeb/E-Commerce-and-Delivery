"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import api from "@/lib/api";
import { createLocalStore, useIsClient, useLocalStore } from "@/lib/local-store";
import type { User } from "@/types";

interface AuthResponse {
  user: User;
  token: string;
}

interface GoogleAuthResponse extends AuthResponse {
  /** true when an old password was removed because the account got linked to Google */
  passwordRemoved: boolean;
}

interface AuthContextValue {
  user: User | null;
  /** false until the saved session has been read in the browser */
  isReady: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (name: string, email: string, password: string) => Promise<User>;
  loginWithGoogle: (idToken: string) => Promise<{ user: User; passwordRemoved: boolean }>;
  setPassword: (password: string) => Promise<void>;
  logout: () => void;
  updateUser: (changes: Partial<User>) => void;
}

// Same keys as lib/api.ts, which reads the token to authorize every request
const tokenStore = createLocalStore<string | null>({
  key: "auth_token",
  fallback: null,
  parse: (raw) => raw,
  serialize: (value) => value ?? "",
});

const userStore = createLocalStore<User | null>({
  key: "auth_user",
  fallback: null,
  parse: (raw) => JSON.parse(raw) as User,
});

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const token = useLocalStore(tokenStore);
  const storedUser = useLocalStore(userStore);
  const isReady = useIsClient();

  // A user without a token (or the opposite) is a broken session: treat it as logged out
  const user = token ? storedUser : null;

  const saveSession = useCallback((session: AuthResponse) => {
    tokenStore.set(session.token);
    userStore.set(session.user);
  }, []);

  // login, register and loginWithGoogle only manage the session. They throw on failure,
  // and the page decides how to show the error (see app/login/page.tsx).
  const login = useCallback(
    async (email: string, password: string) => {
      const { data } = await api.post<AuthResponse>("/auth/login", { email, password });
      saveSession(data);
      return data.user;
    },
    [saveSession],
  );

  const register = useCallback(
    async (name: string, email: string, password: string) => {
      const { data } = await api.post<AuthResponse>("/auth/register", {
        name,
        email,
        password,
      });
      saveSession(data);
      return data.user;
    },
    [saveSession],
  );

  const loginWithGoogle = useCallback(
    async (idToken: string) => {
      const { data } = await api.post<GoogleAuthResponse>("/auth/google", { idToken });
      saveSession(data);
      return { user: data.user, passwordRemoved: data.passwordRemoved };
    },
    [saveSession],
  );

  const logout = useCallback(() => {
    tokenStore.clear();
    userStore.clear();
    // A full navigation also resets every cached query and context,
    // so nothing of this user stays in memory
    // window.location.assign("/");
    window.location.href = new URL(
      "/",
      window.location.origin
    ).toString();
  }, []);

  const updateUser = useCallback((changes: Partial<User>) => {
    const current = userStore.getSnapshot();
    if (current) userStore.set({ ...current, ...changes });
  }, []);

  // A Google user adds a password. Only the flag changes locally: the password never comes back
  const setPassword = useCallback(
    async (password: string) => {
      const { data } = await api.post<{ user: User }>("/auth/set-password", { password });
      updateUser({ hasPassword: data.user.hasPassword });
    },
    [updateUser],
  );

  const value = useMemo(
    () => ({ user, isReady, login, register, loginWithGoogle, setPassword, logout, updateUser }),
    [user, isReady, login, register, loginWithGoogle, setPassword, logout, updateUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}