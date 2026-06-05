import React, { useState, useEffect } from 'react';

const EndGameOverlay = ({ players }) => {
  const sorted = [...players].sort((a, b) => b.score - a.score);
  const [timeLeft, setTimeLeft] = useState(15);

  useEffect(() => {
    if (timeLeft <= 0) { window.location.href = '/'; return; }
    const t = setInterval(() => setTimeLeft((n) => n - 1), 1000);
    return () => clearInterval(t);
  }, [timeLeft]);

  return (
    <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-50">
      <div className="bg-[var(--color-neutral)] border-4 border-[var(--color-primary)] p-6 w-80 flex flex-col gap-4">
        <span className="font-display font-bold text-2xl text-center uppercase tracking-widest">
          Game over
        </span>

        <div className="flex flex-col gap-1.5">
          {sorted.map((p, i) => (
            <div
              key={p.id || p.playerId || i}
              className={`flex justify-between items-center px-3 py-2 text-sm border-2 border-[var(--color-primary)] ${
                i === 0 ? 'bg-[var(--color-secondary)] text-black' : 'bg-transparent'
              }`}
            >
              <span className="font-bold">
                {i + 1}. {p.name || p.playerName}
              </span>
              <span className="font-mono">{p.score} pts</span>
            </div>
          ))}
        </div>

        {/* ELO deltas — shown if present on players */}
        <button
          onClick={() => (window.location.href = '/')}
          className="bg-[var(--color-primary)] text-[var(--color-neutral)] py-2 text-sm hover:bg-[var(--color-secondary)] hover:text-black transition-colors"
        >
          Back to lobby ({timeLeft}s)
        </button>
      </div>
    </div>
  );
};

export default EndGameOverlay;
