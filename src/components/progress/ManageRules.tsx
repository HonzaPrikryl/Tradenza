'use client'

import { useState } from 'react'
import { ListChecks, CalendarCheck } from 'lucide-react'
import { cn } from '@/lib/utils'
import { t } from '@/i18n'
import TabList, { type TabItem } from '@/components/ui/TabList'
import RulesManager from './RulesManager'
import type { ProgressRule } from '@/lib/actions/progress'

type ManageScope = 'trading' | 'habit'

const TAB_ID = 'manage'

// The "Manage" tab: one home for defining every rule. Trading rules and daily habits
// sit side by side on desktop; below lg the two columns collapse into one and a
// sub-switcher toggles between them, so the daily list is never buried under the fold
// the way it was when its CRUD lived at the bottom of the Daily discipline tab.
export default function ManageRules({ rules }: { rules: ProgressRule[] }) {
  const [scope, setScope] = useState<ManageScope>('trading')

  const subTabs: TabItem<ManageScope>[] = [
    { key: 'trading', label: t('progress.manage.trading'), icon: <ListChecks className="h-4 w-4" /> },
    { key: 'habit', label: t('progress.manage.daily'), icon: <CalendarCheck className="h-4 w-4" /> },
  ]

  return (
    <div className="space-y-4">
      {/* Mobile sub-switcher — only where the two columns collapse into a single one. */}
      <TabList
        tabs={subTabs}
        value={scope}
        onChange={setScope}
        label={t('progress.manage.aria')}
        idBase={TAB_ID}
        className="lg:hidden"
      />

      {/* Two independent CRUD lists. Both stay mounted so switching the mobile
          sub-tab (a CSS show/hide) keeps each list's local state intact.

          Visibility stays on `max-lg:hidden` rather than the `hidden` attribute: above lg
          the switcher doesn't exist and BOTH panels are meant to be visible, which no
          single boolean can express. `display:none` already removes the inactive one from
          the accessibility tree on mobile, which is exactly the behaviour we want. */}
      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
        <div
          role="tabpanel"
          id={`${TAB_ID}-panel-trading`}
          aria-labelledby={`${TAB_ID}-tab-trading`}
          className={cn(scope !== 'trading' && 'max-lg:hidden')}
        >
          <RulesManager rules={rules} scope="trading" />
        </div>
        <div
          role="tabpanel"
          id={`${TAB_ID}-panel-habit`}
          aria-labelledby={`${TAB_ID}-tab-habit`}
          className={cn(scope !== 'habit' && 'max-lg:hidden')}
        >
          <RulesManager rules={rules} scope="habit" />
        </div>
      </div>
    </div>
  )
}
