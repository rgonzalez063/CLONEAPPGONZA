// Tailwind theme mapped to tokens.css. Components use bg-surface text-muted, never raw hex.
import type { Config } from 'tailwindcss'
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        'bg': 'var(--color-bg)',
        'workspace': 'var(--color-workspace)',
        'surface': 'var(--color-surface)',
        'surface-done': 'var(--color-surface-done)',
        'border': 'var(--color-border)',
        'border-input': 'var(--color-border-input)',
        'text': 'var(--color-text)',
        'text-muted': 'var(--color-text-muted)',
        'accent': 'var(--color-accent)',
        'accent-soft': 'var(--color-accent-soft)',
        'on-accent': 'var(--color-on-accent)',
        'danger': 'var(--color-danger)',
        'success': 'var(--color-success)',
        'warning': 'var(--color-warning)',
        'warning-bg': 'var(--color-warning-bg)',
        'chart-grid': 'var(--color-chart-grid)',
        'chart-marker': 'var(--color-chart-marker)',
        'dataset-1': 'var(--color-dataset-1)',
        'dataset-2': 'var(--color-dataset-2)',
        'dataset-3': 'var(--color-dataset-3)',
        'peer': 'var(--color-peer)',
        'toggle-off': 'var(--color-toggle-off)',
      },
      borderRadius: { sm: 'var(--radius-sm)', md: 'var(--radius-md)', lg: 'var(--radius-lg)' },
      boxShadow: { card: 'var(--shadow-card)', pop: 'var(--shadow-pop)' },
      fontFamily: { sans: 'var(--font-sans)', mono: 'var(--font-mono)' },
      fontSize: {
        xs: ['var(--text-xs)', 'var(--text-xs-line)'],
        sm: ['var(--text-sm)', 'var(--text-sm-line)'],
        base: ['var(--text-base)', 'var(--text-base-line)'],
        lg: ['var(--text-lg)', 'var(--text-lg-line)'],
        xl: ['var(--text-xl)', 'var(--text-xl-line)'],
      },
    },
  },
}
export default config
