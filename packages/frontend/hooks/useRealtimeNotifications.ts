import { useCallback } from 'react';

/**
 * Hook for real-time notification updates
 * TODO: Implement real-time notifications for Schedio (polling or SSE)
 */
export const useRealtimeNotifications = () => {
  return {
    isConnected: false,
    connect: useCallback(() => {}, []),
    disconnect: useCallback(() => {}, []),
  };
};
