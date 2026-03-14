import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic();

const SYSTEM_PROMPT = `You are a scriptwriter for realistic sales discovery call transcripts. Write a transcript between a slushie team member and a small business client.

Rules:
- The client describes their current workflow using specific named tools — Google Sheets, Excel, QuickBooks, Jira, Slack, Google Calendar, ServiceTitan, Xero, FreshBooks, Trello, Asana, HubSpot, Salesforce, etc. — whatever is realistic for their industry.
- The client explains pain points around those tools: manual data entry, copy-pasting between apps, no single source of truth, dropped balls, lost revenue.
- The team member asks discovery questions that surface how work flows between tools and where the gaps are.
- The prototype being discussed should integrate into the client's existing tools, not replace them.
- Format: [team]: ... and [client]: ... lines (one line per speaker turn).
- Length: 80-120 exchanges (realistic for a ~15-20 minute discovery call).
- Tone: natural, conversational, not salesy. The team member is genuinely trying to understand the business.
- Do NOT include any preamble, headers, or commentary — output ONLY the transcript lines.`;

export async function POST(request: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { clientName, industry, contactName } = body;

  if (!clientName) {
    return NextResponse.json(
      { error: "clientName is required" },
      { status: 400 }
    );
  }

  const userMessage = `Write a discovery call transcript for:
- Client business name: ${clientName}
- Industry: ${industry || "other"}
- Client contact name: ${contactName || "the client"}`;

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 8192,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    });

    const transcript = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("\n");

    return NextResponse.json({ transcript });
  } catch (err) {
    console.error("demo transcript generation failed:", err);
    return NextResponse.json(
      { error: "failed to generate transcript" },
      { status: 500 }
    );
  }
}
