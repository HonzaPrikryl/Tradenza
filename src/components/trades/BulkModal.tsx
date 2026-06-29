'use client'

import { t } from '@/i18n'
import Modal from '@/components/ui/Modal'

export default function BulkModal({
  title,
  onClose,
  onApply,
  applyDisabled,
  children,
}: {
  title: string
  onClose: () => void
  onApply: () => void
  applyDisabled: boolean
  children: React.ReactNode
}) {
  return (
    <Modal
      title={title}
      onClose={onClose}
      onConfirm={onApply}
      confirmLabel={t('trades.bulk.apply')}
      confirmDisabled={applyDisabled}
      cancelLabel={t('trades.bulk.cancel')}
    >
      {children}
    </Modal>
  )
}
