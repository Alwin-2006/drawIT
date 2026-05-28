import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import useUserStore from '../store/userStore';
import { connectGuest, sendPlayCasual, onPlayCasualQueued, onPlayCasualError, onMatched, getSocket } from '../socket.js';

function Home() {
    const usr = useUserStore((state)=> state.username);
    const authPlayerId = useUserStore((state)=> state.playerId);
    const [guest, setGuest] = useState('');
    const [guestPlayerId, setGuestPlayerId] = useState('');
    const [queueStatus, setQueueStatus] = useState('');
    const [error, setError] = useState('');
    const navigate = useNavigate();

    useEffect(() => {
      if (!usr && !guest) {
        return;
      }

      const handleQueued = (payload) => {
        setQueueStatus(`Queued for casual match (job ${payload.jobId})`);
      };

      const handleError = (err) => {
        setQueueStatus(`Queue error: ${err?.message || err}`);
      };

      const handleMatched = (data) => {
        if (data?.roomId) {
          const playerName = usr || guest;
          const playerIdToUse = authPlayerId || guestPlayerId;
          navigate(`/game/${data.roomId}`, {
            state: { playerName, playerId: playerIdToUse },
          });
        }
      };

      onPlayCasualQueued(handleQueued);
      onPlayCasualError(handleError);
      onMatched(handleMatched);

      return () => {
        const socket = getSocket();
        if (socket) {
          socket.off('playCasualQueued', handleQueued);
          socket.off('playCasualError', handleError);
          socket.off('matched', handleMatched);
        }
      };
    }, [navigate, usr, guest, authPlayerId, guestPlayerId]);

    const handlePlay = async () => {
      if (!usr && !guest) return;

      const playerName = usr || guest;
      let currentPlayerId = usr ? authPlayerId : guestPlayerId;

      if (!currentPlayerId) {
        currentPlayerId = `guest-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        setGuestPlayerId(currentPlayerId);
      }

      setQueueStatus('Joining casual queue...');
      const client = await connectGuest();
      if (!client.connected) client.connect();

      sendPlayCasual({ playerId: currentPlayerId, playerName });
    };

    return (
        <div>
            <div className='home-background flex items-center justify-center h-screen'>
                <div className="font-mono bg-[var(--color-neutral)] text-[var(--color-primary)] border-4 border-[var(--color-primary)] p-2 w-1/5 h-1/2 flex flex-col  justify-around gap-2 text-2xl">
                    {usr?<div className='flex items-center justify-center'>{usr}</div>:
                    <input
                      className='text-2xl font-display text-center'
                      value={guest}
                      onChange={(event) => setGuest(event.target.value)}
                      placeholder='Enter username'
                    />
                    }
                    <div>
                        AVATAR
                    </div>
                    <div className='flex flex-col gap-2'>
                        <div className="flex flex-col   gap-5">
                            <button onClick={handlePlay} className='bg-[var(--color-primary)] text-[var(--color-neutral)] px-4 py-2 rounded-sm cursor-pointer hover:bg-[var(--color-secondary)] hover:text-black transition-all text-center duration-200 ease-in-out'>Play</button>
                            {queueStatus && <div className='text-sm text-[var(--color-primary)]'>{queueStatus}</div>}
                        </div>
                        <div className='font-bold text-lg flex items-center bg-[var(--color-tertiary)] shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] justify-center p-3'>
                            <span>Casual</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default Home