"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useAuth } from "./AuthContext";
import { cirisClient } from "../lib/ciris-sdk";
import type { APIRole, WARole } from "../lib/ciris-sdk";
import { sdkConfigManager } from "../lib/sdk-config-manager";
import { AuthStore } from "../lib/ciris-sdk/auth-store";
import { usePathname } from "next/navigation";

// Simplified AgentInfo for standalone mode (no manager dependency)
export interface AgentInfo {
  agent_id: string;
  agent_name: string;
  status: "running" | "stopped" | "error";
  health: "healthy" | "unhealthy" | "unknown";
  api_endpoint: string;
}

interface AgentRole {
  agentId: string;
  apiRole: APIRole;
  waRole?: WARole;
  isAuthority: boolean;
  lastChecked: Date;
}

interface AgentContextType {
  currentAgent: AgentInfo | null;
  currentAgentRole: AgentRole | null;
  refreshAgent: () => Promise<void>;
  refreshAgentRole: () => Promise<void>;
  isLoadingAgent: boolean;
  isLoadingRole: boolean;
  error: Error | null;
}

const AgentContext = createContext<AgentContextType | null>(null);

// Default fallback values when identity cannot be fetched
const DEFAULT_AGENT_ID = "local";
const DEFAULT_AGENT_NAME = "CIRIS Agent";

// Pages that don't require authentication - skip API calls on these
const UNAUTHENTICATED_PAGES = ["/login", "/setup"];

export function AgentProvider({ children }: { children: ReactNode }) {
  const [currentAgent, setCurrentAgent] = useState<AgentInfo | null>(null);
  const [currentAgentRole, setCurrentAgentRole] = useState<AgentRole | null>(null);
  const [isLoadingAgent, setIsLoadingAgent] = useState(false);
  const [isLoadingRole, setIsLoadingRole] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const { user } = useAuth();
  const pathname = usePathname();

  // Check if we're on an unauthenticated page (login/setup)
  const isOnUnauthenticatedPage = UNAUTHENTICATED_PAGES.some(page => pathname?.startsWith(page));

  // Fetch agent identity directly from the API
  // Only call this when authenticated
  const refreshAgent = async () => {
    // Don't fetch if not authenticated or on login/setup pages
    const hasAuth = AuthStore.getAccessToken() || user;
    if (!hasAuth || isOnUnauthenticatedPage) {
      console.log("[AgentContext] Skipping agent fetch - not authenticated or on auth page");
      // Use localStorage fallback without making API call
      const savedAgentId = localStorage.getItem("selectedAgentId") || DEFAULT_AGENT_ID;
      const savedAgentName = localStorage.getItem("selectedAgentName") || DEFAULT_AGENT_NAME;

      if (savedAgentId !== DEFAULT_AGENT_ID || savedAgentName !== DEFAULT_AGENT_NAME) {
        console.log("[AgentContext] Using saved agent from localStorage:", savedAgentName);
        setCurrentAgent({
          agent_id: savedAgentId,
          agent_name: savedAgentName,
          status: "running",
          health: "unknown",
          api_endpoint: process.env.NEXT_PUBLIC_CIRIS_API_URL || "http://localhost:8080",
        });
      }
      return;
    }

    setIsLoadingAgent(true);
    setError(null);

    try {
      // Fetch real identity from the agent API
      const identity = await cirisClient.agent.getIdentity();
      console.log("[AgentContext] Got agent identity:", identity.name, "(", identity.agent_id, ")");

      const agent: AgentInfo = {
        agent_id: identity.agent_id,
        agent_name: identity.name,
        status: "running",
        health: "healthy",
        api_endpoint: process.env.NEXT_PUBLIC_CIRIS_API_URL || "http://localhost:8080",
      };

      setCurrentAgent(agent);

      // Store selection in localStorage
      localStorage.setItem("selectedAgentId", agent.agent_id);
      localStorage.setItem("selectedAgentName", agent.agent_name);
    } catch (err) {
      // Identity fetch failed, check localStorage for saved agent info or use fallback
      console.log("[AgentContext] Could not fetch agent identity, checking localStorage");

      const savedAgentId = localStorage.getItem("selectedAgentId") || DEFAULT_AGENT_ID;
      const savedAgentName = localStorage.getItem("selectedAgentName") || DEFAULT_AGENT_NAME;

      console.log(
        "[AgentContext] Using saved/default agent:",
        savedAgentName,
        "(",
        savedAgentId,
        ")"
      );

      const fallbackAgent: AgentInfo = {
        agent_id: savedAgentId,
        agent_name: savedAgentName,
        status: "running",
        health: "unknown",
        api_endpoint: process.env.NEXT_PUBLIC_CIRIS_API_URL || "http://localhost:8080",
      };

      setCurrentAgent(fallbackAgent);

      // Only set error if it's not an auth or connection error
      if (
        err instanceof Error &&
        !err.message.includes("fetch") &&
        !err.message.includes("Failed to fetch") &&
        !err.message.includes("401") &&
        !err.message.includes("Unauthorized")
      ) {
        setError(err);
      }
    } finally {
      setIsLoadingAgent(false);
    }
  };

  // Fetch role for the current agent
  const refreshAgentRole = async () => {
    if (!user || !currentAgent || isOnUnauthenticatedPage) return;

    setIsLoadingRole(true);

    try {
      const userInfo = await cirisClient.auth.getCurrentUser();

      if (userInfo) {
        const newRole: AgentRole = {
          agentId: currentAgent.agent_id,
          apiRole: userInfo.api_role,
          waRole: userInfo.wa_role,
          isAuthority: userInfo.wa_role === "authority" || userInfo.api_role === "SYSTEM_ADMIN",
          lastChecked: new Date(),
        };

        setCurrentAgentRole(newRole);
      }
    } catch (error) {
      console.error(`Failed to fetch role for agent ${currentAgent.agent_id}:`, error);
      // Don't set a default role on error - let it fail properly
    }

    setIsLoadingRole(false);
  };

  // Initial load - only fetch if authenticated
  useEffect(() => {
    // Skip on login/setup pages
    if (isOnUnauthenticatedPage) {
      console.log("[AgentContext] On auth page, skipping initial fetch");
      // Still load from localStorage if available
      const savedAgentId = localStorage.getItem("selectedAgentId");
      const savedAgentName = localStorage.getItem("selectedAgentName");
      if (savedAgentId && savedAgentName) {
        setCurrentAgent({
          agent_id: savedAgentId,
          agent_name: savedAgentName,
          status: "running",
          health: "unknown",
          api_endpoint: process.env.NEXT_PUBLIC_CIRIS_API_URL || "http://localhost:8080",
        });
      }
      return;
    }

    // Check if we have a stored auth token and restore SDK config
    const authToken = AuthStore.getAccessToken();
    const savedAgentId = localStorage.getItem("selectedAgentId");

    if (authToken && savedAgentId) {
      console.log("[AgentContext] Restoring SDK config for agent:", savedAgentId);
      sdkConfigManager.configure(savedAgentId, authToken);
      // Only fetch if we have auth
      refreshAgent();
    } else if (authToken) {
      // Have auth but no saved agent - fetch to discover
      refreshAgent();
    } else {
      console.log("[AgentContext] No auth token, skipping agent fetch");
      // Load from localStorage if available
      const savedName = localStorage.getItem("selectedAgentName");
      const savedId = localStorage.getItem("selectedAgentId");
      if (savedId && savedName) {
        setCurrentAgent({
          agent_id: savedId,
          agent_name: savedName,
          status: "running",
          health: "unknown",
          api_endpoint: process.env.NEXT_PUBLIC_CIRIS_API_URL || "http://localhost:8080",
        });
      }
    }
  }, [pathname]); // eslint-disable-line

  // Refresh agent when user logs in
  useEffect(() => {
    if (user && !isOnUnauthenticatedPage) {
      console.log("[AgentContext] User authenticated, refreshing agent");
      refreshAgent();
    }
  }, [user]); // eslint-disable-line

  // Refresh role when current agent or user changes
  useEffect(() => {
    if (currentAgent && user && !isOnUnauthenticatedPage) {
      refreshAgentRole();
    }
  }, [currentAgent, user]); // eslint-disable-line

  const value: AgentContextType = {
    currentAgent,
    currentAgentRole,
    refreshAgent,
    refreshAgentRole,
    isLoadingAgent,
    isLoadingRole,
    error,
  };

  return <AgentContext.Provider value={value}>{children}</AgentContext.Provider>;
}

export function useAgent() {
  const context = useContext(AgentContext);
  if (!context) {
    throw new Error("useAgent must be used within an AgentProvider");
  }
  return context;
}
