'use client';

import { useEffect, useCallback, useMemo } from 'react';
import { useRealtimeStore, filterEvents, EventFilter } from '@/stores/realtime-store';
import { useAuthStore } from '@/stores/auth-store';
import { useProjectStore } from '@/stores/project-store';
import { RealtimeEvent, EventType } from '@/lib/websocket';
import { SECURITY_CONFIG, logger } from '@/lib/config';

interface UseRealtimeOptions {
  /**
   * Channels to subscribe to
   * Examples: ['document:*', 'collection:my_docs']
   */
  channels?: string[];

  /**
   * Whether to auto-connect on mount
   * @default true
   */
  autoConnect?: boolean;

  /**
   * Event types to filter
   */
  eventTypes?: EventType[];

  /**
   * Callback when an event is received
   */
  onEvent?: (event: RealtimeEvent) => void;
}

interface UseRealtimeReturn {
  /**
   * Whether connected to the realtime server
   */
  isConnected: boolean;

  /**
   * Connection state
   */
  connectionState: 'connecting' | 'connected' | 'disconnected' | 'error';

  /**
   * Recent events (filtered by options)
   */
  events: RealtimeEvent[];

  /**
   * Currently subscribed channels
   */
  subscriptions: string[];

  /**
   * Subscribe to additional channels
   */
  subscribe: (channels: string | string[]) => void;

  /**
   * Unsubscribe from channels
   */
  unsubscribe: (channels: string | string[]) => void;

  /**
   * Clear event history
   */
  clearEvents: () => void;

  /**
   * Manually connect
   */
  connect: () => Promise<void>;

  /**
   * Disconnect
   */
  disconnect: () => void;
}

/**
 * Hook for real-time event subscriptions
 *
 * @example
 * ```tsx
 * // Subscribe to all document events
 * const { events, isConnected } = useRealtime({
 *   channels: ['document:*'],
 * });
 *
 * // Subscribe to specific collection
 * const { events } = useRealtime({
 *   channels: ['collection:my_docs'],
 *   eventTypes: ['collection.created', 'collection.deleted'],
 * });
 *
 * // With event callback
 * useRealtime({
 *   channels: ['document:*'],
 *   onEvent: (event) => {
 *     if (event.event === 'document.processed') {
 *       refetchDocuments();
 *     }
 *   },
 * });
 * ```
 */
export function useRealtime(options: UseRealtimeOptions = {}): UseRealtimeReturn {
  const { channels = [], autoConnect = true, eventTypes, onEvent } = options;

  const {
    connectionState,
    isConnected,
    events: allEvents,
    subscriptions,
    connect: storeConnect,
    disconnect,
    subscribe: storeSubscribe,
    unsubscribe: storeUnsubscribe,
    clearEvents,
  } = useRealtimeStore();

  const { isAuthenticated } = useAuthStore();
  const { currentProject } = useProjectStore();

  // Get token from localStorage using centralized config
  const getToken = useCallback(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(SECURITY_CONFIG.tokenKey);
    }
    return null;
  }, []);

  // Connect to realtime
  const connect = useCallback(async () => {
    const token = getToken();
    if (!token || !currentProject?.id) {
      logger.warn('Cannot connect: missing token or project');
      return;
    }
    await storeConnect(token, currentProject.id);
  }, [getToken, currentProject?.id, storeConnect]);

  // Auto-connect when authenticated and project is selected
  useEffect(() => {
    if (autoConnect && isAuthenticated && currentProject?.id && !isConnected) {
      connect();
    }
  }, [autoConnect, isAuthenticated, currentProject?.id, isConnected, connect]);

  // Subscribe to channels when connected
  useEffect(() => {
    if (isConnected && channels.length > 0) {
      storeSubscribe(channels);

      return () => {
        storeUnsubscribe(channels);
      };
    }
  }, [isConnected, channels.join(','), storeSubscribe, storeUnsubscribe]);

  // Filter events based on options
  const filter: EventFilter = useMemo(
    () => ({
      types: eventTypes,
      channels: channels.length > 0 ? channels : undefined,
    }),
    [eventTypes, channels]
  );

  const events = useMemo(() => filterEvents(allEvents, filter), [allEvents, filter]);

  // Call onEvent callback for new events
  useEffect(() => {
    if (onEvent && events.length > 0) {
      const latestEvent = events[0];
      onEvent(latestEvent);
    }
  }, [events[0]?.timestamp, onEvent]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Don't disconnect on unmount - keep connection alive
      // Other components may still be using it
    };
  }, []);

  return {
    isConnected,
    connectionState,
    events,
    subscriptions,
    subscribe: storeSubscribe,
    unsubscribe: storeUnsubscribe,
    clearEvents,
    connect,
    disconnect,
  };
}

/**
 * Hook for subscribing to document events
 */
export function useDocumentEvents(
  documentId?: string,
  onEvent?: (event: RealtimeEvent) => void
) {
  const channels = documentId ? [`document:${documentId}`] : ['document:*'];

  return useRealtime({
    channels,
    eventTypes: [
      'document.uploaded',
      'document.processing',
      'document.processed',
      'document.failed',
      'document.deleted',
    ],
    onEvent,
  });
}

/**
 * Hook for subscribing to collection events
 */
export function useCollectionEvents(
  collectionName?: string,
  onEvent?: (event: RealtimeEvent) => void
) {
  const channels = collectionName
    ? [`collection:${collectionName}`]
    : ['collection:*'];

  return useRealtime({
    channels,
    eventTypes: ['collection.created', 'collection.deleted'],
    onEvent,
  });
}
