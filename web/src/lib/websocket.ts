/**
 * WebSocket client for Devabase realtime events
 */

import { API_CONFIG, logger } from './config';

export type EventType =
  | 'document.uploaded'
  | 'document.processing'
  | 'document.processed'
  | 'document.failed'
  | 'document.deleted'
  | 'collection.created'
  | 'collection.deleted'
  | 'vector.upserted'
  | 'vector.deleted'
  | 'table.created'
  | 'table.deleted'
  | 'table.row.created'
  | 'table.row.updated'
  | 'table.row.deleted';

export interface RealtimeEvent {
  channel: string;
  event: EventType;
  data: Record<string, unknown>;
  timestamp: string;
}

export type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'error';

export type MessageHandler = (event: RealtimeEvent) => void;
export type ConnectionHandler = (state: ConnectionState) => void;

interface ClientMessage {
  type: 'subscribe' | 'unsubscribe' | 'ping';
  channels?: string[];
}

interface ServerMessage {
  type: 'subscribed' | 'unsubscribed' | 'event' | 'error' | 'pong';
  channels?: string[];
  channel?: string;
  event?: string;
  data?: Record<string, unknown>;
  timestamp?: string;
  message?: string;
}

export class RealtimeClient {
  private ws: WebSocket | null = null;
  private url: string;
  private token: string | null = null;
  private projectId: string | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private subscriptions = new Set<string>();
  private messageHandlers = new Set<MessageHandler>();
  private connectionHandlers = new Set<ConnectionHandler>();
  private state: ConnectionState = 'disconnected';

  constructor(baseUrl?: string) {
    // Use centralized config, prefer wss for production
    const wsBaseUrl = baseUrl || API_CONFIG.wsUrl;
    // Convert http/https to ws/wss
    this.url = wsBaseUrl.replace(/^http/, 'ws') + '/v1/realtime';
  }

  /**
   * Set authentication credentials
   */
  setAuth(token: string, projectId: string) {
    this.token = token;
    this.projectId = projectId;
  }

  /**
   * Connect to the WebSocket server
   */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.token || !this.projectId) {
        reject(new Error('Authentication required. Call setAuth() first.'));
        return;
      }

      if (this.ws?.readyState === WebSocket.OPEN) {
        resolve();
        return;
      }

      this.setState('connecting');

      // Build URL with auth params
      // Note: In production, consider using Sec-WebSocket-Protocol for auth
      const url = new URL(this.url);
      url.searchParams.set('token', this.token);
      url.searchParams.set('project_id', this.projectId);

      try {
        this.ws = new WebSocket(url.toString());
      } catch (error) {
        this.setState('error');
        reject(error);
        return;
      }

      this.ws.onopen = () => {
        this.setState('connected');
        this.reconnectAttempts = 0;
        this.startPing();

        // Resubscribe to all channels
        if (this.subscriptions.size > 0) {
          this.send({
            type: 'subscribe',
            channels: Array.from(this.subscriptions),
          });
        }

        resolve();
      };

      this.ws.onmessage = (event) => {
        try {
          const msg: ServerMessage = JSON.parse(event.data);
          this.handleMessage(msg);
        } catch (error) {
          logger.error('Failed to parse WebSocket message:', error);
        }
      };

      this.ws.onerror = (error) => {
        logger.error('WebSocket error:', error);
        this.setState('error');
      };

      this.ws.onclose = () => {
        this.setState('disconnected');
        this.stopPing();
        this.attemptReconnect();
      };
    });
  }

  /**
   * Disconnect from the server
   */
  disconnect() {
    this.reconnectAttempts = this.maxReconnectAttempts; // Prevent reconnect
    this.stopPing();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.setState('disconnected');
  }

  /**
   * Subscribe to channels
   */
  subscribe(channels: string | string[]) {
    const channelList = Array.isArray(channels) ? channels : [channels];

    for (const ch of channelList) {
      this.subscriptions.add(ch);
    }

    if (this.ws?.readyState === WebSocket.OPEN) {
      this.send({ type: 'subscribe', channels: channelList });
    }
  }

  /**
   * Unsubscribe from channels
   */
  unsubscribe(channels: string | string[]) {
    const channelList = Array.isArray(channels) ? channels : [channels];

    for (const ch of channelList) {
      this.subscriptions.delete(ch);
    }

    if (this.ws?.readyState === WebSocket.OPEN) {
      this.send({ type: 'unsubscribe', channels: channelList });
    }
  }

  /**
   * Register a message handler
   */
  onMessage(handler: MessageHandler): () => void {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  /**
   * Register a connection state handler
   */
  onConnectionChange(handler: ConnectionHandler): () => void {
    this.connectionHandlers.add(handler);
    // Immediately call with current state
    handler(this.state);
    return () => this.connectionHandlers.delete(handler);
  }

  /**
   * Get current connection state
   */
  getState(): ConnectionState {
    return this.state;
  }

  /**
   * Get subscribed channels
   */
  getSubscriptions(): string[] {
    return Array.from(this.subscriptions);
  }

  private send(msg: ClientMessage) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  private handleMessage(msg: ServerMessage) {
    switch (msg.type) {
      case 'event':
        if (msg.channel && msg.event && msg.data && msg.timestamp) {
          const event: RealtimeEvent = {
            channel: msg.channel,
            event: msg.event as EventType,
            data: msg.data,
            timestamp: msg.timestamp,
          };
          this.messageHandlers.forEach((handler) => handler(event));
        }
        break;
      case 'subscribed':
        logger.debug('Subscribed to:', msg.channels);
        break;
      case 'unsubscribed':
        logger.debug('Unsubscribed from:', msg.channels);
        break;
      case 'error':
        logger.error('Realtime error:', msg.message);
        break;
      case 'pong':
        // Keep-alive response received
        break;
    }
  }

  private setState(state: ConnectionState) {
    this.state = state;
    this.connectionHandlers.forEach((handler) => handler(state));
  }

  private startPing() {
    this.stopPing();
    this.pingInterval = setInterval(() => {
      this.send({ type: 'ping' });
    }, 30000); // 30 seconds
  }

  private stopPing() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error('Max reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

    logger.info(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);

    setTimeout(() => {
      this.connect().catch((error) => {
        logger.error('Reconnection failed:', error);
      });
    }, delay);
  }
}

// Singleton instance
let clientInstance: RealtimeClient | null = null;

export function getRealtimeClient(): RealtimeClient {
  if (!clientInstance) {
    clientInstance = new RealtimeClient();
  }
  return clientInstance;
}
