"use client";

import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useAgent } from "@/contexts/AgentContextHybrid";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { cirisClient } from "@/lib/ciris-sdk/client";
import toast from "react-hot-toast";
import { ProtectedRoute } from "@/components/ProtectedRoute";

// Minimal interact page - store SSE events without complex rendering
export default function InteractPage() {
  const { user } = useAuth();
  const { currentAgent } = useAgent();
  const [message, setMessage] = useState("");
  const queryClient = useQueryClient();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Simple array to store raw SSE events (no processing)
  const [sseEvents, setSseEvents] = useState<any[]>([]);
  const [sseConnected, setSseConnected] = useState(false);
  const [showDebug, setShowDebug] = useState(false);

  // Fetch conversation history - this should include agent responses
  const {
    data: history,
    isLoading,
    error: historyError,
  } = useQuery({
    queryKey: ["conversation-history"],
    queryFn: async () => {
      console.log("📜 Fetching history...");
      const result = await cirisClient.agent.getHistory({
        channel_id: "api_0.0.0.0_8080",
        limit: 20,
      });
      console.log("📜 History result:", result);
      return result;
    },
    refetchInterval: 10000, // Slow down polling to 10 seconds
    enabled: !!currentAgent && !!user,
  });

  // Simple SSE connection - just store events, no processing
  useEffect(() => {
    const token = cirisClient.auth.getAccessToken();
    if (!token || !currentAgent) {
      console.log("⚠️ Skipping SSE - no token or agent");
      return;
    }

    const apiBaseUrl = cirisClient.getBaseURL();
    const streamUrl = `${apiBaseUrl}/v1/system/runtime/reasoning-stream`;
    console.log("🔌 Connecting SSE to:", streamUrl);

    const abortController = new AbortController();

    const connectStream = async () => {
      try {
        const response = await fetch(streamUrl, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "text/event-stream",
          },
          signal: abortController.signal,
        });

        if (!response.ok) {
          console.error("❌ SSE HTTP error:", response.status);
          return;
        }

        console.log("✅ SSE connected");
        setSseConnected(true);

        const reader = response.body?.getReader();
        if (!reader) return;

        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (line.startsWith("data:")) {
              try {
                const data = JSON.parse(line.slice(5).trim());
                console.log("📡 SSE event:", data);
                // Just append to array, limit to last 50
                setSseEvents(prev => [
                  ...prev.slice(-49),
                  { timestamp: new Date().toISOString(), data },
                ]);
              } catch (e) {
                // Ignore parse errors for non-JSON data lines
              }
            }
          }
        }
      } catch (error: any) {
        if (error.name !== "AbortError") {
          console.error("❌ SSE error:", error);
          setSseConnected(false);
        }
      }
    };

    connectStream();
    return () => {
      abortController.abort();
      setSseConnected(false);
    };
  }, [currentAgent]);

  // Get messages sorted by timestamp
  const messages = history?.messages
    ? [...history.messages].sort(
        (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      )
    : [];

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  // Send message
  const sendMessageMutation = useMutation({
    mutationFn: async (msg: string) => {
      console.log("📤 Sending message:", msg);
      return await cirisClient.agent.submitMessage(msg, {
        channel_id: "api_0.0.0.0_8080",
      });
    },
    onSuccess: data => {
      console.log("📤 Send result:", data);
      if (data.accepted) {
        toast.success(`Message accepted (task: ${data.task_id?.slice(-8) || "?"})`);
      } else {
        toast.error(`Rejected: ${data.rejection_reason}`);
      }
      // Refetch history to show our message and eventual response
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["conversation-history"] });
      }, 500);
    },
    onError: (error: any) => {
      console.error("📤 Send error:", error);
      toast.error(`Error: ${error.message}`);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;
    sendMessageMutation.mutate(message.trim());
    setMessage("");
  };

  return (
    <ProtectedRoute>
      <div className="max-w-2xl mx-auto px-4 py-8">
        <h1 className="text-xl font-bold mb-4">CIRIS Chat (Simplified)</h1>

        {/* Status bar */}
        <div className="flex gap-4 mb-4 text-sm">
          <span className={sseConnected ? "text-green-600" : "text-red-600"}>
            SSE: {sseConnected ? "✓ Connected" : "✗ Disconnected"}
          </span>
          <span className="text-gray-600">Events: {sseEvents.length}</span>
          <span className="text-gray-600">Messages: {messages.length}</span>
          <button onClick={() => setShowDebug(!showDebug)} className="text-blue-600 underline">
            {showDebug ? "Hide Debug" : "Show Debug"}
          </button>
        </div>

        {/* Debug panel */}
        {showDebug && (
          <div className="mb-4 p-3 bg-gray-100 rounded text-xs max-h-48 overflow-auto">
            <div className="font-bold mb-2">Raw History Response:</div>
            <pre className="whitespace-pre-wrap break-all">{JSON.stringify(history, null, 2)}</pre>
            <div className="font-bold mt-4 mb-2">Recent SSE Events ({sseEvents.length}):</div>
            <pre className="whitespace-pre-wrap break-all">
              {JSON.stringify(sseEvents.slice(-5), null, 2)}
            </pre>
            {historyError && (
              <div className="text-red-600 mt-2">History Error: {String(historyError)}</div>
            )}
          </div>
        )}

        {/* Messages */}
        <div className="border rounded-lg bg-gray-50 h-96 overflow-y-auto p-4 mb-4">
          {isLoading ? (
            <div className="text-center text-gray-500">Loading...</div>
          ) : messages.length === 0 ? (
            <div className="text-center text-gray-500">No messages yet. Start a conversation!</div>
          ) : (
            <div className="space-y-3">
              {messages.map((msg, i) => (
                <div key={msg.id || i} className={msg.is_agent ? "text-left" : "text-right"}>
                  <div
                    className={`inline-block px-4 py-2 rounded-lg max-w-[80%] ${
                      msg.is_agent ? "bg-gray-200 text-gray-900" : "bg-blue-500 text-white"
                    }`}
                  >
                    {msg.content}
                  </div>
                  <div className="text-xs text-gray-400 mt-1">
                    {msg.is_agent ? "Agent" : "You"} •{" "}
                    {new Date(msg.timestamp).toLocaleTimeString()}
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input */}
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            type="text"
            value={message}
            onChange={e => setMessage(e.target.value)}
            placeholder="Type a message..."
            className="flex-1 px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={sendMessageMutation.isPending}
          />
          <button
            type="submit"
            disabled={sendMessageMutation.isPending || !message.trim()}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {sendMessageMutation.isPending ? "..." : "Send"}
          </button>
        </form>

        {/* Agent info */}
        {currentAgent && (
          <div className="mt-4 text-xs text-gray-500">
            Agent: {currentAgent.agent_id} | User: {user?.username || "?"}
          </div>
        )}
      </div>
    </ProtectedRoute>
  );
}
