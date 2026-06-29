'use client'

import { createContext, useContext, useState } from 'react'

interface SidebarCtx {
  open: boolean
  setOpen: (v: boolean) => void
  toggle: () => void
}

const Ctx = createContext<SidebarCtx | null>(null)

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  return <Ctx.Provider value={{ open, setOpen, toggle: () => setOpen((o) => !o) }}>{children}</Ctx.Provider>
}

export function useSidebar(): SidebarCtx {
  const c = useContext(Ctx)
  if (!c) throw new Error('useSidebar must be used within SidebarProvider')
  return c
}
