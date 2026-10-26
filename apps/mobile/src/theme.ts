/** Visual tokens copied from `apps/web/src/styles/base.css` so mobile reads as the same product. */
export const colors = {
  bg: '#f6f7f9',
  surface: '#ffffff',
  surface2: '#f2f3f6',
  line: '#e5e7ec',
  lineStrong: '#d6d9e0',
  ink: '#1b1f2a',
  ink2: '#444b5a',
  muted: '#7a8192',
  accent: '#5b4ff0',
  accentHover: '#4a3ee0',
  accentWeak: '#efedff',
  green: '#16a36a',
  greenWeak: '#e4f6ed',
  amber: '#e0a100',
  brainstorm: '#9a6700',
  brainstormWeak: '#fdf1c4',
  research: '#2f6fdb',
  researchWeak: '#e8f0fd',
  direction: '#0e8a8a',
  directionWeak: '#dcf1f0',
  red: '#dc4b4b',
  white: '#ffffff',
  ideaOnAmber: '#2b1d00',
};

export const statusColor = {
  todo: '#9aa1b0',
  progress: '#2f80ed',
  review: '#e0a100',
  done: '#16a36a',
} as const;

export const priorityColor = {
  high: '#dc4b4b',
  medium: '#e0a100',
  low: '#9aa1b0',
} as const;

export const radius = {
  sm: 8,
  md: 10,
};

export const shadow = {
  card: {
    shadowColor: '#141828',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
} as const;
