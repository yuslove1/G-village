"use client";

import { create } from "zustand";
import { api, setAccessToken, type User } from "@/lib/api";

type Status = "idle" | "loading" | "authenticated" | "guest";

interface AuthState {
  user: User | null;
  status: Status;
  /** Silent-refresh against the httpOnly cookie. Called once on app mount —
   * see Providers — so a page reload does not read as a fresh sign-out. */
  bootstrap: () => Promise<void>;
  login: (identifier: string, password: string) => Promise<User>;
  register: (input: {
    fullName: string;
    phone: string;
    email?: string;
    password: string;
  }) => Promise<{ user: User; devOtp?: string }>;
  logout: () => Promise<void>;
  setUser: (user: User) => void;
  loginWithGoogle: (
    idToken: string,
  ) => Promise<{ needsPhone: false; user: User } | { needsPhone: true; signupToken: string; fullName: string; email: string }>;
  completeGoogleSignup: (signupToken: string, phone: string) => Promise<{ user: User; devOtp?: string }>;
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  status: "idle",

  bootstrap: async () => {
    set({ status: "loading" });
    try {
      const { user } = await api.auth.me();
      set({ user, status: "authenticated" });
    } catch {
      set({ user: null, status: "guest" });
    }
  },

  login: async (identifier, password) => {
    const { user, accessToken } = await api.auth.login({ identifier, password });
    setAccessToken(accessToken);
    set({ user, status: "authenticated" });
    return user;
  },

  register: async (input) => {
    const result = await api.auth.register(input);
    setAccessToken(result.accessToken);
    set({ user: result.user, status: "authenticated" });
    return { user: result.user, devOtp: result.devOtp };
  },

  logout: async () => {
    try {
      await api.auth.logout();
    } finally {
      setAccessToken(null);
      set({ user: null, status: "guest" });
    }
  },

  setUser: (user) => set({ user }),

  loginWithGoogle: async (idToken) => {
    const result = await api.auth.google(idToken);
    if (!result.needsPhone) {
      setAccessToken(result.accessToken);
      set({ user: result.user, status: "authenticated" });
      return { needsPhone: false, user: result.user };
    }
    return result;
  },

  completeGoogleSignup: async (signupToken, phone) => {
    const result = await api.auth.googleComplete({ signupToken, phone });
    setAccessToken(result.accessToken);
    set({ user: result.user, status: "authenticated" });
    return { user: result.user, devOtp: result.devOtp };
  },
}));
