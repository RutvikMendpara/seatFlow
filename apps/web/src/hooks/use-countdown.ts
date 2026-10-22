'use client';

import { useEffect, useState } from 'react';

function secondsLeft(expiresAt: string, offsetMs: number) {
  return Math.max(0, Math.floor((new Date(expiresAt).getTime() - (Date.now() + offsetMs)) / 1000));
}

// Seconds left until expiresAt, corrected for the gap between this device's
// clock and the server's (serverTime is when the server built the response).
export function useCountdown(expiresAt: string, serverTime: string) {
  const [offsetMs] = useState(() => new Date(serverTime).getTime() - Date.now());
  const [seconds, setSeconds] = useState(() => secondsLeft(expiresAt, offsetMs));

  useEffect(() => {
    const timer = setInterval(() => setSeconds(secondsLeft(expiresAt, offsetMs)), 1000);
    return () => clearInterval(timer);
  }, [expiresAt, offsetMs]);

  return seconds;
}

export function formatCountdown(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
