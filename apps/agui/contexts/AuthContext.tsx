"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { cirisClient, User } from "../lib/ciris-sdk";
import { sdkConfigManager } from "../lib/sdk-config-manager";

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
    if (pathname === "/login" || pathname.startsWith("/manager")) {
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
    const savedManagerToken = localStorage.getItem("manager_token");
    if (savedManagerToken) {
      setManagerToken(savedManagerToken);
    }

    // Listen for native auth injection (happens after page load in WebView)
    const handleNativeAuthReady = (event: Event) => {
      // Deduplicate event handling - only process once per session
      const alreadyHandled = sessionStorage.getItem("ciris_native_auth_event_handled") === "true";
      if (alreadyHandled) {
        console.log(
          "[AuthContext] Native auth ready event received but already handled - skipping"
        );
        return;
      }
      console.log("[AuthContext] Native auth ready event received - processing");
      sessionStorage.setItem("ciris_native_auth_event_handled", "true");
      checkNativeAuth();
    };
    window.addEventListener("ciris_native_auth_ready", handleNativeAuthReady);

    return () => {
      window.removeEventListener("ciris_native_auth_ready", handleNativeAuthReady);
    };
  }, []);

  // Helper to perform setup redirect with loop protection
  const doSetupRedirect = () => {
    console.log("[AuthContext] doSetupRedirect - setting redirect lock and navigating to /setup");
    sessionStorage.setItem("ciris_redirect_in_progress", "true");
    sessionStorage.setItem("ciris_last_redirect_time", Date.now().toString());
    window.location.href = "/setup";
  };

  // Check if setup is actually needed by querying the API
  const checkSetupStatusFromAPI = async (): Promise<boolean> => {
    const localFlag = localStorage.getItem("ciris_show_setup");
    console.log("[AuthContext] checkSetupStatusFromAPI called - localStorage flag:", localFlag);

    try {
      const response = await fetch("/v1/setup/status");
      console.log("[AuthContext] Setup status API response code:", response.status);

      if (response.ok) {
        const responseJson = await response.json();
        console.log("[AuthContext] Setup status API raw response:", JSON.stringify(responseJson));

        // The API returns SuccessResponse envelope: { success: bool, data: { setup_required: bool, ... } }
        // Unwrap the envelope to get the actual data
        const data = responseJson.data || responseJson;
        console.log("[AuthContext] Setup status unwrapped data:", JSON.stringify(data));

        // setup_required=false means setup is COMPLETE
        // setup_required=true means setup is NEEDED
        const setupRequired = data.setup_required;
        const isComplete =
          data.setup_complete || data.is_complete || data.completed || data.isComplete;

        console.log(
          "[AuthContext] API fields - setup_required:",
          setupRequired,
          "(type:",
          typeof setupRequired,
          "), isComplete:",
          isComplete
        );

        // Check setup_required first (the actual API field), then fallback to isComplete variations
        if (setupRequired === false || isComplete === true) {
          console.log(
            "[AuthContext] API confirms setup is COMPLETE (setup_required=false or isComplete=true)"
          );
          localStorage.setItem("ciris_show_setup", "false");
          return false; // Setup NOT needed
        }

        if (setupRequired === true) {
          console.log("[AuthContext] API confirms setup is REQUIRED (setup_required=true)");
          return true; // Setup IS needed
        }

        console.log("[AuthContext] API response unclear, assuming setup IS needed");
        return true; // Setup IS needed
      } else {
        console.warn("[AuthContext] Setup status API returned non-OK:", response.status);
      }
    } catch (e) {
      console.warn("[AuthContext] Failed to check setup status from API:", e);
    }
    // Default to localStorage value if API check fails
    const fallback = localFlag === "true";
    console.log("[AuthContext] Using localStorage fallback - setup needed:", fallback);
    return fallback;
  };

  // Check for native Android app auth (Google Sign-In or API Key mode)
  const checkNativeAuth = async (): Promise<boolean> => {
    const isNativeApp = localStorage.getItem("isNativeApp") === "true";
    const nativeAuthData = localStorage.getItem("ciris_native_auth");
    const authMethod = localStorage.getItem("ciris_auth_method");
    const showSetupFlag = localStorage.getItem("ciris_show_setup") === "true";
    const currentPath = window.location.pathname;

    // Check for CIRIS access token injected by native app (from Google OAuth token exchange)
    const injectedToken =
      localStorage.getItem("ciris_access_token") || localStorage.getItem("access_token");
    const hasInjectedToken = !!injectedToken;

    // Prevent redirect loops - use sessionStorage to track redirect state
    const redirectInProgress = sessionStorage.getItem("ciris_redirect_in_progress") === "true";
    const lastRedirectTime = parseInt(
      sessionStorage.getItem("ciris_last_redirect_time") || "0",
      10
    );
    const now = Date.now();

    // If a redirect happened in the last 5 seconds, skip to prevent loops
    if (redirectInProgress || now - lastRedirectTime < 5000) {
      console.log("[AuthContext] SKIPPING - redirect recently in progress, avoiding loop");
      return true;
    }

    console.log(
      "[AuthContext] checkNativeAuth called - path:",
      currentPath,
      "isNativeApp:",
      isNativeApp,
      "showSetupFlag:",
      showSetupFlag,
      "hasInjectedToken:",
      hasInjectedToken
    );

    if (!isNativeApp || !nativeAuthData) {
      console.log("[AuthContext] Not native app or no auth data, skipping");
      return false;
    }

    // Check if we already completed native auth (persisted in localStorage)
    // This survives page navigations which reset the in-memory SDK client
    const nativeAuthComplete = localStorage.getItem("ciris_native_auth_complete") === "true";
    const savedToken = localStorage.getItem("ciris_native_auth_token");

    // Use injected token if available (from native Google OAuth), otherwise use saved token
    const tokenToUse = injectedToken || savedToken;

    if ((nativeAuthComplete || hasInjectedToken) && tokenToUse) {
      console.log(
        "[AuthContext] Native auth token available, restoring session (injected:",
        hasInjectedToken,
        ")"
      );
      // Restore the token to the SDK client
      localStorage.setItem("selectedAgentId", "datum");
      sdkConfigManager.configure("datum", tokenToUse);

      // If we used injected token, save it for future page navigations
      if (hasInjectedToken && injectedToken) {
        localStorage.setItem("ciris_native_auth_token", injectedToken);
        localStorage.setItem("ciris_native_auth_complete", "true");
      }

      // Create user from saved auth data
      try {
        const authData = JSON.parse(nativeAuthData);
        const restoredUser: User = {
          user_id: authData.googleUserId || "admin",
          username: authData.displayName || authData.email || "admin",
          role: "SYSTEM_ADMIN",
          api_role: "ADMIN",
          permissions: ["read", "write", "admin"],
          created_at: new Date().toISOString(),
        };
        setUser(restoredUser);
        setLoading(false);

        // IMPORTANT: Still need to redirect to setup if needed!
        // But ALWAYS verify with the API to prevent redirect loops
        console.log(
          "[AuthContext] Checking if setup redirect needed - showSetupFlag:",
          showSetupFlag,
          "currentPath:",
          currentPath
        );
        if (showSetupFlag && !currentPath.startsWith("/setup")) {
          console.log("[AuthContext] showSetupFlag is true and not on /setup - checking API...");
          const setupNeeded = await checkSetupStatusFromAPI();
          console.log("[AuthContext] API setupNeeded result:", setupNeeded);
          if (setupNeeded) {
            console.log("[AuthContext] REDIRECTING to /setup - API confirmed setup needed");
            localStorage.setItem(
              "ciris_native_llm_mode",
              authMethod === "google" ? "ciris_proxy" : "custom"
            );
            doSetupRedirect();
            return true;
          } else {
            console.log("[AuthContext] NOT redirecting - API says setup is complete");
            // Also clear the flag since API says complete
            localStorage.setItem("ciris_show_setup", "false");
          }
        } else {
          console.log(
            "[AuthContext] NOT checking API - showSetupFlag:",
            showSetupFlag,
            "onSetupPage:",
            currentPath.startsWith("/setup")
          );
        }
        return true;
      } catch (e) {
        console.error("[AuthContext] Failed to restore session:", e);
        // Clear the flags and try fresh login
        localStorage.removeItem("ciris_native_auth_complete");
        localStorage.removeItem("ciris_native_auth_token");
      }
    }

    // Skip if already authenticated (in-memory check as backup)
    if (cirisClient.isAuthenticated()) {
      console.log("[AuthContext] Already authenticated in SDK, skipping native auth login");
      return true;
    }

    try {
      const authData = JSON.parse(nativeAuthData);
      console.log(
        "[AuthContext] Native auth detected - method:",
        authMethod,
        "showSetupFlag:",
        showSetupFlag,
        "currentPath:",
        currentPath
      );

      // Configure SDK for local on-device API
      localStorage.setItem("selectedAgentId", "datum");
      sdkConfigManager.configure("datum");

      try {
        console.log("[AuthContext] Attempting login with default credentials...");
        // Try to login with default credentials for local on-device API
        const user = await cirisClient.login("admin", "ciris_admin_password");
        const token = cirisClient.auth.getAccessToken();
        if (token) {
          sdkConfigManager.configure("datum", token);
          // Persist the token for page navigation survival
          localStorage.setItem("ciris_native_auth_token", token);
          localStorage.setItem("ciris_native_auth_complete", "true");
          console.log("[AuthContext] Token saved to localStorage");
        }
        setUser(user);
        console.log("[AuthContext] Native auth login successful");
        setLoading(false);

        // Redirect to setup wizard if needed (only if not already on setup page)
        // But ALWAYS verify with the API to prevent redirect loops
        if (showSetupFlag && !currentPath.startsWith("/setup")) {
          const setupNeeded = await checkSetupStatusFromAPI();
          if (setupNeeded) {
            console.log("[AuthContext] Redirecting to setup wizard - API confirmed setup needed");
            // Store native auth info for setup wizard to use
            localStorage.setItem(
              "ciris_native_llm_mode",
              authMethod === "google" ? "ciris_proxy" : "custom"
            );
            doSetupRedirect();
            return true;
          } else {
            console.log("[AuthContext] API says setup complete - NOT redirecting");
          }
        } else {
          console.log(
            "[AuthContext] Not redirecting - showSetupFlag:",
            showSetupFlag,
            "currentPath:",
            currentPath
          );
        }

        return true;
      } catch (loginError) {
        console.error("[AuthContext] Native auth login failed:", loginError);
        // Create a mock user for native app mode if login fails
        const mockUser: User = {
          user_id: authData.googleUserId || "native_user",
          username: authData.displayName || "Native User",
          role: "ADMIN",
          api_role: "ADMIN",
          permissions: ["read", "write", "admin"],
          created_at: new Date().toISOString(),
        };
        setUser(mockUser);
        setLoading(false);
        // Mark as complete even with mock user
        localStorage.setItem("ciris_native_auth_complete", "true");

        // Redirect to setup wizard if needed (only if not already on setup page)
        // But ALWAYS verify with the API to prevent redirect loops
        if (showSetupFlag && !currentPath.startsWith("/setup")) {
          const setupNeeded = await checkSetupStatusFromAPI();
          if (setupNeeded) {
            console.log("[AuthContext] Redirecting to setup wizard (mock user) - API confirmed");
            localStorage.setItem(
              "ciris_native_llm_mode",
              authMethod === "google" ? "ciris_proxy" : "custom"
            );
            doSetupRedirect();
            return true;
          } else {
            console.log("[AuthContext] API says setup complete (mock user) - NOT redirecting");
          }
        }

        return true;
      }
    } catch (error) {
      console.error("[AuthContext] Failed to parse native auth data:", error);
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
      console.error("Auth check failed:", error);
    } finally {
      setLoading(false);
    }
  };

  const login = useCallback(
    async (username: string, password: string) => {
      try {
        // Get the selected agent from localStorage (set by login page)
        const selectedAgentId = localStorage.getItem("selectedAgentId");
        if (!selectedAgentId) {
          throw new Error("No agent selected");
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
        router.push("/");
      } catch (error: any) {
        toast.error(error.message || "Login failed");
        throw error;
      }
    },
    [router]
  );

  const logout = useCallback(async () => {
    try {
      await cirisClient.logout();
      setUser(null);
      toast.success("Logged out successfully");
      router.push("/login");
    } catch (error) {
      console.error("Logout failed:", error);
      toast.error("Logout failed");
    }
  }, [router]);

  const hasPermission = useCallback(
    (permission: string) => {
      if (!user) return false;
      return user.permissions.includes(permission) || user.role === "SYSTEM_ADMIN";
    },
    [user]
  );

  const hasRole = useCallback(
    (role: string) => {
      if (!user) return false;
      const roleHierarchy = ["OBSERVER", "ADMIN", "AUTHORITY", "SYSTEM_ADMIN"];
      const userRoleIndex = roleHierarchy.indexOf(user.role);
      const requiredRoleIndex = roleHierarchy.indexOf(role);
      return userRoleIndex >= requiredRoleIndex;
    },
    [user]
  );

  const setToken = useCallback((token: string) => {
    cirisClient.setConfig({ authToken: token });
  }, []);

  const isManagerAuthenticated = useCallback(() => {
    return !!managerToken;
  }, [managerToken]);

  return (
    <AuthContext.Provider
      value={{
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
        isManagerAuthenticated,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
