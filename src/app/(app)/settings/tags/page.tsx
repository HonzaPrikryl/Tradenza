import TagsManagementClient from '@/components/settings/TagsManagementClient'
import { getTagGroups } from '@/lib/actions/tags'
import { t } from '@/i18n'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: t('meta.settingsTags') }

export default async function SettingsTagsPage() {
  const groups = await getTagGroups()

  return (
    <div className="p-4 sm:p-6 animate-in">
      <TagsManagementClient groups={groups} />
    </div>
  )
}
