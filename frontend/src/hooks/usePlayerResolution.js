import { useEffect } from 'react';

export const usePlayerResolution = (
    localPlayerId,
    setLocalPlayerId,
    localPlayerName,
    setLocalPlayerName,
    resolvedPlayerId,
    resolvedPlayerName
) => {
    useEffect(() => {
        if (!localPlayerId && resolvedPlayerId) setLocalPlayerId(resolvedPlayerId);
        if (!localPlayerName && resolvedPlayerName) setLocalPlayerName(resolvedPlayerName);
    }, [localPlayerId, localPlayerName, resolvedPlayerId, resolvedPlayerName, setLocalPlayerId, setLocalPlayerName]);
};
