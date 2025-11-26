'use client';

import { useState, useEffect, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';

// Types for Google Auth plugin
interface GoogleUser {
  id: string;
  email: string;
  name: string;
  givenName: string;
  familyName: string;
  imageUrl: string;
  authentication: {
    accessToken: string;
    idToken: string;
    refreshToken?: string;
  };
}

interface GoogleAuthPlugin {
  signIn(): Promise<GoogleUser>;
  signOut(): Promise<void>;
  refresh(): Promise<{ accessToken: string; idToken: string }>;
}

/**
 * Hook for native Google Sign-In on Android/iOS via Capacitor
 * Returns null methods when running in web browser
 */
export function useGoogleAuth() {
  const [GoogleAuth, setGoogleAuth] = useState<GoogleAuthPlugin | null>(null);
  const [isNative, setIsNative] = useState(false);
  const [user, setUser] = useState<GoogleUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Initialize plugin on mount
  useEffect(() => {
    const initPlugin = async () => {
      const native = Capacitor.isNativePlatform();
      setIsNative(native);

      if (native) {
        try {
          // Dynamic import to avoid SSR issues
          const { GoogleAuth: GA } = await import('@codetrix-studio/capacitor-google-auth');
          setGoogleAuth(GA as unknown as GoogleAuthPlugin);

          // Try to restore previous session
          const savedUser = localStorage.getItem('google_user');
          if (savedUser) {
            setUser(JSON.parse(savedUser));
          }
        } catch (e) {
          console.error('Failed to load Google Auth plugin:', e);
          setError('Google Auth plugin not available');
        }
      }
      setLoading(false);
    };

    initPlugin();
  }, []);

  const signIn = useCallback(async (): Promise<GoogleUser | null> => {
    if (!GoogleAuth) {
      setError('Google Auth not available');
      return null;
    }

    try {
      setLoading(true);
      setError(null);

      const googleUser = await GoogleAuth.signIn();
      setUser(googleUser);

      // Save for session restore
      localStorage.setItem('google_user', JSON.stringify(googleUser));
      localStorage.setItem('google_user_id', googleUser.id);

      return googleUser;
    } catch (e: any) {
      console.error('Google Sign-In failed:', e);
      setError(e.message || 'Sign-in failed');
      return null;
    } finally {
      setLoading(false);
    }
  }, [GoogleAuth]);

  const signOut = useCallback(async () => {
    if (!GoogleAuth) return;

    try {
      setLoading(true);
      await GoogleAuth.signOut();
      setUser(null);
      localStorage.removeItem('google_user');
      localStorage.removeItem('google_user_id');
    } catch (e: any) {
      console.error('Google Sign-Out failed:', e);
      setError(e.message || 'Sign-out failed');
    } finally {
      setLoading(false);
    }
  }, [GoogleAuth]);

  const refresh = useCallback(async () => {
    if (!GoogleAuth) return null;

    try {
      const tokens = await GoogleAuth.refresh();
      return tokens;
    } catch (e: any) {
      console.error('Token refresh failed:', e);
      setError(e.message || 'Token refresh failed');
      return null;
    }
  }, [GoogleAuth]);

  /**
   * Get the Google user ID for CIRIS LLM proxy authentication
   * Format: Bearer google:{user_id}
   */
  const getProxyAuthHeader = useCallback(() => {
    if (!user) return null;
    return `Bearer google:${user.id}`;
  }, [user]);

  return {
    isNative,
    user,
    loading,
    error,
    signIn,
    signOut,
    refresh,
    getProxyAuthHeader,
    isSignedIn: !!user,
  };
}

/**
 * Check if running in native Capacitor environment
 */
export function isNativePlatform(): boolean {
  return Capacitor.isNativePlatform();
}

/**
 * Get platform name
 */
export function getPlatform(): 'android' | 'ios' | 'web' {
  const platform = Capacitor.getPlatform();
  if (platform === 'android' || platform === 'ios') {
    return platform;
  }
  return 'web';
}
