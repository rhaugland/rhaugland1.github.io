"use client";

import { useParams, useRouter } from "next/navigation";
import { useState, useEffect } from "react";

interface BookingInfo {
  businessName: string;
  name: string;
  plan: string;
  description: string | null;
}

function generateDemoTranscript(info: BookingInfo): string {
  const techStackMatch = info.description?.match(/tools\/tech stack:\s*(.+)/i);
  const techStack = techStackMatch?.[1] ?? "Google Sheets, QuickBooks";
  const descriptionBody = info.description?.replace(/\n\ntools\/tech stack:.+/i, "").trim() ?? "workflow automation tool";

  return `[team]: hey ${info.name}, thanks for hopping on — excited to build this out for you. so we're looking at a workflow tool for ${info.businessName}, right?

[client]: yeah exactly, we've been doing everything manually and it's eating up hours every week. we need something that ties into our existing stack.

[team]: totally get it. and your stack is ${techStack} — we'll build directly on top of those so nothing changes in your day to day. can you walk me through what the workflow looks like right now?

[client]: sure, so basically — ${descriptionBody}. right now i'm copy-pasting data between spreadsheets and it takes forever. i want something that pulls it together automatically.

[team]: got it. so we're talking about automated data sync, a dashboard to see everything at a glance, and some kind of alert system when things need attention. let me make sure i have the scope right.

[client]: yeah that's the core of it. oh also — for the look and feel, can we go with a clean dark theme? i'm thinking dark navy background, not pure black. and for the accent color, something like a bright teal or cyan.

[team]: love it — dark navy base with teal accents. any preference on the fonts?

[client]: something modern and clean. maybe Inter for the body text and something bolder for headings. i like that techy but readable look.

[team]: perfect — Inter for body, maybe Sora or Plus Jakarta Sans for headings. very clean, very modern. what about the data tables — do you want them compact or more spacious?

[client]: spacious for sure. i hate when everything's crammed together. and can we do rounded corners on the cards? not too rounded, just like a subtle softness.

[team]: absolutely — generous spacing, soft rounded corners on cards. we'll make sure it breathes. any specific charts or visualizations you want on the main dashboard?

[client]: a line chart for revenue trends over time, and maybe a donut chart showing where our time is going across different task categories. and stat cards at the top for the key numbers — total revenue, pending invoices, hours saved.

[team]: love that layout. stat cards up top, line chart and donut chart below. and the data tables beneath that for the detail view. anything else on the design side?

[client]: one more thing — the nav bar. can we keep it minimal? just the logo on the left and maybe 3-4 links. no hamburger menus or anything complicated.

[team]: clean minimal nav, got it. alright ${info.name}, i think we have a really solid picture. let me recap: dark navy theme with teal accents, Inter body font, modern heading font, spacious layout with rounded cards, stat cards plus charts on the dashboard, and a clean nav. we'll build this right on top of ${techStack} so it slots right into your workflow.

[client]: that sounds perfect. can't wait to see it.

[team]: we'll have your initial build ready for review soon. you'll get a notification on your tracker when it's ready. thanks ${info.name}!

[client]: awesome, thanks!`;
}

export default function DemoCallPage() {
  const params = useParams<{ pipelineRunId: string }>();
  const router = useRouter();
  const pipelineRunId = params.pipelineRunId;

  const [bookingInfo, setBookingInfo] = useState<BookingInfo | null>(null);
  const [transcript, setTranscript] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState(false);
  const [approved, setApproved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/calls/demo/info?pipelineRunId=${pipelineRunId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          setError(data.error);
        } else {
          setBookingInfo(data);
          setTranscript(generateDemoTranscript(data));
        }
      })
      .catch(() => setError("failed to load booking info"))
      .finally(() => setLoading(false));
  }, [pipelineRunId]);

  async function handleApprove() {
    setApproving(true);
    setError(null);
    try {
      const res = await fetch("/api/calls/demo/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pipelineRunId, transcript }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "failed to approve");
        return;
      }
      setApproved(true);
      setTimeout(() => router.push("/dashboard"), 2000);
    } catch {
      setError("something went wrong");
    } finally {
      setApproving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-[calc(100vh-64px)] items-center justify-center">
        <div className="text-sm text-muted">loading call transcript...</div>
      </div>
    );
  }

  if (error && !bookingInfo) {
    return (
      <div className="flex h-[calc(100vh-64px)] items-center justify-center">
        <div className="text-sm text-red-400">{error}</div>
      </div>
    );
  }

  const lines = transcript.split("\n").filter(Boolean);

  return (
    <div className="flex h-[calc(100vh-64px)] flex-col">
      {/* top bar */}
      <div className="flex items-center justify-between border-b border-border bg-surface px-6 py-3">
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-foreground">
            demo call — {bookingInfo?.businessName}
          </span>
          <span className="rounded-full bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 text-[10px] font-medium text-amber-400">
            pre-recorded transcript
          </span>
        </div>
        <div className="flex items-center gap-3">
          {!approved && (
            <button
              onClick={handleApprove}
              disabled={approving}
              className="rounded-lg bg-gradient-to-r from-primary to-secondary px-5 py-2 text-sm font-semibold text-white transition hover:shadow-md disabled:opacity-50"
            >
              {approving ? "dispatching..." : "approve & start build"}
            </button>
          )}
          {approved && (
            <span className="text-sm font-semibold text-green-400">
              build dispatched — redirecting...
            </span>
          )}
        </div>
      </div>

      {error && (
        <div className="border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* transcript */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        <div className="mx-auto max-w-3xl space-y-3">
          <div className="mb-6">
            <h2 className="text-lg font-bold text-foreground">call transcript</h2>
            <p className="text-xs text-muted mt-1">
              review the discovery call transcript below. approve it to trigger the build pipeline.
            </p>
          </div>

          {lines.map((line, i) => {
            const isTeam = line.startsWith("[team]:");
            const isClient = line.startsWith("[client]:");
            const text = line.replace(/^\[(team|client)\]:\s*/, "");
            const speaker = isTeam ? "team" : isClient ? "client" : null;

            if (!speaker) {
              return (
                <p key={i} className="text-sm text-muted italic">
                  {line}
                </p>
              );
            }

            return (
              <div
                key={i}
                className={`flex ${isTeam ? "justify-start" : "justify-end"}`}
              >
                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${
                    isTeam
                      ? "rounded-bl-sm bg-secondary/10 border border-secondary/20"
                      : "rounded-br-sm bg-primary/10 border border-primary/20"
                  }`}
                >
                  <span
                    className={`mb-1 block text-[10px] font-bold uppercase ${
                      isTeam ? "text-secondary" : "text-primary"
                    }`}
                  >
                    {speaker}
                  </span>
                  <p className="text-sm leading-relaxed text-foreground">{text}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
