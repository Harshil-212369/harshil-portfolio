/**
 * POST /api/contact  — contact-form backend (Cloudflare Pages Function).
 *
 * Runs on the Cloudflare Pages / Workers FREE tier (100k req/day; over-limit
 * requests fail rather than bill). Sends mail via Resend's free tier.
 *
 * Required env vars (set in Pages project → Settings → Variables, NOT in this
 * public repo — that's why nothing here is hardcoded):
 *   RESEND_API_KEY  (secret)  — from resend.com
 *   CONTACT_TO      (secret)  — destination inbox
 *   CONTACT_FROM              — verified sender, e.g. "Portfolio <contact@harshilsuthar.com>"
 *
 * No PII or keys live in this file, so it is safe in the public GitHub repo.
 */

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json" },
  });

export async function onRequestPost({ request, env }) {
  // Parse JSON or form-encoded bodies
  let data;
  try {
    const ct = request.headers.get("content-type") || "";
    data = ct.includes("application/json")
      ? await request.json()
      : Object.fromEntries(await request.formData());
  } catch {
    return json({ success: false, error: "Malformed request." }, 400);
  }

  // Honeypot: real users never fill the hidden 'botcheck' field. Silently 200.
  if (data.botcheck) return json({ success: true });

  const name = String(data.name || "").trim();
  const email = String(data.email || "").trim();
  const subject = String(data.user_subject || "").trim();
  const message = String(data.message || "").trim();

  // Validation
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  if (!name || name.length > 100)
    return json({ success: false, error: "Enter a valid name." }, 422);
  if (!emailOk)
    return json({ success: false, error: "Enter a valid email address." }, 422);
  if (message.length < 5 || message.length > 5000)
    return json({ success: false, error: "Message must be 5–5000 characters." }, 422);

  if (!env.RESEND_API_KEY || !env.CONTACT_TO || !env.CONTACT_FROM)
    return json({ success: false, error: "Email service not configured yet." }, 500);

  // Send via Resend
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.RESEND_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from: env.CONTACT_FROM,
      to: [env.CONTACT_TO],
      reply_to: email,
      subject: subject
        ? `[harshilsuthar.com] ${subject}`
        : `New message from ${name}`,
      text:
        `Name: ${name}\n` +
        `Email: ${email}\n` +
        `Subject: ${subject || "(none)"}\n\n` +
        `${message}`,
    }),
  });

  if (!r.ok)
    return json(
      { success: false, error: "Couldn't send right now — please try again." },
      502
    );

  return json({ success: true });
}
// Non-POST methods get an automatic 405 from Pages (no other handler exported).
