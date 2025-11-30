"use client";

import { useAgent } from "@/contexts/AgentContextHybrid";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusDot } from "@/components/Icons";

export default function AgentsPage() {
  const { currentAgent } = useAgent();

  return (
    <ProtectedRoute>
      <div className="p-6">
        <h1 className="text-3xl font-bold mb-6">Agent</h1>

        {currentAgent ? (
          <Card className="border-primary">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>{currentAgent.agent_name}</CardTitle>
                <StatusDot status={currentAgent.health === "healthy" ? "green" : "yellow"} />
              </div>
              <CardDescription>
                Agent ID: {currentAgent.agent_id} | Status: {currentAgent.status}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">API URL: {currentAgent.api_endpoint}</p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="text-center py-8">
              <p className="text-muted-foreground">No agent connected</p>
            </CardContent>
          </Card>
        )}
      </div>
    </ProtectedRoute>
  );
}
