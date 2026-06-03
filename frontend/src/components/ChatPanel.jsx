import React from 'react';

const MessageItem = ({ message }) => (
    <div className='border-b border-[var(--color-primary)] py-2'>
        <span className='font-bold'>{message.playerName}:</span> {message.text}
    </div>
);

const ChatPanel = ({ messages, guessValue, setGuessValue, onSubmitGuess, isDrawing, gamePhase }) => (
    <div className='font-mono bg-[var(--color-neutral)] text-[var(--color-primary)] border-4 border-[var(--color-primary)] p-2 w-2/5 h-5/7 flex flex-col items-center justify-center gap-10 text-2xl'>
        <div className='flex items-center justify-center'>Chat</div>
        <div className='h-full rounded text-lg p-4 overflow-y-auto w-full'>
            {messages.length === 0 ? (
                <div className='text-sm text-[var(--color-primary)]'>No messages yet.</div>
            ) : (
                messages.map((msg, i) => <MessageItem key={i} message={msg} />)
            )}
        </div>
        <form onSubmit={onSubmitGuess} className='flex text-sm gap-2 w-full'>
            <input
                value={guessValue}
                onChange={(e) => setGuessValue(e.target.value)}
                placeholder={isDrawing ? 'You are drawing...' : 'Type your guess...'}
                className='w-full rounded bg-[var(--color-neutral)] p-2 text-black'
                disabled={gamePhase !== 'guessing' || isDrawing}
            />
            <button
                type='submit'
                className='rounded bg-[var(--color-primary)] px-4 py-2 text-[var(--color-neutral)] hover:bg-[var(--color-secondary)] disabled:opacity-50'
                disabled={gamePhase !== 'guessing' || isDrawing}
            >
                Send
            </button>
        </form>
    </div>
);

export default ChatPanel;
