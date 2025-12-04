"use client";

import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useAgent } from "@/contexts/AgentContextHybrid";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { cirisClient } from "@/lib/ciris-sdk/client";
import toast from "react-hot-toast";
import { ProtectedRoute } from "@/components/ProtectedRoute";

// Stage configuration
const STAGE_NAMES = [
  "thought_start",
  "snapshot_and_context",
  "dma_results",
  "aspdma_result",
  "conscience_result",
  "action_result",
] as const;

type StageName = (typeof STAGE_NAMES)[number];

// Stage display info
const STAGE_INFO: Record<StageName, { label: string; short: string; icon: string }> = {
  thought_start: { label: "Start", short: "1", icon: "▶" },
  snapshot_and_context: { label: "Context", short: "2", icon: "📋" },
  dma_results: { label: "Analysis", short: "3", icon: "🧠" },
  aspdma_result: { label: "Action", short: "4", icon: "⚡" },
  conscience_result: { label: "Ethics", short: "5", icon: "⚖️" },
  action_result: { label: "Result", short: "6", icon: "✓" },
};

// Task and thought types
interface ThoughtStage {
  event_type: string;
  completed: boolean;
  data: Record<string, unknown>;
  timestamp: string;
}

interface TrackedThought {
  thoughtId: string;
  stages: Map<StageName, ThoughtStage>;
}

interface TrackedTask {
  taskId: string;
  description: string;
  completed: boolean;
  firstTimestamp: string;
  thoughts: TrackedThought[];
}

// Helper to extract action label
function getActionLabel(actionName: string): string {
  if (!actionName) return "?";
  let clean = actionName;
  if (clean.includes(".")) clean = clean.split(".").pop() || clean;
  return clean.toUpperCase();
}

// Helper to check if action is conscience-exempt
function isConscienceExempt(actionName: string): boolean {
  const exemptActions = ["TASK_COMPLETE", "DEFER", "REJECT", "OBSERVE", "RECALL"];
  let clean = actionName;
  if (clean?.includes(".")) clean = clean.split(".").pop() || clean;
  return exemptActions.includes(clean.toUpperCase());
}

export default function InteractPage() {
  const { user } = useAuth();
  const { currentAgent } = useAgent();
  const [message, setMessage] = useState("");
  const queryClient = useQueryClient();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Task tracking state
  const [ourTaskIds] = useState<Set<string>>(() => new Set());
  const ourTaskIdsRef = useRef<Set<string>>(new Set());
  const [messageToTaskMap] = useState<Map<string, string>>(() => new Map());
  const messageToTaskMapRef = useRef<Map<string, string>>(new Map());
  const [tasks, setTasks] = useState<Map<string, TrackedTask>>(() => new Map());

  // SSE connection state
  const [sseConnected, setSseConnected] = useState(false);

  // Batch SSE updates for performance
  const pendingEventsRef = useRef<
    Array<{
      event_type: string;
      thought_id: string;
      task_id: string;
      data: Record<string, unknown>;
      timestamp: string;
    }>
  >([]);
  const batchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch conversation history
  const { data: history, isLoading } = useQuery({
    queryKey: ["conversation-history"],
    queryFn: async () => {
      const result = await cirisClient.agent.getHistory({
        channel_id: "api_0.0.0.0_8080",
        limit: 20,
      });
      return result;
    },
    refetchInterval: 8000,
    enabled: !!currentAgent && !!user,
  });

  // Process batched events
  const processBatchedEvents = useCallback(() => {
    const events = pendingEventsRef.current;
    if (events.length === 0) return;
    pendingEventsRef.current = [];

    setTasks(prev => {
      const newTasks = new Map(prev);

      for (const event of events) {
        const { event_type, thought_id, task_id, data, timestamp } = event;
        if (!thought_id || !task_id) continue;

        // Get or create task
        let task = newTasks.get(task_id);
        if (!task) {
          const isOurs = ourTaskIdsRef.current.has(task_id);
          task = {
            taskId: task_id,
            description: (data.task_description as string) || "",
            completed: false,
            firstTimestamp: timestamp,
            thoughts: [],
          };
          newTasks.set(task_id, task);
          console.log(`🎯 New task ${task_id.slice(-8)}, isOurs: ${isOurs}`);
        }

        // Find or create thought
        let thought = task.thoughts.find(t => t.thoughtId === thought_id);
        if (!thought) {
          thought = {
            thoughtId: thought_id,
            stages: new Map(),
          };
          task.thoughts.push(thought);
        }

        // Update stage
        const stageName = event_type as StageName;
        if (STAGE_NAMES.includes(stageName)) {
          thought.stages.set(stageName, {
            event_type,
            completed: true,
            data,
            timestamp,
          });
        }

        // Check if task is complete
        if (
          event_type === "action_result" &&
          ((data.action_executed as string)?.includes("task_complete") ||
            (data.action_executed as string)?.includes("task_reject"))
        ) {
          task.completed = true;
        }
      }

      return newTasks;
    });
  }, []);

  // Queue event for batched processing
  const queueEvent = useCallback(
    (event: {
      event_type: string;
      thought_id: string;
      task_id: string;
      data: Record<string, unknown>;
      timestamp: string;
    }) => {
      pendingEventsRef.current.push(event);

      // Debounce: process after 100ms of no new events
      if (batchTimeoutRef.current) {
        clearTimeout(batchTimeoutRef.current);
      }
      batchTimeoutRef.current = setTimeout(processBatchedEvents, 100);
    },
    [processBatchedEvents]
  );

  // SSE connection
  useEffect(() => {
    const token = cirisClient.auth.getAccessToken();
    if (!token || !currentAgent) {
      return;
    }

    const apiBaseUrl = cirisClient.getBaseURL();
    const streamUrl = `${apiBaseUrl}/v1/system/runtime/reasoning-stream`;
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
          console.error("SSE HTTP error:", response.status);
          return;
        }

        setSseConnected(true);
        const reader = response.body?.getReader();
        if (!reader) return;

        const decoder = new TextDecoder();
        let buffer = "";
        let eventType = "";
        let eventData = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (line.startsWith("event:")) {
              if (eventType && eventData) {
                processSSEEvent(eventType, eventData);
              }
              eventType = line.slice(6).trim();
              eventData = "";
            } else if (line.startsWith("data:")) {
              const newData = line.slice(5).trim();
              eventData = eventData ? eventData + "\n" + newData : newData;
            } else if (line === "") {
              if (eventType && eventData) {
                processSSEEvent(eventType, eventData);
                eventType = "";
                eventData = "";
              }
            }
          }
        }
      } catch (error: unknown) {
        const err = error as Error;
        if (err.name !== "AbortError") {
          console.error("SSE error:", err);
          setSseConnected(false);
        }
      }
    };

    const processSSEEvent = (type: string, data: string) => {
      if (type === "step_update") {
        try {
          const update = JSON.parse(data);
          if (update.events && Array.isArray(update.events)) {
            for (const event of update.events) {
              queueEvent({
                event_type: event.event_type,
                thought_id: event.thought_id,
                task_id: event.task_id,
                data: event,
                timestamp: event.timestamp || new Date().toISOString(),
              });
            }
          }
        } catch (e) {
          console.error("Failed to parse SSE event:", e);
        }
      }
    };

    connectStream();
    return () => {
      abortController.abort();
      setSseConnected(false);
      if (batchTimeoutRef.current) {
        clearTimeout(batchTimeoutRef.current);
      }
    };
  }, [currentAgent, queueEvent]);

  // Get messages sorted by timestamp
  const messages = useMemo(() => {
    if (!history?.messages) return [];
    return [...history.messages]
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
      .slice(-20);
  }, [history?.messages]);

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  // Send message mutation
  const sendMessageMutation = useMutation({
    mutationFn: async (msg: string) => {
      return await cirisClient.agent.submitMessage(msg, {
        channel_id: "api_0.0.0.0_8080",
      });
    },
    onSuccess: data => {
      if (data.accepted && data.task_id && data.message_id) {
        // Track this task as ours
        ourTaskIds.add(data.task_id);
        ourTaskIdsRef.current.add(data.task_id);

        // Map message_id to task_id
        messageToTaskMap.set(data.message_id, data.task_id);
        messageToTaskMapRef.current.set(data.message_id, data.task_id);

        console.log("🎯 Tracking task:", data.task_id, "for message:", data.message_id);
        toast.success(`Processing...`, { duration: 2000 });
      } else if (!data.accepted) {
        toast.error(`Rejected: ${data.rejection_reason}`);
      }

      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["conversation-history"] });
      }, 500);
    },
    onError: (error: Error) => {
      toast.error(`Error: ${error.message}`);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;
    sendMessageMutation.mutate(message.trim());
    setMessage("");
  };

  // Get related task for a user message
  const getRelatedTask = useCallback(
    (messageId: string): TrackedTask | undefined => {
      const taskId = messageToTaskMapRef.current.get(messageId);
      if (taskId) {
        return tasks.get(taskId);
      }
      return undefined;
    },
    [tasks]
  );

  // Render compact progress indicator for a thought
  const renderThoughtProgress = (thought: TrackedThought) => {
    const dmaStage = thought.stages.get("dma_results");
    const aspdmaStage = thought.stages.get("aspdma_result");
    const conscienceStage = thought.stages.get("conscience_result");
    const actionStage = thought.stages.get("action_result");

    const selectedAction = aspdmaStage?.data?.selected_action as string;
    const consciencePassed = conscienceStage?.data?.conscience_passed as boolean;
    const executedAction = actionStage?.data?.action_executed as string;
    const isExempt = selectedAction && isConscienceExempt(selectedAction);

    return (
      <div className="flex flex-wrap items-center gap-1 text-xs">
        {/* DMA indicators */}
        {dmaStage && (
          <span className="px-1.5 py-0.5 bg-gray-200 rounded font-semibold">CS·DS·E</span>
        )}

        {/* Selected action */}
        {selectedAction && (
          <>
            <span className="text-gray-400">→</span>
            <span className="px-1.5 py-0.5 bg-blue-100 text-blue-800 rounded font-semibold">
              {getActionLabel(selectedAction)}
            </span>
          </>
        )}

        {/* Conscience result */}
        {conscienceStage && selectedAction && (
          <>
            <span className="text-gray-400">→</span>
            <span
              className={`px-1.5 py-0.5 rounded font-semibold ${
                isExempt
                  ? "bg-gray-100 text-gray-600"
                  : consciencePassed
                    ? "bg-green-100 text-green-800"
                    : "bg-red-100 text-red-800"
              }`}
            >
              {isExempt ? "EXEMPT" : consciencePassed ? "PASSED" : "FAILED"}
            </span>
          </>
        )}

        {/* Executed action */}
        {executedAction && (
          <>
            <span className="text-gray-400">→</span>
            <span className="px-1.5 py-0.5 bg-purple-100 text-purple-800 rounded font-semibold">
              {getActionLabel(executedAction)}
            </span>
          </>
        )}

        {/* Progress dots for incomplete */}
        {!actionStage && (
          <span className="ml-1 flex gap-0.5">
            {STAGE_NAMES.map(stage => (
              <span
                key={stage}
                className={`w-1.5 h-1.5 rounded-full ${
                  thought.stages.has(stage) ? "bg-green-500" : "bg-gray-300"
                }`}
              />
            ))}
          </span>
        )}
      </div>
    );
  };

  // Render expandable stage details
  const renderStageDetails = (stageName: StageName, stage: ThoughtStage) => {
    const data = stage.data;
    const info = STAGE_INFO[stageName];

    // Special rendering for different stage types
    if (stageName === "aspdma_result") {
      const action = getActionLabel(data.selected_action as string);
      const reasoning = (data.action_rationale || data.action_reasoning || "") as string;
      return (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold text-blue-700">{action}</span>
          </div>
          {reasoning && <p className="text-gray-600 text-sm">{reasoning}</p>}
        </div>
      );
    }

    if (stageName === "conscience_result") {
      const passed = data.conscience_passed as boolean;
      const epistemicData = (data.epistemic_data || {}) as Record<string, unknown>;
      return (
        <div className="space-y-2">
          <div
            className={`inline-block px-2 py-1 rounded font-bold ${
              passed ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
            }`}
          >
            {passed ? "PASSED" : "FAILED"}
          </div>
          {Object.keys(epistemicData).length > 0 && (
            <div className="grid grid-cols-2 gap-1 text-xs">
              {Object.entries(epistemicData).map(([key, value]) => (
                <div key={key} className="flex justify-between">
                  <span className="text-gray-500">{key}:</span>
                  <span className="font-mono">{String(value)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }

    if (stageName === "action_result") {
      const action = getActionLabel(data.action_executed as string);
      const success = data.execution_success as boolean;
      return (
        <div className="space-y-2">
          <div
            className={`inline-block px-2 py-1 rounded font-bold ${
              success ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
            }`}
          >
            {action} {success ? "✓" : "✗"}
          </div>
          {typeof data.tokens_total === "number" && (
            <div className="text-xs text-gray-500">
              Tokens: {data.tokens_total.toLocaleString()}
            </div>
          )}
        </div>
      );
    }

    // Default: show key fields
    const keyFields = ["task_description", "thought_content", "context"];
    const displayFields = keyFields.filter(k => data[k]);

    return (
      <div className="space-y-1 text-sm">
        {displayFields.map(field => (
          <div key={field}>
            <span className="text-gray-500 text-xs">{field}: </span>
            <span className="text-gray-700">
              {String(data[field]).length > 100
                ? String(data[field]).slice(0, 100) + "..."
                : String(data[field])}
            </span>
          </div>
        ))}
        {displayFields.length === 0 && (
          <span className="text-gray-400 text-xs">Stage completed</span>
        )}
      </div>
    );
  };

  // Render task card
  const renderTaskCard = (task: TrackedTask) => {
    return (
      <details className="mt-2 border rounded-lg overflow-hidden" open={!task.completed}>
        <summary className="cursor-pointer px-3 py-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white text-sm font-medium flex items-center justify-between">
          <span className="flex items-center gap-2">
            <span
              className={`w-2 h-2 rounded-full ${task.completed ? "bg-green-300" : "bg-yellow-300 animate-pulse"}`}
            />
            <span>{task.description || `Task ${task.taskId.slice(-8)}`}</span>
          </span>
          <span className="text-xs opacity-75">{task.thoughts.length} thought(s)</span>
        </summary>
        <div className="bg-gray-50 p-2 space-y-2">
          {task.thoughts.map(thought => {
            const thoughtStart = thought.stages.get("thought_start");
            const content = (thoughtStart?.data?.thought_content || "") as string;
            const preview = content.length > 60 ? content.slice(0, 60) + "..." : content;

            return (
              <details key={thought.thoughtId} className="border rounded bg-white">
                <summary className="cursor-pointer px-3 py-2 text-sm">
                  <div className="inline-flex flex-col gap-1 w-full">
                    {preview && <span className="text-gray-700">{preview}</span>}
                    {renderThoughtProgress(thought)}
                  </div>
                </summary>
                <div className="px-3 py-2 border-t bg-gray-50 space-y-2">
                  {STAGE_NAMES.map(stageName => {
                    const stage = thought.stages.get(stageName);
                    const info = STAGE_INFO[stageName];

                    if (!stage) {
                      return (
                        <div
                          key={stageName}
                          className="flex items-center gap-2 py-1 text-gray-400 text-xs"
                        >
                          <span className="w-5 text-center">{info.short}</span>
                          <span>{info.label}</span>
                        </div>
                      );
                    }

                    return (
                      <details key={stageName} className="border-l-2 border-green-500 pl-2">
                        <summary className="cursor-pointer flex items-center gap-2 py-1 text-sm">
                          <span className="w-5 text-center font-bold text-green-600">
                            {info.short}
                          </span>
                          <span className="font-medium">{info.label}</span>
                          <span className="text-green-500 text-xs">✓</span>
                        </summary>
                        <div className="pl-7 py-2 text-sm">
                          {renderStageDetails(stageName, stage)}
                        </div>
                      </details>
                    );
                  })}
                </div>
              </details>
            );
          })}
        </div>
      </details>
    );
  };

  return (
    <ProtectedRoute>
      <div className="max-w-2xl mx-auto px-4 py-4">
        {/* Header with status */}
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-lg font-bold">CIRIS Chat</h1>
          <div className="flex items-center gap-2 text-xs">
            <span
              className={`flex items-center gap-1 ${sseConnected ? "text-green-600" : "text-red-500"}`}
            >
              <span
                className={`w-2 h-2 rounded-full ${sseConnected ? "bg-green-500" : "bg-red-500"}`}
              />
              {sseConnected ? "Live" : "Offline"}
            </span>
          </div>
        </div>

        {/* Messages container */}
        <div className="border rounded-lg bg-white shadow-sm h-[calc(100vh-200px)] overflow-y-auto p-4 mb-4">
          {isLoading ? (
            <div className="text-center text-gray-500 py-8">Loading...</div>
          ) : messages.length === 0 ? (
            <div className="text-center text-gray-500 py-8">
              <p className="mb-2">No messages yet.</p>
              <p className="text-sm">Ask a question about CIRIS or an ethical dilemma!</p>
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((msg, i) => {
                const relatedTask = !msg.is_agent && msg.id ? getRelatedTask(msg.id) : undefined;

                return (
                  <div key={msg.id || i}>
                    {/* Message bubble */}
                    <div className={msg.is_agent ? "text-left" : "text-right"}>
                      <div
                        className={`inline-block px-4 py-2 rounded-2xl max-w-[85%] ${
                          msg.is_agent
                            ? "bg-gray-100 text-gray-900 rounded-tl-sm"
                            : "bg-blue-500 text-white rounded-tr-sm"
                        }`}
                      >
                        {msg.content}
                      </div>
                      <div className="text-xs text-gray-400 mt-1">
                        {new Date(msg.timestamp).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </div>
                    </div>

                    {/* Related task (only for user messages) */}
                    {relatedTask && renderTaskCard(relatedTask)}
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input form */}
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            type="text"
            value={message}
            onChange={e => setMessage(e.target.value)}
            placeholder="Ask something..."
            className="flex-1 px-4 py-3 border rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            disabled={sendMessageMutation.isPending}
          />
          <button
            type="submit"
            disabled={sendMessageMutation.isPending || !message.trim()}
            className="px-6 py-3 bg-blue-600 text-white rounded-full hover:bg-blue-700 disabled:opacity-50 font-medium"
          >
            {sendMessageMutation.isPending ? "..." : "Send"}
          </button>
        </form>
      </div>
    </ProtectedRoute>
  );
}
