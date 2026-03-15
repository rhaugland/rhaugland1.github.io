import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM = process.env.EMAIL_FROM ?? "slushie <noreply@slushie.dev>";

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
    await resend.emails.send({ from: FROM, to, subject, html });
  } catch (err) {
    console.error("[email] send failed:", err);
  }
}

// ── templates ──

function layout(body: string): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#f8f9fa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:520px;margin:0 auto;padding:40px 20px;">
    <div style="text-align:center;margin-bottom:32px;">
      <span style="font-size:24px;font-weight:800;color:#6d28d9;">slushie</span>
    </div>
    <div style="background:#fff;border-radius:12px;padding:32px;border:1px solid #e5e7eb;">
      ${body}
    </div>
    <div style="text-align:center;margin-top:24px;">
      <p style="font-size:11px;color:#9ca3af;margin:0;">powered by slushie</p>
    </div>
  </div>
</body>
</html>`;
}

function button(href: string, label: string): string {
  return `<a href="${href}" style="display:inline-block;background:linear-gradient(135deg,#6d28d9,#a855f7);color:#fff;font-weight:700;font-size:14px;padding:12px 28px;border-radius:8px;text-decoration:none;margin-top:8px;">${label}</a>`;
}

// ── 1. booking confirmed — tracker link delivery ──

export async function sendBookingConfirmed({
  to,
  name,
  businessName,
  planLabel,
  meetingTime,
  slug,
  tempPassword,
}: {
  to: string;
  name: string;
  businessName: string;
  planLabel: string;
  meetingTime: string;
  slug: string;
  tempPassword: string;
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
    subject: `your slushie blend is booked — ${planLabel}`,
    html: layout(`
      <h2 style="margin:0 0 8px;font-size:18px;color:#111;">hey ${name},</h2>
      <p style="margin:0 0 16px;font-size:14px;color:#6b7280;">
        your <strong>${planLabel}</strong> for <strong>${businessName}</strong> is confirmed. we're excited to build something great for you.
      </p>
      <div style="background:#f3f0ff;border:1px solid #ddd6fe;border-radius:8px;padding:16px;margin-bottom:20px;">
        <p style="margin:0 0 4px;font-size:12px;color:#6b7280;">your meeting</p>
        <p style="margin:0;font-size:15px;font-weight:700;color:#111;">${meetingLabel}</p>
      </div>
      <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin-bottom:20px;">
        <p style="margin:0 0 8px;font-size:12px;color:#6b7280;">your tracker login</p>
        <p style="margin:0 0 4px;font-size:13px;color:#111;"><strong>email:</strong> ${to}</p>
        <p style="margin:0 0 8px;font-size:13px;color:#111;"><strong>temporary password:</strong> <code style="background:#f3f0ff;padding:2px 6px;border-radius:4px;font-size:14px;font-weight:700;color:#6d28d9;">${tempPassword}</code></p>
        <p style="margin:0;font-size:11px;color:#9ca3af;">you'll be asked to set your own password on first login.</p>
      </div>
      <p style="margin:0 0 8px;font-size:14px;color:#6b7280;">
        track every step of your build in real time:
      </p>
      <div style="text-align:center;margin:20px 0;">
        ${button(trackerUrl(slug), "view your tracker")}
      </div>
      <p style="margin:16px 0 0;font-size:12px;color:#9ca3af;">
        bookmark this link — it updates automatically as we work on your build.
      </p>
    `),
  });
}

// ── 2. build ready for client approval (step 3 → 4) ──

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
    subject: `your ${businessName} build is ready for review`,
    html: layout(`
      <h2 style="margin:0 0 8px;font-size:18px;color:#111;">hey ${name},</h2>
      <p style="margin:0 0 16px;font-size:14px;color:#6b7280;">
        great news — our team has finished reviewing your build for <strong>${businessName}</strong> and it's ready for you to take a look.
      </p>
      <p style="margin:0 0 16px;font-size:14px;color:#6b7280;">
        you can approve it or request changes. we'll keep iterating until it's exactly right.
      </p>
      <div style="text-align:center;margin:20px 0;">
        ${button(trackerUrl(slug), "review your build")}
      </div>
    `),
  });
}

// ── 3. credentials needed (step 4 → 5) ──

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
      <h2 style="margin:0 0 8px;font-size:18px;color:#111;">hey ${name},</h2>
      <p style="margin:0 0 16px;font-size:14px;color:#6b7280;">
        your build for <strong>${businessName}</strong> is approved! now we need your workflow tool credentials so we can connect everything up.
      </p>
      <p style="margin:0 0 16px;font-size:14px;color:#6b7280;">
        head to your tracker to securely submit your logins — we'll handle the rest.
      </p>
      <div style="text-align:center;margin:20px 0;">
        ${button(trackerUrl(slug), "submit credentials")}
      </div>
    `),
  });
}

// ── 4. payment due (step 5 → 6) ──

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
    subject: `${businessName} is built and connected — complete payment`,
    html: layout(`
      <h2 style="margin:0 0 8px;font-size:18px;color:#111;">hey ${name},</h2>
      <p style="margin:0 0 16px;font-size:14px;color:#6b7280;">
        your <strong>${planLabel}</strong> for <strong>${businessName}</strong> is fully built, tested, and connected to your workflow.
      </p>
      <div style="background:#f3f0ff;border:1px solid #ddd6fe;border-radius:8px;padding:16px;margin-bottom:20px;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <div>
            <p style="margin:0 0 4px;font-size:12px;color:#6b7280;">your plan</p>
            <p style="margin:0;font-size:14px;font-weight:700;color:#111;">${planLabel}</p>
          </div>
          <p style="margin:0;font-size:24px;font-weight:800;color:#111;">${planPrice}</p>
        </div>
      </div>
      <p style="margin:0 0 16px;font-size:14px;color:#6b7280;">
        complete payment to unlock full access.
      </p>
      <div style="text-align:center;margin:20px 0;">
        ${button(trackerUrl(slug), "pay now")}
      </div>
      <p style="margin:16px 0 0;font-size:12px;color:#9ca3af;">
        secure payment via Stripe.
      </p>
    `),
  });
}

// ── 5. survey open (step 6 → 7) ──

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
    subject: `how'd we do? quick survey + free add-on`,
    html: layout(`
      <h2 style="margin:0 0 8px;font-size:18px;color:#111;">hey ${name},</h2>
      <p style="margin:0 0 16px;font-size:14px;color:#6b7280;">
        your <strong>${businessName}</strong> build is complete and fully unlocked. we hope you love it!
      </p>
      <p style="margin:0 0 16px;font-size:14px;color:#6b7280;">
        take 30 seconds to share your experience and you'll get a <strong style="color:#6d28d9;">free workflow add-on</strong> as a thank you.
      </p>
      <div style="text-align:center;margin:20px 0;">
        ${button(trackerUrl(slug), "take the survey")}
      </div>
    `),
  });
}
