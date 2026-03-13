"use client";

import { useEffect, useState, useRef } from "react";

interface NotificationMessage {
  id: string;
  pipelineRunId: string;
  clientName: string;
  message: string;
  trackerUrl: string | null;
  prototypeUrl: string | null;
  createdAt: string;
}

interface ChatThread {
  pipelineRunId: string;
  clientName: string;
  messages: NotificationMessage[];
}

function extractLinks(text: string): {
  beforeLink: string;
  trackerUrl: string | null;
  prototypeUrl: string | null;
  afterLink: string;
} {
  const trackerMatch = text.match(/(slushie\.agency\/track\/[a-zA-Z0-9_-]{21})/);
  const prototypeMatch = text.match(/(app\.slushie\.agency\/preview\/[a-zA-Z0-9_-]{21})/);

  let beforeLink = text;
  let afterLink = "";

  if (trackerMatch) {
    const idx = text.indexOf(trackerMatch[1]);
    beforeLink = text.substring(0, idx);
    afterLink = text.substring(idx + trackerMatch[1].length);
  } else if (prototypeMatch) {
    const idx = text.indexOf(prototypeMatch[1]);
    beforeLink = text.substring(0, idx);
    afterLink = text.substring(idx + prototypeMatch[1].length);
  }

  return {
    beforeLink,
    trackerUrl: trackerMatch ? trackerMatch[1] : null,
    prototypeUrl: prototypeMatch ? prototypeMatch[1] : null,
    afterLink,
  };
}

function ChatBubble({ message }: { message: NotificationMessage }) {
  const { beforeLink, trackerUrl, prototypeUrl, afterLink } = extractLinks(
    message.message
  );
  const time = new Date(message.createdAt).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="flex justify-start">
      <div className="max-w-[280px] rounded-2xl rounded-tl-sm bg-gray-100 px-4 py-2.5">
        <p className="text-sm text-foreground leading-relaxed">
          {beforeLink}
          {trackerUrl && (
            <button
              onClick={() => navigator.clipboard.writeText(`https://${trackerUrl}`)}
              className="inline text-secondary underline decoration-secondary/30 hover:decoration-secondary cursor-pointer"
              title="click to copy link"
            >
              {trackerUrl}
            </button>
          )}
          {prototypeUrl && (
            <button
              onClick={() => navigator.clipboard.writeText(`https://${prototypeUrl}`)}
              className="inline text-secondary underline decoration-secondary/30 hover:decoration-secondary cursor-pointer"
              title="click to copy link"
            >
              {prototypeUrl}
            </button>
          )}
          {afterLink}
        </p>
        <p className="mt-1 text-right text-[10px] text-muted">{time}</p>
      </div>
    </div>
  );
}

function ThreadView({
  thread,
  isSelected,
  onSelect,
}: {
  thread: ChatThread;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const lastMsg = thread.messages[thread.messages.length - 1];
  const preview =
    lastMsg.message.length > 50
      ? lastMsg.message.substring(0, 50) + "..."
      : lastMsg.message;
  const time = new Date(lastMsg.createdAt).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <button
      onClick={onSelect}
      className={`w-full border-b border-gray-100 px-4 py-3 text-left transition-colors ${
        isSelected ? "bg-gradient-start/30" : "hover:bg-gray-50"
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-foreground">
          {thread.clientName}
        </span>
        <span className="text-[10px] text-muted">{time}</span>
      </div>
      <p className="mt-0.5 text-xs text-muted truncate">{preview}</p>
    </button>
  );
}

export function ChatClient() {
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // fetch existing messages on mount
  useEffect(() => {
    async function loadMessages() {
      const res = await fetch("/api/dev/chat/messages");
      if (res.ok) {
        const data = await res.json();
        setThreads(data.threads);
        if (data.threads.length > 0 && !selectedThreadId) {
          setSelectedThreadId(data.threads[data.threads.length - 1].pipelineRunId);
        }
      }
    }
    loadMessages();
  }, []);

  // subscribe to SSE for real-time messages
  useEffect(() => {
    const eventSource = new EventSource("/api/dev/chat/events");

    eventSource.addEventListener("connected", () => {
      setConnected(true);
    });

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "client.notified") {
          const newMsg: NotificationMessage = {
            id: data.id,
            pipelineRunId: data.pipelineRunId,
            clientName: data.clientName,
            message: data.message,
            trackerUrl: data.trackerUrl ?? null,
            prototypeUrl: data.prototypeUrl ?? null,
            createdAt: data.createdAt,
          };

          setThreads((prev) => {
            const existing = prev.find(
              (t) => t.pipelineRunId === newMsg.pipelineRunId
            );
            if (existing) {
              return prev.map((t) =>
                t.pipelineRunId === newMsg.pipelineRunId
                  ? { ...t, messages: [...t.messages, newMsg] }
                  : t
              );
            }
            return [
              ...prev,
              {
                pipelineRunId: newMsg.pipelineRunId,
                clientName: newMsg.clientName,
                messages: [newMsg],
              },
            ];
          });

          // auto-select new thread
          setSelectedThreadId(newMsg.pipelineRunId);
        }
      } catch {
        // ignore malformed messages
      }
    };

    eventSource.onerror = () => {
      setConnected(false);
    };

    return () => {
      eventSource.close();
    };
  }, []);

  // auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [threads, selectedThreadId]);

  const selectedThread = threads.find(
    (t) => t.pipelineRunId === selectedThreadId
  );

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">dev chat</h2>
          <p className="text-sm text-muted">
            simulated sms notifications. upgrade to twilio in phase 2.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div
            className={`h-2 w-2 rounded-full ${
              connected ? "bg-green-500" : "bg-gray-300"
            }`}
          />
          <span className="text-xs text-muted">
            {connected ? "live" : "connecting..."}
          </span>
        </div>
      </div>

      {/* phone-style container */}
      <div className="overflow-hidden rounded-3xl border-2 border-gray-200 bg-white shadow-xl">
        <div className="flex h-[600px]">
          {/* thread list (left panel) */}
          <div className="w-[200px] border-r border-gray-200 overflow-y-auto">
            <div className="border-b border-gray-200 bg-gray-50 px-4 py-2">
              <p className="text-xs font-semibold text-muted">threads</p>
            </div>
            {threads.length === 0 && (
              <div className="p-4 text-center text-xs text-muted">
                no messages yet. run a pipeline to see notifications here.
              </div>
            )}
            {threads.map((thread) => (
              <ThreadView
                key={thread.pipelineRunId}
                thread={thread}
                isSelected={thread.pipelineRunId === selectedThreadId}
                onSelect={() => setSelectedThreadId(thread.pipelineRunId)}
              />
            ))}
          </div>

          {/* chat messages (right panel) */}
          <div className="flex flex-1 flex-col">
            {/* chat header */}
            <div className="border-b border-gray-200 bg-gray-50 px-4 py-2.5">
              {selectedThread ? (
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">
                    {selectedThread.clientName.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      {selectedThread.clientName}
                    </p>
                    <p className="text-[10px] text-muted">slushie notification</p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted">select a thread</p>
              )}
            </div>

            {/* messages */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
              {selectedThread?.messages.map((msg) => (
                <ChatBubble key={msg.id} message={msg} />
              ))}
              {!selectedThread && (
                <div className="flex h-full items-center justify-center">
                  <p className="text-sm text-muted">
                    {threads.length > 0
                      ? "pick a thread from the left."
                      : "waiting for notifications..."}
                  </p>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* bottom bar */}
            <div className="border-t border-gray-200 bg-gray-50 px-4 py-2.5">
              <p className="text-center text-[10px] text-muted">
                outbound only — these messages simulate sms to your client
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
