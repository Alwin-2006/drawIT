import React from 'react'

function Login() {
    return (
        <div className='p-5'>
            <div className='home-background flex  justify-center '>
                <div className="font-mono w-3/4 md:w-1/3 p-3 border-4 border-[var(--color-primary)] bg-[var(--color-neutral)] text-[var(--color-primary)] border-4 border-[var(--color-primary)] p-2   flex flex-col items-center gap-10 ">
                    <h1 className='text-4xl md:text-5xl font-display'>Login</h1>
                    <div className=' flex text-lg md:text-xl flex-col justify-between gap-5 font-[var(--color-primary)]'>
                        <span className=''>Username or email</span>
                        <input type="text" className='border-1 border-black p-2 w-full' />
                    </div>
                    <div className=' flex text-lg md:text-xl flex-col justify-between gap-5 font-[var(--color-primary)]'>
                        <span className=''>Password</span>
                        <input type="password" className='border-1 border-black p-2 w-full' />
                    </div>
                    <button className='font-display text-lg md:text-xl bg-[var(--color-secondary)] text-[var(--color-black)] px-4 py-2 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-[0px_0px_0px_0px_rgba(0,0,0,1)] cursor-pointer hover:bg-[var(--color-secondary)] hover:text-black transition-all duration-200 ease-in-out'>Login</button>
                </div>
            </div>
        </div>
    )
}

export default Login