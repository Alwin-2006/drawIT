import React, { useEffect, useState } from 'react'

//few things to keep in mind
// only socket join rooms when you are in the page itself 
// guest players don't retain their progress, but account players should-> only store the ranked ones in backend
// when entering game, store the player name in FE itself
// eacg message will have Player: message
const PlayersList = ({ players, currentTurn, score }) => {
    return (
        <div className='flex flex-col justify-between'>
            {players.map((player, index) => (
                <div key={index} className='flex justify-between'>
                    <span>{player.name}</span>
                    <span>{player.score}</span>
                </div>
            ))}
        </div>
    )
}

const Message = ({ player, message }) => {
    return (
        <div className='flex flex-col justify-between'>
            {player.map((player, index) => (
                <div key={index} className='flex justify-between'>
                    <span>{player.name}</span>
                    <span>{message}</span>
                </div>
            ))}
        </div>
    )
}
const Playerlist = [
    { name: 'Player 1', score: 0 },
    { name: 'Player 2', score: 0 },
    { name: 'Player 3', score: 0 },
    { name: 'Player 4', score: 0 },
    { name: 'Player 1', score: 0 },
    { name: 'Player 2', score: 0 },
    { name: 'Player 3', score: 0 },
    { name: 'Player 4', score: 0 },
    { name: 'Player 1', score: 0 },
    { name: 'Player 2', score: 0 },
    { name: 'Player 3', score: 0 },
    { name: 'Player 4', score: 0 },
];



function Home() {
    const [score, setScore] = useState(0);
    const [players, setPlayers] = useState([]);
    const [currentTurn, setCurrentTurn] = useState(null);
    const [timeLeft, setTimeLeft] = useState(0);
    const [word, setWord] = useState('');
    const [messages, setMessages] = useState([]);
    // i will do the fetching here
    useEffect(() => {
        setPlayers([
            { name: 'Player 1', score: 0 },
            { name: 'Player 2', score: 0 },
            { name: 'Player 3', score: 0 },
            { name: 'Player 4', score: 0 },
            { name: 'Player 1', score: 0 },
            { name: 'Player 2', score: 0 },
            { name: 'Player 3', score: 0 },
            { name: 'Player 4', score: 0 },
            { name: 'Player 1', score: 0 },
            { name: 'Player 2', score: 0 },
            { name: 'Player 3', score: 0 },
            { name: 'Player 4', score: 0 },
        ]);
        setCurrentTurn(0);
        setTimeLeft(60);
    }, []);

    const handleAnswer = (answer) => {
        if (answer === 'cat') {
            setScore(score + 10);
            setCurrentTurn(currentTurn + 1);
        }
    };
    return (
        <div className='home-background flex flex-col'>
            <div className="flex  items-center justify-between gap-3 p-2 ">
                <span className='font-mono   p-2   gap-10 text-2xl w-1/5 '></span>
                <span className='font-mono bg-[var(--color-neutral)] text-[var(--color-primary)] border-4 border-[var(--color-primary)] p-2   flex flex-col items-center justify-center gap-10 text-2xl w-1/2 '>_ _ _ _ _ _ _ _</span>
                <span className='font-display bg-[var(--color-secondary)] text-[var(--color-primary)]  border-[var(--color-primary)] p-2  shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] flex flex-col items-center justify-center gap-10 text-sm w-1/5 '>Party code:6767676767</span>
            </div>
            <div className='home-background flex flex-row p-3 gap-3  h-screen'>
                <div className="font-display bg-[var(--color-neutral)] text-[var(--color-primary)] border-4 border-[var(--color-primary)] p-3 w-1/5 h-5/7  gap-10 text-2xl">
                    <div>
                        <span>Players:</span>
                    </div>
                    <div className='flex flex-col justify-between  text-lg'>
                        <PlayersList players={players} currentTurn={currentTurn} score={score} />
                    </div>

                </div>
                <div className="font-mono bg-[var(--color-neutral)] text-[var(--color-primary)] border-4 border-[var(--color-primary)] p-2 w-3/5 h-5/7 flex flex-col items-center justify-center gap-10 text-2xl">


                </div>
                <div className="font-mono bg-[var(--color-neutral)] text-[var(--color-primary)] border-4 border-[var(--color-primary)] p-2 w-1/5 h-5/7 flex flex-col items-center justify-center gap-10 text-2xl">
                    <div className='flex items-center justify-center'>
                        Chat
                    </div>
                    <div>

                    </div>
                </div>
            </div>
        </div>
    )
}

export default Home 