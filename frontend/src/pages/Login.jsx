import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import useUserStore from '../store/userStore'
import { handleChange, validateLoginForm, handleLogin } from '../utils/authUtils'

function Login() {
    const [formData, setFormData] = useState({
        username: '',
        password: '',
    })
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)
    const navigate = useNavigate()
    const setUser = useUserStore((state) => state.setUser)
    const setToken = useUserStore((state) => state.setToken)
    
    const onHandleChange = (e) => {
        handleChange(e, setFormData, setError)
    }

    const handleSubmit = async (e) => {
        e.preventDefault()

        const { valid, error: validationError } = validateLoginForm(formData)
        if (!valid) {
            setError(validationError)
            return
        }

        await handleLogin(formData, setError, setLoading, setUser, setToken, navigate)
    }

    return (
        <div className='p-5'>
            <div className='home-background flex justify-center'>
                <div className="font-mono w-3/4 md:w-1/3 p-3 border-4 border-[var(--color-primary)] bg-[var(--color-neutral)] text-[var(--color-primary)] flex flex-col items-center gap-10">
                    <h1 className='text-4xl md:text-5xl font-display'>Login</h1>
                    
                    <form onSubmit={handleSubmit} className='w-full flex flex-col gap-5'>
                        <div className='flex text-lg md:text-xl flex-col justify-between gap-5 font-[var(--color-primary)]'>
                            <label htmlFor="username">Username or email</label>
                            <input
                                type="text"
                                id="username"
                                name="username"
                                value={formData.username}
                                onChange={onHandleChange}
                                className='border-1 border-black p-2 w-full text-black'
                                placeholder='Enter your username or email'
                                required
                            />
                        </div>

                        <div className='flex text-lg md:text-xl flex-col justify-between gap-5 font-[var(--color-primary)]'>
                            <label htmlFor="password">Password</label>
                            <input
                                type="password"
                                id="password"
                                name="password"
                                value={formData.password}
                                onChange={onHandleChange}
                                className='border-1 border-black p-2 w-full text-black'
                                placeholder='Enter your password'
                                required
                            />
                        </div>

                        {error && (
                            <div className='text-red-600 text-lg p-3 bg-red-100 border-2 border-red-600 rounded'>
                                {error}
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={loading}
                            className='font-display text-lg md:text-xl bg-[var(--color-secondary)] text-[var(--color-black)] px-4 py-2 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-[0px_0px_0px_0px_rgba(0,0,0,1)] cursor-pointer hover:bg-[var(--color-secondary)] hover:text-black transition-all duration-200 ease-in-out disabled:opacity-50 disabled:cursor-not-allowed'
                        >
                            {loading ? 'Logging in...' : 'Login'}
                        </button>
                    </form>

                    <div className='text-center'>
                        <p className='text-lg md:text-xl font-[var(--color-primary)]'>
                            Don't have an account?{' '}
                            <a href="/signup" className='underline hover:text-[var(--color-secondary)] transition-colors'>
                                Sign up
                            </a>
                        </p>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default Login