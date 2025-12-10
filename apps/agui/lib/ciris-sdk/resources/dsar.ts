// CIRIS TypeScript SDK - DSAR (Data Subject Access Request) Resource

import { BaseResource } from "./base";

export interface DSARRequest {
  request_type: "access" | "delete" | "export" | "correct";
  email: string;
  user_identifier?: string;
  details?: string;
  urgent?: boolean;
}

export interface DSARResponse {
  ticket_id: string;
  status: string;
  estimated_completion: string;
  contact_email: string;
  message: string;
}

export interface DSARTicket {
  ticket_id: string;
  request_type: string;
  email: string;
  user_identifier?: string;
  details?: string;
  urgent: boolean;
  status: string;
  created_at: string;
  estimated_completion: string;
  completed_at?: string;
  response?: string;
}

export class DSARResource extends BaseResource {
  /**
   * Submit a Data Subject Access Request
   * Public endpoint - no authentication required
   */
  async submitRequest(data: DSARRequest): Promise<DSARResponse> {
    return this.transport.post<DSARResponse>("/v1/dsar/", data, { skipAuth: true });
  }

  /**
   * Check status of a DSAR request
   * Public endpoint - requires ticket ID
   */
  async checkStatus(ticketId: string): Promise<DSARTicket> {
    return this.transport.get<DSARTicket>(`/v1/dsar/${ticketId}`, { skipAuth: true });
  }

  /**
   * List all DSAR requests (admin only)
   * Requires: ADMIN+ permissions
   */
  async listRequests(): Promise<DSARTicket[]> {
    console.log("[DSAR SDK] Fetching DSAR requests...");
    const response = await this.transport.get<
      { requests: DSARTicket[]; total: number } | DSARTicket[]
    >("/v1/dsar/");
    console.log("[DSAR SDK] Raw response:", JSON.stringify(response).substring(0, 200));

    // Handle both wrapped and unwrapped response formats
    if (response && typeof response === "object" && "requests" in response) {
      console.log("[DSAR SDK] Extracted requests array, count:", response.requests?.length ?? 0);
      return response.requests || [];
    }

    // If it's already an array, return it
    if (Array.isArray(response)) {
      console.log("[DSAR SDK] Response is array, count:", response.length);
      return response;
    }

    console.warn("[DSAR SDK] Unexpected response format, returning empty array:", typeof response);
    return [];
  }

  /**
   * Update DSAR request status (admin only)
   * Requires: ADMIN+ permissions
   */
  async updateRequest(ticketId: string, status: string, response?: string): Promise<DSARTicket> {
    return this.transport.put<DSARTicket>(`/v1/dsar/${ticketId}/status`, {
      new_status: status,
      notes: response,
    });
  }
}
