import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';

export default function AdminLogin() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const navigate = useNavigate();

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        // Convenience shortcut: "admin" / "admin" maps to real Supabase Auth credentials
        const loginEmail = email === 'admin' ? 'admin@CacheQuest.com' : email;
        const loginPassword = password === 'admin' && email === 'admin' ? 'adminpassword123' : password;

        const { error } = await supabase.auth.signInWithPassword({
            email: loginEmail,
            password: loginPassword,
        });

        if (error) {
            setError(error.message);
            setLoading(false);
        } else {
            navigate('/admin');
        }
    };

    return (
        <div className="admin-login-bg">
            <div className="admin-login-card">
                {/* Logo */}
                <div className="admin-login-logo">
                    <div className="admin-login-icon">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <polygon points="3 11 22 2 13 21 11 13 3 11" />
                        </svg>
                    </div>
                </div>

                <h1 className="admin-login-title">Welcome to CacheQuest</h1>
                <p className="admin-login-sub">Sign in to Mission Control</p>

                <form onSubmit={handleLogin} className="admin-login-form">
                    <div className="admin-login-field">
                        <label className="admin-login-label">Email</label>
                        <input
                            type="text"
                            className="admin-login-input"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="admin@CacheQuest.com"
                            required
                            autoFocus
                        />
                    </div>

                    <div className="admin-login-field">
                        <label className="admin-login-label">Password</label>
                        <div className="admin-login-input-wrap">
                            <input
                                type={showPassword ? 'text' : 'password'}
                                className="admin-login-input"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="••••••••••"
                                required
                            />
                            <button
                                type="button"
                                className="admin-login-eye"
                                onClick={() => setShowPassword(!showPassword)}
                                tabIndex={-1}
                                aria-label={showPassword ? 'Hide password' : 'Show password'}
                            >
                                {showPassword ? (
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                                        <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                                        <line x1="1" y1="1" x2="23" y2="23" />
                                    </svg>
                                ) : (
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                        <circle cx="12" cy="12" r="3" />
                                    </svg>
                                )}
                            </button>
                        </div>
                    </div>

                    {error && (
                        <div className="admin-login-error">{error}</div>
                    )}

                    <button
                        type="submit"
                        disabled={loading}
                        className="admin-login-submit"
                    >
                        {loading ? 'Signing in...' : 'Sign in'}
                    </button>
                </form>

                <button
                    onClick={() => navigate('/')}
                    className="admin-login-back"
                >
                    ← Back to Game
                </button>
            </div>
        </div>
    );
}
