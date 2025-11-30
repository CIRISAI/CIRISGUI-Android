"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../contexts/AuthContext";
import { cirisClient } from "../../lib/ciris-sdk";
import { SDK_VERSION } from "../../lib/ciris-sdk/version";
import LogoIcon from "../../components/ui/floating/LogoIcon";
import { useGoogleAuth, getPlatform, isNativePlatform } from "../../hooks/useGoogleAuth";

export default function LoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [checkingSetup, setCheckingSetup] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const { login } = useAuth();
  const hasInitialized = useRef(false);
  const [showDebug, setShowDebug] = useState(false);
  const [debugInfo, setDebugInfo] = useState<Record<string, string>>({});

  // Google Auth hook for native platforms
  const {
    isNative,
    user: googleUser,
    loading: googleLoading,
    error: googleError,
    signIn: googleSignIn,
    isSignedIn,
  } = useGoogleAuth();

  // Collect debug info
  useEffect(() => {
    const info: Record<string, string> = {
      platform: getPlatform(),
      isNative: isNativePlatform() ? "Yes" : "No",
      userAgent:
        typeof navigator !== "undefined" ? navigator.userAgent.substring(0, 50) + "..." : "N/A",
    };

    // Try to get capacitor config
    if (typeof window !== "undefined") {
      const configEl = document.querySelector('script[type="application/json"]');
      if (configEl) {
        try {
          const config = JSON.parse(configEl.textContent || "{}");
          info.serverClientId =
            config?.plugins?.GoogleAuth?.serverClientId?.substring(0, 20) + "..." || "Not found";
        } catch {
          info.serverClientId = "Parse error";
        }
      }
    }

    setDebugInfo(info);
  }, []);

  // Check if setup is complete and redirect if needed
  useEffect(() => {
    if (hasInitialized.current) return;
    hasInitialized.current = true;

    const checkSetup = async () => {
      const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || window.location.origin;
      cirisClient.setConfig({ baseURL: apiBaseUrl });

      try {
        const response = await cirisClient.setup.getStatus();

        if (response.setup_required) {
          // Redirect to setup wizard (use window.location for static export)
          window.location.href = "/setup";
          return;
        }

        // Setup is complete, continue with login
        localStorage.setItem("selectedAgentId", "datum");
        localStorage.setItem("selectedAgentName", "CIRIS Agent");
        console.log("Standalone login initialized with API:", apiBaseUrl);
      } catch (error) {
        console.error("Failed to check setup status:", error);
        // If the endpoint doesn't exist, assume setup is complete (backward compatibility)
      } finally {
        setCheckingSetup(false);
      }
    };

    checkSetup();
  }, [router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      await login(username, password);
      // Login successful - AuthContext will handle the redirect
    } catch (err: any) {
      console.error("Login failed:", err);
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    try {
      const user = await googleSignIn();
      if (user) {
        console.log("Google Sign-In successful:", user.email);
        // For now, just show success - later integrate with CIRIS proxy
        // Redirect to dashboard or home
        window.location.href = "/dashboard";
      }
    } catch (err: any) {
      console.error("Google Sign-In error:", err);
      setError(new Error(err.message || "Google Sign-In failed"));
    }
  };

  // Show loading while checking setup status
  if (checkingSetup) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <LogoIcon className="mx-auto h-12 w-auto text-brand-primary fill-brand-primary animate-pulse" />
          <p className="mt-4 text-gray-600">Checking setup status...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full space-y-8 p-8">
        <div>
          <LogoIcon className="mx-auto h-12 w-auto text-brand-primary fill-brand-primary" />
          <h2 className="mt-6 text-center text-3xl text-brand-primary font-extrabold">
            Sign in to CIRIS
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            {isNative ? "Mobile App" : "Standalone Mode"}
          </p>
          {(error || googleError) && (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-md">
              <p className="text-sm text-red-600">{error?.message || googleError}</p>
            </div>
          )}
        </div>

        {/* Google Sign-In for native platforms */}
        {isNative && (
          <div className="space-y-4">
            {isSignedIn && googleUser ? (
              <div className="p-4 bg-green-50 border border-green-200 rounded-md">
                <p className="text-sm text-green-800">Signed in as: {googleUser.email}</p>
                <p className="text-xs text-green-600 mt-1">User ID: {googleUser.id}</p>
              </div>
            ) : (
              <button
                onClick={handleGoogleSignIn}
                disabled={googleLoading}
                className="w-full flex items-center justify-center gap-3 py-3 px-4 border border-gray-300 rounded-md shadow-sm bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
                {googleLoading ? "Signing in..." : "Sign in with Google"}
              </button>
            )}

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-gray-50 text-gray-500">Or continue with</span>
              </div>
            </div>
          </div>
        )}

        <form onSubmit={handleLogin} className="mt-8 space-y-6">
          <div className="space-y-4">
            <div>
              <label htmlFor="username" className="block text-sm font-medium text-gray-700">
                Username
              </label>
              <input
                id="username"
                name="username"
                type="text"
                required
                value={username}
                onChange={e => setUsername(e.target.value)}
                className="mt-1 appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                placeholder="Enter username"
                disabled={loading}
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="mt-1 appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                placeholder="Enter password"
                disabled={loading}
              />
              <p className="mt-1 text-xs text-gray-500">
                Default credentials: <span className="font-mono font-medium">admin</span> /{" "}
                <span className="font-mono font-medium">ciris_admin_password</span>
              </p>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || !username || !password}
            className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>

        {/* Version indicator */}
        <div className="mt-4 text-center text-xs text-gray-400">
          v{SDK_VERSION.version} • {SDK_VERSION.gitHash?.substring(0, 7) || "dev"}
        </div>

        {/* Debug toggle */}
        <button
          onClick={() => setShowDebug(!showDebug)}
          className="w-full text-center text-xs text-gray-400 hover:text-gray-600"
        >
          {showDebug ? "Hide" : "Show"} Debug Info
        </button>

        {/* Debug info panel */}
        {showDebug && (
          <div className="mt-2 p-3 bg-gray-100 rounded-md text-xs font-mono">
            <p className="font-bold mb-2">Debug Info:</p>
            {Object.entries(debugInfo).map(([key, value]) => (
              <p key={key} className="text-gray-600">
                <span className="font-semibold">{key}:</span> {value}
              </p>
            ))}
            {googleError && (
              <p className="text-red-600 mt-2">
                <span className="font-semibold">Google Error:</span> {googleError}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
