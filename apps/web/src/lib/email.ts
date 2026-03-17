import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM = process.env.EMAIL_FROM ?? "slushie <team@slushie.agency>";

function baseUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

function trackerUrl(slug: string): string {
  return `${baseUrl()}/track/${slug}`;
}

// ── shared email wrapper ──

async function send({
  to,
  subject,
  html,
}: {
  to: string;
  subject: string;
  html: string;
}) {
  if (!process.env.RESEND_API_KEY) {
    console.log(`[email:demo] to=${to} subject="${subject}"`);
    return;
  }

  try {
    const result = await resend.emails.send({ from: FROM, to, subject, html });
    if (result.error) {
      console.error(`[email] resend error: to=${to} subject="${subject}"`, result.error);
    } else {
      console.log(`[email] sent: to=${to} subject="${subject}" id=${result.data?.id}`);
    }
  } catch (err) {
    console.error(`[email] send failed: to=${to} subject="${subject}"`, err);
  }
}

// ── brand layout ──

function layout(body: string): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#F8FAFC;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:520px;margin:0 auto;padding:40px 20px;">
    <div style="text-align:center;margin-bottom:32px;">
      <span style="font-size:24px;font-weight:800;background:linear-gradient(135deg,#DC2626,#3B5BDB);-webkit-background-clip:text;-webkit-text-fill-color:transparent;">slushie</span>
    </div>
    <div style="background:#fff;border-radius:12px;padding:32px;border:1px solid #E2E8F0;">
      ${body}
    </div>
    <div style="text-align:center;margin-top:24px;">
      <p style="font-size:11px;color:#94A3B8;margin:0;">powered by slushie</p>
    </div>
  </div>
</body>
</html>`;
}

function button(href: string, label: string): string {
  return `<a href="${href}" style="display:inline-block;background:linear-gradient(135deg,#DC2626,#3B5BDB);color:#fff;font-weight:700;font-size:14px;padding:12px 28px;border-radius:8px;text-decoration:none;margin-top:8px;">${label}</a>`;
}

function accent(text: string): string {
  return `<strong style="color:#DC2626;">${text}</strong>`;
}

function infoBox(content: string): string {
  return `<div style="background:linear-gradient(135deg,#FEE2E2,#EDE9FE,#DBEAFE);border:1px solid #E2E8F0;border-radius:8px;padding:16px;margin-bottom:20px;">${content}</div>`;
}

function mutedBox(content: string): string {
  return `<div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;padding:16px;margin-bottom:20px;">${content}</div>`;
}

// ── 1. booking confirmed — tracker link + credentials ──

export async function sendBookingConfirmed({
  to,
  name,
  businessName,
  planLabel,
  slug,
  tempPassword,
}: {
  to: string;
  name: string;
  businessName: string;
  planLabel: string;
  slug: string;
  tempPassword: string;
}) {
  await send({
    to,
    subject: `your slushie blend is booked — ${planLabel}`,
    html: layout(`
      <h2 style="margin:0 0 8px;font-size:18px;color:#0F172A;">hey ${name},</h2>
      <p style="margin:0 0 16px;font-size:14px;color:#64748B;">
        your ${accent(planLabel)} for ${accent(businessName)} is confirmed. we're already building your first prototype — your rep will reach out to schedule a discovery call.
      </p>
      ${mutedBox(`
        <p style="margin:0 0 8px;font-size:12px;color:#64748B;">your tracker login</p>
        <p style="margin:0 0 4px;font-size:13px;color:#0F172A;"><strong>email:</strong> ${to}</p>
        <p style="margin:0 0 8px;font-size:13px;color:#0F172A;"><strong>temporary password:</strong> <code style="background:#FEE2E2;padding:2px 6px;border-radius:4px;font-size:14px;font-weight:700;color:#DC2626;">${tempPassword}</code></p>
        <p style="margin:0;font-size:11px;color:#94A3B8;">you'll be asked to set your own password on first login.</p>
      `)}
      <p style="margin:0 0 8px;font-size:14px;color:#64748B;">
        track every step of your build in real time:
      </p>
      <div style="text-align:center;margin:20px 0;">
        ${button(trackerUrl(slug), "view your tracker")}
      </div>
      <p style="margin:16px 0 0;font-size:12px;color:#94A3B8;">
        bookmark this link — it updates automatically as we work on your build.
      </p>
    `),
  });
}

// ── discovery scheduling email ──

export async function sendDiscoveryScheduling({
  to,
  name,
  businessName,
  slug,
}: {
  to: string;
  name: string;
  businessName: string;
  slug: string;
}) {
  await send({
    to,
    subject: `${businessName} — let's schedule your discovery call`,
    html: layout(`
      <h2 style="margin:0 0 8px;font-size:18px;color:#0F172A;">hey ${name},</h2>
      <p style="margin:0 0 16px;font-size:14px;color:#64748B;">
        we've been working on your ${accent(businessName)} build and your first prototype is ready. now it's time to dig deeper.
      </p>
      <p style="margin:0 0 16px;font-size:14px;color:#64748B;">
        we'd love to schedule a ${accent("discovery call")} to walk through your workflow together — we'll ask questions about how you work day-to-day so we can build something that fits perfectly.
      </p>
      <p style="margin:0 0 16px;font-size:14px;color:#64748B;">
        just reply to this email with a few times that work for you, and we'll get it on the calendar.
      </p>
      <div style="text-align:center;margin:20px 0;">
        ${button(trackerUrl(slug), "view your prototype")}
      </div>
      <p style="margin:16px 0 0;font-size:12px;color:#94A3B8;">
        you can also preview your first build on your tracker page while we set up the call.
      </p>
    `),
  });
}

// ── 2. meeting confirmed — join link ──

export async function sendMeetingConfirmed({
  to,
  name,
  meetingTime,
  callUrl,
  slug,
}: {
  to: string;
  name: string;
  meetingTime: string;
  callUrl: string;
  slug: string;
}) {
  const meetingLabel = new Date(meetingTime).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  await send({
    to,
    subject: "your slushie meeting is coming up",
    html: layout(`
      <h2 style="margin:0 0 8px;font-size:18px;color:#0F172A;">hey ${name},</h2>
      <p style="margin:0 0 16px;font-size:14px;color:#64748B;">
        your meeting is confirmed. we'll walk through your workflow and figure out exactly what to build.
      </p>
      ${infoBox(`
        <p style="margin:0 0 4px;font-size:12px;color:#64748B;">your meeting</p>
        <p style="margin:0;font-size:15px;font-weight:700;color:#0F172A;">${meetingLabel}</p>
      `)}
      <div style="text-align:center;margin:20px 0;">
        ${button(callUrl, "join your call")}
      </div>
      <p style="margin:16px 0 0;font-size:12px;color:#94A3B8;">
        you can also join from your <a href="${trackerUrl(slug)}" style="color:#3B5BDB;text-decoration:none;">tracker page</a>.
      </p>
    `),
  });
}

// ── 3. team is reviewing — build in progress (step 3) ──

export async function sendTeamReviewing({
  to,
  name,
  businessName,
  slug,
}: {
  to: string;
  name: string;
  businessName: string;
  slug: string;
}) {
  await send({
    to,
    subject: `the slushie team is reviewing your ${businessName} build`,
    html: layout(`
      <h2 style="margin:0 0 8px;font-size:18px;color:#0F172A;">hey ${name},</h2>
      <p style="margin:0 0 16px;font-size:14px;color:#64748B;">
        we're reviewing your build for ${accent(businessName)} right now. our team is making sure everything blends right before we hand it over to you.
      </p>
      <p style="margin:0 0 16px;font-size:14px;color:#64748B;">
        you don't need to do anything yet — we'll email you when it's your turn to review.
      </p>
      <div style="text-align:center;margin:20px 0;">
        ${button(trackerUrl(slug), "check your tracker")}
      </div>
      <p style="margin:16px 0 0;font-size:12px;color:#94A3B8;">
        your tracker updates in real time so you can follow along.
      </p>
    `),
  });
}

// ── 4. your turn to review (step 4) ──

export async function sendBuildReadyForApproval({
  to,
  name,
  businessName,
  slug,
}: {
  to: string;
  name: string;
  businessName: string;
  slug: string;
}) {
  await send({
    to,
    subject: `it's your turn — review your ${businessName} build`,
    html: layout(`
      <h2 style="margin:0 0 8px;font-size:18px;color:#0F172A;">hey ${name},</h2>
      <p style="margin:0 0 16px;font-size:14px;color:#64748B;">
        your build for ${accent(businessName)} is ready for your review. take a look and let us know if it's good to go or if you'd like changes.
      </p>
      <p style="margin:0 0 16px;font-size:14px;color:#64748B;">
        we'll keep iterating until it's exactly right.
      </p>
      <div style="text-align:center;margin:20px 0;">
        ${button(trackerUrl(slug), "approve your build")}
      </div>
    `),
  });
}

// ── 5. send your credentials (step 5) ──

export async function sendCredentialsNeeded({
  to,
  name,
  businessName,
  slug,
}: {
  to: string;
  name: string;
  businessName: string;
  slug: string;
}) {
  await send({
    to,
    subject: `${businessName} — we need your login credentials`,
    html: layout(`
      <h2 style="margin:0 0 8px;font-size:18px;color:#0F172A;">hey ${name},</h2>
      <p style="margin:0 0 16px;font-size:14px;color:#64748B;">
        your build for ${accent(businessName)} is approved. now we need your workflow tool credentials so we can connect everything up.
      </p>
      <p style="margin:0 0 16px;font-size:14px;color:#64748B;">
        head to your tracker to securely submit your logins — we'll handle the rest.
      </p>
      <div style="text-align:center;margin:20px 0;">
        ${button(trackerUrl(slug), "submit credentials")}
      </div>
    `),
  });
}

// ── 6. payment due — workflow locked (step 6) ──

export async function sendPaymentDue({
  to,
  name,
  businessName,
  planLabel,
  planPrice,
  slug,
}: {
  to: string;
  name: string;
  businessName: string;
  planLabel: string;
  planPrice: string;
  slug: string;
}) {
  await send({
    to,
    subject: `${businessName} — please complete payment to unlock your workflow`,
    html: layout(`
      <h2 style="margin:0 0 8px;font-size:18px;color:#0F172A;">hey ${name},</h2>
      <p style="margin:0 0 16px;font-size:14px;color:#64748B;">
        your ${accent(planLabel)} for ${accent(businessName)} is fully built, tested, and connected. your workflow is locked until we receive payment.
      </p>
      ${infoBox(`
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <div>
            <p style="margin:0 0 4px;font-size:12px;color:#64748B;">your plan</p>
            <p style="margin:0;font-size:14px;font-weight:700;color:#0F172A;">${planLabel}</p>
          </div>
          <p style="margin:0;font-size:24px;font-weight:800;color:#0F172A;">${planPrice}</p>
        </div>
      `)}
      <div style="text-align:center;margin:20px 0;">
        ${button(trackerUrl(slug), "pay now")}
      </div>
      <p style="margin:16px 0 0;font-size:12px;color:#94A3B8;">
        secure payment via stripe.
      </p>
    `),
  });
}

// ── 7. survey — free workflow offer (step 7) ──

export async function sendSurveyOpen({
  to,
  name,
  businessName,
  slug,
}: {
  to: string;
  name: string;
  businessName: string;
  slug: string;
}) {
  await send({
    to,
    subject: "quick survey — earn a free workflow build",
    html: layout(`
      <h2 style="margin:0 0 8px;font-size:18px;color:#0F172A;">hey ${name},</h2>
      <p style="margin:0 0 16px;font-size:14px;color:#64748B;">
        your ${accent(businessName)} build is complete and fully unlocked.
      </p>
      <p style="margin:0 0 16px;font-size:14px;color:#64748B;">
        take 30 seconds to fill out our survey and you'll get a ${accent("free workflow build")} as a thank you.
      </p>
      <div style="text-align:center;margin:20px 0;">
        ${button(trackerUrl(slug), "take the survey")}
      </div>
    `),
  });
}

// ── 8. thank you + next workflow (for double/triple scoop) ──

export async function sendThankYou({
  to,
  name,
  businessName,
  slug,
  nextWorkflowBookingId,
  workflowNumber,
  totalWorkflows,
}: {
  to: string;
  name: string;
  businessName: string;
  slug: string;
  nextWorkflowBookingId?: string;
  workflowNumber?: number;
  totalWorkflows?: number;
}) {
  const hasMore = totalWorkflows && workflowNumber && workflowNumber < totalWorkflows;

  await send({
    to,
    subject: `thank you, ${name} — your ${businessName} build is complete`,
    html: layout(`
      <h2 style="margin:0 0 8px;font-size:18px;color:#0F172A;">hey ${name},</h2>
      <p style="margin:0 0 16px;font-size:14px;color:#64748B;">
        your ${accent(businessName)} workflow is live. thanks for trusting slushie — it was a pleasure building for you.
      </p>
      ${hasMore ? `
        ${infoBox(`
          <p style="margin:0 0 4px;font-size:12px;color:#64748B;">your plan includes</p>
          <p style="margin:0;font-size:15px;font-weight:700;color:#0F172A;">${totalWorkflows} workflows — ${totalWorkflows! - workflowNumber!} remaining</p>
        `)}
        <p style="margin:0 0 16px;font-size:14px;color:#64748B;">
          ready for your next build? book your next session whenever you're ready.
        </p>
        <div style="text-align:center;margin:20px 0;">
          ${button(nextWorkflowBookingId ? `${baseUrl()}/book/next/${nextWorkflowBookingId}` : `${baseUrl()}/book`, "book your next workflow")}
        </div>
      ` : `
        <div style="text-align:center;margin:20px 0;">
          ${button(trackerUrl(slug), "view your build")}
        </div>
      `}
      <p style="margin:16px 0 0;font-size:12px;color:#94A3B8;">
        need another workflow? we're always here. just book a new session.
      </p>
    `),
  });
}

// ── password updated — re-send credentials ──

export async function sendPasswordUpdated({
  to,
  name,
  slug,
  newPassword,
}: {
  to: string;
  name: string;
  slug: string;
  newPassword: string;
}) {
  await send({
    to,
    subject: "your slushie credentials have been updated",
    html: layout(`
      <h2 style="margin:0 0 8px;font-size:18px;color:#0F172A;">hey ${name},</h2>
      <p style="margin:0 0 16px;font-size:14px;color:#64748B;">
        your password has been updated. here are your credentials for safekeeping.
      </p>
      ${mutedBox(`
        <p style="margin:0 0 8px;font-size:12px;color:#64748B;">your tracker login</p>
        <p style="margin:0 0 4px;font-size:13px;color:#0F172A;"><strong>email:</strong> ${to}</p>
        <p style="margin:0 0 8px;font-size:13px;color:#0F172A;"><strong>password:</strong> <code style="background:#FEE2E2;padding:2px 6px;border-radius:4px;font-size:14px;font-weight:700;color:#DC2626;">${newPassword}</code></p>
      `)}
      <div style="text-align:center;margin:20px 0;">
        ${button(trackerUrl(slug), "view your tracker")}
      </div>
      <p style="margin:16px 0 0;font-size:12px;color:#94A3B8;">
        keep this email safe — it contains your login credentials.
      </p>
    `),
  });
}

// ── payment failed ──

export async function sendPaymentFailed({
  to,
  name,
  businessName,
  planLabel,
  slug,
}: {
  to: string;
  name: string;
  businessName: string;
  planLabel: string;
  slug: string;
}) {
  await send({
    to,
    subject: `${businessName} — payment didn't go through`,
    html: layout(`
      <h2 style="margin:0 0 8px;font-size:18px;color:#0F172A;">hey ${name},</h2>
      <p style="margin:0 0 16px;font-size:14px;color:#64748B;">
        your payment for the ${accent(planLabel)} build for ${accent(businessName)} didn't complete. no worries — your build is safe and waiting.
      </p>
      <div style="text-align:center;margin:20px 0;">
        ${button(trackerUrl(slug), "retry payment")}
      </div>
      <p style="margin:16px 0 0;font-size:12px;color:#94A3B8;">
        if you're having trouble, just reply to this email and we'll help.
      </p>
    `),
  });
}

// ── free add-on ready ──

export async function sendFreeAddonReady({
  to,
  name,
  businessName,
}: {
  to: string;
  name: string;
  businessName: string;
}) {
  await send({
    to,
    subject: "your free workflow add-on is ready to claim",
    html: layout(`
      <h2 style="margin:0 0 8px;font-size:18px;color:#0F172A;">hey ${name},</h2>
      <p style="margin:0 0 16px;font-size:14px;color:#64748B;">
        thanks for sharing your feedback on the ${accent(businessName)} build. as promised, you've earned a ${accent("free single scoop workflow add-on")}.
      </p>
      <div style="text-align:center;margin:20px 0;">
        ${button(`${baseUrl()}/book?addon=true`, "book your free add-on")}
      </div>
      <p style="margin:16px 0 0;font-size:12px;color:#94A3B8;">
        your add-on never expires. use it whenever you need a new workflow tool.
      </p>
    `),
  });
}

// ── next workflow ready (kept for backwards compat) ──

export async function sendNextWorkflowReady({
  to,
  name,
  businessName,
  bookingId,
  workflowNumber,
  totalWorkflows,
}: {
  to: string;
  name: string;
  businessName: string;
  bookingId: string;
  workflowNumber: number;
  totalWorkflows: number;
}) {
  await send({
    to,
    subject: `${businessName} — time to schedule workflow ${workflowNumber} of ${totalWorkflows}`,
    html: layout(`
      <h2 style="margin:0 0 8px;font-size:18px;color:#0F172A;">hey ${name},</h2>
      <p style="margin:0 0 16px;font-size:14px;color:#64748B;">
        your first workflow for ${accent(businessName)} is complete. your plan includes ${accent(`${totalWorkflows} workflows`)}, and it's time to kick off number ${accent(`${workflowNumber}`)}.
      </p>
      <div style="text-align:center;margin:20px 0;">
        ${button(`${baseUrl()}/book/next/${bookingId}`, "schedule your next workflow")}
      </div>
      <p style="margin:16px 0 0;font-size:12px;color:#94A3B8;">
        ${totalWorkflows - workflowNumber > 0
          ? `you'll still have ${totalWorkflows - workflowNumber} more workflow${totalWorkflows - workflowNumber > 1 ? "s" : ""} after this one.`
          : "this is your last included workflow — make it count!"}
      </p>
    `),
  });
}
