"use client";

import { useState, useCallback } from "react";
import Sidebar from "@/components/Sidebar";
import ChatArea from "@/components/ChatArea";
import TaskPanel from "@/components/TaskPanel";
import { Clock, PanelRightOpen, PanelRightClose } from "lucide-react";

export default function Home() {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [taskPanelOpen, setTaskPanelOpen] = useState(false);

  const handleNewConversation = useCallback(() => {
    setConversationId(null);
  }, []);

  const handleSelectConversation = useCallback((id: string) => {
    setConversationId(id);
  }, []);

  const handleConversationCreated = useCallback((id: string) => {
    setConversationId(id);
  }, []);

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <Sidebar
        currentConversationId={conversationId}
        onSelectConversation={handleSelectConversation}
        onNewConversation={handleNewConversation}
      />

      {/* Main area */}
      <div className="flex-1 flex flex-col relative">
        {/* Top bar */}
        <div className="h-12 border-b border-zinc-800 flex items-center justify-between px-4 bg-zinc-950">
          <div className="text-sm text-zinc-400">
            {conversationId ? "Conversation" : "New Chat"}
          </div>
          <button
            onClick={() => setTaskPanelOpen(!taskPanelOpen)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
          >
            <Clock size={14} />
            Tasks
            {taskPanelOpen ? (
              <PanelRightClose size={14} />
            ) : (
              <PanelRightOpen size={14} />
            )}
          </button>
        </div>

        {/* Chat + Task Panel */}
        <div className="flex-1 flex overflow-hidden">
          <div className="flex-1">
            <ChatArea
              conversationId={conversationId}
              onConversationCreated={handleConversationCreated}
            />
          </div>
          <TaskPanel
            isOpen={taskPanelOpen}
            onClose={() => setTaskPanelOpen(false)}
          />
        </div>
      </div>
    </div>
  );
}
