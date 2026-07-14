const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const TURNSTILE_TEST_SECRET_KEY = "1x0000000000000000000000000000000AA";

interface TurnstileVerifyResponse {
  success: boolean;
  "error-codes"?: string[];
}

export async function POST(request: Request) {
  let data: Record<string, unknown>;
  try {
    data = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const name = typeof data.name === "string" ? data.name.trim() : "";
  const email = typeof data.email === "string" ? data.email.trim() : "";
  const message = typeof data.message === "string" ? data.message.trim() : "";
  const turnstileToken = typeof data["cf-turnstile-response"] === "string" ? data["cf-turnstile-response"] : "";

  if (!name || !email || !message) {
    return Response.json({ error: "Name, email, and message are required." }, { status: 400 });
  }
  if (!EMAIL_RE.test(email)) {
    return Response.json({ error: "Please enter a valid email address." }, { status: 400 });
  }

  const turnstileResult = await verifyTurnstileToken(turnstileToken, getClientIp(request));
  if (!turnstileResult.ok) {
    return Response.json({ error: turnstileResult.error }, { status: turnstileResult.status });
  }

  const submission = { name, email, message, receivedAt: new Date().toISOString() };

  const webhookUrl = process.env.CONTACT_WEBHOOK_URL;
  if (webhookUrl) {
    try {
      const res = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(submission),
      });
      if (!res.ok) {
        throw new Error(`webhook responded ${res.status}`);
      }
    } catch {
      return Response.json({ error: "Could not deliver your message. Please try again later." }, { status: 502 });
    }
  }

  return Response.json({ ok: true });
}

async function verifyTurnstileToken(token: string, remoteIp: string | null) {
  const secret =
    process.env.TURNSTILE_SECRET_KEY ??
    (process.env.NODE_ENV === "production" ? undefined : TURNSTILE_TEST_SECRET_KEY);
  if (!secret) {
    return { ok: false, status: 500, error: "Contact form protection is not configured." };
  }

  if (!token) {
    return { ok: false, status: 400, error: "Please complete the security check." };
  }

  const formData = new FormData();
  formData.append("secret", secret);
  formData.append("response", token);
  if (remoteIp) {
    formData.append("remoteip", remoteIp);
  }

  try {
    const response = await fetch(TURNSTILE_VERIFY_URL, {
      method: "POST",
      body: formData,
    });
    if (!response.ok) {
      return { ok: false, status: 502, error: "Could not verify the security check. Please try again." };
    }

    const result = (await response.json()) as TurnstileVerifyResponse;
    if (!result.success) {
      return { ok: false, status: 400, error: "Security check failed. Please try again." };
    }

    return { ok: true };
  } catch {
    return { ok: false, status: 502, error: "Could not verify the security check. Please try again." };
  }
}

function getClientIp(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return request.headers.get("cf-connecting-ip") ?? forwardedFor ?? null;
}
