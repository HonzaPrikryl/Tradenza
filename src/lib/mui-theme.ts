import { createTheme, type Theme } from '@mui/material/styles'
import type {} from '@mui/x-date-pickers/themeAugmentation'

const PRIMARY = 'hsl(var(--primary))'
const PRIMARY_FG = 'hsl(var(--primary-foreground))'

export function makeMuiTheme(mode: 'light' | 'dark'): Theme {
  return createTheme({
    palette: {
      mode,
      primary: {
        main: PRIMARY,
        light: PRIMARY,
        dark: PRIMARY,
        contrastText: PRIMARY_FG,
      },
      background: {
        default: 'hsl(var(--background))',
        paper: 'hsl(var(--popover))',
      },
      text: {
        primary: 'hsl(var(--foreground))',
        secondary: 'hsl(var(--muted-foreground))',
      },
      divider: 'hsl(var(--border))',
    },
    shape: { borderRadius: 8 },
    typography: {
      fontFamily: 'DM Sans, system-ui, sans-serif',
      fontSize: 13,
    },
    components: {
      MuiPaper: {
        styleOverrides: {
          root: {
            backgroundColor: 'hsl(var(--popover))',
            color: 'hsl(var(--popover-foreground))',
            backgroundImage: 'none',
            border: '1px solid hsl(var(--border))',
          },
        },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            backgroundColor: 'hsl(var(--input) / 0.4)',
            fontSize: 13,
            color: 'hsl(var(--foreground))',
            '& .MuiOutlinedInput-notchedOutline': { borderColor: 'hsl(var(--border))' },
            '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'hsl(var(--foreground) / 0.2)' },
            '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: PRIMARY, borderWidth: 1 },
          },
          input: { padding: '10px 12px', color: 'hsl(var(--foreground))' },
        },
      },
      MuiInputAdornment: {
        styleOverrides: { root: { color: 'hsl(var(--muted-foreground))' } },
      },
      MuiIconButton: {
        styleOverrides: { root: { color: 'hsl(var(--muted-foreground))' } },
      },
      MuiPickersCalendarHeader: {
        styleOverrides: {
          label: { color: 'hsl(var(--foreground))', fontWeight: 600 },
          switchViewButton: { color: 'hsl(var(--foreground))' },
        },
      },
      MuiPickersArrowSwitcher: {
        styleOverrides: { button: { color: 'hsl(var(--foreground))' } },
      },
      // ── Days ─────────────────────────────────────────────────────────
      MuiDayCalendar: {
        styleOverrides: { weekDayLabel: { color: 'hsl(var(--muted-foreground))' } },
      },
      MuiPickersDay: {
        styleOverrides: {
          root: {
            color: 'hsl(var(--foreground))',
            '&:hover': { backgroundColor: 'hsl(var(--accent))' },
            '&.Mui-selected': {
              backgroundColor: PRIMARY,
              color: PRIMARY_FG,
              '&:hover': { backgroundColor: PRIMARY },
              '&:focus': { backgroundColor: PRIMARY },
            },
            '&.MuiPickersDay-today': { borderColor: PRIMARY },
          },
        },
      },
      MuiPickersYear: {
        styleOverrides: {
          yearButton: {
            color: 'hsl(var(--foreground))',
            '&:hover': { backgroundColor: 'hsl(var(--accent))' },
            '&.Mui-selected': { backgroundColor: PRIMARY, color: PRIMARY_FG, '&:hover': { backgroundColor: PRIMARY } },
          },
        },
      },
      MuiPickersMonth: {
        styleOverrides: {
          monthButton: {
            color: 'hsl(var(--foreground))',
            '&:hover': { backgroundColor: 'hsl(var(--accent))' },
            '&.Mui-selected': { backgroundColor: PRIMARY, color: PRIMARY_FG, '&:hover': { backgroundColor: PRIMARY } },
          },
        },
      },
      MuiMultiSectionDigitalClockSection: {
        styleOverrides: {
          item: {
            color: 'hsl(var(--foreground))',
            '&:hover': { backgroundColor: 'hsl(var(--accent))' },
            '&.Mui-selected': { backgroundColor: PRIMARY, color: PRIMARY_FG, '&:hover': { backgroundColor: PRIMARY } },
          },
        },
      },
      MuiDigitalClock: {
        styleOverrides: {
          item: {
            color: 'hsl(var(--foreground))',
            '&:hover': { backgroundColor: 'hsl(var(--accent))' },
            '&.Mui-selected': { backgroundColor: PRIMARY, color: PRIMARY_FG, '&:hover': { backgroundColor: PRIMARY } },
          },
        },
      },
      MuiButton: {
        styleOverrides: { root: { textTransform: 'none', color: PRIMARY } },
      },
    },
  })
}

export const muiTheme = makeMuiTheme('dark')
