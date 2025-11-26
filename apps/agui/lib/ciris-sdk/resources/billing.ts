// CIRIS TypeScript SDK - Billing Resource

import { BaseResource } from "./base";

export interface CreditStatus {
  has_credit: boolean;
  credits_remaining: number;
  free_uses_remaining: number;
  total_uses: number;
  plan_name: string;
  purchase_required: boolean;
  purchase_options?: {
    price_minor: number;
    uses: number;
    currency: string;
  };
}

export interface PurchaseInitiateRequest {
  return_url?: string;
}

export interface PurchaseInitiateResponse {
  payment_id: string;
  client_secret: string;
  amount_minor: number;
  currency: string;
  uses_purchased: number;
  publishable_key: string;
}

export type PaymentStatus =
  | "succeeded" // Payment complete, credits added
  | "processing" // Payment being processed
  | "pending" // Awaiting payment confirmation
  | "requires_payment_method" // Payment method required
  | "requires_confirmation" // Requires confirmation
  | "requires_action" // User action required (3D Secure)
  | "failed" // Payment failed
  | "canceled" // Payment canceled
  | "unknown"; // Status unknown

export interface PurchaseStatusResponse {
  status: PaymentStatus;
  credits_added: number;
  balance_after: number;
}

export interface Transaction {
  transaction_id: string;
  type: "charge" | "credit";
  amount_minor: number;
  currency: string;
  description: string;
  created_at: string;
  balance_after: number;
  metadata?: {
    agent_id?: string;
    channel?: string;
    thought_id?: string;
    [key: string]: any;
  };
  transaction_type?: string;
  external_transaction_id?: string;
}

export interface TransactionListResponse {
  transactions: Transaction[];
  total_count: number;
  has_more: boolean;
}

export interface GetTransactionsRequest {
  limit?: number;
  offset?: number;
}

export class BillingResource extends BaseResource {
  /**
   * Get current user's credit status
   * @returns Credit status information
   */
  async getCredits(): Promise<CreditStatus> {
    return this.transport.get<CreditStatus>("/v1/api/billing/credits");
  }

  /**
   * Initiate a purchase flow and get Stripe payment intent
   * @param request Optional return URL for redirect flow
   * @returns Payment information including client secret
   */
  async initiatePurchase(request?: PurchaseInitiateRequest): Promise<PurchaseInitiateResponse> {
    return this.transport.post<PurchaseInitiateResponse>(
      "/v1/api/billing/purchase/initiate",
      request || {}
    );
  }

  /**
   * Check the status of a payment
   * @param paymentId The payment ID to check
   * @returns Payment status and credit information
   */
  async getPurchaseStatus(paymentId: string): Promise<PurchaseStatusResponse> {
    return this.transport.get<PurchaseStatusResponse>(
      `/v1/api/billing/purchase/status/${paymentId}`
    );
  }

  /**
   * Get transaction history for the current user
   * @param request Optional limit and offset for pagination
   * @returns List of transactions with pagination info
   */
  async getTransactions(request?: GetTransactionsRequest): Promise<TransactionListResponse> {
    const params = new URLSearchParams();
    if (request?.limit) params.append("limit", request.limit.toString());
    if (request?.offset) params.append("offset", request.offset.toString());

    const queryString = params.toString();
    const url = `/v1/api/billing/transactions${queryString ? `?${queryString}` : ""}`;

    return this.transport.get<TransactionListResponse>(url);
  }
}
