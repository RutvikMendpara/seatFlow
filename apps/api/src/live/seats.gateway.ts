import { Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import type { IncomingMessage } from 'node:http';
import type { Subscription } from 'rxjs';
import { WebSocket } from 'ws';
import type { Env } from '../config/env';
import { SeatChangeListener, type LiveEvent } from './seat-change-listener';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_SUBSCRIPTIONS = 4;
const HEARTBEAT_MS = 30_000;

type Socket = WebSocket & { alive?: boolean; showtimes?: Set<string> };

// Pushes seat changes to browsers looking at a show. These messages are a
// hint for the UI, never the source of truth: a hold request is always
// checked against the database.
//
// Protocol (JSON):
//   client -> { "event": "subscribe" | "unsubscribe", "data": { "showtimeId": "..." } }
//   server -> { "type": "seats", "showtimeId", "seats": [{ id, status, version }] }
//             { "type": "resync" }   fetch full availability, updates may have been missed
//             { "type": "error", "message" }
@WebSocketGateway({ path: '/ws' })
export class SeatsGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(SeatsGateway.name);
  private readonly rooms = new Map<string, Set<Socket>>();
  private readonly sockets = new Set<Socket>();
  private readonly allowedOrigin: string;
  private subscription?: Subscription;
  private heartbeat?: NodeJS.Timeout;

  constructor(
    private readonly listener: SeatChangeListener,
    config: ConfigService<Env, true>,
  ) {
    this.allowedOrigin = new URL(config.get('WEB_URL', { infer: true })).origin;
  }

  onModuleInit() {
    this.subscription = this.listener.events.subscribe((event) => this.broadcast(event));
    // Drop connections that stopped answering pings, e.g. a laptop that went to sleep.
    this.heartbeat = setInterval(() => {
      for (const socket of this.sockets) {
        if (socket.alive === false) {
          socket.terminate();
          continue;
        }
        socket.alive = false;
        socket.ping();
      }
    }, HEARTBEAT_MS);
  }

  onModuleDestroy() {
    this.subscription?.unsubscribe();
    clearInterval(this.heartbeat);
  }

  handleConnection(socket: Socket, req: IncomingMessage) {
    // Browsers always send Origin. Other clients can't be stopped this way,
    // but they only get public availability anyway.
    const origin = req.headers.origin;
    if (origin && origin !== this.allowedOrigin) {
      socket.close(1008, 'Origin not allowed');
      return;
    }
    socket.alive = true;
    socket.showtimes = new Set();
    socket.on('pong', () => (socket.alive = true));
    this.sockets.add(socket);
  }

  handleDisconnect(socket: Socket) {
    for (const showtimeId of socket.showtimes ?? []) this.leave(socket, showtimeId);
    this.sockets.delete(socket);
  }

  @SubscribeMessage('subscribe')
  subscribe(@ConnectedSocket() socket: Socket, @MessageBody() data: { showtimeId?: unknown }) {
    const showtimeId = data?.showtimeId;
    if (typeof showtimeId !== 'string' || !UUID.test(showtimeId)) {
      return this.send(socket, { type: 'error', message: 'showtimeId must be a UUID' });
    }
    if (!socket.showtimes) return;
    if (socket.showtimes.size >= MAX_SUBSCRIPTIONS && !socket.showtimes.has(showtimeId)) {
      return this.send(socket, { type: 'error', message: 'Too many subscriptions' });
    }

    socket.showtimes.add(showtimeId);
    let room = this.rooms.get(showtimeId);
    if (!room) {
      room = new Set();
      this.rooms.set(showtimeId, room);
    }
    room.add(socket);
    this.send(socket, { type: 'subscribed', showtimeId });
  }

  @SubscribeMessage('unsubscribe')
  unsubscribe(@ConnectedSocket() socket: Socket, @MessageBody() data: { showtimeId?: unknown }) {
    if (typeof data?.showtimeId === 'string') this.leave(socket, data.showtimeId);
  }

  private leave(socket: Socket, showtimeId: string) {
    socket.showtimes?.delete(showtimeId);
    const room = this.rooms.get(showtimeId);
    room?.delete(socket);
    if (room?.size === 0) this.rooms.delete(showtimeId);
  }

  private broadcast(event: LiveEvent) {
    if (event.type === 'resync') {
      for (const socket of this.sockets) this.send(socket, { type: 'resync' });
      return;
    }
    const room = this.rooms.get(event.change.showtimeId);
    if (!room) return;
    const message = JSON.stringify({ type: 'seats', ...event.change });
    for (const socket of room) {
      if (socket.readyState === WebSocket.OPEN) socket.send(message);
    }
  }

  private send(socket: Socket, message: object) {
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
  }
}
