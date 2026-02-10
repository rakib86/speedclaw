"use client";

import { useState, useEffect } from "react";
import { ChevronDown } from "lucide-react";

interface Model {
  id: string;
  name: string;
  context_length: number;
}

interface ModelSelectorProps {
  value: string;
  onChange: (model: string) => void;
  /** Placeholder text when no model is selected. */
  placeholder?: string;
}

const POPULAR_MODELS = [
  "ollama/gemma3:1b",
  "arcee-ai/trinity-large-preview:free",
  "anthropic/claude-sonnet-4",
  "anthropic/claude-3.5-sonnet",
  "openai/gpt-4o",
  "openai/gpt-4o-mini",
  "google/gemini-2.0-flash-001",
  "meta-llama/llama-3.1-70b-instruct",
  "deepseek/deepseek-chat",
];

function getModelBadge(id: string): { label: string; color: string } | null {
  if (id.startsWith("copilot/")) return { label: "GitHub", color: "text-purple-400" };
  if (id.startsWith("ollama/")) return { label: "Local", color: "text-orange-400" };
  return null;
}

export default function ModelSelector({ value, onChange, placeholder }: ModelSelectorProps) {
  const [models, setModels] = useState<Model[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const fetchModels = async () => {
      try {
        const res = await fetch("/api/models");
        if (res.ok) {
          const data = await res.json();
          setModels(data);
        }
      } catch {
        /* ignore */
      }
    };
    fetchModels();
  }, []);

  const filteredModels = models.filter(
    (m) =>
      m.id.toLowerCase().includes(search.toLowerCase()) ||
      m.name.toLowerCase().includes(search.toLowerCase()),
  );

  // Sort: popular models first
  const sortedModels = filteredModels.sort((a, b) => {
    const aPopular = POPULAR_MODELS.includes(a.id);
    const bPopular = POPULAR_MODELS.includes(b.id);
    if (aPopular && !bPopular) return -1;
    if (!aPopular && bPopular) return 1;
    return a.id.localeCompare(b.id);
  });

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 rounded-lg border border-zinc-700 bg-zinc-800 text-sm text-zinc-200 hover:border-zinc-600 transition-colors w-full"
      >
        <span className="truncate flex-1 text-left">
          {value || placeholder || "Select model..."}
        </span>
        <ChevronDown size={14} className="text-zinc-500 shrink-0" />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl max-h-80 overflow-hidden">
          <div className="p-2 border-b border-zinc-700">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search models..."
              className="w-full px-3 py-1.5 rounded bg-zinc-900 border border-zinc-700 text-sm text-white placeholder-zinc-500 outline-none focus:border-emerald-600"
              autoFocus
            />
          </div>
          <div className="overflow-y-auto max-h-60">
            {sortedModels.length === 0 ? (
              <p className="text-zinc-500 text-sm text-center py-4">
                {models.length === 0
                  ? "Add API key to load models"
                  : "No models found"}
              </p>
            ) : (
              sortedModels.map((model) => (
                <button
                  key={model.id}
                  onClick={() => {
                    onChange(model.id);
                    setIsOpen(false);
                    setSearch("");
                  }}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-zinc-700 transition-colors ${
                    value === model.id
                      ? "text-emerald-400 bg-zinc-700/50"
                      : "text-zinc-300"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-medium truncate">{model.id}</span>
                    {(() => {
                      const badge = getModelBadge(model.id);
                      return badge ? (
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded bg-zinc-700/60 ${badge.color} shrink-0`}>
                          {badge.label}
                        </span>
                      ) : null;
                    })()}
                  </div>
                  {model.context_length > 0 && (
                    <div className="text-xs text-zinc-500">
                      Context: {(model.context_length / 1000).toFixed(0)}k
                    </div>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
