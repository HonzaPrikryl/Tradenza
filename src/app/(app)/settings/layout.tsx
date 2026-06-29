import SettingsSidebar from '@/components/settings/SettingsSidebar'

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col lg:flex-row h-full min-h-[calc(100vh-3.5rem)]">
      <SettingsSidebar />
      <div className="flex-1 overflow-y-auto min-w-0">{children}</div>
    </div>
  )
}
