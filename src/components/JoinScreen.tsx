import { useState } from 'react';
import { supabase } from '../lib/supabase';

interface JoinScreenProps {
    onJoin: (userId: string, teamName: string) => void;
}

export default function JoinScreen({ onJoin }: JoinScreenProps) {
    const [teamName, setTeamName] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!teamName.trim()) return;

        setLoading(true);
        setError(null);

        const name = teamName.trim();

        // Check if team name exists
        const { data: existingUser } = await supabase
            .from('users')
            .select('id')
            .eq('team_name', name)
            .single();

        if (existingUser) {
            localStorage.setItem('CacheQuest_user_id', existingUser.id);
            localStorage.setItem('CacheQuest_team_name', name);
            onJoin(existingUser.id, name);
            setLoading(false);
            return;
        }

        // Create new user
        const { data, error: insertError } = await supabase
            .from('users')
            .insert({ team_name: name, score: 0 })
            .select()
            .single();

        if (insertError) {
            setError('Could not join. Try a different name?');
            setLoading(false);
            return;
        }

        if (data) {
            localStorage.setItem('CacheQuest_user_id', data.id);
            localStorage.setItem('CacheQuest_team_name', data.team_name);
            onJoin(data.id, data.team_name);
        }
    };

    return (
        <div className="join-screen">
            {/* Animated background grid */}
            <div className="join-bg-grid" />

            <div className="join-content">
                {/* Logo mark */}
                <div className="join-logo-mark">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <polygon points="3 11 22 2 13 21 11 13 3 11" />
                    </svg>
                </div>

                <h1 className="join-title">
                    Cash<span className="join-title-accent">Quest</span>
                </h1>
                <p className="join-subtitle">Geocaching</p>

                <div className="join-divider" />

                <form onSubmit={handleSubmit} className="join-form">
                    <label className="join-label">Team Name</label>
                    <input
                        type="text"
                        className="join-input"
                        placeholder="Enter team name"
                        value={teamName}
                        onChange={(e) => setTeamName(e.target.value)}
                        disabled={loading}
                        maxLength={20}
                        autoFocus
                    />

                    {error && <p className="join-error">{error}</p>}

                    <button
                        type="submit"
                        className="join-btn"
                        disabled={!teamName.trim() || loading}
                    >
                        {loading ? (
                            <span className="join-btn-loading">
                                <svg className="join-spinner" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                                </svg>
                                Joining...
                            </span>
                        ) : (
                            'Enter the Hunt →'
                        )}
                    </button>
                </form>

                <p className="join-footer">
                    Find hidden caches. Enter secret codes. Climb the leaderboard.
                </p>
            </div>
        </div>
    );
}
