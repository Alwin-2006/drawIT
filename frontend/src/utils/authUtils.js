const API_BASE_URL = `${import.meta.env.VITE_BACKEND_URL}/api/auth`;

export const handleChange = (e, setFormData, setError) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
        ...prev,
        [name]: value,
    }));
    setError('');
};

export const validateLoginForm = (formData) => {
    if (!formData.username || !formData.password) {
        return { valid: false, error: 'Please fill in all fields' };
    }
    return { valid: true, error: '' };
};

export const validateSignupForm = (formData) => {
    if (!formData.username || !formData.password || !formData.confirmPassword) {
        return { valid: false, error: 'Please fill in all fields' };
    }

    if (formData.username.length < 3) {
        return { valid: false, error: 'Username must be at least 3 characters long' };
    }

    if (formData.password.length < 6) {
        return { valid: false, error: 'Password must be at least 6 characters long' };
    }

    if (formData.password !== formData.confirmPassword) {
        return { valid: false, error: 'Passwords do not match' };
    }

    return { valid: true, error: '' };
};

export const handleLogin = async (formData, setError, setLoading, setUser, setToken, navigate) => {
    setLoading(true);
    setError('');

    try {
        const response = await fetch(`${API_BASE_URL}/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(formData),
        });

        const data = await response.json();

        if (!response.ok) {
            setError(data.error || 'Login failed');
            setLoading(false);
            return;
        }

        // Store user data and token
        setUser(data);
        setToken(data.token);
        localStorage.setItem('authToken', data.token);
        localStorage.setItem('user', JSON.stringify(data));

        setLoading(false);
        navigate('/');
        return true;
    } catch (err) {
        setError(err.message || 'An error occurred during login');
        setLoading(false);
        return false;
    }
};

export const handleSignup = async (formData, setError, setLoading, setUser, setToken, navigate) => {
    setLoading(true);
    setError('');

    try {
        const response = await fetch(`${API_BASE_URL}/signup`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                username: formData.username,
                password: formData.password,
            }),
        });

        const data = await response.json();

        if (!response.ok) {
            setError(data.error || 'Sign up failed');
            setLoading(false);
            return;
        }

        // Store user data and token
        setUser(data);
        setToken(data.token);
        localStorage.setItem('authToken', data.token);
        localStorage.setItem('user', JSON.stringify(data));

        setLoading(false);
        navigate('/');
        return true;
    } catch (err) {
        setError(err.message || 'An error occurred during sign up');
        setLoading(false);
        return false;
    }
};
