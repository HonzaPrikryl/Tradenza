'use client'

import { useMemo } from 'react'
import { AppRouterCacheProvider } from '@mui/material-nextjs/v15-appRouter'
import { ThemeProvider } from '@mui/material/styles'
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFnsV3'
import { makeMuiTheme } from '@/lib/mui-theme'
import { useTheme } from '@/components/providers/ThemeProvider'

export default function MuiProvider({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme()
  const muiTheme = useMemo(() => makeMuiTheme(theme), [theme])

  return (
    <AppRouterCacheProvider options={{ key: 'mui' }}>
      <ThemeProvider theme={muiTheme}>
        <LocalizationProvider dateAdapter={AdapterDateFns}>{children}</LocalizationProvider>
      </ThemeProvider>
    </AppRouterCacheProvider>
  )
}
