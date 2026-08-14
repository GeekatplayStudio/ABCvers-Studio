import { CoffeeIcon } from './Icons'

/** Where a thank-you goes. Opened in a new tab, never in place. */
export const COFFEE_URL = 'https://geekatplay.gumroad.com/coffee'

/**
 * Support link for Geekatplay Studio. Shown at the top and bottom of the
 * studio so it is always reachable without ever sitting in the way of the work.
 */
export function CoffeeLink({ compact = false }: { compact?: boolean }) {
  return (
    <a
      className={`btn btn--coffee${compact ? ' btn--icon' : ''}`}
      href={COFFEE_URL}
      target="_blank"
      rel="noopener noreferrer"
      title="Enjoying ABCvers Studio? Buy Vladimir a coffee - opens geekatplay.gumroad.com"
      aria-label="Buy me a coffee - support Geekatplay Studio"
    >
      <CoffeeIcon size={15} />
      {!compact && <span>Buy me a coffee</span>}
    </a>
  )
}
