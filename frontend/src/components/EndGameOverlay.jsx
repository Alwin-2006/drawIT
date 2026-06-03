import React, { useState, useEffect } from 'react';

const EndGameOverlay = ({ players }) => {
    const sorted = [...players].sort((a, b) => b.score - a.score);
    const [timeLeft, setTimeLeft] = useState(20);

    useEffect(() => {
        if (timeLeft <= 0) {
            window.location.href = '/';
            return;
        }
        const timerId = setInterval(() => {
            setTimeLeft((prev) => prev - 1);
        }, 1000);
        return () => clearInterval(timerId);
    }, [timeLeft]);

    return (
        <div className='absolute inset-0 bg-black bg-opacity-80 flex flex-col items-center justify-center rounded z-50'>
            <div className='bg-[var(--color-neutral)] border-4 border-[var(--color-primary)] p-8 rounded-lg flex flex-col items-center gap-6 max-w-lg w-full shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]'>
                <h3 className='text-4xl font-display font-bold text-[var(--color-primary)] uppercase tracking-widest'>
                    Game Over!
                </h3>
                <div className='flex flex-col gap-3 w-full'>
                    {sorted.map((p, i) => (
                        <div
                            key={p.id || p.playerId || i}
                            className={`flex justify-between items-center p-4 text-white rounded border-2 border-[var(--color-primary)] ${i === 0
                                ? 'bg-yellow-400 bg-opacity-20 scale-105'
                                : 'bg-[var(--color-primary)] bg-opacity-5'
                                }`}
                        >
                            <div className='flex items-center gap-3'>
                                <span className='font-bold text-xl'>{i + 1}.</span>
                                <span className='text-lg text-white font-bold'>{p.name || p.playerName}</span>
                                {i === 0 && <span>👑</span>}
                            </div>
                            <span className='text-xl font-mono'>{p.score} pts</span>
                        </div>
                    ))}
                </div>
                <button
                    onClick={() => (window.location.href = '/')}
                    className='mt-4 rounded bg-[var(--color-primary)] px-8 py-3 text-[var(--color-neutral)] hover:bg-[var(--color-secondary)] font-bold text-lg'
                >
                    Return to Lobby ({timeLeft}s)
                </button>
            </div>
        </div>
    );
};

export default EndGameOverlay;
