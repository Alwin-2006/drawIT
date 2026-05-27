import React from 'react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import "../index.css";
import useUserStore from '../store/userStore';


function Navbar() {
    const user = useUserStore((state)=>state.username);
    return (
        <>
            <nav className="fixed top-0 w-full bg-[var(--color-neutral)]  border-[var(--color-primary)] border-4 flex items-center justify-between px-5 py-3 font-mono">
                <Link to='/' className="">
                    <h1 className="text-[var(--color-primary)] font-display font-bold text-4xl">drawIT</h1>
                </Link>
                <div className="flex justify-around font-mono text-[var(--color-primary)] items-center gap-5 text-lg">
                    <Link to="/">Home</Link>
                    <Link to="/rooms">Rooms</Link>
                    <Link to="/leaderboard">Leaderboard</Link>
                </div>
                {
                    user?<div>{user}</div>:
                <div className="flex justify-center text-sm items-center gap-5">
                    
                    <Link to="/login" className="bg-[var(--color-primary)] text-[var(--color-neutral)] px-4 py-2 rounded-xl cursor-pointer">Login</Link>
                    <Link to="/signup" className="bg-[var(--color-primary)] text-[var(--color-neutral)] px-4 py-2 rounded-xl cursor-pointer">Signup</Link>
                </div>
}
            </nav>
        </>
    )
}

export default Navbar
