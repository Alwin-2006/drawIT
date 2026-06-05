import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import useUserStore from '../store/userStore';
import { disconnectSocket, offAll } from '../socket';

function Navbar() {
  const user = useUserStore((s) => s.username);
  const rating = useUserStore((s) => s.rating);
  const isAuthenticated = useUserStore((s) => s.isAuthenticated);
  const logout = useUserStore((s) => s.logout);
  const navigate = useNavigate();

  const handleLogout = () => {
    offAll();
    disconnectSocket();
    logout();
    navigate('/');
  };

  return (
    <nav className="fixed top-0 w-full bg-[var(--color-neutral)] border-b-4 border-[var(--color-primary)] flex items-center justify-between px-6 py-3 font-mono z-50">
      <Link to="/">
        <span className="text-[var(--color-primary)] font-display font-bold text-3xl">drawIT</span>
      </Link>

      <div className="flex items-center gap-6 text-sm">
        <Link to="/" className="hover:underline">Home</Link>
        <Link to="/leaderboard" className="hover:underline">Leaderboard</Link>
      </div>

      <div className="flex items-center gap-3 text-sm">
        {isAuthenticated ? (
          <>
            <span className="text-[var(--color-text-muted)]">{user} · {rating ?? 1200}</span>
            <button
              onClick={handleLogout}
              className="bg-[var(--color-primary)] text-[var(--color-neutral)] px-3 py-1.5 cursor-pointer hover:bg-[var(--color-secondary)] hover:text-black transition-colors"
            >
              Logout
            </button>
          </>
        ) : (
          <>
            <Link to="/login" className="bg-[var(--color-primary)] text-[var(--color-neutral)] px-3 py-1.5 hover:bg-[var(--color-secondary)] hover:text-black transition-colors">Login</Link>
            <Link to="/signup" className="border-2 border-[var(--color-primary)] px-3 py-1.5 hover:bg-[var(--color-primary)] hover:text-[var(--color-neutral)] transition-colors">Sign up</Link>
          </>
        )}
      </div>
    </nav>
  );
}

export default Navbar;
