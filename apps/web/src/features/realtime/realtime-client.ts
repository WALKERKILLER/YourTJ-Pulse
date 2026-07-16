import {
  clientMessageSchema,
  serverMessageSchema,
  type ClientMessage,
  type PresenceStatus,
  type RealtimeLocation,
  type ServerMessage,
} from '@yourtj/contracts';

import type { RealtimeConnectionStatus } from '../../stores/realtime-store';

export const REALTIME_PROTOCOL = 'yourtj.realtime.v1';
const AUTH_PROTOCOL_PREFIX = 'yourtj.auth.';
const MAX_PENDING_REQUESTS = 100;

export type AccessTokenProvider = (forceRefresh?: boolean) => string | undefined | Promise<string | undefined>;
export type WebSocketFactory = (url: string, protocols: string[]) => WebSocket;

export interface RoomRealtimeClientOptions {
  baseUrl?: string;
  roomId: string;
  tokenProvider?: AccessTokenProvider;
  webSocketFactory?: WebSocketFactory;
  onMessage: (message: ServerMessage) => void;
  onStatus: (status: RealtimeConnectionStatus, error?: string) => void;
}

let inMemoryAccessToken: string | undefined;

export function setRealtimeAccessToken(token: string | undefined): void {
  inMemoryAccessToken = token;
}

function defaultTokenProvider(): string | undefined {
  return inMemoryAccessToken;
}

function encodeProtocolValue(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

export function realtimeWebSocketUrl(roomId: string, baseUrl?: string): string {
  const url = new URL(baseUrl ?? window.location.href);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = `/api/realtime/rooms/${encodeURIComponent(roomId)}`;
  url.search = '';
  url.hash = '';
  return url.toString();
}

function requestId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `req-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export class RoomRealtimeClient {
  private socket: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  private forceTokenRefresh = false;
  private stopped = true;
  private snapshotReceived = false;
  private lastSequence = 0;
  private readonly pending = new Map<string, ClientMessage>();
  private readonly tokenProvider: AccessTokenProvider;
  private readonly webSocketFactory: WebSocketFactory;
  private readonly onlineListener = () => {
    if (!this.stopped && this.socket?.readyState !== WebSocket.OPEN) void this.openSocket();
  };

  constructor(private readonly options: RoomRealtimeClientOptions) {
    this.tokenProvider = options.tokenProvider ?? defaultTokenProvider;
    this.webSocketFactory = options.webSocketFactory ?? ((url, protocols) => new WebSocket(url, protocols));
  }

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    if (typeof window !== 'undefined') window.addEventListener('online', this.onlineListener);
    void this.openSocket();
  }

  stop(): void {
    this.stopped = true;
    if (typeof window !== 'undefined') window.removeEventListener('online', this.onlineListener);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.socket?.close(1000, 'Client stopped');
    this.socket = null;
    this.options.onStatus('disconnected');
  }

  reconnect(): void {
    if (this.stopped) {
      this.start();
      return;
    }
    if (this.socket) this.socket.close(4000, 'Credentials changed');
    else void this.openSocket();
  }

  updatePresence(status: PresenceStatus, sharingLocation: boolean): string {
    return this.queue({ type: 'presence.update', requestId: requestId(), sentAt: Date.now(), payload: { status, sharingLocation } });
  }

  sendLocation(location: RealtimeLocation): string {
    for (const [id, message] of this.pending) if (message.type === 'location.update') this.pending.delete(id);
    return this.queue({ type: 'location.update', requestId: requestId(), sentAt: Date.now(), payload: location });
  }

  ping(): string {
    return this.queue({ type: 'ping', requestId: requestId(), sentAt: Date.now(), payload: { lastSequence: this.lastSequence } });
  }

  private async openSocket(): Promise<void> {
    if (this.stopped || this.socket?.readyState === WebSocket.CONNECTING || this.socket?.readyState === WebSocket.OPEN) return;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.options.onStatus(this.reconnectAttempt ? 'reconnecting' : 'connecting');
    try {
      const token = await this.tokenProvider(this.forceTokenRefresh);
      this.forceTokenRefresh = false;
      if (this.stopped) return;
      const protocols = [REALTIME_PROTOCOL, ...(token ? [`${AUTH_PROTOCOL_PREFIX}${encodeProtocolValue(token)}`] : [])];
      const socket = this.webSocketFactory(realtimeWebSocketUrl(this.options.roomId, this.options.baseUrl), protocols);
      this.socket = socket;
      socket.onopen = () => this.handleOpen(socket);
      socket.onmessage = (event) => this.handleIncoming(event.data);
      socket.onerror = () => this.options.onStatus('error', '实时连接发生错误，正在尝试恢复。');
      socket.onclose = (event) => this.handleClose(socket, event.code);
    } catch (error) {
      this.options.onStatus('error', error instanceof Error ? error.message : '无法建立实时连接');
      this.scheduleReconnect();
    }
  }

  private handleOpen(socket: WebSocket): void {
    if (socket !== this.socket || this.stopped) return;
    this.reconnectAttempt = 0;
    this.snapshotReceived = false;
    this.options.onStatus('connected');
    for (const [id, message] of this.pending) if (message.type === 'room.join') this.pending.delete(id);
    const join = clientMessageSchema.parse({
      type: 'room.join', requestId: requestId(), sentAt: Date.now(), payload: { lastSequence: this.lastSequence },
    });
    this.pending.set(join.requestId, join);
    socket.send(JSON.stringify(join));
  }

  private handleIncoming(raw: unknown): void {
    if (typeof raw !== 'string') return;
    let decoded: unknown;
    try {
      decoded = JSON.parse(raw);
    } catch {
      this.options.onStatus('error', '服务端返回了无法解析的实时消息。');
      return;
    }
    const parsed = serverMessageSchema.safeParse(decoded);
    if (!parsed.success) {
      this.options.onStatus('error', '服务端实时消息不符合共享协议。');
      return;
    }
    const message = parsed.data;
    this.lastSequence = Math.max(this.lastSequence, message.sequence);
    if (message.requestId && (message.type !== 'room.error' || !message.payload.retryable)) this.pending.delete(message.requestId);
    this.options.onMessage(message);
    if (message.type === 'room.snapshot') {
      this.snapshotReceived = true;
      this.flushPending();
    }
    if (message.type === 'room.error' && message.payload.code === 'ROOM_EXPIRED') {
      this.stopped = true;
      this.options.onStatus('expired', message.payload.message);
    }
  }

  private handleClose(socket: WebSocket, code: number): void {
    if (socket !== this.socket) return;
    this.socket = null;
    this.snapshotReceived = false;
    if (this.stopped) return;
    if (code === 4004) {
      this.stopped = true;
      this.options.onStatus('expired', '房间已过期，位置共享已停止。');
      return;
    }
    if (code === 4001) this.forceTokenRefresh = true;
    this.options.onStatus('reconnecting', code === 4001 ? '会话已过期，正在刷新身份并重连。' : undefined);
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.reconnectTimer) return;
    const baseDelay = Math.min(30_000, 1_000 * 2 ** this.reconnectAttempt);
    const delay = Math.round(baseDelay * (1 + Math.random() * 0.2));
    this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.openSocket();
    }, delay);
  }

  private queue(message: ClientMessage): string {
    const parsed = clientMessageSchema.parse(message);
    this.pending.set(parsed.requestId, parsed);
    while (this.pending.size > MAX_PENDING_REQUESTS) {
      const oldest = this.pending.keys().next().value as string | undefined;
      if (!oldest) break;
      this.pending.delete(oldest);
    }
    if (this.socket?.readyState === WebSocket.OPEN && this.snapshotReceived) this.socket.send(JSON.stringify(parsed));
    return parsed.requestId;
  }

  private flushPending(): void {
    if (this.socket?.readyState !== WebSocket.OPEN) return;
    for (const message of this.pending.values()) {
      if (message.type !== 'room.join') this.socket.send(JSON.stringify(message));
    }
  }
}
