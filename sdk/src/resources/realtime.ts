import { HttpClient } from '../utils/http';

export interface RealtimeEvent {
  type: 'event';
  channel: string;
  event: string;
  data: Record<string, unknown>;
  timestamp: string;
}

export interface RealtimeMessage {
  type: 'subscribed' | 'event' | 'error' | 'pong';
  channels?: string[];
  channel?: string;
  event?: string;
  data?: Record<string, unknown>;
  message?: string;
  timestamp?: string;
}

export interface RealtimeCallbacks {
  onEvent?: (event: RealtimeEvent) => void;
  onSubscribed?: (channels: string[]) => void;
  onError?: (message: string) => void;
  onClose?: () => void;
  onOpen?: () => void;
}

/**
 * Real-time event streaming via WebSocket.
 *
 * Channel formats:
 * - `document:*` - All document events
 * - `document:{id}` - Specific document events
 * - `collection:*` - All collection events
 * - `collection:{name}` - Specific collection events
 * - `vector:*` - All vector events
 * - `table:*` - All user table events
 * - `project:{id}` - All events for a project
 */
export class RealtimeResource {
  private ws: WebSocket | null = null;
  private pingInterval: ReturnType<typeof setInterval> | null = null;

  constructor(private http: HttpClient) {}

  /**
   * Connect to the realtime WebSocket
   * @example
   * client.realtime.connect({
   *   onEvent: (event) => console.log('Event:', event),
   *   onError: (msg) => console.error('Error:', msg)
   * });
   */
  connect(callbacks: RealtimeCallbacks): void {
    if (this.ws) {
      this.disconnect();
    }

    // Build WebSocket URL from HTTP base URL
    const baseUrl = (this.http as unknown as { config: { baseUrl: string } }).config.baseUrl;
    const wsUrl = baseUrl.replace(/^http/, 'ws') + '/v1/realtime';

    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      callbacks.onOpen?.();

      // Start keep-alive ping every 30 seconds
      this.pingInterval = setInterval(() => {
        this.send({ type: 'ping' });
      }, 30000);
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as RealtimeMessage;

        switch (msg.type) {
          case 'event':
            callbacks.onEvent?.({
              type: 'event',
              channel: msg.channel!,
              event: msg.event!,
              data: msg.data!,
              timestamp: msg.timestamp!,
            });
            break;
          case 'subscribed':
            callbacks.onSubscribed?.(msg.channels || []);
            break;
          case 'error':
            callbacks.onError?.(msg.message || 'Unknown error');
            break;
          case 'pong':
            break;
        }
      } catch {
        // Ignore malformed messages
      }
    };

    this.ws.onclose = () => {
      this.cleanup();
      callbacks.onClose?.();
    };

    this.ws.onerror = () => {
      callbacks.onError?.('WebSocket connection error');
    };
  }

  /**
   * Subscribe to event channels
   * @example
   * client.realtime.subscribe(['document:*', 'collection:my-docs']);
   */
  subscribe(channels: string[]): void {
    this.send({ type: 'subscribe', channels });
  }

  /**
   * Unsubscribe from event channels
   * @example
   * client.realtime.unsubscribe(['document:*']);
   */
  unsubscribe(channels: string[]): void {
    this.send({ type: 'unsubscribe', channels });
  }

  /**
   * Disconnect from the WebSocket
   */
  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.cleanup();
    }
  }

  /**
   * Check if connected
   */
  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  private send(data: Record<string, unknown>): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  private cleanup(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    this.ws = null;
  }
}
