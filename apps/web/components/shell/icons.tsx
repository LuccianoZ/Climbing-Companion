// Inline stroke icons rather than an icon package: the mockups use a small,
// fixed set, and adding a dependency (plus its tree-shaking config) to draw
// eight glyphs is not something Epic 4 needs. BL-023's gear-requirement
// icon set is deliberately NOT here -- that story is held back until its
// artwork exists.

type IconProps = { className?: string };

const base = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  viewBox: '0 0 24 24',
  'aria-hidden': true,
};

export function MapIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M9 4 3 6.5v13L9 17l6 2.5 6-2.5v-13L15 6.5 9 4Z" />
      <path d="M9 4v13M15 6.5v13" />
    </svg>
  );
}

export function SearchIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m20 20-3.7-3.7" />
    </svg>
  );
}

export function ChatIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M20 12.5a7.5 7.5 0 0 1-7.5 7.5H8l-4 3v-4.4A7.5 7.5 0 0 1 4 12.5 7.5 7.5 0 0 1 11.5 5h1A7.5 7.5 0 0 1 20 12.5Z" />
    </svg>
  );
}

export function BellIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M18 16V11a6 6 0 1 0-12 0v5l-1.5 2.5h15L18 16Z" />
      <path d="M10 21h4" />
    </svg>
  );
}

export function ProfileIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <circle cx="12" cy="8.5" r="3.75" />
      <path d="M4.75 20.25a7.25 7.25 0 0 1 14.5 0" />
    </svg>
  );
}

export function MenuIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

export function CragIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="m3 19 6.5-11L14 15l2.5-4L21 19H3Z" />
    </svg>
  );
}

export function GymIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <rect x="4" y="4.5" width="16" height="15" rx="2" />
      <circle cx="9" cy="9" r="1.15" />
      <circle cx="15" cy="12.5" r="1.15" />
      <circle cx="9.5" cy="15.5" r="1.15" />
    </svg>
  );
}

export function LockIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <rect x="5" y="10.5" width="14" height="9.5" rx="2" />
      <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
    </svg>
  );
}

export function CheckIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m8.5 12.2 2.4 2.4 4.6-4.9" />
    </svg>
  );
}

export function CrosshairIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <circle cx="12" cy="12" r="6.5" />
      <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3" />
    </svg>
  );
}

export function CloseIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="m6.5 6.5 11 11M17.5 6.5l-11 11" />
    </svg>
  );
}
