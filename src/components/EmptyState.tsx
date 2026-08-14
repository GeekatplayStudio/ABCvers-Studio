import { useRef } from 'react'
import { useStudio } from '../store/useStudio'
import { ACCEPT_ATTRIBUTE, MAX_PANELS } from '../lib/guards'
import { PlusIcon } from './Icons'

export function EmptyState() {
  const addFiles = useStudio((state) => state.addFiles)
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <div className="empty">
      <div className="empty__card">
        <span className="empty__mark" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <h1 className="empty__title">Compare side by side</h1>
        <p className="empty__copy">
          Drop videos or images anywhere on this window, or browse for them. Up to {MAX_PANELS} panels
          play in perfect sync, with one scrubber, one volume and one zoom driving all of them.
        </p>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT_ATTRIBUTE}
          multiple
          className="visually-hidden"
          onChange={(event) => {
            const files = event.target.files
            if (files && files.length > 0) addFiles(Array.from(files))
            event.target.value = ''
          }}
        />
        <button type="button" className="btn btn--primary btn--lg" onClick={() => inputRef.current?.click()}>
          <PlusIcon size={16} />
          Choose files
        </button>
        <p className="empty__footnote">
          Everything stays on this machine. Nothing is uploaded, ever.
        </p>
      </div>
    </div>
  )
}
