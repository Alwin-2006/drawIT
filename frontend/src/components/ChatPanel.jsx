import React, { useEffect, useRef } from 'react';

const ChatPanel = ({ messages, guessValue, setGuessValue, onSubmitGuess, isDrawing, gamePhase }) => {
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="font-mono bg-[var(--color-neutral)] border-4 border-[var(--color-primary)] w-56 flex flex-col shrink-0">
      {/* Message list */}
      <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-1 min-h-0">
        {messages.length === 0 ? (
          <span className="text-xs text-[var(--color-text-muted)]">No messages yet.</span>
        ) : (
          messages.map((msg, i) => (
            <div key={i} className="text-xs leading-snug">
              <span className={`font-bold ${msg.playerName === 'System' ? 'text-[var(--color-text-muted)]' : ''}`}>
                {msg.playerName === 'System' ? '' : `${msg.playerName}: `}
              </span>
              <span className={msg.playerName === 'System' ? 'text-[var(--color-text-muted)] italic' : ''}>
                {msg.text}
              </span>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <form onSubmit={onSubmitGuess} className="flex border-t-4 border-[var(--color-primary)]">
        <input
          value={guessValue}
          onChange={(e) => setGuessValue(e.target.value)}
          placeholder={isDrawing ? 'You are drawing' : 'Guess…'}
          className="flex-1 bg-transparent p-2 text-xs outline-none"
          disabled={gamePhase !== 'guessing' || isDrawing}
        />
        <button
          type="submit"
          className="bg-[var(--color-primary)] text-[var(--color-neutral)] px-3 text-xs hover:bg-[var(--color-secondary)] hover:text-black disabled:opacity-40"
          disabled={gamePhase !== 'guessing' || isDrawing}
        >
          →
        </button>
      </form>
    </div>
  );
};

export default ChatPanel;
