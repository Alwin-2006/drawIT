import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const useUserStore = create(
  persist(
    (set) => ({
      _id: '',
      username: '',
      rating: 0,
      token: '',
      playerId: '',
      isAuthenticated: false,

      setUser: (user) =>
        set({
          _id: user._id,
          username: user.username,
          rating: user.rating,
          token: user.token,
          // Support both explicit playerId and fallback to _id (for pre-existing sessions)
          playerId: user.playerId || user._id || '',
          isAuthenticated: true,
        }),

      setUsername: (username) => set({ username }),
      setRating: (rating) => set({ rating }),
      setToken: (token) => set({ token }),
      setPlayerId: (playerId) => set({ playerId }),

      resetUser: () =>
        set({
          _id: '',
          username: '',
          rating: 0,
          token: '',
          playerId: '',
          isAuthenticated: false,
        }),

      logout: () => {
        set({
          _id: '',
          username: '',
          rating: 0,
          token: '',
          playerId: '',
          isAuthenticated: false,
        });
        localStorage.removeItem('authToken');
        localStorage.removeItem('token');
        localStorage.removeItem('user');
      },
    }),
    {
      name: 'user-store',
      partialize: (state) => ({
        _id: state._id,
        username: state.username,
        rating: state.rating,
        token: state.token,
        playerId: state.playerId,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);

export default useUserStore;
