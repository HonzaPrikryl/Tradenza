'use client'

import { DatePicker } from '@mui/x-date-pickers/DatePicker'
import { format, parse, isValid } from 'date-fns'

interface Props {
  /** "YYYY-MM-DD" or "" */
  value: string
  onChange: (value: string) => void
  className?: string
}

const STORE = 'yyyy-MM-dd'

export default function DateField({ value, onChange, className }: Props) {
  const parsed = value ? parse(value, STORE, new Date()) : null

  return (
    <DatePicker
      value={parsed && isValid(parsed) ? parsed : null}
      onChange={(d: Date | null) => onChange(d && isValid(d) ? format(d, STORE) : '')}
      format="MM/dd/yyyy"
      views={['year', 'month', 'day']}
      openTo="day"
      className={className}
      slotProps={{
        textField: { size: 'small', fullWidth: true },
        popper: { placement: 'bottom-start' },
      }}
    />
  )
}
