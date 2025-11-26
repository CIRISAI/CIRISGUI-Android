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
import { ADAPTERS } from "./adapters-config";

type Step = "welcome" | "llm" | "users" | "template" | "adapters" | "complete";

export default function SetupWizard() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState<Step>("welcome");
  const [providers, setProviders] = useState<LLMProvider[]>([]);
  const [templates, setTemplates] = useState<AgentTemplate[]>([]);
  const [loading, setLoading] = useState(false);

  // Form state - Primary LLM
  const [selectedProvider, setSelectedProvider] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [selectedModel, setSelectedModel] = useState("");
  const [apiBase, setApiBase] = useState("");
  const [validatingLLM, setValidatingLLM] = useState(false);
  const [llmValid, setLlmValid] = useState(false);

  // Backup/Secondary LLM (Optional)
  const [enableBackupLLM, setEnableBackupLLM] = useState(false);
  const [backupApiKey, setBackupApiKey] = useState("");
  const [backupModel, setBackupModel] = useState("");
  const [backupApiBase, setBackupApiBase] = useState("");

  const [adminPassword, setAdminPassword] = useState("");
  const [adminPasswordConfirm, setAdminPasswordConfirm] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");

  const [selectedTemplate, setSelectedTemplate] = useState("");

  // Adapter selection state
  const [enabledAdapters, setEnabledAdapters] = useState<string[]>(["api"]);
  const [adapterConfigs, setAdapterConfigs] = useState<Record<string, Record<string, string>>>({});

  // Load providers and templates
  useEffect(() => {
    loadProvidersAndTemplates();
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
    if (adminPassword !== adminPasswordConfirm) {
      toast.error("Admin passwords do not match");
      return;
    }
    if (password !== passwordConfirm) {
      toast.error("User passwords do not match");
      return;
    }
    if (!llmValid) {
      toast.error("Please validate your LLM configuration first");
      return;
    }

    setLoading(true);
    try {
      const config: SetupCompleteRequest = {
        llm_provider: selectedProvider,
        llm_api_key: apiKey,
        llm_base_url: apiBase || null,
        llm_model: selectedModel || null,
        // Backup LLM (optional)
        backup_llm_api_key: enableBackupLLM && backupApiKey ? backupApiKey : null,
        backup_llm_base_url: enableBackupLLM && backupApiBase ? backupApiBase : null,
        backup_llm_model: enableBackupLLM && backupModel ? backupModel : null,
        template_id: selectedTemplate || "general",
        enabled_adapters: enabledAdapters,
        adapter_config: adapterConfigs,
        admin_username: username,
        admin_password: password,
        system_admin_password: adminPassword, // Update default admin password
        agent_port: 8080,
      };

      const response = await cirisClient.setup.complete(config);
      console.log("Setup complete:", response.message);
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

        {/* Progress indicator */}
        {currentStep !== "complete" && (
          <div className="mb-8">
            <div className="flex items-center justify-center space-x-2 sm:space-x-4">
              {["welcome", "llm", "users", "template", "adapters"].map((step, idx) => (
                <div key={step} className="flex items-center">
                  <div
                    className={`flex items-center justify-center w-8 h-8 sm:w-10 sm:h-10 rounded-full text-sm sm:text-base ${
                      currentStep === step
                        ? "bg-indigo-600 text-white"
                        : idx <
                            ["welcome", "llm", "users", "template", "adapters"].indexOf(currentStep)
                          ? "bg-green-500 text-white"
                          : "bg-gray-200 text-gray-500"
                    }`}
                  >
                    {idx < ["welcome", "llm", "users", "template", "adapters"].indexOf(currentStep)
                      ? "✓"
                      : idx + 1}
                  </div>
                  {idx < 4 && (
                    <div
                      className={`w-8 sm:w-16 h-1 ${
                        idx <
                        ["welcome", "llm", "users", "template", "adapters"].indexOf(currentStep)
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
              <h2 className="text-2xl font-bold text-gray-900">Let's Get Started</h2>
              <div className="prose prose-indigo max-w-none">
                <p className="text-gray-700 leading-relaxed">
                  CIRIS is a next-generation AI assistant that prioritizes cognitive integrity,
                  transparency, and ethical decision-making. This setup wizard will help you
                  configure your instance in just a few steps.
                </p>

                <h3 className="text-lg font-semibold text-gray-900 mt-6 mb-3">What you'll need:</h3>
                <ul className="space-y-2">
                  <li className="flex items-start">
                    <span className="text-indigo-600 mr-2">•</span>
                    <span>
                      <strong>LLM API Key</strong> - An API key from OpenAI, Anthropic, or another
                      supported provider
                    </span>
                  </li>
                  <li className="flex items-start">
                    <span className="text-indigo-600 mr-2">•</span>
                    <span>
                      <strong>Admin Password</strong> - A secure password for the default admin
                      account
                    </span>
                  </li>
                  <li className="flex items-start">
                    <span className="text-indigo-600 mr-2">•</span>
                    <span>
                      <strong>Your Account</strong> - Username and password for your personal
                      account
                    </span>
                  </li>
                </ul>

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-6">
                  <p className="text-sm text-blue-900">
                    <strong>Note:</strong> All data is stored locally on your machine. Your API keys
                    and passwords are encrypted and never shared.
                  </p>
                </div>
              </div>

              <button
                onClick={() => setCurrentStep("llm")}
                className="w-full px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium"
              >
                Continue to LLM Setup →
              </button>
            </div>
          )}

          {/* Step 2: LLM Configuration */}
          {currentStep === "llm" && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-gray-900">Configure Your LLM</h2>
                <button
                  onClick={() => setCurrentStep("welcome")}
                  className="text-gray-500 hover:text-gray-700"
                >
                  ← Back
                </button>
              </div>

              <p className="text-gray-600">
                Choose your preferred LLM provider and enter your API credentials. We'll test the
                connection to make sure everything works.
              </p>

              {/* Provider selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Provider</label>
                <div className="grid grid-cols-2 gap-4">
                  {providers.map(p => (
                    <button
                      key={p.id}
                      onClick={() => {
                        setSelectedProvider(p.id);
                        setLlmValid(false);
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

              {/* API Key */}
              {provider && provider.requires_api_key && (
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

              {/* Model input */}
              {provider && provider.requires_model && (
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

              {/* API Base URL */}
              {provider && provider.requires_base_url && (
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

              {/* Validation */}
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

              {/* Optional Backup LLM Configuration */}
              <div className="border-t border-gray-200 pt-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">
                      Backup LLM{" "}
                      <span className="text-sm font-normal text-gray-500">(Optional)</span>
                    </h3>
                    <p className="text-sm text-gray-600 mt-1">
                      Configure a secondary LLM provider for redundancy
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEnableBackupLLM(!enableBackupLLM)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      enableBackupLLM
                        ? "bg-indigo-100 text-indigo-700"
                        : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                    }`}
                  >
                    {enableBackupLLM ? "Enabled" : "Enable"}
                  </button>
                </div>

                {enableBackupLLM && (
                  <div className="space-y-4 pl-4 border-l-2 border-indigo-200">
                    {/* Backup API Key */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Backup API Key
                      </label>
                      <input
                        type="password"
                        value={backupApiKey}
                        onChange={e => setBackupApiKey(e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        placeholder="Backup LLM API key"
                      />
                    </div>

                    {/* Backup Model */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Backup Model <span className="text-gray-500">(optional)</span>
                      </label>
                      <input
                        type="text"
                        value={backupModel}
                        onChange={e => setBackupModel(e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        placeholder="Model name"
                      />
                    </div>

                    {/* Backup Base URL */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Backup Base URL <span className="text-gray-500">(optional)</span>
                      </label>
                      <input
                        type="text"
                        value={backupApiBase}
                        onChange={e => setBackupApiBase(e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        placeholder="https://api.openai.com/v1"
                      />
                    </div>
                  </div>
                )}
              </div>

              <button
                onClick={() => setCurrentStep("users")}
                disabled={!llmValid}
                className="w-full px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
              >
                Continue to User Setup →
              </button>
            </div>
          )}

          {/* Step 3: User & Admin Setup */}
          {currentStep === "users" && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-gray-900">Create Your Accounts</h2>
                <button
                  onClick={() => setCurrentStep("llm")}
                  className="text-gray-500 hover:text-gray-700"
                >
                  ← Back
                </button>
              </div>

              <p className="text-gray-600">
                First, set a secure password for the default admin account. Then create your
                personal user account.
              </p>

              {/* Admin Password */}
              <div className="border-b border-gray-200 pb-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Admin Account</h3>
                <div className="space-y-4">
                  <div>
                    <label
                      htmlFor="adminPassword"
                      className="block text-sm font-medium text-gray-700 mb-2"
                    >
                      New Admin Password
                    </label>
                    <input
                      id="adminPassword"
                      type="password"
                      value={adminPassword}
                      onChange={e => setAdminPassword(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                      placeholder="Enter a secure password"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="adminPasswordConfirm"
                      className="block text-sm font-medium text-gray-700 mb-2"
                    >
                      Confirm Admin Password
                    </label>
                    <input
                      id="adminPasswordConfirm"
                      type="password"
                      value={adminPasswordConfirm}
                      onChange={e => setAdminPasswordConfirm(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                      placeholder="Re-enter password"
                    />
                  </div>
                </div>
              </div>

              {/* User Account */}
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
                      Password
                    </label>
                    <input
                      id="password"
                      type="password"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                      placeholder="Enter your password"
                    />
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

              <button
                onClick={() => setCurrentStep("template")}
                disabled={
                  !adminPassword ||
                  !adminPasswordConfirm ||
                  !username ||
                  !password ||
                  !passwordConfirm
                }
                className="w-full px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
              >
                Continue to Template Selection →
              </button>
            </div>
          )}

          {/* Step 4: Template Selection */}
          {currentStep === "template" && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-gray-900">Choose Your Agent Template</h2>
                <button
                  onClick={() => setCurrentStep("users")}
                  className="text-gray-500 hover:text-gray-700"
                >
                  ← Back
                </button>
              </div>

              <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 sm:p-5 mb-2">
                <h3 className="text-sm font-semibold text-indigo-900 mb-2">
                  How CIRIS Agent Templates Work
                </h3>
                <p className="text-sm text-indigo-800 leading-relaxed">
                  Each template contains Standard Operating Procedures (SOPs) that define your
                  agent's role and capabilities. CIRIS agents are mission-driven—their conscience
                  system validates every action against their defined mission to ensure ethical,
                  aligned behavior. For multi-stage workflows, agents use tickets to track progress
                  through each step of their SOPs, automatically generating tasks as work continues.
                </p>
              </div>

              {/* Templates Info */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 sm:p-5">
                <div className="flex items-start gap-3">
                  <span className="text-blue-600 text-xl flex-shrink-0">ℹ️</span>
                  <div>
                    <h4 className="text-sm font-semibold text-blue-900 mb-1">
                      Choose Your Agent Template
                    </h4>
                    <p className="text-sm text-blue-700">
                      Select from available templates for different use cases including customer
                      service, research, GDPR automation, and moderation. Each template comes with
                      pre-configured SOPs and stewardship tier ratings.
                    </p>
                  </div>
                </div>
              </div>

              {/* Available Templates */}
              <div className="space-y-3">
                <h3 className="text-lg font-semibold text-gray-900 mb-3">Available Templates</h3>
                {templates.length === 0 ? (
                  <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-gray-200">
                    <p className="text-gray-500">Loading templates...</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-3">
                    {templates.map(template => (
                      <button
                        key={template.id}
                        onClick={() => setSelectedTemplate(template.id)}
                        className={`p-4 sm:p-5 border-2 rounded-lg text-left transition-all ${
                          selectedTemplate === template.id
                            ? "border-indigo-600 bg-indigo-50"
                            : "border-gray-200 hover:border-gray-300"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 className="text-base sm:text-lg font-semibold text-gray-900">
                                {template.name}
                              </h4>
                              <span
                                className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                                  template.stewardship_tier <= 2
                                    ? "bg-green-100 text-green-800"
                                    : template.stewardship_tier <= 3
                                      ? "bg-yellow-100 text-yellow-800"
                                      : "bg-orange-100 text-orange-800"
                                }`}
                                title={`Stewardship Tier ${template.stewardship_tier}/5`}
                              >
                                Tier {template.stewardship_tier}
                              </span>
                            </div>
                            <p className="text-sm text-gray-600 mt-1">{template.description}</p>
                            {template.example_use_cases &&
                              template.example_use_cases.length > 0 && (
                                <div className="mt-2">
                                  <p className="text-xs text-gray-500 font-medium">Use Cases:</p>
                                  <p className="text-xs text-gray-600">
                                    {template.example_use_cases.slice(0, 2).join(", ")}
                                    {template.example_use_cases.length > 2 && "..."}
                                  </p>
                                </div>
                              )}
                          </div>
                          {selectedTemplate === template.id && (
                            <span className="text-indigo-600 text-xl flex-shrink-0">✓</span>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
                <button
                  onClick={() => setCurrentStep("adapters")}
                  className="flex-1 px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium"
                >
                  Continue to Adapters →
                </button>
              </div>
            </div>
          )}

          {/* Step 5: Adapters */}
          {currentStep === "adapters" && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-gray-900">Configure Adapters</h2>
                <button
                  onClick={() => setCurrentStep("template")}
                  className="text-gray-500 hover:text-gray-700"
                >
                  ← Back
                </button>
              </div>

              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 sm:p-5">
                <div className="flex items-start gap-3">
                  <span className="text-yellow-600 text-xl flex-shrink-0">⚠️</span>
                  <div>
                    <h3 className="text-sm font-semibold text-yellow-900 mb-1">Restart Required</h3>
                    <p className="text-sm text-yellow-800">
                      Adapter configuration changes require restarting the CIRIS agent to take
                      effect.
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                {/* Core Adapters */}
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-3">Core Adapters</h3>
                  <p className="text-sm text-gray-600 mb-4">
                    Communication interfaces for interacting with your agent.
                  </p>
                  <div className="space-y-4">
                    {ADAPTERS.core.map(adapter => (
                      <div key={adapter.id} className="border-2 rounded-lg overflow-hidden">
                        <button
                          onClick={() => {
                            if (!adapter.required) {
                              setEnabledAdapters(prev =>
                                prev.includes(adapter.id)
                                  ? prev.filter(id => id !== adapter.id)
                                  : [...prev, adapter.id]
                              );
                            }
                          }}
                          disabled={adapter.required}
                          className={`w-full p-4 text-left transition-all ${
                            enabledAdapters.includes(adapter.id)
                              ? "border-indigo-600 bg-indigo-50"
                              : "border-gray-200 bg-white hover:bg-gray-50"
                          } ${adapter.required ? "cursor-not-allowed" : ""}`}
                        >
                          <div className="flex items-start gap-3">
                            <div className="flex-shrink-0 mt-0.5">
                              {enabledAdapters.includes(adapter.id) ? (
                                <span className="text-indigo-600 text-xl">✓</span>
                              ) : (
                                <span className="text-gray-400 text-xl">○</span>
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap mb-1">
                                <h4 className="text-base font-semibold text-gray-900">
                                  {adapter.name}
                                </h4>
                                {adapter.required && (
                                  <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-blue-100 text-blue-800">
                                    Required
                                  </span>
                                )}
                                <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-purple-100 text-purple-800">
                                  {adapter.tools} {adapter.tools === 1 ? "tool" : "tools"}
                                </span>
                              </div>
                              <p className="text-sm text-gray-600">{adapter.description}</p>
                            </div>
                          </div>
                        </button>

                        {/* Configuration Fields */}
                        {enabledAdapters.includes(adapter.id) &&
                          adapter.configFields &&
                          adapter.configFields.length > 0 && (
                            <div className="bg-gray-50 p-4 border-t border-gray-200 space-y-4">
                              <h5 className="text-sm font-semibold text-gray-900">Configuration</h5>
                              {adapter.configFields.map(field => (
                                <div key={field.name}>
                                  <label className="block text-sm font-medium text-gray-700 mb-2">
                                    {field.label}
                                    {field.required && <span className="text-red-500 ml-1">*</span>}
                                  </label>
                                  {field.type === "select" ? (
                                    <select
                                      value={
                                        adapterConfigs[adapter.id]?.[field.name] ||
                                        ("default" in field ? field.default : "") ||
                                        ""
                                      }
                                      onChange={e =>
                                        setAdapterConfigs(prev => ({
                                          ...prev,
                                          [adapter.id]: {
                                            ...prev[adapter.id],
                                            [field.name]: e.target.value,
                                          },
                                        }))
                                      }
                                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                    >
                                      {("options" in field
                                        ? (field.options as string[])
                                        : ([] as string[])
                                      ).map(option => (
                                        <option key={option} value={option}>
                                          {option}
                                        </option>
                                      ))}
                                    </select>
                                  ) : (
                                    <input
                                      type={field.type}
                                      value={
                                        adapterConfigs[adapter.id]?.[field.name] ||
                                        ("default" in field ? field.default : "") ||
                                        ""
                                      }
                                      onChange={e =>
                                        setAdapterConfigs(prev => ({
                                          ...prev,
                                          [adapter.id]: {
                                            ...prev[adapter.id],
                                            [field.name]: e.target.value,
                                          },
                                        }))
                                      }
                                      placeholder={"default" in field ? field.default : ""}
                                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                      required={field.required}
                                    />
                                  )}
                                  <p className="mt-1 text-xs text-gray-500">{field.description}</p>
                                  {field.envVar && (
                                    <p className="mt-0.5 text-xs text-gray-400">
                                      Env: {field.envVar}
                                    </p>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Modular Services */}
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-3">Modular Services</h3>
                  <p className="text-sm text-gray-600 mb-4">
                    Optional capabilities that extend your agent's functionality.
                  </p>
                  <div className="space-y-4">
                    {ADAPTERS.modular.map(service => (
                      <div key={service.id} className="border-2 rounded-lg overflow-hidden">
                        <button
                          onClick={() => {
                            setEnabledAdapters(prev =>
                              prev.includes(service.id)
                                ? prev.filter(id => id !== service.id)
                                : [...prev, service.id]
                            );
                          }}
                          className={`w-full p-4 text-left transition-all ${
                            enabledAdapters.includes(service.id)
                              ? "border-indigo-600 bg-indigo-50"
                              : "border-gray-200 bg-white hover:bg-gray-50"
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <div className="flex-shrink-0 mt-0.5">
                              {enabledAdapters.includes(service.id) ? (
                                <span className="text-indigo-600 text-xl">✓</span>
                              ) : (
                                <span className="text-gray-400 text-xl">○</span>
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap mb-1">
                                <h4 className="text-base font-semibold text-gray-900">
                                  {service.name}
                                </h4>
                                <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-purple-100 text-purple-800">
                                  {service.tools} {service.tools === 1 ? "tool" : "tools"}
                                </span>
                              </div>
                              <p className="text-sm text-gray-600">{service.description}</p>
                            </div>
                          </div>
                        </button>

                        {/* Configuration Fields */}
                        {enabledAdapters.includes(service.id) &&
                          service.configFields &&
                          service.configFields.length > 0 && (
                            <div className="bg-gray-50 p-4 border-t border-gray-200 space-y-4">
                              <h5 className="text-sm font-semibold text-gray-900">Configuration</h5>
                              {service.configFields.map(field => (
                                <div key={field.name}>
                                  <label className="block text-sm font-medium text-gray-700 mb-2">
                                    {field.label}
                                    {field.required && <span className="text-red-500 ml-1">*</span>}
                                  </label>
                                  {field.type === "select" ? (
                                    <select
                                      value={
                                        adapterConfigs[service.id]?.[field.name] ||
                                        ("default" in field ? field.default : "") ||
                                        ""
                                      }
                                      onChange={e =>
                                        setAdapterConfigs(prev => ({
                                          ...prev,
                                          [service.id]: {
                                            ...prev[service.id],
                                            [field.name]: e.target.value,
                                          },
                                        }))
                                      }
                                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                    >
                                      {("options" in field
                                        ? (field.options as string[])
                                        : ([] as string[])
                                      ).map(option => (
                                        <option key={option} value={option}>
                                          {option}
                                        </option>
                                      ))}
                                    </select>
                                  ) : (
                                    <input
                                      type={field.type}
                                      value={
                                        adapterConfigs[service.id]?.[field.name] ||
                                        ("default" in field ? field.default : "") ||
                                        ""
                                      }
                                      onChange={e =>
                                        setAdapterConfigs(prev => ({
                                          ...prev,
                                          [service.id]: {
                                            ...prev[service.id],
                                            [field.name]: e.target.value,
                                          },
                                        }))
                                      }
                                      placeholder={"default" in field ? field.default : ""}
                                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                      required={field.required}
                                    />
                                  )}
                                  <p className="mt-1 text-xs text-gray-500">{field.description}</p>
                                  {field.envVar && (
                                    <p className="mt-0.5 text-xs text-gray-400">
                                      Env: {field.envVar}
                                    </p>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
                <button
                  onClick={completeSetup}
                  disabled={loading}
                  className="flex-1 px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
                >
                  {loading ? "Completing Setup..." : "Complete Setup"}
                </button>
              </div>
            </div>
          )}

          {/* Step 6: Complete */}
          {currentStep === "complete" && (
            <div className="text-center space-y-6 py-8">
              <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                <span className="text-4xl">✓</span>
              </div>
              <h2 className="text-3xl font-bold text-gray-900">Setup Complete!</h2>
              <p className="text-gray-600 max-w-md mx-auto">
                Your CIRIS instance is now configured and ready to use. You can log in with your
                credentials.
              </p>
              <button
                onClick={() => router.push("/login")}
                className="px-8 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium"
              >
                Go to Login →
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
