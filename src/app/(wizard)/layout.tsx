import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'

export default async function WizardLayout({ children }: { children: React.ReactNode }) {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-background text-foreground">
      <div
        className="pointer-events-none fixed inset-0 -z-10"
        style={{
          background:
            'radial-gradient(60% 50% at 0% 0%, hsl(258 90% 66% / 0.18), transparent 60%), radial-gradient(50% 45% at 100% 100%, hsl(258 90% 66% / 0.14), transparent 60%)',
        }}
      />
      {children}
    </div>
  )
}
