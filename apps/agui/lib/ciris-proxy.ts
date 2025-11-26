/**
 * CIRIS Proxy Client for llm.ciris.ai
 *
 * Uses Google OAuth for authentication with format:
 * Authorization: Bearer google:{google_user_id}
 *
 * Billing is per interaction_id - multiple LLM calls with the same
 * interaction_id are billed as a single interaction.
 */

const PROXY_BASE_URL = 'https://llm.ciris.ai';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatRequest {
  model?: string;
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
  metadata?: {
    interaction_id: string;
    [key: string]: any;
  };
}

export interface ChatChoice {
  index: number;
  message: ChatMessage;
  finish_reason: string;
}

export interface ChatResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: ChatChoice[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface StreamChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: {
    index: number;
    delta: {
      role?: string;
      content?: string;
    };
    finish_reason: string | null;
  }[];
}

/**
 * Generate a unique interaction ID for billing
 * Multiple LLM calls with the same ID = 1 credit
 */
export function generateInteractionId(): string {
  return `int_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * CIRIS Proxy Client
 */
export class CIRISProxyClient {
  private googleUserId: string;
  private baseUrl: string;

  constructor(googleUserId: string, baseUrl: string = PROXY_BASE_URL) {
    this.googleUserId = googleUserId;
    this.baseUrl = baseUrl;
  }

  private getAuthHeader(): string {
    return `Bearer google:${this.googleUserId}`;
  }

  /**
   * Send a chat completion request
   */
  async chat(request: ChatRequest): Promise<ChatResponse> {
    // Ensure interaction_id is set for billing
    if (!request.metadata?.interaction_id) {
      request.metadata = {
        ...request.metadata,
        interaction_id: generateInteractionId(),
      };
    }

    const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': this.getAuthHeader(),
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`CIRIS Proxy error: ${response.status} - ${error}`);
    }

    return response.json();
  }

  /**
   * Send a streaming chat completion request
   */
  async *chatStream(request: ChatRequest): AsyncGenerator<StreamChunk> {
    // Ensure interaction_id is set for billing
    if (!request.metadata?.interaction_id) {
      request.metadata = {
        ...request.metadata,
        interaction_id: generateInteractionId(),
      };
    }

    const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': this.getAuthHeader(),
      },
      body: JSON.stringify({
        ...request,
        stream: true,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`CIRIS Proxy error: ${response.status} - ${error}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();
          if (data === '[DONE]') return;
          try {
            const chunk = JSON.parse(data) as StreamChunk;
            yield chunk;
          } catch {
            // Skip invalid JSON
          }
        }
      }
    }
  }

  /**
   * Get available models
   */
  async listModels(): Promise<string[]> {
    const response = await fetch(`${this.baseUrl}/v1/models`, {
      headers: {
        'Authorization': this.getAuthHeader(),
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to list models: ${response.status}`);
    }

    const data = await response.json();
    return data.data?.map((m: any) => m.id) || [];
  }

  /**
   * Check user credit balance
   */
  async getCredits(): Promise<{ credits: number; used: number }> {
    const response = await fetch(`${this.baseUrl}/v1/credits`, {
      headers: {
        'Authorization': this.getAuthHeader(),
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to get credits: ${response.status}`);
    }

    return response.json();
  }
}

/**
 * Hook-compatible factory function
 */
export function createProxyClient(googleUserId: string): CIRISProxyClient {
  return new CIRISProxyClient(googleUserId);
}
