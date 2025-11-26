'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { cirisClient, User } from '../lib/ciris-sdk';
import { sdkConfigManager } from '../lib/sdk-config-manager';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  hasPermission: (permission: string) => boolean;
  hasRole: (role: string) => boolean;
  setUser: (user: User | null) => void;
  setToken: (token: string) => void;
  managerToken: string | null;
  setManagerToken: (token: string | null) => void;
  isManagerAuthenticated: () => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [managerToken, setManagerToken] = useState<string | null>(null);
  const router = useRouter();

  // Check auth status on mount
  useEffect(() => {
    // Skip auth check on login page and manager pages
    const pathname = window.location.pathname;
    if (pathname === '/login' || pathname.startsWith('/manager')) {
      setLoading(false);
    } else {
      // Check for native Android auth first
      checkNativeAuth().then(hasNativeAuth => {
        if (!hasNativeAuth) {
          checkAuth();
        }
      });
    }
    // Also check for manager token
    const savedManagerToken = localStorage.getItem('manager_token');
    if (savedManagerToken) {
      setManagerToken(savedManagerToken);
    }
  }, []);

  // Check for native Android app auth (Google Sign-In or API Key mode)
  const checkNativeAuth = async (): Promise<boolean> => {
    const isNativeApp = localStorage.getItem('isNativeApp') === 'true';
    const nativeAuthData = localStorage.getItem('ciris_native_auth');
    const authMethod = localStorage.getItem('ciris_auth_method');
    const showSetup = localStorage.getItem('ciris_show_setup') === 'true';

    if (!isNativeApp || !nativeAuthData) {
      return false;
    }

    try {
      const authData = JSON.parse(nativeAuthData);
      console.log('[AuthContext] Native auth detected - method:', authMethod, 'showSetup:', showSetup);

      // Configure SDK for local on-device API
      localStorage.setItem('selectedAgentId', 'datum');
      sdkConfigManager.configure('datum');

      try {
        // Try to login with default credentials for local on-device API
        const user = await cirisClient.login('admin', 'ciris_admin_password');
        const token = cirisClient.auth.getAccessToken();
        if (token) {
          sdkConfigManager.configure('datum', token);
        }
        setUser(user);
        console.log('[AuthContext] Native auth login successful');
        setLoading(false);

        // Redirect to setup wizard if needed
        if (showSetup) {
          console.log('[AuthContext] Redirecting to setup wizard');
          // Store native auth info for setup wizard to use
          localStorage.setItem('ciris_native_llm_mode', authMethod === 'google' ? 'ciris_proxy' : 'custom');
          router.push('/setup');
        }

        return true;
      } catch (loginError) {
        console.error('[AuthContext] Native auth login failed:', loginError);
        // Create a mock user for native app mode if login fails
        const mockUser: User = {
          user_id: authData.googleUserId || 'native_user',
          username: authData.displayName || 'Native User',
          role: 'ADMIN',
          api_role: 'ADMIN',
          permissions: ['read', 'write', 'admin'],
          created_at: new Date().toISOString(),
        };
        setUser(mockUser);
        setLoading(false);

        // Redirect to setup wizard if needed
        if (showSetup) {
          console.log('[AuthContext] Redirecting to setup wizard (mock user)');
          localStorage.setItem('ciris_native_llm_mode', authMethod === 'google' ? 'ciris_proxy' : 'custom');
          router.push('/setup');
        }

        return true;
      }
    } catch (error) {
      console.error('[AuthContext] Failed to parse native auth data:', error);
      return false;
    }
  };

  const checkAuth = async () => {
    try {
      if (cirisClient.isAuthenticated()) {
        const currentUser = await cirisClient.auth.getMe();
        setUser(currentUser);
      }
    } catch (error) {
      console.error('Auth check failed:', error);
    } finally {
      setLoading(false);
    }
  };

  const login = useCallback(async (username: string, password: string) => {
    try {
      // Get the selected agent from localStorage (set by login page)
      const selectedAgentId = localStorage.getItem('selectedAgentId');
      if (!selectedAgentId) {
        throw new Error('No agent selected');
      }

      // Configure SDK for the selected agent BEFORE login
      sdkConfigManager.configure(selectedAgentId);

      // Now perform the login
      const user = await cirisClient.login(username, password);

      // Configure SDK again with the auth token from AuthStore
      const token = cirisClient.auth.getAccessToken();
      if (token) {
        sdkConfigManager.configure(selectedAgentId, token);
      }

      setUser(user);
      toast.success(`Welcome, ${user.username || user.user_id}!`);
      router.push('/');
    } catch (error: any) {
      toast.error(error.message || 'Login failed');
      throw error;
    }
  }, [router]);

  const logout = useCallback(async () => {
    try {
      await cirisClient.logout();
      setUser(null);
      toast.success('Logged out successfully');
      router.push('/login');
    } catch (error) {
      console.error('Logout failed:', error);
      toast.error('Logout failed');
    }
  }, [router]);

  const hasPermission = useCallback((permission: string) => {
    if (!user) return false;
    return user.permissions.includes(permission) || user.role === 'SYSTEM_ADMIN';
  }, [user]);

  const hasRole = useCallback((role: string) => {
    if (!user) return false;
    const roleHierarchy = ['OBSERVER', 'ADMIN', 'AUTHORITY', 'SYSTEM_ADMIN'];
    const userRoleIndex = roleHierarchy.indexOf(user.role);
    const requiredRoleIndex = roleHierarchy.indexOf(role);
    return userRoleIndex >= requiredRoleIndex;
  }, [user]);

  const setToken = useCallback((token: string) => {
    cirisClient.setConfig({ authToken: token });
  }, []);

  const isManagerAuthenticated = useCallback(() => {
    return !!managerToken;
  }, [managerToken]);

  return (
    <AuthContext.Provider value={{
      user,
      loading,
      login,
      logout,
      hasPermission,
      hasRole,
      setUser,
      setToken,
      managerToken,
      setManagerToken,
      isManagerAuthenticated
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
