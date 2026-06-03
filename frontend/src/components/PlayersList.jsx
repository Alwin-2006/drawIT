import React from 'react';

const PlayersList = ({ players }) => (
    <div className='flex flex-col justify-between gap-2'>
        {players.map((player, index) => (
            <div key={player.id || player.playerId || index} className='flex justify-between'>
                <span>{player.name || player.playerName}</span>
                <span>{player.score || 0}</span>
            </div>
        ))}
    </div>
);

export default PlayersList;
