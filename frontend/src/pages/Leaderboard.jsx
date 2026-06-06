import React, { useEffect, useRef, useState, useCallback } from 'react';
import useUserStore from '../store/userStore';

// In production the nginx reverse proxy handles /api/* on the same origin.
// In local dev fall back to the Vite proxy or direct backend address.
const API_BASE = import.meta.env.VITE_API_URL || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000');
const PAGE_SIZE = 5;

// Medal colors for top 3
const rankStyle = (rank) => {
  if (rank === 1) return 'text-[var(--color-tertiary)] bg-black';
  if (rank === 2) return 'text-[#C0C0C0] bg-black';
  if (rank === 3) return 'text-[#CD7F32] bg-black';
  return 'text-[var(--color-text-muted)] bg-transparent';
};

function Leaderboard() {
  const currentUserId = useUserStore((s) => s._id);

  const [entries, setEntries] = useState([]);
  const [total, setTotal] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  const sentinelRef = useRef(null);
  const observerRef = useRef(null);

  const fetchPage = useCallback(async (currentOffset) => {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `${API_BASE}/api/game/leaderboard?offset=${currentOffset}&limit=${PAGE_SIZE}`
      );
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const data = await res.json();

      setEntries((prev) => {
        // Avoid duplicates if called twice in StrictMode
        const existingRanks = new Set(prev.map((e) => e.rank));
        const fresh = data.entries.filter((e) => !existingRanks.has(e.rank));
        return [...prev, ...fresh];
      });
      setTotal(data.total);
      const nextOffset = currentOffset + data.entries.length;
      setOffset(nextOffset);
      setHasMore(nextOffset < data.total && data.entries.length === PAGE_SIZE);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [loading]);

  // Initial load
  useEffect(() => {
    fetchPage(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Infinite scroll via IntersectionObserver
  useEffect(() => {
    if (observerRef.current) observerRef.current.disconnect();

    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loading) {
          fetchPage(offset);
        }
      },
      { threshold: 0.1 }
    );

    if (sentinelRef.current) {
      observerRef.current.observe(sentinelRef.current);
    }

    return () => observerRef.current?.disconnect();
  }, [hasMore, loading, offset, fetchPage]);

  return (
    <div className="home-background min-h-screen flex flex-col items-center py-12 px-4">
      <div className="w-full max-w-lg font-mono">

        {/* Header */}
        <div className="mb-6">
          <h1 className="font-display font-bold text-4xl text-[var(--color-primary)]">
            Leaderboard
          </h1>
          {total !== null && (
            <p className="text-sm text-[var(--color-text-muted)] mt-1">
              Top {total} ranked players
            </p>
          )}
        </div>

        {/* Table */}
        <div className="border-4 border-[var(--color-primary)] bg-[var(--color-neutral)]">
          {/* Column headers */}
          <div className="grid grid-cols-[3rem_1fr_auto] px-4 py-2 border-b-2 border-[var(--color-primary)] text-xs text-[var(--color-text-muted)] uppercase tracking-widest">
            <span>#</span>
            <span>Player</span>
            <span>Rating</span>
          </div>

          {/* Rows */}
          {entries.map((entry) => {
            const isMe = entry.playerId === currentUserId;
            return (
              <div
                key={entry.rank}
                className={`grid grid-cols-[3rem_1fr_auto] items-center px-4 py-3 border-b border-[var(--color-border)] last:border-b-0 transition-colors ${
                  isMe
                    ? 'bg-[var(--color-secondary)] text-black font-bold'
                    : 'hover:bg-[var(--color-bg-secondary)]'
                }`}
              >
                {/* Rank badge */}
                <span
                  className={`inline-flex items-center justify-center w-7 h-7 text-xs font-bold ${rankStyle(entry.rank)}`}
                >
                  {entry.rank}
                </span>

                {/* Username */}
                <span className="text-sm truncate pl-1">
                  {entry.username}
                  {isMe && (
                    <span className="ml-2 text-xs font-normal opacity-70">(you)</span>
                  )}
                </span>

                {/* Rating */}
                <span className="text-sm tabular-nums">{entry.rating}</span>
              </div>
            );
          })}

          {/* Initial loading skeleton */}
          {loading && entries.length === 0 && (
            <div className="flex flex-col gap-0">
              {Array.from({ length: PAGE_SIZE }).map((_, i) => (
                <div
                  key={i}
                  className="grid grid-cols-[3rem_1fr_auto] items-center px-4 py-3 border-b border-[var(--color-border)] last:border-b-0 animate-pulse"
                >
                  <div className="w-7 h-7 bg-[var(--color-bg-tertiary)]" />
                  <div className="h-4 bg-[var(--color-bg-tertiary)] rounded w-32 ml-1" />
                  <div className="h-4 bg-[var(--color-bg-tertiary)] rounded w-12" />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Sentinel + load-more indicator */}
        <div ref={sentinelRef} className="flex items-center justify-center py-6">
          {loading && entries.length > 0 && (
            <span className="text-sm text-[var(--color-text-muted)] animate-pulse">
              Loading more…
            </span>
          )}
          {!hasMore && entries.length > 0 && (
            <span className="text-sm text-[var(--color-text-muted)]">
              — end of leaderboard —
            </span>
          )}
          {error && (
            <span className="text-sm text-[var(--color-danger)]">
              Error: {error}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export default Leaderboard;
