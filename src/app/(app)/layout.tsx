import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/layout/Sidebar'
import AppHeader from '@/components/layout/AppHeader'
import { SidebarProvider } from '@/components/layout/SidebarContext'
import { getAccounts } from '@/lib/actions/accounts'
import { getTagGroups } from '@/lib/actions/tags'
import { getTradeSymbols } from '@/lib/actions/trades'
import { getStrategies } from '@/lib/actions/strategies'
import { readGlobalFilters } from '@/lib/global-filters'
import { readGlobalSettings } from '@/lib/global-settings'
import { isAdmin } from '@/lib/admin'
import { ensureUserRecord } from '@/lib/db/sync-user'
import TimezoneDetector from '@/components/layout/TimezoneDetector'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')
  await ensureUserRecord(userId)

  const [accounts, tagGroups, filters, symbols, strategies, admin, settings] = await Promise.all([
    getAccounts(),
    getTagGroups(),
    readGlobalFilters(),
    getTradeSymbols(),
    getStrategies(),
    isAdmin(),
    readGlobalSettings(),
  ])

  return (
    <SidebarProvider>
      <TimezoneDetector hasTimezone={!!settings.timezone} />
      <div translate="no" className="flex h-screen overflow-hidden bg-background">
        <Sidebar isAdmin={admin} />
        <main className="flex-1 overflow-y-auto min-w-0">
          <AppHeader
            accounts={accounts.map((a) => ({ id: a.id, name: a.name }))}
            tagGroups={tagGroups}
            filters={filters}
            symbols={symbols}
            strategies={strategies.map((s) => ({ id: s.id, name: s.name, color: s.color }))}
          />
          {children}
        </main>
      </div>
    </SidebarProvider>
  )
}
