import { currentUser } from '@clerk/nextjs/server'

// Admin access is gated by e-mail: only the addresses listed in the private
// `ADMIN_EMAILS` env var (comma-separated) may see the internal /admin overview.
// When the var is empty the admin area is disabled entirely — so a misconfigured
// deployment fails closed, never open.
function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
}

// True when the currently signed-in Clerk user owns one of the admin e-mails.
export async function isAdmin(): Promise<boolean> {
  const allow = adminEmails()
  if (allow.length === 0) return false
  const user = await currentUser()
  if (!user) return false
  return user.emailAddresses.some((e) => allow.includes(e.emailAddress.toLowerCase()))
}
