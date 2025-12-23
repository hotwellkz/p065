import { create } from "zustand";
import type { User } from "firebase/auth";
import {
  authRepository,
  type AuthCredentials
} from "../repositories/authRepository";
import { mapUserToUserData, type UserData } from "../domain/user";

type AuthStatus = "idle" | "loading" | "authenticated" | "unauthenticated";

interface AuthState {
  user: UserData | null;
  status: AuthStatus;
  error: string | null;
  initialize: () => void;
  login: (credentials: AuthCredentials) => Promise<void>;
  signup: (credentials: AuthCredentials) => Promise<void>;
  logout: () => Promise<void>;
  setFromFirebaseUser: (user: User | null) => void;
}

let unsubscribeAuth: (() => void) | null = null;

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  status: "idle",
  error: null,

  initialize: () => {
    if (unsubscribeAuth) {
      return;
    }
    set({ status: "loading" });
    unsubscribeAuth = authRepository.subscribe((firebaseUser) => {
      get().setFromFirebaseUser(firebaseUser);
    });
  },

  setFromFirebaseUser: (firebaseUser) => {
    if (firebaseUser) {
      set({
        user: mapUserToUserData(firebaseUser),
        status: "authenticated",
        error: null
      });
    } else {
      set({
        user: null,
        status: "unauthenticated"
      });
    }
  },

  login: async (credentials) => {
    set({ status: "loading", error: null });
    try {
      const user = await authRepository.login(credentials);
      set({
        user: mapUserToUserData(user),
        status: "authenticated"
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Auth error";
      set({
        error: message,
        status: "unauthenticated"
      });
      throw error;
    }
  },

  signup: async (credentials) => {
    set({ status: "loading", error: null });
    try {
      const user = await authRepository.signup(credentials);
      set({
        user: mapUserToUserData(user),
        status: "authenticated"
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Signup error";
      set({
        error: message,
        status: "unauthenticated"
      });
      throw error;
    }
  },

  logout: async () => {
    await authRepository.logout();
    set({
      user: null,
      status: "unauthenticated"
    });
  }
}));

export const disposeAuthStore = () => {
  if (unsubscribeAuth) {
    unsubscribeAuth();
    unsubscribeAuth = null;
  }
};

