"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { cirisClient } from "../../lib/ciris-sdk";
import type {
  LLMProvider,
  AgentTemplate,
  SetupCompleteRequest,
} from "../../lib/ciris-sdk/resources/setup";
import LogoIcon from "../../components/ui/floating/LogoIcon";
import toast from "react-hot-toast";

// Simplified wizard for Android: no template selection (force ally), auto-generate admin password for OAuth
type Step = "welcome" | "llm" | "users" | "complete";

export default function SetupWizard() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState<Step>("welcome");
  const [providers, setProviders] = useState<LLMProvider[]>([]);
  const [templates, setTemplates] = useState<AgentTemplate[]>([]);
  const [loading, setLoading] = useState(false);

  // Native app mode detection
  const [isNativeApp, setIsNativeApp] = useState(false);
  const [isGoogleAuth, setIsGoogleAuth] = useState(false); // Separate from LLM choice
  const [llmChoice, setLlmChoice] = useState<"ciris_key" | "byok" | null>(null);

  // Form state - Primary LLM
  const [selectedProvider, setSelectedProvider] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [selectedModel, setSelectedModel] = useState("");
  const [apiBase, setApiBase] = useState("");
  const [validatingLLM, setValidatingLLM] = useState(false);
  const [llmValid, setLlmValid] = useState(false);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [userPasswordError, setUserPasswordError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Check if user is logged in with Google (affects user account requirements, NOT LLM choice)
  // Google users don't need a local account, but can still choose BYOK for LLM
  const showLocalUserFields = !isGoogleAuth;

  // Check if using CIRIS proxy (affects LLM configuration)
  const useCirisProxy = llmChoice === "ciris_key";

  // Force "ally" template for Android app - no user selection
  const selectedTemplate = "ally";

  // Helper to read native app state from localStorage
  const readNativeAppState = () => {
    const nativeApp = localStorage.getItem("isNativeApp") === "true";
    const authMethod = localStorage.getItem("ciris_auth_method");
    const savedLlmChoice = localStorage.getItem("ciris_llm_choice") as "ciris_key" | "byok" | null;

    console.log(
      "[Setup] Reading native state - isNativeApp:",
      nativeApp,
      "authMethod:",
      authMethod,
      "savedLlmChoice:",
      savedLlmChoice
    );

    setIsNativeApp(nativeApp);

    // Detect Google auth (separate from LLM choice)
    if (authMethod === "google") {
      console.log("[Setup] Google auth detected - user can choose CIRIS Key or BYOK");
      setIsGoogleAuth(true);
    } else if (authMethod) {
      console.log("[Setup] Non-Google auth:", authMethod, "- user must use BYOK");
      setIsGoogleAuth(false);
      setLlmChoice("byok");
    }

    // Restore saved LLM choice if available
    if (savedLlmChoice) {
      setLlmChoice(savedLlmChoice);
    }
  };

  // Load providers and templates
  useEffect(() => {
    // Clear redirect lock and event handler flags - we successfully landed on setup page
    sessionStorage.removeItem("ciris_redirect_in_progress");
    sessionStorage.removeItem("ciris_native_auth_event_handled");
    console.log("[Setup] Cleared redirect lock and event flag - successfully on setup page");

    loadProvidersAndTemplates();

    // Read initial native app state
    readNativeAppState();

    // Listen for native auth injection (happens AFTER page load in WebView)
    // This handles the race condition where useEffect runs before native injection
    const handleNativeAuthReady = () => {
      console.log("[Setup] Native auth ready event received - re-reading state");
      readNativeAppState();
    };
    window.addEventListener("ciris_native_auth_ready", handleNativeAuthReady);

    return () => {
      window.removeEventListener("ciris_native_auth_ready", handleNativeAuthReady);
    };
  }, []);

  const loadProvidersAndTemplates = async () => {
    try {
      const [providersRes, templatesRes] = await Promise.all([
        cirisClient.setup.getProviders(),
        cirisClient.setup.getTemplates(),
      ]);
      setProviders(providersRes);
      setTemplates(templatesRes);
      if (providersRes.length > 0) {
        setSelectedProvider(providersRes[0].id);
      }
    } catch (error) {
      console.error("Failed to load setup data:", error);
      toast.error("Failed to load setup data");
    }
  };

  const validateLLM = async () => {
    if (!selectedProvider) {
      toast.error("Please select a provider");
      return;
    }

    const currentProvider = providers.find(p => p.id === selectedProvider);
    if (currentProvider?.requires_api_key && !apiKey) {
      toast.error("API key is required for this provider");
      return;
    }
    if (currentProvider?.requires_base_url && !apiBase) {
      toast.error("Base URL is required for this provider");
      return;
    }
    if (currentProvider?.requires_model && !selectedModel) {
      toast.error("Model name is required for this provider");
      return;
    }

    setValidatingLLM(true);
    try {
      const response = await cirisClient.setup.validateLLM({
        provider: selectedProvider,
        api_key: apiKey,
        base_url: apiBase || null,
        model: selectedModel || null,
      });

      if (response.valid) {
        setLlmValid(true);
        toast.success(response.message || "LLM configuration validated!");
      } else {
        setLlmValid(false);
        toast.error(response.error || "LLM validation failed");
      }
    } catch (error: any) {
      setLlmValid(false);
      toast.error(error.message || "Failed to validate LLM");
    } finally {
      setValidatingLLM(false);
    }
  };

  const completeSetup = async () => {
    // Comprehensive debug logging
    console.log("[Setup] ========== completeSetup called ==========");
    console.log("[Setup] State values:");
    console.log("[Setup]   llmChoice:", llmChoice);
    console.log("[Setup]   useCirisProxy:", useCirisProxy, '(llmChoice === "ciris_key")');
    console.log("[Setup]   isGoogleAuth:", isGoogleAuth);
    console.log("[Setup]   isNativeApp:", isNativeApp);
    console.log("[Setup]   selectedProvider:", selectedProvider);
    console.log("[Setup]   apiKey:", apiKey ? `${apiKey.substring(0, 10)}...` : "(empty)");
    console.log("[Setup]   apiBase:", apiBase);
    console.log("[Setup]   selectedModel:", selectedModel);
    console.log("[Setup] localStorage values:");
    console.log("[Setup]   ciris_google_user_id:", localStorage.getItem("ciris_google_user_id"));
    console.log("[Setup]   ciris_auth_method:", localStorage.getItem("ciris_auth_method"));
    console.log("[Setup]   ciris_llm_choice:", localStorage.getItem("ciris_llm_choice"));
    console.log("[Setup]   isNativeApp:", localStorage.getItem("isNativeApp"));

    // Admin password is always auto-generated - no validation needed
    // Only validate user passwords if showing local user fields
    if (showLocalUserFields && password !== passwordConfirm) {
      toast.error("User passwords do not match");
      return;
    }
    // Skip LLM validation check for CIRIS Key mode (uses proxy)
    if (!llmValid && !useCirisProxy) {
      toast.error("Please validate your LLM configuration first");
      return;
    }

    // Always generate random admin password (users don't need to enter it)
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*";
    let finalAdminPassword = "";
    for (let i = 0; i < 32; i++) {
      finalAdminPassword += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    console.log("[Setup] Auto-generated secure random admin password");

    setLoading(true);
    try {
      // For CIRIS proxy mode (CIRIS Key), use the actual Google ID Token (JWT)
      // The CIRIS LLM proxy at llm.ciris.ai verifies the JWT with Google's public keys
      const googleIdToken = localStorage.getItem("ciris_google_id_token") || "";
      const googleUserId = localStorage.getItem("ciris_google_user_id") || "";

      console.log("[Setup] CIRIS proxy config:");
      console.log("[Setup]   googleUserId:", googleUserId);
      console.log("[Setup]   googleIdToken length:", googleIdToken.length);
      console.log("[Setup]   googleIdToken prefix:", googleIdToken.substring(0, 20) + "...");

      if (useCirisProxy && !googleIdToken) {
        console.error(
          "[Setup] CIRIS proxy requires Google ID Token but none found in localStorage"
        );
        toast.error("Google ID Token not found. Please sign out and sign in again with Google.");
        setLoading(false);
        return;
      }

      // Determine final values based on mode
      // IMPORTANT: Use "other" provider when using CIRIS proxy so backend writes OPENAI_API_BASE to .env
      // If we use "openai", the backend only writes the API key and comments out the base URL
      const finalProvider = useCirisProxy ? "other" : selectedProvider;
      const finalApiKey = useCirisProxy ? googleIdToken : apiKey; // Use actual JWT, not google:{userId}
      const finalBaseUrl = useCirisProxy ? "https://llm.ciris.ai/v1" : apiBase || null;
      const finalModel = useCirisProxy ? "default" : selectedModel || null;

      console.log("[Setup] Final config to send:");
      console.log("[Setup]   llm_provider:", finalProvider);
      console.log(
        "[Setup]   llm_api_key:",
        finalApiKey ? `${finalApiKey.substring(0, 15)}...` : "(empty)"
      );
      console.log("[Setup]   llm_base_url:", finalBaseUrl);
      console.log("[Setup]   llm_model:", finalModel);

      // Get auth method and OAuth details from localStorage
      const authMethod = localStorage.getItem("ciris_auth_method");
      const oauthProvider = authMethod === "google" ? "google" : null;
      const oauthExternalId = localStorage.getItem("ciris_google_user_id") || null;
      const oauthEmail = localStorage.getItem("ciris_google_email") || null;

      console.log("[Setup] OAuth details:");
      console.log("[Setup]   oauthProvider:", oauthProvider);
      console.log("[Setup]   oauthExternalId:", oauthExternalId);
      console.log("[Setup]   oauthEmail:", oauthEmail);

      const config: SetupCompleteRequest = {
        llm_provider: finalProvider,
        llm_api_key: finalApiKey,
        llm_base_url: finalBaseUrl,
        llm_model: finalModel,
        // Backup LLM (not configured in simplified setup)
        backup_llm_api_key: null,
        backup_llm_base_url: null,
        backup_llm_model: null,
        template_id: selectedTemplate || "general",
        enabled_adapters: ["api"], // Default to just API adapter
        adapter_config: {},
        // For OAuth users, username/password may be empty - server generates random password
        admin_username: username || (oauthProvider ? `oauth_${oauthProvider}_user` : "admin"),
        admin_password: password || null, // Optional for OAuth users
        system_admin_password: finalAdminPassword || null, // Update default admin password (auto-generated for OAuth)
        oauth_provider: oauthProvider, // Tell server this is an OAuth user
        oauth_external_id: oauthExternalId, // Google user ID for OAuth linking
        oauth_email: oauthEmail, // OAuth user email
        agent_port: 8080,
      };

      const response = await cirisClient.setup.complete(config);
      console.log("[Setup] Setup API response:", JSON.stringify(response));

      // Save the selected agent template name for AgentContext to use
      // This is used as a fallback when the /v1/agent/identity endpoint isn't available yet
      const selectedTemplateObj = templates.find(t => t.id === selectedTemplate);
      if (selectedTemplateObj) {
        // Use the template name as the agent name (e.g., "Ally", "Datum", etc.)
        localStorage.setItem("selectedAgentName", selectedTemplateObj.name);
        localStorage.setItem("selectedAgentId", selectedTemplateObj.id);
        console.log(
          "[Setup] Saved agent selection:",
          selectedTemplateObj.name,
          "(",
          selectedTemplateObj.id,
          ")"
        );
      }

      // CRITICAL: Clear the setup flag to prevent redirect loop
      console.log(
        "[Setup] BEFORE clearing - ciris_show_setup was:",
        localStorage.getItem("ciris_show_setup")
      );
      localStorage.setItem("ciris_show_setup", "false");
      localStorage.removeItem("ciris_native_llm_mode");
      localStorage.removeItem("ciris_llm_choice");
      console.log(
        "[Setup] AFTER clearing - ciris_show_setup is now:",
        localStorage.getItem("ciris_show_setup")
      );
      console.log("[Setup] Setup complete - transitioning to complete step");

      setCurrentStep("complete");
    } catch (error: any) {
      toast.error(error.message || "Setup failed");
    } finally {
      setLoading(false);
    }
  };

  const provider = providers.find(p => p.id === selectedProvider);

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-4xl">
        {/* Header */}
        <div className="text-center mb-8">
          <LogoIcon className="mx-auto h-16 w-auto text-brand-primary fill-brand-primary mb-4" />
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Welcome to CIRIS</h1>
        </div>

        {/* Progress indicator - simplified to 3 steps (no template selection) */}
        {currentStep !== "complete" && (
          <div className="mb-8">
            <div className="flex items-center justify-center space-x-2 sm:space-x-4">
              {["welcome", "llm", "users"].map((step, idx) => (
                <div key={step} className="flex items-center">
                  <div
                    className={`flex items-center justify-center w-8 h-8 sm:w-10 sm:h-10 rounded-full text-sm sm:text-base ${
                      currentStep === step
                        ? "bg-indigo-600 text-white"
                        : idx < ["welcome", "llm", "users"].indexOf(currentStep)
                          ? "bg-green-500 text-white"
                          : "bg-gray-200 text-gray-500"
                    }`}
                  >
                    {idx < ["welcome", "llm", "users"].indexOf(currentStep) ? "✓" : idx + 1}
                  </div>
                  {idx < 2 && (
                    <div
                      className={`w-8 sm:w-16 h-1 ${
                        idx < ["welcome", "llm", "users"].indexOf(currentStep)
                          ? "bg-green-500"
                          : "bg-gray-200"
                      }`}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Main content card */}
        <div className="bg-white rounded-xl shadow-xl p-8">
          {/* Step 1: Welcome */}
          {currentStep === "welcome" && (
            <div className="space-y-6">
              <div className="text-center">
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-green-100 text-green-800 rounded-full text-sm font-medium mb-4">
                  <span>✓</span> 100% Free & Open Source
                </div>
                <h2 className="text-2xl font-bold text-gray-900">Welcome to CIRIS</h2>
              </div>

              <div className="prose prose-indigo max-w-none">
                <p className="text-gray-700 leading-relaxed text-center">
                  CIRIS is an ethical AI assistant that runs on your device. Your conversations and
                  data stay private.
                </p>

                {isGoogleAuth ? (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-5 mt-6">
                    <div className="flex items-center gap-3 mb-3">
                      <span className="text-green-600 text-2xl">✓</span>
                      <span className="font-semibold text-green-900 text-lg">
                        You're ready to go!
                      </span>
                    </div>
                    <p className="text-sm text-green-800">
                      Since you signed in with Google, CIRIS can start working right away with free
                      AI access. Your conversations are private and never used for training.
                    </p>
                  </div>
                ) : (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-5 mt-6">
                    <h4 className="font-semibold text-blue-900 mb-2">Quick Setup Required</h4>
                    <p className="text-sm text-blue-800">
                      To power AI conversations, you'll need to connect an AI provider (like OpenAI
                      or Anthropic). This takes about 2 minutes.
                    </p>
                  </div>
                )}

                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mt-6">
                  <h4 className="font-semibold text-gray-700 mb-2 text-sm">How it works</h4>
                  <p className="text-sm text-gray-600">
                    CIRIS runs entirely on your device. However, AI reasoning requires powerful
                    servers. CIRIS connects to privacy-respecting AI providers that never train on
                    your data and never store your conversations.
                  </p>
                </div>
              </div>

              <button
                onClick={() => setCurrentStep("llm")}
                className="w-full px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium"
              >
                Continue →
              </button>
            </div>
          )}

          {/* Step 2: LLM Configuration */}
          {currentStep === "llm" && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-gray-900">AI Configuration</h2>
                <button
                  onClick={() => setCurrentStep("welcome")}
                  className="text-gray-500 hover:text-gray-700"
                >
                  ← Back
                </button>
              </div>

              {/* Google users: Simple free AI option with hidden advanced */}
              {isGoogleAuth && !showAdvanced && (
                <div className="space-y-4">
                  <div className="bg-green-50 border border-green-200 rounded-lg p-5">
                    <div className="flex items-center gap-3 mb-3">
                      <span className="text-green-600 text-2xl">✓</span>
                      <div>
                        <div className="font-semibold text-green-900">Free AI Access Ready</div>
                        <p className="text-sm text-green-700 mt-1">
                          Your Google account includes free AI conversations. Privacy-protected and
                          never used for training.
                        </p>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      // Auto-select CIRIS proxy for Google users
                      const googleUserId = localStorage.getItem("ciris_google_user_id") || "";
                      setLlmChoice("ciris_key");
                      setSelectedProvider("openai");
                      setLlmValid(true);
                      const proxyKey = googleUserId ? `google:${googleUserId}` : "";
                      setApiKey(proxyKey);
                      setApiBase("https://llm.ciris.ai/v1");
                      setSelectedModel("default");
                      localStorage.setItem("ciris_llm_choice", "ciris_key");
                      setCurrentStep("users");
                    }}
                    className="w-full px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium"
                  >
                    Continue →
                  </button>

                  <button
                    onClick={() => setShowAdvanced(true)}
                    className="w-full text-center text-sm text-gray-500 hover:text-gray-700"
                  >
                    I have my own AI provider (Advanced)
                  </button>
                </div>
              )}

              {/* Non-Google users OR advanced mode: Show provider options */}
              {(!isGoogleAuth || showAdvanced) && (
                <>
                  <p className="text-gray-600">
                    {showAdvanced
                      ? "Connect your own AI provider for unlimited conversations."
                      : "Connect an AI provider to power conversations."}
                  </p>

                  {/* Provider selection */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      AI Provider
                    </label>
                    <div className="grid grid-cols-2 gap-4">
                      {providers.map(p => (
                        <button
                          key={p.id}
                          onClick={() => {
                            setLlmChoice("byok");
                            setSelectedProvider(p.id);
                            setLlmValid(false);
                            // Reset all fields when switching providers to avoid stale state
                            setApiKey("");
                            setSelectedModel(p.default_model || "");
                            setApiBase(p.default_base_url || ""); // Clear CIRIS proxy URL
                            localStorage.setItem("ciris_llm_choice", "byok");
                          }}
                          className={`p-4 border-2 rounded-lg text-left transition-all ${
                            selectedProvider === p.id
                              ? "border-indigo-600 bg-indigo-50"
                              : "border-gray-200 hover:border-gray-300"
                          }`}
                        >
                          <div className="font-semibold text-gray-900">{p.name}</div>
                          <div className="text-xs text-gray-500 mt-1">{p.description}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* API Key - only show for BYOK providers */}
              {llmChoice === "byok" && provider && provider.requires_api_key && (
                <div>
                  <label htmlFor="apiKey" className="block text-sm font-medium text-gray-700 mb-2">
                    API Key <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="apiKey"
                    type="password"
                    value={apiKey}
                    onChange={e => {
                      setApiKey(e.target.value);
                      setLlmValid(false);
                    }}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    placeholder="sk-..."
                    required
                  />
                </div>
              )}

              {/* Model input - only show for BYOK providers */}
              {llmChoice === "byok" && provider && provider.requires_model && (
                <div>
                  <label htmlFor="model" className="block text-sm font-medium text-gray-700 mb-2">
                    Model Name {provider.requires_model && <span className="text-red-500">*</span>}
                  </label>
                  <input
                    id="model"
                    type="text"
                    value={selectedModel}
                    onChange={e => {
                      setSelectedModel(e.target.value);
                      setLlmValid(false);
                    }}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    placeholder={provider.default_model || "Enter model name"}
                  />
                  {provider.examples.length > 0 && (
                    <p className="mt-1 text-xs text-gray-500">
                      Examples: {provider.examples.slice(0, 2).join(", ")}
                    </p>
                  )}
                </div>
              )}

              {/* API Base URL - only show for BYOK providers */}
              {llmChoice === "byok" && provider && provider.requires_base_url && (
                <div>
                  <label htmlFor="apiBase" className="block text-sm font-medium text-gray-700 mb-2">
                    API Base URL{" "}
                    {provider.requires_base_url && <span className="text-red-500">*</span>}
                  </label>
                  <input
                    id="apiBase"
                    type="text"
                    value={apiBase}
                    onChange={e => {
                      setApiBase(e.target.value);
                      setLlmValid(false);
                    }}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    placeholder={provider.default_base_url || "http://localhost:11434"}
                    required={provider.requires_base_url}
                  />
                  {provider.examples.length > 0 && (
                    <p className="mt-1 text-xs text-gray-500">{provider.examples[0]}</p>
                  )}
                </div>
              )}

              {/* Validation - only show for BYOK providers */}
              {llmChoice === "byok" && (
                <div className="flex items-center space-x-4">
                  <button
                    onClick={validateLLM}
                    disabled={validatingLLM || !selectedProvider}
                    className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {validatingLLM ? "Testing..." : "Test Connection"}
                  </button>
                  {llmValid && <span className="text-green-600 font-medium">✓ Connected</span>}
                </div>
              )}

              {/* Continue button for BYOK mode */}
              {llmChoice === "byok" && (
                <button
                  onClick={() => setCurrentStep("users")}
                  disabled={!llmValid}
                  className="w-full px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
                >
                  Continue →
                </button>
              )}

              {/* Back to simple mode for Google users */}
              {showAdvanced && isGoogleAuth && (
                <button
                  onClick={() => {
                    setShowAdvanced(false);
                    setLlmChoice(null);
                    setSelectedProvider("");
                  }}
                  className="w-full text-center text-sm text-gray-500 hover:text-gray-700"
                >
                  ← Use free AI instead
                </button>
              )}
            </div>
          )}

          {/* Step 3: User & Admin Setup */}
          {currentStep === "users" && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-gray-900">
                  {isGoogleAuth ? "Confirm Setup" : "Create Your Accounts"}
                </h2>
                <button
                  onClick={() => setCurrentStep("llm")}
                  className="text-gray-500 hover:text-gray-700"
                >
                  ← Back
                </button>
              </div>

              {/* For OAuth users: auto-generate admin password and show confirmation */}
              {isGoogleAuth ? (
                <div className="space-y-4">
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-green-600 text-xl">✓</span>
                      <span className="font-semibold text-green-900">Google Account Connected</span>
                    </div>
                    <p className="text-sm text-green-800">
                      You'll sign in to CIRIS using your Google account. A secure random password
                      will be generated for the admin account (you won't need to use it).
                    </p>
                  </div>

                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <h3 className="font-semibold text-blue-900 mb-2">Setup Summary</h3>
                    <ul className="text-sm text-blue-800 space-y-1">
                      <li>
                        • <strong>AI:</strong>{" "}
                        {useCirisProxy ? "Free AI Access (via Google)" : "Your own AI provider"}
                      </li>
                      <li>
                        • <strong>Assistant:</strong> Ally
                      </li>
                      <li>
                        • <strong>Sign-in:</strong> Google Account
                      </li>
                    </ul>
                  </div>
                </div>
              ) : (
                <p className="text-gray-600">
                  Create your personal user account to access the CIRIS dashboard.
                </p>
              )}

              {/* User Account - Only shown for non-Google OAuth users */}
              {showLocalUserFields && (
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Your Account</h3>
                  <div className="space-y-4">
                    <div>
                      <label
                        htmlFor="username"
                        className="block text-sm font-medium text-gray-700 mb-2"
                      >
                        Username
                      </label>
                      <input
                        id="username"
                        type="text"
                        value={username}
                        onChange={e => setUsername(e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        placeholder="your_username"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="password"
                        className="block text-sm font-medium text-gray-700 mb-2"
                      >
                        Password <span className="text-xs text-gray-500">(min 8 characters)</span>
                      </label>
                      <input
                        id="password"
                        type="password"
                        value={password}
                        onChange={e => {
                          setPassword(e.target.value);
                          if (e.target.value.length > 0 && e.target.value.length < 8) {
                            setUserPasswordError("Password must be at least 8 characters");
                          } else {
                            setUserPasswordError(null);
                          }
                        }}
                        className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent ${
                          userPasswordError ? "border-red-500" : "border-gray-300"
                        }`}
                        placeholder="Enter your password (min 8 chars)"
                      />
                      {userPasswordError && (
                        <p className="mt-1 text-sm text-red-600">{userPasswordError}</p>
                      )}
                    </div>
                    <div>
                      <label
                        htmlFor="passwordConfirm"
                        className="block text-sm font-medium text-gray-700 mb-2"
                      >
                        Confirm Password
                      </label>
                      <input
                        id="passwordConfirm"
                        type="password"
                        value={passwordConfirm}
                        onChange={e => setPasswordConfirm(e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        placeholder="Re-enter your password"
                      />
                    </div>
                  </div>
                </div>
              )}

              <button
                onClick={completeSetup}
                disabled={
                  loading ||
                  // Only require local user account for non-Google OAuth users
                  (showLocalUserFields &&
                    (!username ||
                      !password ||
                      !passwordConfirm ||
                      password.length < 8 ||
                      password !== passwordConfirm))
                }
                className="w-full px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
              >
                {loading ? "Completing Setup..." : "Complete Setup"}
              </button>
            </div>
          )}

          {/* Step 4: Complete */}
          {currentStep === "complete" && (
            <div className="text-center space-y-6 py-8">
              <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                <span className="text-4xl">✓</span>
              </div>
              <h2 className="text-3xl font-bold text-gray-900">Setup Complete!</h2>
              <p className="text-gray-600 max-w-md mx-auto">
                {isNativeApp
                  ? "Your CIRIS instance is now configured and ready to use."
                  : "Your CIRIS instance is now configured and ready to use. You can log in with your credentials."}
              </p>
              <button
                onClick={() => {
                  // Check localStorage directly to avoid race condition with React state
                  // Native injection may have completed after React state was set
                  const actuallyNativeApp = localStorage.getItem("isNativeApp") === "true";
                  console.log(
                    "[Setup Complete] Button clicked - isNativeApp state:",
                    isNativeApp,
                    "localStorage isNativeApp:",
                    actuallyNativeApp
                  );

                  // Native app users are already authenticated, go to native InteractActivity
                  // Non-native users need to login first
                  if (actuallyNativeApp || isNativeApp) {
                    console.log(
                      "[Setup Complete] Native app mode - refreshing token for updated role"
                    );
                    // Tell the native app to refresh the token to get updated role (ADMIN after setup)
                    const win = window as unknown as {
                      CIRISNative?: { refreshToken?: () => void; navigateToInteract?: () => void };
                    };
                    if (typeof win.CIRISNative !== "undefined" && win.CIRISNative.refreshToken) {
                      console.log("[Setup Complete] Calling CIRISNative.refreshToken()");
                      win.CIRISNative.refreshToken();
                      // Give the token refresh a moment to complete before navigating to native InteractActivity
                      setTimeout(() => {
                        if (win.CIRISNative?.navigateToInteract) {
                          console.log("[Setup Complete] Navigating to native InteractActivity");
                          win.CIRISNative.navigateToInteract();
                        } else {
                          console.log(
                            "[Setup Complete] navigateToInteract not available, going to /"
                          );
                          window.location.href = "/";
                        }
                      }, 1000);
                    } else {
                      console.log(
                        "[Setup Complete] CIRISNative.refreshToken not available, navigating directly"
                      );
                      window.location.href = "/";
                    }
                  } else {
                    console.log("[Setup Complete] Navigating to /login (browser mode)");
                    router.push("/login");
                  }
                }}
                className="px-8 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium"
              >
                {localStorage.getItem("isNativeApp") === "true" || isNativeApp
                  ? "Start Using CIRIS →"
                  : "Go to Login →"}
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="text-center mt-8 text-sm text-gray-500">CIRIS v1.0 • Standalone Mode</div>
      </div>
    </div>
  );
}
