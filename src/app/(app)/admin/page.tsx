import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { isAdmin } from '@/lib/admin'
import { getUserOverview, reconcileUsersWithClerk } from '@/lib/actions/admin'
import AdminUsersTable from '@/components/admin/AdminUsersTable'
import { t } from '@/i18n'

export const metadata: Metadata = { title: 'Admin · Users' }
export const dynamic = 'force-dynamic'

// Internal, e-mail-gated overview of every user and their key numbers. Hidden
// (404) for anyone who is not an admin, so its existence isn't even disclosed.
export default async function AdminPage() {
  if (!(await isAdmin())) notFound()

  await reconcileUsersWithClerk()
  const users = await getUserOverview()

  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
  const totalUsers = users.length
  const activeUsers = users.filter((u) => u.tradeCount > 0).length
  const newUsers = users.filter((u) => u.createdAt && new Date(u.createdAt).getTime() >= weekAgo).length
  const totalTrades = users.reduce((sum, u) => sum + u.tradeCount, 0)

  return (
    <div className="p-4 sm:p-6 w-full animate-in">
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight">{t('admin.users.title')}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">{t('admin.users.subtitle')}</p>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4 sm:max-w-2xl">
        <StatTile label={t('admin.users.stats.totalUsers')} value={totalUsers} />
        <StatTile label={t('admin.users.stats.activeUsers')} value={activeUsers} />
        <StatTile label={t('admin.users.stats.newUsers')} value={newUsers} />
        <StatTile label={t('admin.users.stats.totalTrades')} value={totalTrades} />
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
