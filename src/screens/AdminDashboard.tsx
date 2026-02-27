import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';
import { resetGame } from '../lib/cacheService';
import { useCaches } from '../hooks/useCaches';
import { useLivePlayers } from '../hooks/useLivePlayers';
import CachesView from '../components/admin/CachesView';
import Toast from '../components/Toast';
import { LogOut, RefreshCw, Box, BarChart3, Settings, AlertTriangle, Users, MapPin, Trophy, Radio, Menu } from 'lucide-react';

type ViewType = 'caches' | 'dashboard' | 'settings';

const NAV_ITEMS: { id: ViewType; label: string; icon: React.ReactNode }[] = [
    { id: 'caches', label: 'Caches', icon: <Box size={18} /> },
    { id: 'dashboard', label: 'Dashboard', icon: <BarChart3 size={18} /> },
    { id: 'settings', label: 'Settings', icon: <Settings size={18} /> },
];

export default function AdminDashboard() {
    const navigate = useNavigate();
    const [currentView, setCurrentView] = useState<ViewType>('caches');
    const [showResetPrompt, setShowResetPrompt] = useState(false);
    const [resetInput, setResetInput] = useState('');
    const [resetting, setResetting] = useState(false);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

    // Mobile sidebar
    const [sidebarOpen, setSidebarOpen] = useState(false);

    // Settings state
    const [showLivePlayers, setShowLivePlayers] = useState(false);
    const [trackingInterval, setTrackingInterval] = useState(5);

    const handleSignOut = async () => {
        await supabase.auth.signOut();
        navigate('/admin/login');
    };

    const executeResetGame = async () => {
        if (resetInput !== 'RESET') return;
        setResetting(true);
        setShowResetPrompt(false);
        const { error } = await resetGame();
        setResetting(false);
        if (error) setToast({ message: 'Reset failed: ' + error.message, type: 'error' });
        else setToast({ message: 'All caches restored to active. Scores reset to 0.', type: 'success' });
        setResetInput('');
    };

    const handleNavClick = (view: ViewType) => {
        setCurrentView(view);
        setSidebarOpen(false);
    };

    return (
        <div className="admin-shell">
            {/* ─── Mobile Header ─── */}
            <div className="admin-mobile-header">
                <button
                    className="admin-mobile-hamburger"
                    onClick={() => setSidebarOpen(true)}
                    aria-label="Open menu"
                >
                    <Menu size={22} />
                </button>
                <span className="admin-mobile-title">CacheQuest</span>
            </div>

            {/* ─── Sidebar Backdrop (mobile only) ─── */}
            <div
                className={`admin-sidebar-backdrop ${sidebarOpen ? 'open' : ''}`}
                onClick={() => setSidebarOpen(false)}
            />

            {/* ─── Sidebar ─── */}
            <aside className={`admin-sidebar ${sidebarOpen ? 'open' : ''}`}>
                <div className="admin-logo">
                    <div className="admin-logo-icon">C</div>
                    <div>
                        <div className="admin-logo-title">CacheQuest</div>
                        <div className="admin-logo-sub">Mission Control</div>
                    </div>
                </div>

                <nav className="admin-nav">
                    {NAV_ITEMS.map(item => (
                        <button
                            key={item.id}
                            onClick={() => handleNavClick(item.id)}
                            className={`admin-nav-item ${currentView === item.id ? 'active' : ''}`}
                        >
                            {item.icon}
                            {item.label}
                        </button>
                    ))}
                </nav>

                <div className="admin-sidebar-footer">
                    <button
                        onClick={() => { setShowResetPrompt(true); setResetInput(''); setSidebarOpen(false); }}
                        className="admin-nav-item danger"
                        disabled={resetting}
                    >
                        <RefreshCw size={18} style={resetting ? { animation: 'spin 1s linear infinite' } : undefined} />
                        {resetting ? 'Resetting...' : 'Reset Game'}
                    </button>
                    <button onClick={handleSignOut} className="admin-nav-item">
                        <LogOut size={18} />
                        Sign Out
                    </button>
                </div>
            </aside>

            {/* ─── Main Content ─── */}
            <main className="admin-main">
                {currentView === 'caches' && <CachesView setToast={setToast} />}
                {currentView === 'dashboard' && (
                    <DashboardView showLivePlayers={showLivePlayers} />
                )}
                {currentView === 'settings' && (
                    <SettingsView
                        showLivePlayers={showLivePlayers}
                        setShowLivePlayers={setShowLivePlayers}
                        trackingInterval={trackingInterval}
                        setTrackingInterval={setTrackingInterval}
                        setToast={setToast}
                    />
                )}
            </main>

            {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

            {/* Reset Game Modal */}
            {showResetPrompt && (
                <div className="admin-modal-overlay" onClick={() => { setShowResetPrompt(false); setResetInput(''); }}>
                    <div className="admin-modal" onClick={e => e.stopPropagation()}>
                        <div className="admin-modal-icon danger">
                            <AlertTriangle size={24} />
                        </div>
                        <h3 className="admin-modal-title">Reset Entire Game?</h3>
                        <p className="admin-modal-desc">
                            This will mark all caches as unfound and reset every team's score to 0. Caches themselves will be preserved.
                        </p>
                        <div className="admin-modal-field">
                            <label>Type <strong>RESET</strong> to confirm</label>
                            <input
                                autoFocus
                                value={resetInput}
                                onChange={e => setResetInput(e.target.value.toUpperCase())}
                                placeholder="RESET"
                                className="admin-input mono"
                            />
                        </div>
                        <div className="admin-modal-actions">
                            <button
                                onClick={() => { setShowResetPrompt(false); setResetInput(''); }}
                                className="admin-btn secondary"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={executeResetGame}
                                disabled={resetInput !== 'RESET'}
                                className="admin-btn danger"
                            >
                                Reset Game
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// ─── Dashboard View ───
function DashboardView({ showLivePlayers }: { showLivePlayers: boolean }) {
    const { caches } = useCaches({ channelName: 'dashboard-caches' });
    const livePlayers = useLivePlayers();
    const [users, setUsers] = useState<{ id: string; team_name: string; score: number | null }[]>([]);

    useEffect(() => {
        supabase.from('users').select('id, team_name, score').order('score', { ascending: false }).then(({ data }) => {
            if (data) setUsers(data);
        });
    }, []);

    const totalCaches = caches.length;
    const foundCount = caches.filter(c => c.is_found).length;
    const hiddenCount = totalCaches - foundCount;

    return (
        <div className="admin-dashboard-view">
            <h2 className="admin-view-title">Dashboard</h2>

            <div className="admin-stats-grid">
                <div className="admin-stat-card">
                    <div className="admin-stat-icon green"><Box size={22} /></div>
                    <div className="admin-stat-value">{totalCaches}</div>
                    <div className="admin-stat-label">Total Caches</div>
                </div>
                <div className="admin-stat-card">
                    <div className="admin-stat-icon emerald"><MapPin size={22} /></div>
                    <div className="admin-stat-value">{hiddenCount}</div>
                    <div className="admin-stat-label">Hidden</div>
                </div>
                <div className="admin-stat-card">
                    <div className="admin-stat-icon blue"><Trophy size={22} /></div>
                    <div className="admin-stat-value">{foundCount}</div>
                    <div className="admin-stat-label">Found</div>
                </div>
                <div className="admin-stat-card">
                    <div className="admin-stat-icon purple"><Users size={22} /></div>
                    <div className="admin-stat-value">{users.length}</div>
                    <div className="admin-stat-label">Teams</div>
                </div>
            </div>

            {/* Leaderboard */}
            <div className="admin-section">
                <h3 className="admin-section-title"><Trophy size={16} /> Leaderboard</h3>
                <div className="admin-table">
                    <div className="admin-table-head">
                        <span>Rank</span>
                        <span>Team</span>
                        <span>Score</span>
                    </div>
                    {users.length === 0 ? (
                        <div className="admin-list-empty">No teams yet</div>
                    ) : (
                        users.map((u, i) => (
                            <div key={u.id} className="admin-table-row">
                                <span className="admin-rank">#{i + 1}</span>
                                <span className="admin-team-name">{u.team_name}</span>
                                <span className="admin-score">{u.score}</span>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* Live Players */}
            {showLivePlayers && (
                <div className="admin-section">
                    <h3 className="admin-section-title"><Radio size={16} style={{ color: '#4ade80' }} /> Live Players ({livePlayers.length})</h3>
                    {livePlayers.length === 0 ? (
                        <div className="admin-list-empty">No players online</div>
                    ) : (
                        <div className="admin-players-grid">
                            {livePlayers.map(p => (
                                <div key={p.userId} className="admin-player-card">
                                    <div className="admin-player-dot" />
                                    <div>
                                        <div className="admin-player-name">{p.teamName}</div>
                                        <div className="admin-player-coords">
                                            {p.latitude.toFixed(4)}, {p.longitude.toFixed(4)}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// ─── Settings View ───
function SettingsView({
    showLivePlayers, setShowLivePlayers, trackingInterval, setTrackingInterval, setToast,
}: {
    showLivePlayers: boolean; setShowLivePlayers: (v: boolean) => void;
    trackingInterval: number; setTrackingInterval: (v: number) => void;
    setToast: (t: { message: string; type: 'success' | 'error' } | null) => void;
}) {
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [changingPassword, setChangingPassword] = useState(false);

    const handlePasswordChange = async () => {
        if (newPassword.length < 6) {
            setToast({ message: 'Password must be at least 6 characters.', type: 'error' });
            return;
        }
        if (newPassword !== confirmPassword) {
            setToast({ message: 'Passwords do not match.', type: 'error' });
            return;
        }
        setChangingPassword(true);
        const { error } = await supabase.auth.updateUser({ password: newPassword });
        setChangingPassword(false);
        if (error) {
            setToast({ message: 'Failed to update password: ' + error.message, type: 'error' });
        } else {
            setToast({ message: 'Password updated successfully.', type: 'success' });
            setNewPassword('');
            setConfirmPassword('');
        }
    };

    return (
        <div className="admin-settings-view">
            <h2 className="admin-view-title">Settings</h2>

            {/* ─── Account ─── */}
            <div className="admin-settings-group">
                <h3 className="admin-settings-group-title">Account</h3>

                <div className="admin-settings-item" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 12 }}>
                    <div>
                        <div className="admin-settings-item-title">Change Password</div>
                        <div className="admin-settings-item-desc">Update your admin account password</div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <input
                            type="password"
                            className="admin-input"
                            placeholder="New password"
                            value={newPassword}
                            onChange={e => setNewPassword(e.target.value)}
                        />
                        <input
                            type="password"
                            className="admin-input"
                            placeholder="Confirm new password"
                            value={confirmPassword}
                            onChange={e => setConfirmPassword(e.target.value)}
                        />
                        <button
                            onClick={handlePasswordChange}
                            disabled={changingPassword || !newPassword || !confirmPassword}
                            className="admin-btn primary"
                            style={{ alignSelf: 'flex-start' }}
                        >
                            {changingPassword ? 'Updating...' : 'Update Password'}
                        </button>
                    </div>
                </div>
            </div>

            {/* ─── Player Tracking ─── */}
            <div className="admin-settings-group">
                <h3 className="admin-settings-group-title">Player Tracking</h3>

                <div className="admin-settings-item">
                    <div>
                        <div className="admin-settings-item-title">Live Player Locations</div>
                        <div className="admin-settings-item-desc">Show real-time player positions on the admin map and dashboard</div>
                    </div>
                    <label className="admin-toggle">
                        <input type="checkbox" checked={showLivePlayers} onChange={e => setShowLivePlayers(e.target.checked)} />
                        <span className="admin-toggle-slider" />
                    </label>
                </div>

                <div className="admin-settings-item">
                    <div>
                        <div className="admin-settings-item-title">Tracking Interval</div>
                        <div className="admin-settings-item-desc">How often players broadcast their location (in seconds). Lower = more accurate but uses more Supabase quota.</div>
                    </div>
                    <select
                        value={trackingInterval}
                        onChange={e => setTrackingInterval(Number(e.target.value))}
                        className="admin-select"
                    >
                        <option value={3}>3s (High)</option>
                        <option value={5}>5s (Default)</option>
                        <option value={10}>10s (Conservative)</option>
                        <option value={30}>30s (Minimal)</option>
                    </select>
                </div>
            </div>

            {/* ─── Info ─── */}
            <div className="admin-settings-group">
                <h3 className="admin-settings-group-title">Info</h3>

                <div className="admin-settings-item">
                    <div>
                        <div className="admin-settings-item-title">Campus Center</div>
                        <div className="admin-settings-item-desc">10.26944, 76.40035 — map bounds are ±550m around this point</div>
                    </div>
                </div>

                <div className="admin-settings-item">
                    <div>
                        <div className="admin-settings-item-title">Supabase Free Tier</div>
                        <div className="admin-settings-item-desc">Realtime is limited to 200 concurrent connections and 2M messages/month. Monitor usage in your Supabase dashboard.</div>
                    </div>
                </div>
            </div>
        </div>
    );
}
