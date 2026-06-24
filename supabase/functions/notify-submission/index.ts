// ================================================================
// ODAC Internal Portal â€” notify-submission Edge Function
// Triggered by a Supabase Database Webhook on INSERT to submissions.
// Sends two emails via Resend:
//   1. Confirmation to the submitter
//   2. New submission alert to the ODAC admin inbox
//
// HOW TO DEPLOY:
// Supabase dashboard â†’ Edge Functions â†’ New function
// Name it exactly: notify-submission
// Paste this entire file into the editor and click Deploy.
//
// REQUIRED SECRETS (set in Edge Functions â†’ Manage secrets):
//   RESEND_API_KEY  â€” your Resend API key (starts with re_)
//   ADMIN_EMAIL     â€” where to send admin alerts (e.g. info@osoyoosartscouncil.com)
//   FROM_EMAIL      â€” the "from" address (must be a verified Resend sender domain)
// ================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

/* â”€â”€ Environment â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const ADMIN_EMAIL    = Deno.env.get('ADMIN_EMAIL')    ?? '';
const FROM_EMAIL     = Deno.env.get('FROM_EMAIL')     ?? 'submissions@osoyoosartscouncil.com';

/* â”€â”€ Type label map â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
const TYPE_LABELS: Record<string, string> = {
  event:        'Event',
  exhibition:   'Exhibition',
  artwork:      'Artwork',
  announcement: 'Announcement',
};

/* â”€â”€ Entry point â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
serve(async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  let payload: { record?: Record<string, unknown> };
  try {
    payload = await req.json();
  } catch {
    return new Response('Invalid JSON body', { status: 400 });
  }

  const record = payload?.record;
  if (!record) {
    return new Response('No record in webhook payload', { status: 400 });
  }

  const errors: string[] = [];

  /* Email 1 â€” Confirmation to submitter */
  if (typeof record.submitter_email === 'string' && record.submitter_email) {
    const err = await sendEmail({
      to:      record.submitter_email,
      subject: `We received your submission â€” ${record.title}`,
      html:    buildConfirmationEmail(record),
    });
    if (err) errors.push(`Submitter confirmation: ${err}`);
  }

  /* Email 2 â€” Alert to ODAC admin inbox */
  if (ADMIN_EMAIL) {
    const err = await sendEmail({
      to:      ADMIN_EMAIL,
      subject: `New submission from ${record.group_name} â€” ${record.title}`,
      html:    buildAdminAlertEmail(record),
    });
    if (err) errors.push(`Admin alert: ${err}`);
  }

  if (errors.length > 0) {
    console.error('Email delivery errors:', errors);
    return new Response(
      JSON.stringify({ ok: false, errors }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  return new Response(
    JSON.stringify({ ok: true }),
    { headers: { 'Content-Type': 'application/json' } }
  );
});

/* â”€â”€ Resend API helper â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
}): Promise<string | null> {
  if (!RESEND_API_KEY) {
    return 'RESEND_API_KEY secret is not set. Check Edge Function secrets.';
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization:  `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from:    FROM_EMAIL,
        to:      opts.to,
        subject: opts.subject,
        html:    opts.html,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '(no body)');
      return `Resend HTTP ${res.status}: ${body}`;
    }

    return null;
  } catch (e) {
    return String(e);
  }
}

/* â”€â”€ Email templates â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function buildConfirmationEmail(r: Record<string, unknown>): string {
  const typeLabel  = TYPE_LABELS[r.content_type as string] ?? String(r.content_type ?? '');
  const submitted  = r.created_at
    ? new Date(r.created_at as string).toLocaleDateString('en-CA', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      })
    : 'just now';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Submission received â€” ODAC</title>
</head>
<body style="margin:0;padding:0;background:#f4f0eb;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f0eb;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);max-width:600px;width:100%;">

        <!-- Header -->
        <tr>
          <td style="background:#1f6b6b;padding:24px 28px;border-bottom:3px solid #d4a843;">
            <p style="margin:0;font-size:11px;color:#9fd4d4;text-transform:uppercase;letter-spacing:1.5px;">Osoyoos &amp; District Arts Council</p>
            <h1 style="margin:8px 0 0;font-size:20px;color:#ffffff;font-weight:600;">Submission Received âœ“</h1>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:28px 28px 24px;">
            <p style="font-size:16px;color:#1a1a1a;margin:0 0 12px;">
              Hello, <strong>${esc(String(r.group_name ?? ''))}</strong> â€” thank you for submitting!
            </p>
            <p style="font-size:14px;color:#5a5a5a;line-height:1.65;margin:0 0 20px;">
              Our team reviews every submission within <strong>48&nbsp;hours</strong>.
              We may make small edits to your description before posting it to
              Facebook and the ODAC website. If we need anything from you,
              we'll reply to this email.
            </p>

            <!-- Summary card -->
            <table width="100%" cellpadding="0" cellspacing="0"
              style="background:#fdf6e3;border-left:4px solid #d4a843;border-radius:5px;padding:0;">
              <tr>
                <td style="padding:16px 20px;">
                  <p style="margin:0 0 8px;font-size:12px;font-weight:700;color:#3d2a00;text-transform:uppercase;letter-spacing:0.8px;">What you submitted</p>
                  <table cellpadding="0" cellspacing="0" style="font-size:13px;color:#1a1a1a;line-height:1.9;">
                    <tr><td style="color:#888;padding-right:12px;white-space:nowrap;">Type</td><td><strong>${esc(typeLabel)}</strong></td></tr>
                    <tr><td style="color:#888;padding-right:12px;white-space:nowrap;">Title</td><td><strong>${esc(String(r.title ?? ''))}</strong></td></tr>
                    <tr><td style="color:#888;padding-right:12px;white-space:nowrap;">Received</td><td>${esc(submitted)}</td></tr>
                  </table>
                </td>
              </tr>
            </table>

            <p style="font-size:13px;color:#888;margin:24px 0 0;line-height:1.5;">
              Questions? Reply to this email or contact us at
              <a href="mailto:${esc(FROM_EMAIL)}" style="color:#1f6b6b;">${esc(FROM_EMAIL)}</a>.
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f4f0eb;padding:14px 28px;border-top:1px solid #e0dbd4;text-align:center;">
            <p style="margin:0;font-size:11px;color:#aaa;">
              Celebrating Arts &amp; Culture in Osoyoos &nbsp;Â·&nbsp;
              <a href="https://osoyoosartscouncil.com" style="color:#1f6b6b;text-decoration:none;">osoyoosartscouncil.com</a>
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function buildAdminAlertEmail(r: Record<string, unknown>): string {
  const typeLabel = TYPE_LABELS[r.content_type as string] ?? String(r.content_type ?? '');
  const submitted = r.created_at
    ? new Date(r.created_at as string).toLocaleString('en-CA', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
        hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
      })
    : 'just now';

  const submissionId = String(r.id ?? '');
  const storagePath  = submissionId
    ? `submissions/${submissionId}/`
    : '(see Supabase Storage â†’ submission-files)';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>New submission â€” ODAC Portal</title>
</head>
<body style="margin:0;padding:0;background:#f4f0eb;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f0eb;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);max-width:600px;width:100%;">

        <!-- Header -->
        <tr>
          <td style="background:#1f6b6b;padding:24px 28px;border-bottom:3px solid #d4a843;">
            <p style="margin:0;font-size:11px;color:#9fd4d4;text-transform:uppercase;letter-spacing:1.5px;">ODAC Internal Portal</p>
            <h1 style="margin:8px 0 0;font-size:20px;color:#ffffff;font-weight:600;">New Submission â€” Review within 48&nbsp;h</h1>
          </td>
        </tr>

        <!-- Alert banner -->
        <tr>
          <td style="background:#e8f4f4;padding:12px 28px;border-bottom:1px solid #c8e0e0;">
            <p style="margin:0;font-size:13px;color:#1f6b6b;">
              <strong>${esc(String(r.group_name ?? ''))}</strong> just submitted content for review.
              &nbsp;Submitted: ${esc(submitted)}
            </p>
          </td>
        </tr>

        <!-- Submission details -->
        <tr>
          <td style="padding:24px 28px;">
            <table width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;border-collapse:collapse;">
              <tr>
                <td style="padding:10px 0;color:#888;width:110px;vertical-align:top;border-bottom:1px solid #f0ece4;">Group</td>
                <td style="padding:10px 0;color:#1a1a1a;font-weight:600;border-bottom:1px solid #f0ece4;">${esc(String(r.group_name ?? ''))}</td>
              </tr>
              <tr>
                <td style="padding:10px 0;color:#888;vertical-align:top;border-bottom:1px solid #f0ece4;">Type</td>
                <td style="padding:10px 0;color:#1a1a1a;border-bottom:1px solid #f0ece4;">${esc(typeLabel)}</td>
              </tr>
              <tr>
                <td style="padding:10px 0;color:#888;vertical-align:top;border-bottom:1px solid #f0ece4;">Title</td>
                <td style="padding:10px 0;color:#1a1a1a;font-weight:600;border-bottom:1px solid #f0ece4;">${esc(String(r.title ?? ''))}</td>
              </tr>
              <tr>
                <td style="padding:10px 0;color:#888;vertical-align:top;border-bottom:1px solid #f0ece4;">Description</td>
                <td style="padding:10px 0;color:#1a1a1a;line-height:1.6;border-bottom:1px solid #f0ece4;white-space:pre-wrap;">${esc(String(r.description ?? ''))}</td>
              </tr>
              <tr>
                <td style="padding:10px 0;color:#888;vertical-align:top;">Reply to</td>
                <td style="padding:10px 0;">
                  <a href="mailto:${esc(String(r.submitter_email ?? ''))}" style="color:#1f6b6b;">${esc(String(r.submitter_email ?? ''))}</a>
                </td>
              </tr>
            </table>

            <!-- Files note -->
            <div style="background:#fdf6e3;border-left:4px solid #d4a843;border-radius:5px;padding:14px 18px;margin-top:20px;">
              <p style="margin:0;font-size:12px;color:#3d2a00;line-height:1.6;">
                <strong>Attached files</strong> (if any) are in Supabase Storage:<br>
                Storage â†’ submission-files â†’ <code style="background:#f5ead0;padding:1px 5px;border-radius:3px;">${esc(storagePath)}</code>
              </p>
            </div>

            <p style="font-size:12px;color:#aaa;margin-top:20px;line-height:1.5;">
              This submission should be posted to Facebook and the ODAC website within 48 hours per Kelsey's performance plan.
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f4f0eb;padding:14px 28px;border-top:1px solid #e0dbd4;text-align:center;">
            <p style="margin:0;font-size:11px;color:#aaa;">ODAC Internal Portal Â· Phase 1</p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/* â”€â”€ HTML escape â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function esc(str: string): string {
  return str
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&#039;');
}

