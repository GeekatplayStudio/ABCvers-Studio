/** Slim 1.5px stroke icon set, sized by the `size` prop. */
import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement> & { size?: number }

function Svg({ size = 16, children, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  )
}

export const PlayIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M7 4.5v15l13-7.5z" fill="currentColor" stroke="none" />
  </Svg>
)

export const PauseIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="6.5" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none" />
    <rect x="13.5" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none" />
  </Svg>
)

export const StopIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="6" y="6" width="12" height="12" rx="1.5" fill="currentColor" stroke="none" />
  </Svg>
)

export const StepBackIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M18 5.5v13L9 12z" fill="currentColor" stroke="none" />
    <path d="M6 5v14" />
  </Svg>
)

export const StepForwardIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 5.5v13L15 12z" fill="currentColor" stroke="none" />
    <path d="M18 5v14" />
  </Svg>
)

export const JumpBackIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M13 6.5v11L5.5 12z" fill="currentColor" stroke="none" />
    <path d="M21 6.5v11L13.5 12z" fill="currentColor" stroke="none" />
  </Svg>
)

export const JumpForwardIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 6.5v11L10.5 12z" fill="currentColor" stroke="none" />
    <path d="M11 6.5v11L18.5 12z" fill="currentColor" stroke="none" />
  </Svg>
)

export const CoffeeIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 9.5h13v5.5a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4z" />
    <path d="M17 11h1.6a2.4 2.4 0 0 1 0 4.8H17" />
    <path d="M7.5 3.2v2.4M11 2.8v2.8M14.5 3.6v2" />
  </Svg>
)

export const LoopIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 9a5 5 0 0 1 5-5h9" />
    <path d="m15 1.5 3 2.5-3 2.5" />
    <path d="M20 15a5 5 0 0 1-5 5H6" />
    <path d="m9 22.5-3-2.5 3-2.5" />
  </Svg>
)

export const VolumeIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 9.5h3.5L12 5.5v13L7.5 14.5H4z" fill="currentColor" stroke="none" />
    <path d="M15.5 9.2a4 4 0 0 1 0 5.6" />
    <path d="M18 6.8a7.5 7.5 0 0 1 0 10.4" />
  </Svg>
)

export const MuteIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 9.5h3.5L12 5.5v13L7.5 14.5H4z" fill="currentColor" stroke="none" />
    <path d="m16 9.5 5 5" />
    <path d="m21 9.5-5 5" />
  </Svg>
)

export const ZoomIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="M8.5 11h5M11 8.5v5" />
    <path d="m16 16 4.5 4.5" />
  </Svg>
)

export const ResetIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4.5 12a7.5 7.5 0 1 0 2.4-5.5" />
    <path d="M4 4v4h4" />
  </Svg>
)

export const CloseIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="m6.5 6.5 11 11M17.5 6.5l-11 11" />
  </Svg>
)

export const PlusIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
)

export const InfoIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 11v5.5" />
    <path d="M12 7.8h.01" />
  </Svg>
)

export const GridIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="4" y="4" width="7" height="16" rx="1.2" />
    <rect x="13" y="4" width="7" height="16" rx="1.2" />
  </Svg>
)

export const ArrowLeftIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M14.5 6.5 9 12l5.5 5.5" />
  </Svg>
)

export const ArrowRightIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9.5 6.5 15 12l-5.5 5.5" />
  </Svg>
)

export const FullscreenIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 9V4.5h5M20 9V4.5h-5M4 15v4.5h5M20 15v4.5h-5" />
  </Svg>
)

export const TrashIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4.5 6.5h15" />
    <path d="M9.5 6.5V4.8h5v1.7" />
    <path d="M6.5 6.5 7.4 20h9.2l.9-13.5" />
  </Svg>
)

export const HelpIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M9.7 9.6a2.4 2.4 0 1 1 3.1 2.6c-.6.2-.8.7-.8 1.3v.4" />
    <path d="M12 16.8h.01" />
  </Svg>
)
