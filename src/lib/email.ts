export function isMailerConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.FEEDBACK_FROM_EMAIL)
}

export async function sendEmail(args: { to: string; subject: string; text: string }): Promise<boolean> {
  if (!isMailerConfigured()) return false
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.FEEDBACK_FROM_EMAIL,
        to: args.to,
        subject: args.subject,
        text: args.text,
      }),
    })
    return res.ok
  } catch {
    return false
  }
}
