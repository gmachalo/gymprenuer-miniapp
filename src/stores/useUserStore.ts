"use client";
import { create } from "zustand";
import { MAX_XP_ACCUMULATION } from "@/lib/game/engine";

interface UserState {
  id: string;
  name?: string;
  email?: string;
  image?: string;
  level: number;
  totalXp: number;
  offChainTokens: number;
  mode: "SOLO" | "SOCIAL";
  onboardingDone: boolean;
  walletAddress?: string;
}

interface UserStore {
  user: UserState | null;
  setUser: (user: UserState) => void;
  addXp: (xp: number) => void;
  addTokens: (tokens: number) => void;
  spendTokens: (tokens: number) => boolean;
  setMode: (mode: "SOLO" | "SOCIAL") => void;
  clear: () => void;
}

export const useUserStore = create<UserStore>((set, get) => ({
  user: null,
  setUser: (user) => set({ user }),
  addXp: (xp) =>
    set((state) => ({
      user: state.user
        ? {
            ...state.user,
            totalXp: Math.min(MAX_XP_ACCUMULATION, state.user.totalXp + xp),
          }
        : null,
    })),
  addTokens: (tokens) =>
    set((state) => ({
      user: state.user
        ? { ...state.user, offChainTokens: state.user.offChainTokens + tokens }
        : null,
    })),
  spendTokens: (tokens) => {
    const { user } = get();
    if (!user || user.offChainTokens < tokens) return false;
    set({ user: { ...user, offChainTokens: user.offChainTokens - tokens } });
    return true;
  },
  setMode: (mode) =>
    set((state) => ({ user: state.user ? { ...state.user, mode } : null })),
  clear: () => set({ user: null }),
}));
