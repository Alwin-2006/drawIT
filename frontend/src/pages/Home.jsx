import React from 'react'
import { Link } from 'react-router-dom'
import { useState } from 'react'
import { io } from "socket.io-client";

function Home() {
    const [username, setUsername] = useState('Player 1');
    const [room, setRoom] = useState('');
    const [error, setError] = useState('');
    const socket = io('http://localhost:3000');
    return (
        <div>
            <div className='home-background flex items-center justify-center h-screen'>
                <div className="font-mono bg-[var(--color-neutral)] text-[var(--color-primary)] border-4 border-[var(--color-primary)] p-2 w-3/5 h-5/7 flex flex-col items-center justify-center gap-10 text-2xl">
                    <div>
            
                    </div>
                    <h1 className='text-5xl font-display'>Player {username}</h1>
                    <div className="flex items-center justify-center gap-5">
                        <Link to="/game" className='bg-[var(--color-primary)] text-[var(--color-neutral)] px-4 py-2 rounded-sm cursor-pointer hover:bg-[var(--color-secondary)] hover:text-black transition-all duration-200 ease-in-out'>Play</Link>
                        <button className='bg-[var(--color-primary)] text-[var(--color-neutral)] px-4 py-2 rounded-sm cursor-pointer hover:bg-[var(--color-secondary)] hover:text-black transition-all duration-200 ease-in-out'>Mode</button>
                    </div>
                    <div className='font-bold text-lg flex items-center bg-[var(--color-tertiary)] shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] justify-center p-3'>
                        <span>Casual</span>
                    </div>

                </div>
            </div>
        </div>
    )
}

export default Home