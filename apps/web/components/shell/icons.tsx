// Inline stroke icons rather than an icon package: the mockups use a small,
// fixed set, and adding a dependency (plus its tree-shaking config) to draw
// a dozen glyphs is not something this app needs.
//
// There is deliberately no gear-requirement icon set here, and there will
// not be one: BL-023 ships gear as named text chips and named checkboxes
// instead (AR-33). The artwork was dropped from scope rather than deferred,
// so nothing is waiting on it.

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

// --- added by the Sprint 1/2 frontend backfill ------------------------------
// Auth, submission, upload and admin chrome. Same inline-SVG approach as
// above, for the same reason: a handful of glyphs does not justify an icon
// package and its tree-shaking configuration.

export function MailIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <rect x="3" y="5.5" width="18" height="13" rx="2" />
      <path d="m3.5 7 8.5 6 8.5-6" />
    </svg>
  );
}

export function EyeIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M2.5 12S6 6.5 12 6.5 21.5 12 21.5 12 18 17.5 12 17.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="2.75" />
    </svg>
  );
}

export function EyeOffIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M9.9 5.1A9.6 9.6 0 0 1 12 4.9c6 0 9.5 5.5 9.5 5.5a17 17 0 0 1-2.9 3.4M6.4 6.9A16.8 16.8 0 0 0 2.5 10.4S6 15.9 12 15.9a9.4 9.4 0 0 0 3.3-.6" />
      <path d="M4 4l16 16" />
    </svg>
  );
}

export function CameraIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M3.5 8.5h3l1.5-2h6l1.5 2h3a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1Z" />
      <circle cx="12" cy="13" r="3.25" />
    </svg>
  );
}

export function PlusIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function ArrowLeftIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M19 12H5M11 6l-6 6 6 6" />
    </svg>
  );
}

export function ShieldIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M12 3.5 5 6v6c0 4.2 2.9 7.4 7 8.5 4.1-1.1 7-4.3 7-8.5V6l-7-2.5Z" />
      <path d="m9 12 2.2 2.2L15.5 10" />
    </svg>
  );
}

export function SignOutIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M14.5 4.5h-7a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h7" />
      <path d="M17 15.5 20.5 12 17 8.5M20 12h-9" />
    </svg>
  );
}

export function KeyIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <circle cx="8.5" cy="12" r="4" />
      <path d="M12.5 12H21M18 12v3M15.5 12v2.5" />
    </svg>
  );
}
