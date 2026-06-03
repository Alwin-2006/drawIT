import React from 'react';

const RoundEndOverlay = ({ currentWord, roundEndCountdown, players, scoreDeltas }) => (
    <div className='absolute inset-0 bg-black bg-opacity-70 flex flex-col items-center justify-center rounded z-40'>
        <div className='bg-[var(--color-neutral)] border-4 border-[var(--color-primary)] p-6 rounded-lg flex flex-col items-center gap-4 max-w-md w-full'>
            <h3 className='text-2xl font-bold text-[var(--color-primary)]'>Round Summary</h3>
            <div className='text-lg text-[var(--color-primary)]'>
                Word: <span className='font-bold text-xl'>{currentWord}</span>
            </div>
            <div className='max-h-40 text-white overflow-y-auto w-full'>
                {players.map((p, i) => (
                    <div
                        key={p.id || p.playerId || i}
                        className='flex justify-between items-center bg-[var(--color-primary)] bg-opacity-10 p-2 rounded mb-2'
                    >
                        <span className='text-sm'>{p.name || p.playerName}</span>
                        <div className='flex gap-2'>
                            <span className='text-sm'>Score: {p.score}</span>
                            {scoreDeltas[p.id || p.playerId] > 0 && (
                                <span className='text-green-400 font-bold text-sm'>+{scoreDeltas[p.id || p.playerId]}</span>
                            )}
                        </div>
                    </div>
                ))}
            </div>
            <div className='text-sm text-gray-400'>Next drawer in {roundEndCountdown}s…</div>
        </div>
    </div>
);

export default RoundEndOverlay;
