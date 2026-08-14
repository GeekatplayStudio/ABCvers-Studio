import { useEffect } from 'react'
import { useStudio } from '../store/useStudio'
import { CloseIcon } from './Icons'

const LIFETIME_MS = 5000

export function Toasts() {
  const toasts = useStudio((state) => state.toasts)
  const dismiss = useStudio((state) => state.dismissToast)

  useEffect(() => {
    if (toasts.length === 0) return
    const timers = toasts.map((toast) => setTimeout(() => dismiss(toast.id), LIFETIME_MS))
    return () => timers.forEach(clearTimeout)
  }, [toasts, dismiss])

  if (toasts.length === 0) return null

  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className="toast" data-tone={toast.tone}>
          <span>{toast.message}</span>
          <button
            type="button"
            className="iconbtn iconbtn--sm"
            onClick={() => dismiss(toast.id)}
            aria-label="Dismiss"
          >
            <CloseIcon size={12} />
          </button>
        </div>
      ))}
    </div>
  )
}
