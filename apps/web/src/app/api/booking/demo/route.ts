import { NextResponse } from "next/server";
import { prisma } from "@slushie/db";
import { nanoid } from "nanoid";
import bcrypt from "bcryptjs";
import { generateTempPassword } from "@/lib/tracker-auth";

const BOOKING_STEPS = [
  { step: 1, label: "meeting confirmed", subtitle: "your blend is scheduled. we'll see you there." },
  { step: 2, label: "meeting", subtitle: "we're on the call. workflow discovery in progress." },
  { step: 3, label: "slushie build review", subtitle: "our team is reviewing the build for quality." },
  { step: 4, label: "client build approval", subtitle: "your turn. take a look and let us know." },
  { step: 5, label: "plug-in", subtitle: "connecting to your tools. almost there." },
  { step: 6, label: "billing", subtitle: "invoice sent. simple and transparent." },
  { step: 7, label: "satisfaction survey", subtitle: "how'd we do? we want to keep getting better." },
];

interface DemoPreset {
  name: string;
  email: string;
  businessName: string;
  plan: "SINGLE_SCOOP" | "DOUBLE_BLEND" | "TRIPLE_FREEZE";
  description: string;
  industry: string;
  transcript: string;
  workflowMap: object;
  gaps: object[];
  monetaryImpact: object;
  pages: object[];
  mockEndpoints: object[];
  integrations: object[];
  walkthroughSteps: object[];
  manifest: object;
}

const PRESETS: Record<string, DemoPreset> = {
  ryan: {
    name: "Ryan Haugland",
    email: "ryanrhaugland@gmail.com",
    businessName: "Haugland Consulting",
    plan: "DOUBLE_BLEND",
    description:
      "We run a consulting business and track all our client projects in Google Sheets. " +
      "Every week I manually pull data from QuickBooks invoices, cross-reference with our " +
      "Sheets tracker, and send a summary email to each client. This takes 3+ hours every " +
      "Monday. I want a system that auto-syncs invoices, updates the tracker, and sends " +
      "branded status emails to clients automatically.",
    industry: "Consulting",
    transcript:
      "SLUSHIE: Hey Ryan, thanks for joining. Walk me through your Monday morning.\n\n" +
      "RYAN: Sure. So every Monday I open QuickBooks and pull all invoices from the past week. " +
      "Then I go to our Google Sheet — it's got a tab per client — and I manually copy over " +
      "the invoice amounts, dates, payment status. That alone takes about an hour.\n\n" +
      "SLUSHIE: And then the emails?\n\n" +
      "RYAN: Yeah, after the sheet is updated I write a status email to each active client. " +
      "\"Hey, here's your project status, here's what was invoiced, here's what's outstanding.\" " +
      "Each one takes 10-15 minutes because I'm pulling numbers from the sheet and formatting it nicely. " +
      "With 12 active clients that's another 2 hours easy.\n\n" +
      "SLUSHIE: What tools are involved? QuickBooks, Google Sheets, and Gmail?\n\n" +
      "RYAN: QuickBooks Online for invoicing, Google Sheets for the master tracker, and Gmail for the status emails. " +
      "I've tried Zapier but it couldn't handle the cross-referencing logic.\n\n" +
      "SLUSHIE: Got it. What does the ideal state look like?\n\n" +
      "RYAN: I want to wake up Monday and the sheet is already updated with last week's invoices. " +
      "Then each client gets a branded email with their project status — automatically. I just review and hit send. " +
      "Saves me 3 hours minimum.",
    workflowMap: {
      trigger: "weekly (Monday 6am)",
      steps: [
        { id: "1", action: "Pull invoices from QuickBooks API", tool: "QuickBooks Online" },
        { id: "2", action: "Match invoices to client tabs in Google Sheets", tool: "Google Sheets" },
        { id: "3", action: "Update payment status and amounts per client", tool: "Google Sheets" },
        { id: "4", action: "Generate branded status email per active client", tool: "Gmail" },
        { id: "5", action: "Queue emails for review in draft folder", tool: "Gmail" },
      ],
    },
    gaps: [
      { severity: "high", description: "No automated sync between QuickBooks and Sheets — 1hr manual data entry weekly" },
      { severity: "high", description: "Status emails written manually — 2hrs weekly across 12 clients" },
      { severity: "medium", description: "No payment status tracking — overdue invoices discovered late" },
    ],
    monetaryImpact: { total: "$2,400/month", hoursSaved: 12, confidence: "high" },
    pages: [
      { name: "Dashboard", path: "/", description: "Overview of all clients with invoice status, next email due" },
      { name: "Client Detail", path: "/client/:id", description: "Per-client view showing invoices, payment history, email log" },
      { name: "Email Templates", path: "/templates", description: "Branded email template editor with variable placeholders" },
    ],
    mockEndpoints: [
      { method: "GET", path: "/api/invoices", description: "Pull recent invoices from QuickBooks" },
      { method: "POST", path: "/api/sync", description: "Sync QuickBooks data to Google Sheets" },
      { method: "POST", path: "/api/emails/generate", description: "Generate status emails for all active clients" },
    ],
    integrations: [
      { name: "QuickBooks Online", type: "oauth", status: "ready" },
      { name: "Google Sheets", type: "service_account", status: "ready" },
      { name: "Gmail", type: "oauth", status: "ready" },
    ],
    walkthroughSteps: [
      { title: "Auto-sync invoices", description: "Every Monday at 6am, the system pulls all new invoices from QuickBooks and matches them to your client tracker in Google Sheets." },
      { title: "Smart matching", description: "Invoices are automatically matched to the right client tab using email and company name. Payment status is updated in real-time." },
      { title: "Branded emails", description: "Each client gets a personalized status email with their project updates, invoice summary, and outstanding balances — drafted and ready for your review." },
      { title: "One-click send", description: "Review the drafted emails in your Gmail, make any tweaks, and send. What used to take 3 hours now takes 10 minutes." },
    ],
    manifest: {
      pages: [
        { name: "Dashboard", route: "/", components: ["ClientGrid", "InvoiceStatusBar", "WeeklyDigest"] },
        { name: "Client Detail", route: "/client/:id", components: ["InvoiceTable", "PaymentTimeline", "EmailLog"] },
        { name: "Templates", route: "/templates", components: ["TemplateEditor", "VariablePicker"] },
      ],
      decisionLog: [
        { decision: "Used weekly cron over real-time sync", reason: "Client only needs Monday summaries — real-time adds complexity without value" },
        { decision: "Draft emails instead of auto-send", reason: "Client wants final review before emails go out" },
      ],
    },
  },
  adam: {
    name: "Adam Roozen",
    email: "aroozen@gmail.com",
    businessName: "Roozen Media",
    plan: "TRIPLE_FREEZE",
    description:
      "We're a media agency managing 15+ social media accounts. Right now we copy-paste " +
      "analytics from Instagram, TikTok, and YouTube into a master Google Sheet every Friday, " +
      "then manually build client reports in Google Slides. Each report takes 45 minutes. " +
      "I need a pipeline that pulls analytics from all platforms, aggregates them into a " +
      "dashboard, and auto-generates branded PDF reports for each client.",
    industry: "Digital Marketing",
    transcript:
      "SLUSHIE: Adam, walk me through your Friday reporting process.\n\n" +
      "ADAM: Every Friday my team spends the entire afternoon on reports. We manage 15 social " +
      "media accounts across Instagram, TikTok, and YouTube. For each account, someone logs " +
      "into the platform, screenshots the analytics, copies the numbers into our master Google Sheet, " +
      "then builds a slide deck in Google Slides with the highlights.\n\n" +
      "SLUSHIE: How long per client?\n\n" +
      "ADAM: About 45 minutes each. So with 15 clients that's over 11 hours of work every Friday. " +
      "We have 3 people doing it and it still takes all afternoon. And honestly, the reports look " +
      "inconsistent because everyone formats them differently.\n\n" +
      "SLUSHIE: What metrics are you tracking?\n\n" +
      "ADAM: The big ones — followers, engagement rate, impressions, reach, video views for TikTok and YouTube. " +
      "Then week-over-week and month-over-month trends. Clients love seeing growth graphs.\n\n" +
      "SLUSHIE: And the dream state?\n\n" +
      "ADAM: I want the system to pull everything automatically on Friday morning. Give me a dashboard " +
      "where I can see all 15 clients at a glance. Then auto-generate branded PDF reports — our colors, " +
      "our logo, nice charts — and either email them to clients or let me download them. " +
      "Cuts 11 hours down to maybe 30 minutes of review.",
    workflowMap: {
      trigger: "weekly (Friday 7am)",
      steps: [
        { id: "1", action: "Pull analytics from Instagram Graph API", tool: "Instagram" },
        { id: "2", action: "Pull analytics from TikTok Business API", tool: "TikTok" },
        { id: "3", action: "Pull analytics from YouTube Data API", tool: "YouTube" },
        { id: "4", action: "Aggregate metrics per client in master sheet", tool: "Google Sheets" },
        { id: "5", action: "Calculate WoW and MoM trends", tool: "Internal" },
        { id: "6", action: "Generate branded PDF report per client", tool: "Internal" },
        { id: "7", action: "Email reports to clients or stage for download", tool: "Gmail" },
      ],
    },
    gaps: [
      { severity: "high", description: "Manual data collection from 3 platforms — 6+ hrs weekly for 15 accounts" },
      { severity: "high", description: "Report generation is manual and inconsistent — 5+ hrs weekly" },
      { severity: "medium", description: "No real-time dashboard for account health overview" },
      { severity: "low", description: "Trend calculations done by hand, prone to errors" },
    ],
    monetaryImpact: { total: "$4,800/month", hoursSaved: 40, confidence: "high" },
    pages: [
      { name: "Agency Dashboard", path: "/", description: "All 15 clients at a glance — followers, engagement, alerts" },
      { name: "Client Analytics", path: "/client/:id", description: "Deep dive into one client across all platforms" },
      { name: "Report Builder", path: "/reports", description: "Auto-generated branded PDF reports, ready to send" },
      { name: "Settings", path: "/settings", description: "Platform connections, branding, email preferences" },
    ],
    mockEndpoints: [
      { method: "GET", path: "/api/analytics/instagram/:accountId", description: "Pull Instagram metrics" },
      { method: "GET", path: "/api/analytics/tiktok/:accountId", description: "Pull TikTok metrics" },
      { method: "GET", path: "/api/analytics/youtube/:channelId", description: "Pull YouTube metrics" },
      { method: "POST", path: "/api/reports/generate", description: "Generate branded PDF reports" },
      { method: "POST", path: "/api/reports/send", description: "Email reports to clients" },
    ],
    integrations: [
      { name: "Instagram Graph API", type: "oauth", status: "ready" },
      { name: "TikTok Business API", type: "oauth", status: "ready" },
      { name: "YouTube Data API", type: "api_key", status: "ready" },
      { name: "Google Sheets", type: "service_account", status: "ready" },
      { name: "Gmail", type: "oauth", status: "ready" },
    ],
    walkthroughSteps: [
      { title: "Automated data pull", description: "Every Friday at 7am, the system connects to Instagram, TikTok, and YouTube APIs to pull the latest analytics for all 15 client accounts." },
      { title: "Agency dashboard", description: "See all clients at a glance — follower growth, engagement rates, top performing content, and week-over-week trends across all platforms." },
      { title: "Branded PDF reports", description: "Auto-generated reports with your agency's logo, colors, and branding. Each client gets a professional deck with charts, trends, and highlights." },
      { title: "One-click delivery", description: "Reports are staged for review. Send them all at once or download individually. What used to take 11 hours now takes 30 minutes of review." },
    ],
    manifest: {
      pages: [
        { name: "Agency Dashboard", route: "/", components: ["ClientGrid", "EngagementHeatmap", "AlertsBanner"] },
        { name: "Client Analytics", route: "/client/:id", components: ["PlatformTabs", "MetricsChart", "ContentTable", "TrendCards"] },
        { name: "Reports", route: "/reports", components: ["ReportList", "PDFPreview", "BulkSendButton"] },
        { name: "Settings", route: "/settings", components: ["PlatformConnections", "BrandingEditor", "EmailConfig"] },
      ],
      decisionLog: [
        { decision: "Weekly batch pull over real-time streaming", reason: "Reports are weekly — real-time adds API cost without value" },
        { decision: "PDF reports over Google Slides", reason: "PDFs are portable, brandable, and don't require client Google access" },
        { decision: "Staged delivery over auto-send", reason: "Agency wants final review of each report before client sees it" },
      ],
    },
  },
};

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { preset } = body;

    const data = PRESETS[preset];
    if (!data) {
      return NextResponse.json(
        { error: "invalid preset — use 'ryan' or 'adam'" },
        { status: 400 }
      );
    }

    // create client
    const client = await prisma.client.create({
      data: {
        name: data.businessName,
        industry: data.industry,
        contactName: data.name,
        contactEmail: data.email,
      },
    });

    // meeting time = now
    const meetingTime = new Date();

    // create booking
    const booking = await prisma.booking.create({
      data: {
        name: data.name,
        email: data.email,
        businessName: data.businessName,
        plan: data.plan,
        description: data.description,
        meetingTime,
        calendarEventId: `demo-${nanoid(10)}`,
        clientId: client.id,
      },
    });

    // create call with realistic transcript
    const call = await prisma.call.create({
      data: {
        clientId: client.id,
        startedAt: new Date(meetingTime.getTime() - 60 * 60 * 1000), // 1hr before
        endedAt: meetingTime,
        transcript: data.transcript,
        coachingLog: [],
      },
    });

    // create pipeline run
    const pipelineRun = await prisma.pipelineRun.create({
      data: {
        clientId: client.id,
        callId: call.id,
        status: "RUNNING",
      },
    });

    // seed build artifacts: Analysis → BuildSpec → Prototype
    const analysis = await prisma.analysis.create({
      data: {
        callId: call.id,
        workflowMap: data.workflowMap,
        gaps: data.gaps,
        monetaryImpact: data.monetaryImpact,
      },
    });

    const buildSpec = await prisma.buildSpec.create({
      data: {
        analysisId: analysis.id,
        version: 1,
        uiRequirements: data.pages,
        dataModels: data.mockEndpoints,
        integrations: data.integrations,
        walkthroughSteps: data.walkthroughSteps,
      },
    });

    const prototypeNanoid = nanoid(12);

    await prisma.prototype.create({
      data: {
        buildSpecId: buildSpec.id,
        version: 1,
        manifest: data.manifest,
        decisionLog: (data.manifest as { decisionLog?: object[] }).decisionLog ?? [],
        previewUrl: `/preview/${prototypeNanoid}`,
      },
    });

    // create tracker with password auth + link prototype preview
    const slug = nanoid(21);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    const tempPassword = generateTempPassword();
    const passwordHash = await bcrypt.hash(tempPassword, 10);

    const steps = BOOKING_STEPS.map((s, i) => ({
      ...s,
      status: i === 0 ? "done" : "pending",
      completedAt: i === 0 ? new Date().toISOString() : null,
    }));

    await prisma.tracker.create({
      data: {
        bookingId: booking.id,
        pipelineRunId: pipelineRun.id,
        prototypeNanoid,
        slug,
        currentStep: 1,
        steps,
        expiresAt,
        passwordHash,
        mustChangePassword: true,
      },
    });

    return NextResponse.json({
      ok: true,
      trackingSlug: slug,
      bookingId: booking.id,
      tempPassword,
      email: data.email,
      name: data.name,
      businessName: data.businessName,
    });
  } catch (err) {
    console.error("demo booking creation failed:", err);
    return NextResponse.json(
      { error: "something went wrong creating the demo" },
      { status: 500 }
    );
  }
}
