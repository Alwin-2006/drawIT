import React, { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useState } from 'react'
import useUserStore from '../store/userStore';

function Home() {
    const usr = useUserStore((state)=> state.username);
    const setUsername = useUserStore((state)=> state.setUsername);
    const [room, setRoom] = useState('');
    const [error, setError] = useState('');
    return (
        <div>
            <div className='home-background flex items-center justify-center h-screen'>
                <div className="font-mono bg-[var(--color-neutral)] text-[var(--color-primary)] border-4 border-[var(--color-primary)] p-2 w-1/5 h-1/2 flex flex-col  justify-around gap-2 text-2xl">
                    {usr?<div className='flex items-center justify-center'>{usr}</div>:
                    <input
                      className='text-2xl font-display text-center'
                      value={usr}
                      onChange={(event) => setUsername(event.target.value)}
                      placeholder='Enter username'
                    />
                    }
                    <div>
                        AVATAR
                    </div>
                    <div className='flex flex-col gap-2'>
                        <div className="flex flex-col   gap-5">
                            <Link to="/game" className='bg-[var(--color-primary)] text-[var(--color-neutral)] px-4 py-2 rounded-sm cursor-pointer hover:bg-[var(--color-secondary)] hover:text-black transition-all text-center duration-200 ease-in-out'>Play</Link>
                        </div>
                        <div className='font-bold text-lg flex items-center bg-[var(--color-tertiary)] shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] justify-center p-3'>
                            <span>Casual</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default Home