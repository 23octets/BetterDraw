const P: Record<string, React.ReactNode> = {
  select: <path d="M5 3l12 8-5 1.5L9.5 18z" />,
  polyline: <path d="M3 17l5-9 5 5 6-9" />,
  arc: <path d="M3 17a9 9 0 0 1 16 0" />,
  bezier: <><path d="M3 17C6 3 14 21 19 5" /><circle cx="3" cy="17" r="1.4" /><circle cx="19" cy="5" r="1.4" /></>,
  trim: <><circle cx="6" cy="6" r="2.6" /><circle cx="6" cy="16" r="2.6" /><path d="M8.2 7.4L19 15M8.2 14.6L19 7" /></>,
  fill: <><path d="M4 11l6-6 7 7-6 6z" /><path d="M18 14c1.5 2 2 3 2 4a2 2 0 0 1-4 0c0-1 .5-2 2-4z" /></>,
  erase: <path d="M4 15l8-8 6 6-5 5H7zM9 18h10" />,
  pick: <path d="M14 4l4 4-9 9H5v-4zM12 6l4 4" />,
  measure: <path d="M3 15l12-12 4 4L7 19zM7 11l2 2M10 8l2 2M13 5l2 2" />,
  image: <><rect x="3" y="4" width="16" height="14" rx="1.5" /><path d="M3 15l5-5 4 4 3-3 4 4" /><circle cx="14.5" cy="8.5" r="1.3" /></>,
  grid: <><rect x="3" y="3" width="16" height="16" rx="1.5" /><path d="M8.3 3v16M13.7 3v16M3 8.3h16M3 13.7h16" /></>,
  keyboard: <><rect x="2" y="6" width="18" height="11" rx="2" /><path d="M5.5 9.5h.01M8.5 9.5h.01M11.5 9.5h.01M14.5 9.5h.01M17 9.5h.01M7 13.5h8" /></>,
  undo: <path d="M8 6L4 10l4 4M4 10h9a5 5 0 0 1 0 10h-2" />,
  redo: <path d="M14 6l4 4-4 4M18 10H9a5 5 0 0 0 0 10h2" />,
  eye: <><path d="M2 11s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6z" /><circle cx="11" cy="11" r="2.5" /></>,
  eyeOff: <><path d="M2 11s3.5-6 9-6c1.8 0 3.3.6 4.6 1.5M20 11s-3.5 6-9 6c-1.8 0-3.3-.6-4.6-1.5" /><path d="M4 18L18 4" /></>,
  lock: <><rect x="5" y="10" width="12" height="9" rx="1.5" /><path d="M8 10V7a3 3 0 0 1 6 0v3" /></>,
  unlock: <><rect x="5" y="10" width="12" height="9" rx="1.5" /><path d="M8 10V7a3 3 0 0 1 5.8-1" /></>,
  up: <path d="M11 17V5M6 10l5-5 5 5" />,
  down: <path d="M11 5v12M6 12l5 5 5-5" />,
  close: <path d="M6 6l10 10M16 6L6 16" />,
  chevron: <path d="M6 9l5 5 5-5" />,
  width: <path d="M3 11h16M6 8l-3 3 3 3M16 8l3 3-3 3M3 5v12M19 5v12" />,
  height: <path d="M11 3v16M8 6l3-3 3 3M8 16l3 3 3-3M5 3h12M5 19h12" />,
  angle: <><path d="M4 18h15M4 18L15 5" /><path d="M10 18a6 6 0 0 0-2-4.5" /></>,
  branch: <><circle cx="6" cy="5" r="2" /><circle cx="6" cy="17" r="2" /><circle cx="16" cy="9" r="2" /><path d="M6 7v8M16 11c0 3-4 3-8.5 5" /></>,
  drop: <path d="M11 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z" />,
  fit: <path d="M4 8V4h4M14 4h4v4M18 14v4h-4M8 18H4v-4" />,
  plus: <path d="M11 5v12M5 11h12" />,
  minus: <path d="M5 11h12" />,
  export: <path d="M11 3v11M6 9l5 5 5-5M4 18h14" />,
}

export type IconName = keyof typeof P

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg className="icon" viewBox="0 0 22 22" width={size} height={size} aria-hidden>
      {P[name]}
    </svg>
  )
}
