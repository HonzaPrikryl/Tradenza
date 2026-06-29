'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import * as Popover from '@radix-ui/react-popover'
import { Pencil, Check, Plus, Sliders } from 'lucide-react'
import { setDefaultTemplate } from '@/lib/actions/dashboard'
import type { DashboardTemplateDTO } from '@/lib/dashboard/types'
import { t } from '@/i18n'
import { cn } from '@/lib/utils'

interface Props {
  templates: DashboardTemplateDTO[]
  activeId: string | null
  onEdit: (template: DashboardTemplateDTO) => void
  onCreate: () => void
}

export default function DashboardToolbar({ templates, activeId, onEdit, onCreate }: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()

  function switchTo(id: string) {
    if (!id) return
    startTransition(async () => {
      await setDefaultTemplate(id)
      router.refresh()
    })
  }

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          aria-label={t('dashboard.toolbar.customize')}
          className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium transition-colors hover:bg-accent md:mt-4"
        >
          <Sliders className="w-4 h-4 shrink-0" />
          <span className="hidden md:inline">{t('dashboard.toolbar.customize')}</span>
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={6}
          className="z-50 w-64 rounded-xl border border-border bg-popover p-1.5 shadow-xl animate-fade-in"
        >
          <div className="px-2 py-1 text-[11px] uppercase tracking-wide text-muted-foreground">
            {t('dashboard.toolbar.templates')}
          </div>

          <div className="max-h-[260px] overflow-y-auto">
            {templates.map((tpl) => {
              const active = tpl.id !== '' ? tpl.id === activeId : true
              return (
                <div key={tpl.id || 'default'} className="group flex items-center gap-1 rounded-md hover:bg-accent">
                  <button
                    onClick={() => switchTo(tpl.id)}
                    className="flex flex-1 items-center gap-2 px-2 py-1.5 text-sm text-left min-w-0"
                  >
                    <Check className={cn('w-4 h-4 shrink-0', active ? 'text-primary' : 'opacity-0')} />
                    <span className="truncate">{tpl.name}</span>
                  </button>
                  <Popover.Close asChild>
                    <button
                      onClick={() => onEdit(tpl)}
                      className="mr-1 p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-background/60 transition-colors"
                      aria-label={t('dashboard.toolbar.editTemplate', { name: tpl.name })}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  </Popover.Close>
                </div>
              )
            })}
          </div>

          <div className="my-1.5 h-px bg-border" />

          <Popover.Close asChild>
            <button
              onClick={onCreate}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium text-primary hover:bg-accent transition-colors"
            >
              <Plus className="w-4 h-4" />
              {t('dashboard.toolbar.createNew')}
            </button>
          </Popover.Close>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
