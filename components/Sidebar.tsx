"use client";

import { useState, useEffect } from "react";
import { MessageSquarePlus, Trash2, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";

interface Conversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

interface SidebarProps {
  currentConversationId: string | null;
  onSelectConversation: (id: string) => void;
  onNewConversation: () => void;
}

export default function Sidebar({
  currentConversationId,
  onSelectConversation,
  onNewConversation,
}: SidebarProps) {
  const [conversations, setConversations] = useState<Conversation[]>([]);

  const fetchConversations = async () => {
    try {
      const res = await fetch("/api/conversations");
      if (res.ok) {
        const data = await res.json();
        setConversations(data);
      }
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    fetchConversations();
    const interval = setInterval(fetchConversations, 5000);
    return () => clearInterval(interval);
  }, []);

  const deleteConversation = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await fetch(`/api/conversations?id=${id}`, { method: "DELETE" });
      fetchConversations();
      if (currentConversationId === id) {
        onNewConversation();
      }
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="w-64 bg-zinc-900 border-r border-zinc-800 flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-zinc-800">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-lg font-bold text-white flex items-center gap-2">
            <span className="text-emerald-400"></span> RACDOX Agent
          </h1>
        </div>
        <button
          onClick={onNewConversation}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium transition-colors"
        >
          <MessageSquarePlus size={16} />
          New Chat
        </button>
      </div>

      {/* Conversations List */}
      <div className="flex-1 overflow-y-auto p-2">
        {conversations.length === 0 && (
          <p className="text-zinc-500 text-sm text-center py-4">
            No conversations yet
          </p>
        )}
        {conversations.map((conv) => (
          <button
            key={conv.id}
            onClick={() => onSelectConversation(conv.id)}
            className={cn(
              "w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-left group transition-colors mb-1",
              currentConversationId === conv.id
                ? "bg-zinc-700 text-white"
                : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200",
            )}
          >
            <MessageSquare size={14} className="shrink-0" />
            <span className="truncate flex-1">{conv.title}</span>
            <Trash2
              size={14}
              className="shrink-0 opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-red-400 transition-opacity"
              onClick={(e) => deleteConversation(conv.id, e)}
            />
          </button>
        ))}
      </div>

      {/* Footer */}
      <div className="p-3 border-t border-zinc-800">
        <a
          href="/settings"
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-colors"
        >
          ⚙️ Settings
        </a>
      </div>
    </div>
  );
}
