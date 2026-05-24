import { create } from 'zustand';

const useUserStore = create((set) => ({
  username: '',
  rating: 0,

  setUsername: (username) => set({ username }),
  setRating: (rating) => set({ rating }),
  resetUser: () => set({ username: '', rating: 0 }),
}));

export default useUserStore;
