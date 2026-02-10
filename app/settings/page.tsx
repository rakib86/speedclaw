"use client";

import { useState, useEffect, useCallback } from "react";
import { ArrowLeft, Save, Key, Bot, Search, Server, Brain, Cpu, Github, ExternalLink, LogOut, Loader2, CheckCircle2 } from "lucide-react";
import ModelSelector from "@/components/ModelSelector";
import Link from "next/link";

export default function SettingsPage() {
  const [openrouterKey, setOpenrouterKey] = useState("");
  const [braveKey, setBraveKey] = useState("");
  const [defaultModel, setDefaultModel] = useState(
    "arcee-ai/trinity-large-preview:free",
  );
  // New: planner and executor model settings for the 3-layer pipeline
  const [plannerModel, setPlannerModel] = useState("");
  const [executorModel, setExecutorModel] = useState("");
  const [ollamaUrl, setOllamaUrl] = useState("http://localhost:11434");
  // GitHub OAuth device flow state
  const [githubAuth, setGithubAuth] = useState<{
    authenticated: boolean;
    username: string;
  }>({ authenticated: false, username: "" });
  const [deviceFlow, setDeviceFlow] = useState<{
    userCode: string;
    verificationUri: string;
    deviceCode: string;
  } | null>(null);
  const [githubLoading, setGithubLoading] = useState(false);
  const [githubError, setGithubError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const res = await fetch("/api/settings");
        if (res.ok) {
          const data = await res.json();
          if (data.openrouter_api_key)
            setOpenrouterKey(data.openrouter_api_key);
          if (data.brave_api_key) setBraveKey(data.brave_api_key);
          if (data.default_model) setDefaultModel(data.default_model);
          if (data.planner_model) setPlannerModel(data.planner_model);
          if (data.executor_model) setExecutorModel(data.executor_model);
          if (data.ollama_url) setOllamaUrl(data.ollama_url);
        }
      } catch {
        /* ignore */
      }
    };
    loadSettings();
  }, []);

  // Load GitHub auth status on mount
  useEffect(() => {
    const checkGithubAuth = async () => {
      try {
        const res = await fetch("/api/github");
        if (res.ok) {
          const data = await res.json();
          setGithubAuth({
            authenticated: data.authenticated,
            username: data.username || "",
          });
        }
      } catch {
        /* ignore */
      }
    };
    checkGithubAuth();
  }, []);

  // GitHub device flow: start login
  const startGithubLogin = useCallback(async () => {
    setGithubLoading(true);
    setGithubError("");
    setDeviceFlow(null);

    try {
      const res = await fetch("/api/github", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "device_code" }),
      });
      const data = await res.json();

      if (data.error) {
        setGithubError(data.error);
        setGithubLoading(false);
        return;
      }

      setDeviceFlow({
        userCode: data.user_code,
        verificationUri: data.verification_uri,
        deviceCode: data.device_code,
      });

      // Open the verification URL
      window.open(data.verification_uri, "_blank");

      // Start polling for token
      const interval = (data.interval || 5) * 1000;
      const pollForToken = async () => {
        const maxAttempts = 60; // ~5 minutes at 5s interval
        for (let i = 0; i < maxAttempts; i++) {
          await new Promise((r) => setTimeout(r, interval));

          try {
            const pollRes = await fetch("/api/github", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                action: "poll_token",
                device_code: data.device_code,
              }),
            });
            const pollData = await pollRes.json();

            if (pollData.status === "success") {
              setGithubAuth({
                authenticated: true,
                username: pollData.username || "",
              });
              setDeviceFlow(null);
              setGithubLoading(false);
              return;
            } else if (
              pollData.status === "expired_token" ||
              pollData.status === "access_denied"
            ) {
              setGithubError(
                pollData.status === "expired_token"
                  ? "Code expired. Please try again."
                  : "Access denied.",
              );
              setDeviceFlow(null);
              setGithubLoading(false);
              return;
            }
            // "authorization_pending" or "slow_down" → keep polling
          } catch {
            /* network error, keep trying */
          }
        }
        setGithubError("Login timed out. Please try again.");
        setDeviceFlow(null);
        setGithubLoading(false);
      };

      pollForToken();
    } catch (err) {
      setGithubError(`Failed to start login: ${err}`);
      setGithubLoading(false);
    }
  }, []);

  // GitHub logout
  const handleGithubLogout = useCallback(async () => {
    try {
      await fetch("/api/github", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "logout" }),
      });
      setGithubAuth({ authenticated: false, username: "" });
    } catch {
      /* ignore */
    }
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      // Build settings object — only include planner/executor if explicitly set
      const settings: Record<string, string> = {
        openrouter_api_key: openrouterKey,
        brave_api_key: braveKey,
        default_model: defaultModel,
        ollama_url: ollamaUrl,
      };

      // If user set a planner model, save it; otherwise fall back to default_model
      if (plannerModel) {
        settings.planner_model = plannerModel;
      } else {
        settings.planner_model = defaultModel;
      }

      // If user set an executor model, save it; otherwise fall back to a cheaper model
      if (executorModel) {
        settings.executor_model = executorModel;
      } else {
        // Default: use a cheaper tool-capable model if available
        settings.executor_model = defaultModel;
      }

      await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      /* ignore */
    }
    setSaving(false);
  };

  return (
    <div className="min-h-screen bg-zinc-950">
      {/* Header */}
      <div className="border-b border-zinc-800 bg-zinc-950">
        <div className="max-w-2xl mx-auto px-6 py-4 flex items-center gap-4">
          <Link
            href="/"
            className="p-2 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            <ArrowLeft size={20} />
          </Link>
          <h1 className="text-lg font-semibold text-white">Settings</h1>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-2xl mx-auto px-6 py-8 space-y-8">
        {/* OpenRouter API Key */}
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-sm font-medium text-zinc-200">
            <Key size={16} className="text-emerald-400" />
            OpenRouter API Key
          </label>
          <p className="text-xs text-zinc-500">
            Get your API key from{" "}
            <a
              href="https://openrouter.ai/keys"
              target="_blank"
              rel="noopener noreferrer"
              className="text-emerald-400 hover:underline"
            >
              openrouter.ai/keys
            </a>
          </p>
          <input
            type="password"
            value={openrouterKey}
            onChange={(e) => setOpenrouterKey(e.target.value)}
            placeholder="sk-or-v1-..."
            className="w-full px-4 py-2.5 rounded-lg bg-zinc-900 border border-zinc-800 text-white placeholder-zinc-600 text-sm outline-none focus:border-emerald-600 transition-colors"
          />
        </div>

        {/* Brave Search API Key */}
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-sm font-medium text-zinc-200">
            <Search size={16} className="text-blue-400" />
            Brave Search API Key
          </label>
          <p className="text-xs text-zinc-500">
            Get your API key from{" "}
            <a
              href="https://brave.com/search/api/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:underline"
            >
              brave.com/search/api
            </a>
          </p>
          <input
            type="password"
            value={braveKey}
            onChange={(e) => setBraveKey(e.target.value)}
            placeholder="BSA..."
            className="w-full px-4 py-2.5 rounded-lg bg-zinc-900 border border-zinc-800 text-white placeholder-zinc-600 text-sm outline-none focus:border-emerald-600 transition-colors"
          />
        </div>

        {/* Ollama URL */}
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-sm font-medium text-zinc-200">
            <Server size={16} className="text-orange-400" />
            Ollama URL
          </label>
          <p className="text-xs text-zinc-500">
            URL for your local Ollama instance. Default is
            http://localhost:11434. Make sure Ollama is running with your model
            pulled (e.g.{" "}
            <code className="text-orange-400">ollama pull gemma3:1b</code>).
          </p>
          <input
            type="text"
            value={ollamaUrl}
            onChange={(e) => setOllamaUrl(e.target.value)}
            placeholder="http://localhost:11434"
            className="w-full px-4 py-2.5 rounded-lg bg-zinc-900 border border-zinc-800 text-white placeholder-zinc-600 text-sm outline-none focus:border-emerald-600 transition-colors"
          />
        </div>

        {/* GitHub Copilot / GitHub Models API */}
        <div className="space-y-4 p-4 rounded-lg border border-zinc-800 bg-zinc-900/50">
          <label className="flex items-center gap-2 text-sm font-medium text-zinc-200">
            <Github size={16} className="text-white" />
            GitHub Models API
          </label>
          <p className="text-xs text-zinc-500">
            Connect your GitHub account to use GitHub Models API as an
            additional LLM provider with models from OpenAI, Meta, and more.
          </p>

          {githubAuth.authenticated ? (
            /* Logged in state */
            <div className="flex items-center justify-between bg-zinc-800/50 rounded-lg px-4 py-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={16} className="text-emerald-400" />
                <span className="text-sm text-zinc-200">
                  Connected as{" "}
                  <span className="font-medium text-white">
                    {githubAuth.username || "GitHub user"}
                  </span>
                </span>
              </div>
              <button
                onClick={handleGithubLogout}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs bg-zinc-700 hover:bg-zinc-600 text-zinc-300 transition-colors"
              >
                <LogOut size={12} />
                Disconnect
              </button>
            </div>
          ) : deviceFlow ? (
            /* Device flow: waiting for user to approve */
            <div className="space-y-3">
              <div className="bg-zinc-800 rounded-lg p-4 text-center space-y-3">
                <p className="text-xs text-zinc-400">
                  Enter this code on GitHub:
                </p>
                <div className="text-2xl font-mono font-bold text-white tracking-widest">
                  {deviceFlow.userCode}
                </div>
                <a
                  href={deviceFlow.verificationUri}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-emerald-400 hover:underline"
                >
                  <ExternalLink size={12} />
                  Open GitHub to enter code
                </a>
              </div>
              <div className="flex items-center gap-2 text-xs text-zinc-500">
                <Loader2 size={12} className="animate-spin" />
                Waiting for authorization...
              </div>
            </div>
          ) : (
            /* Logged out state */
            <div className="space-y-2">
              <button
                onClick={startGithubLogin}
                disabled={githubLoading}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-sm text-zinc-200 font-medium transition-colors disabled:opacity-50"
              >
                {githubLoading ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Github size={16} />
                )}
                Login with GitHub
              </button>
              {githubError && (
                <p className="text-xs text-red-400">{githubError}</p>
              )}
            </div>
          )}
        </div>

        {/* Default Model */}
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-sm font-medium text-zinc-200">
            <Bot size={16} className="text-purple-400" />
            Default AI Model
          </label>
          <p className="text-xs text-zinc-500">
            Choose which model NexusAgent uses. Models prefixed with{" "}
            <code className="text-orange-400">ollama/</code> use your local
            Ollama instance.
          </p>
          <ModelSelector value={defaultModel} onChange={setDefaultModel} />
        </div>

        {/* Planner Model (new: multi-model pipeline) */}
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-sm font-medium text-zinc-200">
            <Brain size={16} className="text-blue-400" />
            Planner Model
          </label>
          <p className="text-xs text-zinc-500">
            Model used for reasoning and generating step-by-step plans.
            Ideally a strong reasoning model (e.g. GPT-4.1, DeepSeek-R1).
            Leave empty to use the default model.
          </p>
          <ModelSelector
            value={plannerModel}
            onChange={setPlannerModel}
            placeholder="Same as default model"
          />
        </div>

        {/* Executor Model (new: multi-model pipeline) */}
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-sm font-medium text-zinc-200">
            <Cpu size={16} className="text-emerald-400" />
            Executor Model
          </label>
          <p className="text-xs text-zinc-500">
            Model used for executing each step (tool calls, browsing, etc.).
            Can be a cheaper, faster model with good tool support.
            Leave empty to use the default model.
          </p>
          <ModelSelector
            value={executorModel}
            onChange={setExecutorModel}
            placeholder="Same as default model"
          />
        </div>

        {/* Save Button */}
        <div className="pt-4">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:bg-zinc-700 text-white text-sm font-medium transition-colors"
          >
            <Save size={16} />
            {saving ? "Saving..." : saved ? "Saved!" : "Save Settings"}
          </button>
        </div>

        {/* Info */}
        <div className="mt-8 p-4 rounded-lg bg-zinc-900 border border-zinc-800">
          <h3 className="text-sm font-medium text-zinc-200 mb-2">
            About NexusAgent
          </h3>
          <p className="text-xs text-zinc-500 leading-relaxed">
            NexusAgent is a personal AI assistant with web browsing, search,
            task scheduling, and persistent memory capabilities. It uses
            OpenRouter to access various AI models (Claude, GPT-4, Llama, etc.)
            and Brave Search for web search. Settings are stored in the local
            database and override environment variables.
          </p>
        </div>
      </div>
    </div>
  );
}
