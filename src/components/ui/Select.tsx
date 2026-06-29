'use client'

import * as SelectPrimitive from '@radix-ui/react-select'
import { Check, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface SelectOption {
  value: string
  label: string
  dot?: string
}

interface Props {
  value: string
  onValueChange: (value: string) => void
  options: SelectOption[]
  placeholder?: string
  disabled?: boolean
  className?: string
  align?: 'start' | 'center' | 'end'
}

export default function Select({
  value,
  onValueChange,
  options,
  placeholder,
  disabled,
  className,
  align = 'start',
}: Props) {
  return (
    <SelectPrimitive.Root value={value || undefined} onValueChange={onValueChange} disabled={disabled}>
      <SelectPrimitive.Trigger
        className={cn(
          'flex items-center justify-between gap-2 w-full bg-input border border-border rounded-md px-3 py-2 text-sm',
          'focus:outline-none focus:ring-1 focus:ring-ring data-[placeholder]:text-muted-foreground',
          'disabled:opacity-50 disabled:cursor-not-allowed transition-colors hover:border-foreground/20',
          className,
        )}
      >
        <SelectPrimitive.Value placeholder={placeholder} />
        <SelectPrimitive.Icon>
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>

      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={4}
          align={align}
          className={cn(
            'z-[60] min-w-[var(--radix-select-trigger-width)] max-h-72 overflow-hidden',
            'bg-popover border border-border rounded-lg shadow-2xl',
          )}
        >
          <SelectPrimitive.Viewport className="p-1">
            {options.map((o) => (
              <SelectPrimitive.Item
                key={o.value}
                value={o.value}
                className={cn(
                  'relative flex items-center gap-2 pl-2 pr-7 py-1.5 text-sm rounded-md cursor-pointer select-none outline-none',
                  'data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground',
                  'data-[state=checked]:text-primary',
                )}
              >
                {o.dot && <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: o.dot }} />}
                <SelectPrimitive.ItemText>{o.label}</SelectPrimitive.ItemText>
                <SelectPrimitive.ItemIndicator className="absolute right-2 inline-flex items-center">
                  <Check className="w-4 h-4" />
                </SelectPrimitive.ItemIndicator>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  )
}
