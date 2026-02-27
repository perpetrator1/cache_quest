import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import maplibregl from 'maplibre-gl';
import confetti from 'canvas-confetti';
import MapView, { recenterMap } from '../components/MapView';
import BottomSheet from '../components/BottomSheet';
import StatusBar from '../components/StatusBar';
import AdminPanel from '../components/AdminPanel';
import Toast from '../components/Toast';
import JoinScreen from '../components/JoinScreen';
import Leaderboard from '../components/Leaderboard';
import { useGeolocation, useDistanceTo } from '../hooks/useGeolocation';
import { useCaches } from '../hooks/useCaches';
import { claimCache } from '../lib/cacheService';
import { supabase } from '../lib/supabase';
import type { Cache } from '../lib/types';

export default function GameScreen() {
    const mapRef = useRef<maplibregl.Map | null>(null);
    const geo = useGeolocation();

    const [selectedCache, setSelectedCache] = useState<Cache | null>(null);
    const [sheetOpen, setSheetOpen] = useState(false);

    // Toast state
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

    // ─── Admin: mock location ───
    const [mockLocation, setMockLocation] = useState<{ latitude: number; longitude: number } | null>(null);
    const [mapClickMode, setMapClickMode] = useState(false);

    // ─── User Session ───
    const [userId, setUserId] = useState<string | null>(() => localStorage.getItem('CacheQuest_user_id'));
    const [teamName, setTeamName] = useState<string | null>(() => localStorage.getItem('CacheQuest_team_name'));

    // ─── Caches (via shared hook) ───
    const { caches } = useCaches({
        channelName: 'player-caches-realtime',
        enabled: !!userId,
    });

    // Handle Geolocation Errors via Toast
    useEffect(() => {
        if (geo.error) {
            // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: sync geo error to toast
            setToast({ message: geo.error, type: 'error' });
        }
    }, [geo.error]);

    const activeCaches = useMemo(
        () => caches.filter((c) => !c.is_found),
        [caches]
    );

    const handleCacheSelect = useCallback((cache: Cache) => {
        setSelectedCache(cache);
        setSheetOpen(true);
    }, []);

    const handleSheetClose = useCallback(() => {
        setSheetOpen(false);
        setTimeout(() => {
            setSelectedCache(null);
        }, 350);
    }, []);

    const effectiveLocation = useMemo(() => {
        if (mockLocation) return mockLocation;
        if (geo.latitude !== null && geo.longitude !== null) {
            return { latitude: geo.latitude, longitude: geo.longitude };
        }
        return null;
    }, [mockLocation, geo.latitude, geo.longitude]);

    // ─── Live Player Tracking (Broadcast) ───
    const [trackingEnabled] = useState(() => localStorage.getItem('CacheQuest_tracking') === 'true');
    const trackingChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

    useEffect(() => {
        if (!userId || !teamName || !trackingEnabled) {
            if (trackingChannelRef.current) {
                trackingChannelRef.current.untrack();
                supabase.removeChannel(trackingChannelRef.current);
                trackingChannelRef.current = null;
            }
            return;
        }

        const channel = supabase.channel('player-tracking', {
            config: { presence: { key: userId } }
        });

        channel.subscribe();
        trackingChannelRef.current = channel;

        return () => {
            channel.untrack();
            supabase.removeChannel(channel);
            trackingChannelRef.current = null;
        };
    }, [userId, teamName, trackingEnabled]);

    const lastBroadcastRef = useRef<number>(0);
    const pendingBroadcastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (!userId || !teamName || !effectiveLocation || !trackingChannelRef.current) return;

        const broadcast = () => {
            if (!trackingChannelRef.current) return;
            trackingChannelRef.current.track({
                userId,
                teamName,
                latitude: effectiveLocation.latitude,
                longitude: effectiveLocation.longitude,
                lastTick: Date.now(),
            });
            lastBroadcastRef.current = Date.now();
            pendingBroadcastTimeoutRef.current = null;
        };

        const now = Date.now();
        const timeSinceLast = now - lastBroadcastRef.current;
        const cooldown = 15000;

        if (timeSinceLast >= cooldown) {
            broadcast();
        } else if (!pendingBroadcastTimeoutRef.current) {
            pendingBroadcastTimeoutRef.current = setTimeout(broadcast, cooldown - timeSinceLast);
        }

        return () => {
            if (pendingBroadcastTimeoutRef.current) {
                clearTimeout(pendingBroadcastTimeoutRef.current);
                pendingBroadcastTimeoutRef.current = null;
            }
        };
    }, [userId, teamName, effectiveLocation]);

    const handleRecenter = useCallback(() => {
        geo.recalibrate();

        if (effectiveLocation) {
            recenterMap(
                mapRef.current,
                effectiveLocation.latitude,
                effectiveLocation.longitude
            );
        }
    }, [effectiveLocation, geo]);

    const distance = useDistanceTo(
        effectiveLocation?.latitude ?? null,
        effectiveLocation?.longitude ?? null,
        selectedCache?.lat ?? 0,
        selectedCache?.lng ?? 0
    );

    const handleMapClick = useCallback(
        (lngLat: { lng: number; lat: number }) => {
            if (mapClickMode) {
                setMockLocation({ latitude: lngLat.lat, longitude: lngLat.lng });
                setMapClickMode(false);
            }
        },
        [mapClickMode]
    );

    const handleToggleMapClickMode = useCallback(() => {
        setMapClickMode((prev) => !prev);
    }, []);

    const handleJoin = useCallback((id: string, name: string) => {
        setUserId(id);
        setTeamName(name);
    }, []);

    const handleSignOut = useCallback(() => {
        localStorage.removeItem('CacheQuest_user_id');
        localStorage.removeItem('CacheQuest_team_name');
        setUserId(null);
        setTeamName(null);
        setSheetOpen(false);
    }, []);

    // ─── Claim Logic ───
    const handleClaim = useCallback(async (code: string) => {
        if (!selectedCache || !userId) return;

        if (code.trim().toUpperCase() === selectedCache.secret_code.toUpperCase()) {
            setSheetOpen(false);
            setTimeout(() => setSelectedCache(null), 350);

            // Fire confetti!
            confetti({
                particleCount: 150,
                spread: 70,
                origin: { y: 0.6 },
                colors: ['#00FF94', '#FFD700', '#FFFFFF']
            });

            // DB Update via service
            const { error } = await claimCache(selectedCache.id, userId);

            if (error) {
                setToast({ message: 'Error syncing with server.', type: 'error' });
            } else {
                setToast({ message: `Cache found! You claimed "${selectedCache.name}".`, type: 'success' });
            }
        } else {
            setToast({ message: 'Incorrect secret code. Try again!', type: 'error' });
        }
    }, [selectedCache, userId]);

    return (
        <div className={`game-screen ${mapClickMode ? 'map-pick-active' : ''}`}>
            {!userId && <JoinScreen onJoin={handleJoin} />}

            {/* Toast */}
            {toast && (
                <Toast
                    message={toast.message}
                    type={toast.type}
                    onClose={() => setToast(null)}
                />
            )}

            {/* Map */}
            <MapView
                caches={caches}
                userLocation={effectiveLocation}
                onCacheSelect={handleCacheSelect}
                onMapClick={handleMapClick}
                pickMode={mapClickMode}
                mapRef={mapRef}
            />

            {/* Live Leaderboard */}
            <Leaderboard teamName={teamName} onSignOut={handleSignOut} />

            {/* Status bar */}
            <StatusBar activeCacheCount={activeCaches.length} />

            {/* Re-center FAB */}
            <button
                className="fab fab-recenter"
                onClick={handleRecenter}
                aria-label="Re-center on my location"
                title="Re-center on my location"
            >
                <svg
                    width="22"
                    height="22"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                >
                    <polygon points="3 11 22 2 13 21 11 13 3 11" />
                </svg>
            </button>

            {/* Admin panel (Mock Location) */}
            <AdminPanel
                mockLocation={mockLocation}
                onSetMockLocation={setMockLocation}
                isMapClickMode={mapClickMode}
                onToggleMapClickMode={handleToggleMapClickMode}
            />

            {/* Map pick mode indicator */}
            {mapClickMode && (
                <div className="map-pick-banner">
                    Tap anywhere on the map to set your mock location
                </div>
            )}

            {/* Bottom sheet */}
            <BottomSheet
                cache={selectedCache}
                isOpen={sheetOpen}
                onClose={handleSheetClose}
                onClaim={handleClaim}
                distance={selectedCache ? distance : null}
            />

            {/* Location permission prompt */}
            {geo.permissionState === 'denied' && (
                <div className="location-prompt">
                    📍 Location access denied. Enable location in your browser settings to navigate the campus.
                </div>
            )}
        </div>
    );
}
