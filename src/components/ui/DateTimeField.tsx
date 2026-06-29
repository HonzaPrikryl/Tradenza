'use client'

import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker'
import { format, parse, isValid, startOfDay } from 'date-fns'

interface Props {
  /** "YYYY-MM-DDTHH:mm:ss" or "" */
  value: string
  onChange: (value: string) => void
  className?: string
}

const STORE = "yyyy-MM-dd'T'HH:mm:ss"

export default function DateTimeField({ value, onChange, className }: Props) {
  const parsed = value ? parse(value, STORE, new Date()) : null

  return (
    <DateTimePicker
      value={parsed && isValid(parsed) ? parsed : null}
      onChange={(d: Date | null) => onChange(d && isValid(d) ? format(d, STORE) : '')}
      format="MM/dd/yyyy HH:mm:ss"
      ampm={false}
      views={['year', 'month', 'day', 'hours', 'minutes', 'seconds']}
      openTo="day"
      referenceDate={startOfDay(new Date())}
      timeSteps={{ hours: 1, minutes: 1, seconds: 1 }}
      className={className}
      slotProps={{
        textField: { size: 'small', fullWidth: true },
        popper: { placement: 'bottom-start' },
      }}
    />
  )
}
