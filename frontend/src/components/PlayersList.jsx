import React from 'react';

const PlayersList = ({ players, currentDrawer }) => (
  <div className="flex flex-col gap-1.5 text-sm">
    {players.map((player, i) => {
      const id = player.id || player.playerId;
      const isDrawing = currentDrawer && String(id) === String(currentDrawer);
      return (
        <div
          key={id || i}
          className={`flex justify-between items-center px-1 py-0.5 ${
            isDrawing ? 'bg-[var(--color-secondary)] text-black' : ''
          }`}
        >
          <span className="truncate max-w-24">
            {isDrawing && '✏ '}
            {player.name || player.playerName}
          </span>
          <span className="font-bold shrink-0">{player.score || 0}</span>
        </div>
      );
    })}
    {players.length === 0 && (
      <span className="text-xs text-[var(--color-text-muted)]">Waiting…</span>
    )}
  </div>
);

export default PlayersList;
