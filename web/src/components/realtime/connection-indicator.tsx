'use client';

import { useRealtimeStore } from '@/stores/realtime-store';
import { cn } from '@/lib/utils';
import { Wifi, WifiOff, Loader2 } from 'lucide-react';

interface ConnectionIndicatorProps {
  className?: string;
  showLabel?: boolean;
  size?: 'sm' | 'md';
}

export function ConnectionIndicator({
  className,
  showLabel = false,
  size = 'sm',
}: ConnectionIndicatorProps) {
  const { connectionState, isConnected } = useRealtimeStore();

  const iconSize = size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4';
  const dotSize = size === 'sm' ? 'w-2 h-2' : 'w-2.5 h-2.5';

  const getStateColor = () => {
    switch (connectionState) {
      case 'connected':
        return 'text-success';
      case 'connecting':
        return 'text-warning';
      case 'error':
        return 'text-error';
      default:
        return 'text-text-tertiary';
    }
  };

  const getStateLabel = () => {
    switch (connectionState) {
      case 'connected':
        return 'Connected';
      case 'connecting':
        return 'Connecting...';
      case 'error':
        return 'Error';
      default:
        return 'Disconnected';
    }
  };

  const getDotColor = () => {
    switch (connectionState) {
      case 'connected':
        return 'bg-success';
      case 'connecting':
        return 'bg-warning';
      case 'error':
        return 'bg-error';
      default:
        return 'bg-text-tertiary';
    }
  };

  return (
    <div
      className={cn('flex items-center gap-1.5', className)}
      title={`Realtime: ${getStateLabel()}`}
    >
      {connectionState === 'connecting' ? (
        <Loader2 className={cn(iconSize, 'animate-spin', getStateColor())} />
      ) : isConnected ? (
        <div className="relative">
          <Wifi className={cn(iconSize, getStateColor())} />
          <span
            className={cn(
              dotSize,
              'absolute -top-0.5 -right-0.5 rounded-full',
              getDotColor(),
              'animate-pulse'
            )}
          />
        </div>
      ) : (
        <WifiOff className={cn(iconSize, getStateColor())} />
      )}

      {showLabel && (
        <span className={cn('text-xs', getStateColor())}>{getStateLabel()}</span>
      )}
    </div>
  );
}
