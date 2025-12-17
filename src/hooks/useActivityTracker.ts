/**
 * Activity Tracking Hook for Client-Side
 * =======================================
 * 
 * Track user activity from React components
 */

import { useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import axios from '@/lib/axiosInstance';

interface TrackEventOptions {
  action: string;
  metadata?: Record<string, unknown>;
}

export function useActivityTracker() {
  const { user } = useAuth();

  const trackEvent = useCallback(async (options: TrackEventOptions) => {
    if (!user) return;

    try {
      const idToken = await user.getIdToken();
      await axios.post('/api/activity/track', {
        action: options.action,
        metadata: options.metadata
      }, {
        headers: { Authorization: `Bearer ${idToken}` }
      });
    } catch (error) {
      // Don't fail if tracking fails
      console.error('[ActivityTracker] Failed to track event:', error);
    }
  }, [user]);

  const trackPageView = useCallback((page: string) => {
    trackEvent({ action: 'dashboard.view', metadata: { page } });
  }, [trackEvent]);

  return { trackEvent, trackPageView };
}

/**
 * Auto-track page views
 */
export function usePageViewTracking(pageName: string) {
  const { trackPageView } = useActivityTracker();

  useEffect(() => {
    trackPageView(pageName);
  }, [pageName, trackPageView]);
}
