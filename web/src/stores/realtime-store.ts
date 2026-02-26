'use client';

import { create } from 'zustand';
import {
  getRealtimeClient,
  RealtimeClient,
  RealtimeEvent,
  ConnectionState,
  EventType,
} from '@/lib/websocket';

interface RealtimeState {
  // Connection state
  connectionState: ConnectionState;
  isConnected: boolean;

  // Recent events (limited buffer)
  events: RealtimeEvent[];
  maxEvents: number;

  // Subscriptions
  subscriptions: string[];

  // Actions
  connect: (token: string, projectId: string) => Promise<void>;
  disconnect: () => void;
  subscribe: (channels: string | string[]) => void;
  unsubscribe: (channels: string | string[]) => void;
  clearEvents: () => void;

  // Internal
  _client: RealtimeClient | null;
  _cleanup: (() => void) | null;
}

export const useRealtimeStore = create<RealtimeState>((set, get) => ({
  connectionState: 'disconnected',
  isConnected: false,
  events: [],
  maxEvents: 100,
  subscriptions: [],
  _client: null,
  _cleanup: null,

  connect: async (token: string, projectId: string) => {
    const { _client: existingClient, _cleanup } = get();

    // Clean up existing connection
    if (_cleanup) {
      _cleanup();
    }

    const client = existingClient || getRealtimeClient();
    client.setAuth(token, projectId);

    // Set up event handlers
    const unsubMessage = client.onMessage((event) => {
      set((state) => ({
        events: [event, ...state.events].slice(0, state.maxEvents),
      }));
    });

    const unsubConnection = client.onConnectionChange((state) => {
      set({
        connectionState: state,
        isConnected: state === 'connected',
      });
    });

    set({
      _client: client,
      _cleanup: () => {
        unsubMessage();
        unsubConnection();
      },
    });

    // Connect
    await client.connect();

    // Update subscriptions from client
    set({ subscriptions: client.getSubscriptions() });
  },

  disconnect: () => {
    const { _client, _cleanup } = get();

    if (_cleanup) {
      _cleanup();
    }

    if (_client) {
      _client.disconnect();
    }

    set({
      connectionState: 'disconnected',
      isConnected: false,
      subscriptions: [],
      _cleanup: null,
    });
  },

  subscribe: (channels) => {
    const { _client } = get();
    if (_client) {
      _client.subscribe(channels);
      set({ subscriptions: _client.getSubscriptions() });
    }
  },

  unsubscribe: (channels) => {
    const { _client } = get();
    if (_client) {
      _client.unsubscribe(channels);
      set({ subscriptions: _client.getSubscriptions() });
    }
  },

  clearEvents: () => {
    set({ events: [] });
  },
}));

// Helper type for event filtering
export type EventFilter = {
  types?: EventType[];
  channels?: string[];
};

// Helper function to filter events
export function filterEvents(
  events: RealtimeEvent[],
  filter: EventFilter
): RealtimeEvent[] {
  return events.filter((event) => {
    if (filter.types && !filter.types.includes(event.event)) {
      return false;
    }
    if (filter.channels) {
      const matchesChannel = filter.channels.some((ch) => {
        if (ch.endsWith(':*')) {
          const prefix = ch.slice(0, -1);
          return event.channel.startsWith(prefix);
        }
        return event.channel === ch;
      });
      if (!matchesChannel) {
        return false;
      }
    }
    return true;
  });
}
