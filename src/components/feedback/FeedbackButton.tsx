'use client'

import { useRef, useState, useTransition } from 'react'
import { MessageSquarePlus, Bug, Lightbulb, MessageCircle, ImagePlus, Loader2, X, type LucideIcon } from 'lucide-react'
import { toast } from 'sonner'
import Dialog from '@/components/ui/Dialog'
import { handleRateLimit } from '@/components/ui/rate-limit-toast'
import { submitFeedback, type FeedbackKind } from '@/lib/actions/feedback'
import { uploadNoteImage } from '@/lib/actions/uploads'
import { cn } from '@/lib/utils'
import { t } from '@/i18n'

const KINDS: { kind: FeedbackKind; icon: LucideIcon }[] = [
  { kind: 'bug', icon: Bug },
  { kind: 'idea', icon: Lightbulb },
  { kind: 'other', icon: MessageCircle },
]

export default function FeedbackButton() {
  const [open, setOpen] = useState(false)
  const [kind, setKind] = useState<FeedbackKind>('bug')
  const [message, setMessage] = useState('')
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const [pending, startTransition] = useTransition()

  function close() {
    setOpen(false)
    setMessage('')
    setKind('bug')
    setImageUrl(null)
    setUploading(false)
  }

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-picking the same file
    if (!file) return
    setUploading(true)
    try {
      const form = new FormData()
      form.set('file', file)
      const res = await uploadNoteImage(form)
      if (handleRateLimit(res)) return
      if (res.status === 'ok') setImageUrl(res.url)
      else if (res.status === 'notConfigured') toast.error(t('feedback.imageUnavailable'))
      else toast.error(res.message ?? t('feedback.error'))
    } catch {
      toast.error(t('feedback.error'))
    } finally {
      setUploading(false)
    }
  }

  function submit() {
    const text = message.trim()
    if (!text || pending) return
    startTransition(async () => {
      const res = await submitFeedback({ kind, message: text, imageUrl: imageUrl ?? undefined })
      if (handleRateLimit(res)) return
      if (res.success) {
        toast.success(t('feedback.success'))
        close()
      } else {
        toast.error(t('feedback.error'))
      }
    })
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <MessageSquarePlus className="w-4 h-4 shrink-0" />
        {t('feedback.trigger')}
      </button>

      {open && (
        <Dialog open={open} onClose={close} className="max-w-lg">
          <div className="border-b border-border px-5 py-4">
            <h2 className="text-base font-semibold">{t('feedback.title')}</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">{t('feedback.description')}</p>
          </div>

          <div className="space-y-3 px-5 py-4">
            <div className="grid grid-cols-3 gap-2">
              {KINDS.map(({ kind: k, icon: Icon }) => (
                <button
                  key={k}
                  onClick={() => setKind(k)}
                  className={cn(
                    'flex items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-sm transition-colors',
                    kind === k
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:text-foreground hover:bg-accent',
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {t(`feedback.kind.${k}`)}
                </button>
              ))}
            </div>

            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={t('feedback.placeholder')}
              rows={5}
              maxLength={4000}
              autoFocus
              className="w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            />

            <input ref={fileRef} type="file" accept="image/*" hidden onChange={onPickFile} />
            {imageUrl ? (
              <div className="relative inline-block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imageUrl} alt="" className="max-h-32 rounded-md border border-border object-contain" />
                <button
                  onClick={() => setImageUrl(null)}
                  aria-label={t('feedback.removeImage')}
                  className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground hover:bg-accent disabled:opacity-60"
              >
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
                {uploading ? t('feedback.uploading') : t('feedback.attach')}
              </button>
            )}
          </div>

          <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
            <button
              onClick={close}
              className="rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {t('feedback.cancel')}
            </button>
            <button
              onClick={submit}
              disabled={pending || message.trim().length === 0}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
            >
              {pending ? t('feedback.sending') : t('feedback.submit')}
            </button>
          </div>
        </Dialog>
      )}
    </>
  )
}
