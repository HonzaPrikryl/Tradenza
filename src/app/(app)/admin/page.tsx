import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { isAdmin } from '@/lib/admin'
import { getUserOverview } from '@/lib/actions/admin'
import AdminUsersTable from '@/components/admin/AdminUsersTable'

export const metadata: Metadata = { title: 'Admin · Users' }

// Internal, e-mail-gated overview of every user and their key numbers. Hidden
// (404) for anyone who is not an admin, so its existence isn't even disclosed.
export default async function AdminPage() {
  if (!(await isAdmin())) notFound()

  const users = await getUserOverview()

  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
  const totalUsers = users.length
  const activeUsers = users.filter((u) => u.tradeCount > 0).length
  const newUsers = users.filter((u) => u.createdAt && new Date(u.createdAt).getTime() >= weekAgo).length
  const totalTrades = users.reduce((sum, u) => sum + u.tradeCount, 0)

  return (
    <div className="p-4 sm:p-6 w-full animate-in">
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight">Users</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Internal admin overview</p>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4 sm:max-w-2xl">
        <StatTile label="Total users" value={totalUsers} />
        <StatTile label="Active (≥1 trade)" value={activeUsers} />
        <StatTile label="New (7 days)" value={newUsers} />
        <StatTile label="Total trades" value={totalTrades} />
      </div>

      <AdminUsersTable users={users} />
    </div>
  )
}

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3">
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
    </div>
  )
}
