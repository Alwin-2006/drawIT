import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useUserStore from '../store/userStore';
import {
  connectGuest,
  connectSocket,
  sendPlayCasual,
  sendPlayRanked,
  onPlayCasualQueued,
  onPlayCasualError,
  onPlayRankedQueued,
  onPlayRankedError,
  onRankedReconnect,
  onMatched,
  getSocket,
} from '../socket.js';

function Home() {
  const usr = useUserStore((s) => s.username);
  const authPlayerId = useUserStore((s) => s.playerId);
  const rating = useUserStore((s) => s.rating);
  const token = useUserStore((s) => s.token);

  const [mode, setMode] = useState('casual');
  const [guest, setGuest] = useState('');
  const [guestPlayerId, setGuestPlayerId] = useState('');
  const [queueStatus, setQueueStatus] = useState('');
  const [error, setError] = useState('');

  const navigate = useNavigate();

  // On mount: reconnect to any active ranked game
  useEffect(() => {
    if (!usr || !token) return;

    connectSocket(token).then(() => {
      const handleRankedReconnect = (data) => {
        if (data?.roomId) {
          navigate(`/game/${data.roomId}`, {
            state: { playerName: usr, playerId: authPlayerId, isRanked: true, reconnect: true, reconnectData: data },
          });
        }
      };
      onRankedReconnect(handleRankedReconnect);
      return () => {
        const s = getSocket();
        if (s) s.off('rankedReconnect', handleRankedReconnect);
      };
    });
  }, [usr, token, authPlayerId, navigate]);

  // Queue event listeners
  useEffect(() => {
    if (!usr && !guest) return;

    const onCasualQueued = (p) => setQueueStatus(`In queue…`);
    const onCasualErr = (e) => { setQueueStatus(''); setError(e?.message || 'Queue error'); };
    const onRankedQueued = (p) => setQueueStatus(`In ranked queue… (${p.rating} rating)`);
    const onRankedErr = (e) => { setQueueStatus(''); setError(e?.message || 'Ranked error'); };
    const onMatchedHandler = (data) => {
      if (!data?.roomId) return;
      navigate(`/game/${data.roomId}`, {
        state: {
          playerName: usr || guest,
          playerId: authPlayerId || guestPlayerId,
          isRanked: data.isRanked || false,
        },
      });
    };

    onPlayCasualQueued(onCasualQueued);
    onPlayCasualError(onCasualErr);
    onPlayRankedQueued(onRankedQueued);
    onPlayRankedError(onRankedErr);
    onMatched(onMatchedHandler);

    return () => {
      const s = getSocket();
      if (s) {
        s.off('playCasualQueued', onCasualQueued);
        s.off('playCasualError', onCasualErr);
        s.off('playRankedQueued', onRankedQueued);
        s.off('playRankedError', onRankedErr);
        s.off('matched', onMatchedHandler);
      }
    };
  }, [navigate, usr, guest, authPlayerId, guestPlayerId]);

  const handlePlay = async () => {
    setError('');
    if (mode === 'ranked') {
      if (!usr || !token) { setError('Log in to play ranked.'); return; }
      setQueueStatus('Joining ranked queue…');
      await connectSocket(token);
      sendPlayRanked(token);
      return;
    }

    if (!usr && !guest) return;
    const playerName = usr || guest;
    let pid = usr ? authPlayerId : guestPlayerId;
    if (!pid) {
      pid = `guest-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      setGuestPlayerId(pid);
    }
    setQueueStatus('Joining queue…');
    const client = await connectGuest();
    if (!client.connected) client.connect();
    sendPlayCasual({ playerId: pid, playerName });
  };

  const isRanked = mode === 'ranked';

  return (
    <div className="home-background min-h-screen flex items-center justify-center">
      <div className="font-mono bg-[var(--color-neutral)] border-4 border-[var(--color-primary)] p-6 w-72 flex flex-col gap-4">

        {/* Identity */}
        {usr ? (
          <div className="flex flex-col items-center gap-0.5">
            <span className="text-lg font-bold">{usr}</span>
            <span className="text-xs text-[var(--color-text-muted)]">{rating ?? 1200} rating</span>
          </div>
        ) : (
          <input
            className="border-2 border-[var(--color-primary)] bg-transparent p-2 text-center text-sm w-full outline-none"
            value={guest}
            onChange={(e) => setGuest(e.target.value)}
            placeholder="Enter a username"
          />
        )}

        {/* Mode toggle */}
        <div className="flex border-2 border-[var(--color-primary)] text-sm">
          {['casual', 'ranked'].map((m) => (
            <button
              key={m}
              onClick={() => { setMode(m); setQueueStatus(''); setError(''); }}
              className={`flex-1 py-1.5 capitalize transition-colors cursor-pointer ${
                mode === m
                  ? 'bg-[var(--color-primary)] text-[var(--color-neutral)]'
                  : 'hover:bg-[var(--color-primary)] hover:text-[var(--color-neutral)]'
              }`}
            >
              {m}
            </button>
          ))}
        </div>

        {/* Play */}
        <button
          onClick={handlePlay}
          disabled={isRanked && !usr}
          className="bg-[var(--color-primary)] text-[var(--color-neutral)] py-2 text-sm cursor-pointer hover:bg-[var(--color-secondary)] hover:text-black transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {queueStatus || 'Play'}
        </button>

        {isRanked && !usr && (
          <p className="text-xs text-center text-[var(--color-danger)]">Log in to play ranked</p>
        )}
        {error && (
          <p className="text-xs text-center text-[var(--color-danger)]">{error}</p>
        )}
      </div>
    </div>
  );
}

export default Home;
