/**
 * Consent Management Resource
 * Implements Consensual Evolution Protocol v0.2
 */

import { BaseResource } from "./base";

// Consent stream types
export enum ConsentStream {
  TEMPORARY = "temporary",
  PARTNERED = "partnered",
  ANONYMOUS = "anonymous",
}

// Consent categories for PARTNERED stream
export enum ConsentCategory {
  INTERACTION = "interaction",
  PREFERENCE = "preference",
  IMPROVEMENT = "improvement",
  RESEARCH = "research",
  SHARING = "sharing",
}

// Consent status response
export interface ConsentStatus {
  user_id: string;
  stream: ConsentStream;
  categories: ConsentCategory[];
  granted_at: string;
  expires_at?: string;
  last_modified: string;
  impact_score: number;
  attribution_count: number;
}

// Consent grant request
export interface ConsentRequest {
  user_id: string; // Required - must be the authenticated user's ID
  stream: ConsentStream;
  categories: ConsentCategory[];
  reason?: string;
}

// Consent audit entry
export interface ConsentAuditEntry {
  entry_id: string;
  user_id: string;
  timestamp: string;
  previous_stream: ConsentStream;
  new_stream: ConsentStream;
  previous_categories: ConsentCategory[];
  new_categories: ConsentCategory[];
  initiated_by: string;
  reason?: string;
}

// Consent decay status
export interface ConsentDecayStatus {
  user_id: string;
  decay_started: string;
  identity_severed: boolean;
  patterns_anonymized: boolean;
  decay_complete_at: string;
  safety_patterns_retained: number;
}

// Consent impact report
export interface ConsentImpactReport {
  user_id: string;
  total_interactions: number;
  patterns_contributed: number;
  users_helped: number;
  categories_active: ConsentCategory[];
  impact_score: number;
  example_contributions: string[];
}

// Stream description
export interface ConsentStreamInfo {
  name: string;
  description: string;
  duration_days?: number;
  auto_forget: boolean;
  learning_enabled: boolean;
  identity_removed?: boolean;
  requires_categories?: boolean;
}

// Category description
export interface ConsentCategoryInfo {
  name: string;
  description: string;
}

// Partnership status response
export interface PartnershipStatus {
  current_stream: ConsentStream;
  partnership_status: "pending" | "accepted" | "rejected" | "deferred" | "none";
  message: string;
}

// Streams response
export interface ConsentStreamsResponse {
  streams: Record<string, ConsentStreamInfo>;
  default: ConsentStream;
}

// Categories response
export interface ConsentCategoriesResponse {
  categories: Record<string, ConsentCategoryInfo>;
}

// DSAR Export types
export interface DSARExportRequest {
  request_type: "full" | "consent_only" | "impact_only" | "audit_only";
}

export interface DSARExportResponse {
  request_id: string;
  user_id: string;
  request_type: string;
  status: "completed";
  export_data: {
    consent?: ConsentStatus;
    impact?: ConsentImpactReport;
    audit_trail?: ConsentAuditEntry[];
  };
}

export interface DSARStatusResponse {
  request_id: string;
  user_id: string;
  status: "completed";
  message: string;
}

/**
 * Consent Management Resource
 *
 * Handles user consent for data processing and retention.
 * Implements three-stream model: TEMPORARY, PARTNERED, ANONYMOUS.
 *
 * @example
 * ```typescript
 * // Get current consent status
 * const status = await client.consent.getStatus();
 *
 * // Request partnership
 * const result = await client.consent.grantConsent({
 *   stream: ConsentStream.PARTNERED,
 *   categories: [ConsentCategory.INTERACTION, ConsentCategory.PREFERENCE],
 *   reason: "I want to help improve the system"
 * });
 *
 * // Check partnership status
 * const partnership = await client.consent.getPartnershipStatus();
 *
 * // Get impact report
 * const impact = await client.consent.getImpactReport();
 * ```
 */
export class ConsentResource extends BaseResource {
  /**
   * Get current consent status for authenticated user
   *
   * Returns default TEMPORARY (14-day) consent if none exists.
   *
   * @returns Current consent status
   * @throws {Error} If not authenticated
   */
  async getStatus(): Promise<ConsentStatus> {
    return this.transport.get<ConsentStatus>("/v1/consent/status");
  }

  /**
   * Grant or update consent
   *
   * Streams:
   * - TEMPORARY: 14-day auto-forget (default)
   * - PARTNERED: Explicit consent for mutual growth (requires agent approval)
   * - ANONYMOUS: Statistics only, no identity
   *
   * @param request - Consent request with stream and categories
   * @returns Updated consent status
   * @throws {Error} If validation fails or not authenticated
   */
  async grantConsent(request: Omit<ConsentRequest, "user_id">): Promise<ConsentStatus> {
    // Get the current user to include their ID
    const currentUser = await this.transport.get<any>("/v1/auth/me");

    // Add the user_id to the request
    const fullRequest: ConsentRequest = {
      ...request,
      user_id: currentUser.user_id,
    };

    return this.transport.post<ConsentStatus>("/v1/consent/grant", fullRequest);
  }

  /**
   * Revoke consent and start decay protocol
   *
   * - Immediate identity severance
   * - 90-day pattern decay
   * - Safety patterns may be retained (anonymized)
   *
   * @param reason - Optional reason for revocation
   * @returns Decay status information
   * @throws {Error} If no consent exists
   */
  async revokeConsent(reason?: string): Promise<ConsentDecayStatus> {
    return this.transport.post<ConsentDecayStatus>("/v1/consent/revoke", { reason });
  }

  /**
   * Get impact report showing contribution to collective learning
   *
   * Only available for PARTNERED and ANONYMOUS users.
   *
   * Shows:
   * - Patterns contributed
   * - Users helped
   * - Impact score
   * - Example contributions (anonymized)
   *
   * @returns Impact report with metrics
   * @throws {Error} If no consent data found
   */
  async getImpactReport(): Promise<ConsentImpactReport> {
    return this.transport.get<ConsentImpactReport>("/v1/consent/impact");
  }

  /**
   * Get consent change history - IMMUTABLE AUDIT TRAIL
   *
   * @param limit - Maximum number of entries to return (default: 100)
   * @returns List of audit entries
   */
  async getAuditTrail(limit: number = 100): Promise<ConsentAuditEntry[]> {
    return this.transport.get<ConsentAuditEntry[]>(`/v1/consent/audit?limit=${limit}`);
  }

  /**
   * Get available consent streams and their descriptions
   *
   * @returns Stream information and default stream
   */
  async getStreams(): Promise<ConsentStreamsResponse> {
    return this.transport.get<ConsentStreamsResponse>("/v1/consent/streams");
  }

  /**
   * Get available consent categories for PARTNERED stream
   *
   * @returns Category information
   */
  async getCategories(): Promise<ConsentCategoriesResponse> {
    return this.transport.get<ConsentCategoriesResponse>("/v1/consent/categories");
  }

  /**
   * Check status of pending partnership request
   *
   * Returns current status and any pending partnership request outcome.
   * Poll this endpoint when partnership_status is "pending".
   *
   * @returns Partnership status information
   */
  async getPartnershipStatus(): Promise<PartnershipStatus> {
    return this.transport.get<PartnershipStatus>("/v1/consent/partnership/status");
  }

  /**
   * Clean up expired TEMPORARY consents (admin only)
   *
   * HARD DELETE after 14 days - NO GRACE PERIOD.
   *
   * @returns Number of cleaned records
   * @throws {Error} If not admin
   */
  async cleanupExpired(): Promise<{ cleaned: number; message: string }> {
    return this.transport.post<{ cleaned: number; message: string }>("/v1/consent/cleanup", {});
  }

  /**
   * Helper: Request partnership with selected categories
   *
   * @param categories - Categories to consent to
   * @param reason - Reason for partnership request
   * @returns Consent status (will still be current stream until approved)
   */
  async requestPartnership(categories: ConsentCategory[], reason?: string): Promise<ConsentStatus> {
    return this.grantConsent({
      stream: ConsentStream.PARTNERED,
      categories,
      reason: reason || "User requested partnership upgrade",
    });
  }

  /**
   * Helper: Switch to TEMPORARY consent
   *
   * @returns Updated consent status
   */
  async switchToTemporary(): Promise<ConsentStatus> {
    return this.grantConsent({
      stream: ConsentStream.TEMPORARY,
      categories: [],
      reason: "User switched to temporary consent",
    });
  }

  /**
   * Helper: Switch to ANONYMOUS consent
   *
   * @returns Updated consent status
   */
  async switchToAnonymous(): Promise<ConsentStatus> {
    return this.grantConsent({
      stream: ConsentStream.ANONYMOUS,
      categories: [],
      reason: "User switched to anonymous consent",
    });
  }

  /**
   * Helper: Check if user has active partnership
   *
   * @returns True if user has PARTNERED consent
   */
  async hasPartnership(): Promise<boolean> {
    const status = await this.getStatus();
    return status.stream === ConsentStream.PARTNERED;
  }

  /**
   * Helper: Get remaining time for TEMPORARY consent
   *
   * @returns Remaining time in milliseconds, or null if not TEMPORARY
   */
  async getTimeRemaining(): Promise<number | null> {
    const status = await this.getStatus();
    if (status.stream !== ConsentStream.TEMPORARY || !status.expires_at) {
      return null;
    }

    const expiresAt = new Date(status.expires_at).getTime();
    const now = Date.now();
    return Math.max(0, expiresAt - now);
  }

  /**
   * Helper: Poll for partnership decision
   *
   * Polls every 5 seconds until partnership is accepted/rejected.
   *
   * @param onStatusChange - Callback for status changes
   * @param maxAttempts - Maximum polling attempts (default: 60 = 5 minutes)
   * @returns Final partnership status
   */
  async pollPartnershipStatus(
    onStatusChange?: (status: PartnershipStatus) => void,
    maxAttempts: number = 60
  ): Promise<PartnershipStatus> {
    let attempts = 0;

    while (attempts < maxAttempts) {
      const status = await this.getPartnershipStatus();

      if (onStatusChange) {
        onStatusChange(status);
      }

      if (status.partnership_status !== "pending") {
        return status;
      }

      // Wait 5 seconds before next poll
      await new Promise(resolve => setTimeout(resolve, 5000));
      attempts++;
    }

    // Return final status after max attempts
    return this.getPartnershipStatus();
  }

  /**
   * Initiate DSAR export for consent data
   *
   * Immediately returns complete export data including consent status,
   * impact metrics, and audit trail based on request type.
   *
   * @param requestType - Type of export: full, consent_only, impact_only, or audit_only
   * @returns Complete export data with request ID
   */
  async initiateDSARExport(requestType: string = "full"): Promise<DSARExportResponse> {
    return this.transport.post<DSARExportResponse>("/v1/consent/dsar/initiate", {
      request_type: requestType,
    });
  }

  /**
   * Check status of DSAR export request
   *
   * @param requestId - DSAR request ID from initiate call
   * @returns Status information
   */
  async getDSARStatus(requestId: string): Promise<DSARStatusResponse> {
    return this.transport.get<DSARStatusResponse>(`/v1/consent/dsar/status/${requestId}`);
  }

  /**
   * Helper: Download consent data as JSON file
   *
   * Initiates export and automatically downloads the data as a JSON file.
   *
   * @param requestType - Type of export (default: full)
   * @returns Request ID of completed export
   */
  async downloadConsentData(requestType: string = "full"): Promise<string> {
    const response = await this.initiateDSARExport(requestType);

    // Create and download JSON file
    const blob = new Blob([JSON.stringify(response.export_data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ciris-consent-export-${response.request_id}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    return response.request_id;
  }
}
