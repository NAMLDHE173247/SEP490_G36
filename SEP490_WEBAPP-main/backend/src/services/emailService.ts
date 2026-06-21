type EmailPayload = { to: string | string[]; subject: string; text: string };

export async function sendTransactionalEmail(payload: EmailPayload): Promise<{ sent: boolean; reason?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) return { sent: false, reason: 'email_not_configured' };
  const recipients = (Array.isArray(payload.to) ? payload.to : [payload.to]).filter(Boolean);
  if (!recipients.length) return { sent: false, reason: 'no_recipient' };
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: recipients, subject: payload.subject, text: payload.text }),
    });
    if (!response.ok) return { sent: false, reason: `resend_${response.status}` };
    return { sent: true };
  } catch (error: any) {
    return { sent: false, reason: error?.message || 'email_request_failed' };
  }
}
