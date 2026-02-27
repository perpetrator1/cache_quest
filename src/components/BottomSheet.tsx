import { useEffect, useRef, useState } from 'react';
import type { Cache } from '../lib/types';

/** Distance in meters at which hint becomes visible */
const HINT_PROXIMITY_METERS = 50;

interface BottomSheetProps {
    cache: Cache | null;
    isOpen: boolean;
    onClose: () => void;
    onClaim: (code: string) => void;
    distance: number | null;
}

export default function BottomSheet({
    cache,
    isOpen,
    onClose,
    onClaim,
    distance,
}: BottomSheetProps) {
    const sheetRef = useRef<HTMLDivElement>(null);
    const [code, setCode] = useState('');

    // Reset code when sheet closes
    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: reset input when sheet closes
        if (!isOpen) setCode('');
    }, [isOpen]);

    // Close on Escape key
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        if (isOpen) window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [isOpen, onClose]);

    const handleClaim = () => {
        if (code.trim()) {
            onClaim(code.trim());
        }
    };

    const distanceLabel =
        distance !== null
            ? distance < 1000
                ? `${Math.round(distance)}m away`
                : `${(distance / 1000).toFixed(1)}km away`
            : null;

    const isNearby = distance !== null && distance <= HINT_PROXIMITY_METERS;

    return (
        <>
            {/* Backdrop */}
            <div
                className={`sheet-backdrop ${isOpen ? 'open' : ''}`}
                onClick={onClose}
            />

            {/* Sheet */}
            <div
                ref={sheetRef}
                className={`bottom-sheet ${isOpen ? 'open' : ''}`}
                role="dialog"
                aria-modal="true"
                aria-label={cache?.name ?? 'Cache details'}
            >
                <div className="sheet-handle" />

                {cache && (
                    <div className="sheet-content">
                        {/* Header row */}
                        <div className="sheet-header">
                            <div className="sheet-header-text">
                                <h2 className="sheet-title">{cache.name}</h2>
                                {distanceLabel && (
                                    <span className={`sheet-distance ${isNearby ? 'nearby' : ''}`}>
                                        📍 {distanceLabel}
                                    </span>
                                )}
                            </div>
                            <button onClick={onClose} className="sheet-close" aria-label="Close">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="18" y1="6" x2="6" y2="18" />
                                    <line x1="6" y1="6" x2="18" y2="18" />
                                </svg>
                            </button>
                        </div>

                        {/* Hint — only visible when close enough, hidden for already-found caches */}
                        {cache.hint && !cache.is_found && (
                            <div className={`sheet-hint-block ${isNearby ? 'unlocked' : 'locked'}`}>
                                {isNearby ? (
                                    <>
                                        <p className="sheet-hint-label">Hint</p>
                                        <p className="sheet-hint-text">{cache.hint}</p>
                                    </>
                                ) : (
                                    <div className="sheet-hint-locked">
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                                            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                                        </svg>
                                        <span>Get within {HINT_PROXIMITY_METERS}m to unlock hint</span>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Code input */}
                        <div className="sheet-action-row">
                            <input
                                type="text"
                                placeholder="Enter secret code…"
                                className="sheet-input"
                                value={code}
                                onChange={(e) => setCode(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleClaim()}
                            />
                            <button
                                className="sheet-claim-btn"
                                onClick={handleClaim}
                                disabled={!code.trim()}
                            >
                                Claim
                            </button>
                        </div>

                        <p className="sheet-footer">
                            Find the cache and enter its secret code to claim it
                        </p>
                    </div>
                )}
            </div>
        </>
    );
}
