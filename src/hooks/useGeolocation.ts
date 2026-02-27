import { useState, useEffect, useCallback, useRef, useMemo } from 'react';

// ─── Types ───

export type PermissionState = 'prompt' | 'granted' | 'denied' | 'unsupported';

interface GeoPosition {
    latitude: number;
    longitude: number;
    accuracy: number;
}

interface GeolocationState {
    latitude: number | null;
    longitude: number | null;
    accuracy: number | null;
    error: string | null;
    loading: boolean;
    permissionState: PermissionState;
    stale: boolean;
    recalibrate: () => void;
}

// ─── Constants ───

/** EMA smoothing factor: 0 = ignore new readings, 1 = no smoothing */
const EMA_ALPHA = 0.15;
/** Discard readings with accuracy worse than this (meters) */
const MAX_ACCEPTABLE_ACCURACY = 100;
/** Minimum movement (meters) before pushing a state update to avoid render churn */
const MIN_MOVEMENT_THRESHOLD = 5;
/** If no successful position arrives within this window, mark as stale */
const STALENESS_TIMEOUT_MS = 30_000;
/** Consecutive sub-threshold readings before snapping (freezing) position */
const SNAP_AFTER_STABLE_COUNT = 3;

const WATCH_OPTIONS: PositionOptions = {
    enableHighAccuracy: true,
    maximumAge: 5000,
    timeout: 20000,
};

const RECALIBRATE_OPTIONS: PositionOptions = {
    enableHighAccuracy: true,
    maximumAge: 0,
    timeout: 20000,
};

// ─── Pure Utilities ───

/** Haversine distance between two lat/lng points in meters */
export function haversine(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number
): number {
    const R = 6371000;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Apply EMA smoothing to a new position reading */
function smooth(
    prev: GeoPosition | null,
    raw: GeoPosition,
    alpha: number
): GeoPosition {
    if (!prev) return raw;
    return {
        latitude: alpha * raw.latitude + (1 - alpha) * prev.latitude,
        longitude: alpha * raw.longitude + (1 - alpha) * prev.longitude,
        accuracy: alpha * raw.accuracy + (1 - alpha) * prev.accuracy,
    };
}

// ─── Hook ───

export function useGeolocation(): GeolocationState {
    const [state, setState] = useState<Omit<GeolocationState, 'recalibrate'>>({
        latitude: null,
        longitude: null,
        accuracy: null,
        error: null,
        loading: true,
        permissionState: 'prompt',
        stale: false,
    });

    // Refs for smoothing (avoid re-render cascades)
    const smoothedRef = useRef<GeoPosition | null>(null);
    const lastPushedRef = useRef<GeoPosition | null>(null);
    const stalenessTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const watchIdRef = useRef<number | null>(null);
    const stableCountRef = useRef(0);

    // ─── Process a successful position reading ───
    const handlePosition = useCallback((pos: GeolocationCoordinates) => {
        // Gate: discard wildly inaccurate readings
        if (pos.accuracy > MAX_ACCEPTABLE_ACCURACY && smoothedRef.current) {
            return;
        }

        // Speed-based filter: if device reports near-zero speed, skip update
        // (speed is null on some devices, so only filter when explicitly available)
        if (pos.speed !== null && pos.speed >= 0 && pos.speed < 0.3 && smoothedRef.current) {
            // Device reports stationary — bump stable count and skip
            stableCountRef.current++;
            if (stableCountRef.current >= SNAP_AFTER_STABLE_COUNT) {
                // Already snapped; just refresh staleness timer and return
                if (stalenessTimerRef.current) clearTimeout(stalenessTimerRef.current);
                stalenessTimerRef.current = setTimeout(() => {
                    setState(prev => ({ ...prev, stale: true, error: 'Location signal lost. Move to an open area.' }));
                }, STALENESS_TIMEOUT_MS);
                // Still clear loading/error flags if needed
                setState(prev => {
                    if (prev.loading || prev.error || prev.stale || prev.permissionState !== 'granted') {
                        return { ...prev, error: null, loading: false, permissionState: 'granted', stale: false };
                    }
                    return prev;
                });
                return;
            }
        } else {
            // Moving — reset stable counter
            stableCountRef.current = 0;
        }

        const raw: GeoPosition = {
            latitude: pos.latitude,
            longitude: pos.longitude,
            accuracy: pos.accuracy,
        };

        // Apply EMA
        const smoothed = smooth(smoothedRef.current, raw, EMA_ALPHA);
        smoothedRef.current = smoothed;

        // Reset staleness timer
        if (stalenessTimerRef.current) clearTimeout(stalenessTimerRef.current);
        stalenessTimerRef.current = setTimeout(() => {
            setState(prev => ({ ...prev, stale: true, error: 'Location signal lost. Move to an open area.' }));
        }, STALENESS_TIMEOUT_MS);

        // Only push to React state if position moved ≥ threshold (or first reading)
        const prev = lastPushedRef.current;
        const shouldPush =
            !prev ||
            haversine(prev.latitude, prev.longitude, smoothed.latitude, smoothed.longitude) >= MIN_MOVEMENT_THRESHOLD;

        if (shouldPush) {
            lastPushedRef.current = smoothed;
            setState({
                latitude: smoothed.latitude,
                longitude: smoothed.longitude,
                accuracy: smoothed.accuracy,
                error: null,
                loading: false,
                permissionState: 'granted',
                stale: false,
            });
        } else {
            // Still clear error/loading even if position didn't move enough to push
            setState(prev => {
                if (prev.loading || prev.error || prev.stale || prev.permissionState !== 'granted') {
                    return { ...prev, error: null, loading: false, permissionState: 'granted', stale: false };
                }
                return prev;
            });
        }
    }, []);

    // ─── Handle geolocation errors ───
    const handleError = useCallback((error: GeolocationPositionError) => {
        if (error.code === error.PERMISSION_DENIED) {
            setState(prev => ({
                ...prev,
                error: 'Location access denied. Please enable location in your browser settings to play.',
                loading: false,
                permissionState: 'denied',
            }));
            // Stop watching — no point continuing if denied
            if (watchIdRef.current !== null) {
                navigator.geolocation.clearWatch(watchIdRef.current);
                watchIdRef.current = null;
            }
        } else {
            // POSITION_UNAVAILABLE or TIMEOUT — transient, let watchPosition keep retrying
            setState(prev => ({
                ...prev,
                error: prev.latitude === null
                    ? 'Acquiring location… Please ensure GPS is enabled.'
                    : null, // Don't show error if we already have a position (transient blip)
                loading: prev.latitude === null,
                // Do NOT change permissionState here — this is not a denial
            }));
        }
    }, []);

    // ─── Unified permission check + watchPosition (single effect) ───
    useEffect(() => {
        if (!navigator.geolocation) {
            setState(prev => ({
                ...prev,
                error: 'Location services are not supported by your browser.',
                loading: false,
                permissionState: 'unsupported',
            }));
            return;
        }

        let cancelled = false;

        const startWatching = () => {
            if (cancelled) return;
            watchIdRef.current = navigator.geolocation.watchPosition(
                (position) => handlePosition(position.coords),
                (error) => handleError(error),
                WATCH_OPTIONS
            );
        };

        // Try the Permissions API first (works on Chrome, Firefox; not Safari)
        if (navigator.permissions?.query) {
            navigator.permissions
                .query({ name: 'geolocation' })
                .then(result => {
                    if (cancelled) return;

                    if (result.state === 'denied') {
                        // User has previously denied — don't call watchPosition (avoids
                        // silent failure on some browsers that won't re-prompt)
                        setState(prev => ({
                            ...prev,
                            error: 'Location access denied. Please enable location in your browser settings to play.',
                            loading: false,
                            permissionState: 'denied',
                        }));
                        return;
                    }

                    // 'granted' or 'prompt' — start watching (browser will prompt if needed)
                    setState(prev => ({
                        ...prev,
                        permissionState: result.state as PermissionState,
                    }));
                    startWatching();

                    // Listen for future permission changes (e.g. user toggles in settings)
                    result.addEventListener('change', () => {
                        if (result.state === 'denied') {
                            setState(prev => ({
                                ...prev,
                                error: 'Location access revoked.',
                                permissionState: 'denied',
                            }));
                            if (watchIdRef.current !== null) {
                                navigator.geolocation.clearWatch(watchIdRef.current);
                                watchIdRef.current = null;
                            }
                        } else if (result.state === 'granted' && watchIdRef.current === null) {
                            // Permission re-granted — restart watching
                            startWatching();
                        }
                    });
                })
                .catch(() => {
                    // Permissions API not available (e.g. Safari) — fall straight through
                    if (!cancelled) startWatching();
                });
        } else {
            // No Permissions API (Safari) — watchPosition will trigger the browser prompt
            startWatching();
        }

        return () => {
            cancelled = true;
            if (watchIdRef.current !== null) {
                navigator.geolocation.clearWatch(watchIdRef.current);
                watchIdRef.current = null;
            }
            if (stalenessTimerRef.current) {
                clearTimeout(stalenessTimerRef.current);
            }
        };
    }, [handlePosition, handleError]);

    // ─── Recalibrate: one-shot high-accuracy fix piped through EMA ───
    const recalibrate = useCallback(() => {
        if (!navigator.geolocation) return;

        setState(prev => ({ ...prev, loading: true, error: null, stale: false }));

        navigator.geolocation.getCurrentPosition(
            (pos) => handlePosition(pos.coords),
            (err) => {
                setState(prev => ({
                    ...prev,
                    error: `Recalibration failed: ${err.message}`,
                    loading: false,
                }));
            },
            RECALIBRATE_OPTIONS
        );
    }, [handlePosition]);

    return { ...state, recalibrate };
}

// ─── Convenience Hook ───

/** Reactive distance calculation between user and a target point */
export function useDistanceTo(
    userLat: number | null,
    userLng: number | null,
    targetLat: number,
    targetLng: number
): number | null {
    return useMemo(() => {
        if (userLat === null || userLng === null) return null;
        return haversine(userLat, userLng, targetLat, targetLng);
    }, [userLat, userLng, targetLat, targetLng]);
}
