// icons.jsx — inline SVG icon components

export const Icon = {
  Play: (p) => (
    <svg viewBox="0 0 16 16" width="14" height="14" {...p}>
      <path d="M4 3l9 5-9 5V3z" fill="currentColor" />
    </svg>
  ),
  Pause: (p) => (
    <svg viewBox="0 0 16 16" width="14" height="14" {...p}>
      <rect x="4" y="3" width="3" height="10" fill="currentColor" />
      <rect x="9" y="3" width="3" height="10" fill="currentColor" />
    </svg>
  ),
  Check: (p) => (
    <svg
      viewBox="0 0 16 16"
      width="12"
      height="12"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...p}
    >
      <path d="M3 8.5l3 3 7-7" />
    </svg>
  ),
  ArrowR: (p) => (
    <svg
      viewBox="0 0 16 16"
      width="12"
      height="12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...p}
    >
      <path d="M3 8h10M9 4l4 4-4 4" />
    </svg>
  ),
  Download: (p) => (
    <svg
      viewBox="0 0 16 16"
      width="13"
      height="13"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...p}
    >
      <path d="M8 2v9M4 7l4 4 4-4M3 14h10" />
    </svg>
  ),
  Restart: (p) => (
    <svg
      viewBox="0 0 16 16"
      width="13"
      height="13"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...p}
    >
      <path d="M3 8a5 5 0 1 0 1.5-3.5M3 3v3h3" />
    </svg>
  ),
  Trash: (p) => (
    <svg
      viewBox="0 0 16 16"
      width="13"
      height="13"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...p}
    >
      <line x1="2.5" y1="4.5" x2="13.5" y2="4.5" />
      <path d="M6 4.5V3h4v1.5" />
      <path d="M4.5 4.5l.7 8.5h5.6l.7-8.5" />
    </svg>
  ),
  Warn: (p) => (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...p}
    >
      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  ),
};
