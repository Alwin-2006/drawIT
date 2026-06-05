import React from 'react';

const RoundEndOverlay = ({ currentWord, roundEndCountdown, players, scoreDeltas }) => (
  <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-40">
    <div className="bg-[var(--color-neutral)] border-4 border-[var(--color-primary)] p-6 w-72 flex flex-col gap-3">
      <div className="flex justify-between items-baseline">
        <span className="text-xs font-bold uppercase tracking-wide">Round over</span>
        <span className="text-xs text-[var(--color-text-muted)]">{roundEndCountdown}s</span>
      </div>

      <div className="text-sm">
        Word: <span className="font-bold">{currentWord}</span>
      </div>

      <div className="flex flex-col gap-1">
        {players.map((p, i) => {
          const id = p.id || p.playerId;
          const delta = scoreDeltas?.[id];
          return (
            <div key={id || i} className="flex justify-between text-xs">
              <span className="truncate">{p.name || p.playerName}</span>
              <div className="flex gap-2 shrink-0">
                <span>{p.score}</span>
                {delta > 0 && <span className="text-green-600 font-bold">+{delta}</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  </div>
);

export default RoundEndOverlay;
