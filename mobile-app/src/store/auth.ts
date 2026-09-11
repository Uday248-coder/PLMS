import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface AuthState {
  token: string | null;
  role: 'driver' | 'guard' | 'admin' | null;
  userId: string | null;
  isLoading: boolean;
  login: (token: string, role: string, userId: string) => Promise<void>;
  logout: () => Promise<void>;
  checkLocalSession: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  role: null,
  userId: null,
  isLoading: true, // Initially true while we load from AsyncStorage

  login: async (token, role, userId) => {
    await Promise.all([
      AsyncStorage.setItem('park_token', token),
      AsyncStorage.setItem('park_role', role),
      AsyncStorage.setItem('park_userId', userId)
    ]);
    set({ token, role: role as any, userId, isLoading: false });
  },

  logout: async () => {
    await Promise.all([
      AsyncStorage.removeItem('park_token'),
      AsyncStorage.removeItem('park_role'),
      AsyncStorage.removeItem('park_userId')
    ]);
    set({ token: null, role: null, userId: null, isLoading: false });
  },

  checkLocalSession: async () => {
    try {
      const [token, role, userId] = await Promise.all([
        AsyncStorage.getItem('park_token'),
        AsyncStorage.getItem('park_role'),
        AsyncStorage.getItem('park_userId')
      ]);
      
      if (token && role && userId) {
        set({ token, role: role as any, userId, isLoading: false });
      } else {
        set({ isLoading: false });
      }
    } catch (error) {
      console.error("Failed to restore session from AsyncStorage", error);
      set({ isLoading: false });
    }
  }
}));
