import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const useUserStore = create(
  persist(
    (set) => ({
      _id: '',
      username: '',
      rating: 0,
      token: '',
      isAuthenticated: false,

      setUser: (user) =>
        set({
          _id: user._id,
          username: user.username,
          rating: user.rating,
          token: user.token,
          isAuthenticated: true,
        }),

      setUsername: (username) => set({ username }),
      setRating: (rating) => set({ rating }),
      setToken: (token) => set({ token }),

      resetUser: () =>
        set({
          _id: '',
          username: '',
          rating: 0,
          token: '',
          isAuthenticated: false,
        }),
    }),
    {
      name: 'user-store',
      partialize: (state) => ({
        _id: state._id,
        username: state.username,
        rating: state.rating,
        token: state.token,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);

export default useUserStore;
