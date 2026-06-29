'use client'

import { TimePicker } from '@mui/x-date-pickers/TimePicker'
import { format, parse, isValid } from 'date-fns'

interface Props {
  /** "HH:mm" or "" */
  value: string
  onChange: (value: string) => void
  className?: string
}

const FORMAT = 'HH:mm'

export default function TimeField({ value, onChange, className }: Props) {
  const parsed = value ? parse(value, FORMAT, new Date()) : null
  return (
    <TimePicker
      value={parsed && isValid(parsed) ? parsed : null}
      onChange={(d: Date | null) => onChange(d && isValid(d) ? format(d, FORMAT) : '')}
      ampm={false}
      views={['hours', 'minutes']}
      format={FORMAT}
      timeSteps={{ minutes: 1 }}
      className={className}
      slotProps={{
        textField: { size: 'small', fullWidth: true },
        popper: { placement: 'bottom-start' },
      }}
    />
  )
}
