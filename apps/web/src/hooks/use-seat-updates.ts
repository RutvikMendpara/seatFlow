'use client';

import { useEffect, useRef, useState } from 'react';
import type { SeatState } from '@/lib/types';

export type LiveStatus = 'connecting' | 'live' | 'offline';

type Handlers = {
  onSeats: (seats: SeatState[]) => void;
  // Called whenever updates may have been missed: right after subscribing,
  // after a reconnect, when the server asks, and when the tab comes back.
  onResync: () => void;
};

const RECONNECT_DELAYS_MS = [1_000, 2_000, 5_000, 10_000];
// While the socket is down, fall back to polling.
const POLL_MS = 15_000;

function socketUrl() {
  if (process.env.NEXT_PUBLIC_WS_URL) return process.env.NEXT_PUBLIC_WS_URL;
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${protocol}://${window.location.hostname}:4000/ws`;
}

export function useSeatUpdates(showtimeId: string, handlers: Handlers): LiveStatus {
  const [status, setStatus] = useState<LiveStatus>('connecting');
  // Kept in a ref so new handler functions on each render don't reconnect.
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    let socket: WebSocket | undefined;
    let attempt = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let pollTimer: ReturnType<typeof setInterval> | undefined;
    let closed = false;

    const startPolling = () => {
      pollTimer ??= setInterval(() => handlersRef.current.onResync(), POLL_MS);
    };
    const stopPolling = () => {
      clearInterval(pollTimer);
      pollTimer = undefined;
    };

    const connect = () => {
      socket = new WebSocket(socketUrl());
      socket.onopen = () => {
        socket?.send(JSON.stringify({ event: 'subscribe', data: { showtimeId } }));
      };
      socket.onmessage = (event) => {
        const message = JSON.parse(String(event.data)) as {
          type: string;
          showtimeId?: string;
          seats?: SeatState[];
        };
        if (message.type === 'subscribed') {
          attempt = 0;
          stopPolling();
          setStatus('live');
          handlersRef.current.onResync();
        } else if (message.type === 'seats' && message.showtimeId === showtimeId && message.seats) {
          handlersRef.current.onSeats(message.seats);
        } else if (message.type === 'resync') {
          handlersRef.current.onResync();
        }
      };
      socket.onclose = () => {
        if (closed) return;
        setStatus('offline');
        startPolling();
        const delay = RECONNECT_DELAYS_MS[Math.min(attempt, RECONNECT_DELAYS_MS.length - 1)];
        attempt++;
        reconnectTimer = setTimeout(connect, delay);
      };
    };

    const onVisible = () => {
      if (document.visibilityState === 'visible') handlersRef.current.onResync();
    };

    connect();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      closed = true;
      clearTimeout(reconnectTimer);
      stopPolling();
      document.removeEventListener('visibilitychange', onVisible);
      socket?.close();
    };
  }, [showtimeId]);

  return status;
}
