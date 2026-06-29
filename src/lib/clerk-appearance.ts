import { type Appearance } from '@clerk/types'

export const clerkAppearance: Appearance = {
  variables: {
    colorPrimary: 'hsl(var(--primary))',
    colorBackground: 'hsl(var(--card))',
    colorText: 'hsl(var(--foreground))',
    colorTextSecondary: 'hsl(var(--muted-foreground))',
    colorInputBackground: 'hsl(var(--input))',
    colorInputText: 'hsl(var(--foreground))',
    colorNeutral: 'hsl(var(--foreground))',
    colorDanger: 'hsl(var(--loss))',
    colorSuccess: 'hsl(var(--profit))',
    borderRadius: 'var(--radius)',
  },
}
