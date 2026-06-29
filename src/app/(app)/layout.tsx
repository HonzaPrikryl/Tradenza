import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/layout/Sidebar'
import AppHeader from '@/components/layout/AppHeader'
import { SidebarProvider } from '@/components/layout/SidebarContext'
import { getAccounts } from '@/lib/actions/accounts'
import { getTagGroups } from '@/lib/actions/tags'
import { getTradeSymbols } from '@/lib/actions/trades'
import { readGlobalFilters } from '@/lib/global-filters'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const [accounts, tagGroups, filters, symbols] = await Promise.all([
    getAccounts(),
    getTagGroups(),
    readGlobalFilters(),
    getTradeSymbols(),
  ])

  return (
    <SidebarProvider>
      <div className="flex h-screen overflow-hidden bg-background">
        <Sidebar />
        <main className="flex-1 overflow-y-auto min-w-0">
          <AppHeader
            accounts={accounts.map((a) => ({ id: a.id, name: a.name }))}
            tagGroups={tagGroups}
            filters={filters}
            symbols={symbols}
          />
          {children}
        </main>
      </div>
    </SidebarProvider>
  )
}
