/** @type {import('tailwindcss').Config} */
// Tailwind CSS configuration for the Industrial Tactile design system.
// Colors, fonts, shadows, and animations reflect the physical/concrete aesthetic.
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: {
          DEFAULT: '#EBEAE5',
          surface: '#F7F6F2',
          edge: '#E2E0D9',
        },
        ink: {
          DEFAULT: '#111111',
          50: '#F4F4F4',
          100: '#E2E0D9',
          200: '#C9C7BF',
          400: '#666562',
          600: '#333330',
          900: '#111111',
        },
        olive: {
          DEFAULT: '#15803D',
          50: '#E7F4EC',
          100: '#C7E5D2',
          200: '#7CB495',
          600: '#15803D',
          700: '#0E5C2C',
        },
        amber: {
          DEFAULT: '#D97706',
          50: '#FCEFD9',
          100: '#F8DAB0',
          600: '#D97706',
          700: '#A45705',
        },
        crimson: {
          DEFAULT: '#DC2626',
          50: '#FBE5E5',
          100: '#F5BFBF',
          600: '#DC2626',
          700: '#A41B1B',
        },
        slateink: {
          DEFAULT: '#334155',
          50: '#EAECEF',
          100: '#CFD3DA',
          600: '#334155',
          700: '#1F2A3D',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: [
          'JetBrains Mono',
          'ui-monospace',
          'SFMono-Regular',
          'Menlo',
          'Consolas',
          'Courier New',
          'monospace',
        ],
      },
      boxShadow: {
        hard: '5px 5px 0px 0px #111111',
        'hard-sm': '3px 3px 0px 0px #111111',
        'hard-lg': '7px 7px 0px 0px #111111',
        'hard-inset': 'inset 3px 3px 0px 0px rgba(17, 17, 17, 0.85)',
        'hard-press': '2px 2px 0px 0px #111111',
      },
      borderWidth: {
        3: '3px',
        'ink-2': '2px',
      },
      borderRadius: {
        none: '0px',
        sm: '2px',
        DEFAULT: '4px',
        md: '6px',
        lg: '8px',
      },
      keyframes: {
        'pulse-hazard': {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(220, 38, 38, 0.65)', borderColor: '#DC2626' },
          '50%': { boxShadow: '0 0 0 6px rgba(220, 38, 38, 0)', borderColor: '#7F1414' },
        },
        'pulse-amber': {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(217, 119, 6, 0.55)' },
          '50%': { boxShadow: '0 0 0 6px rgba(217, 119, 6, 0)' },
        },
        'hazard-stripes': {
          '0%': { backgroundPosition: '0 0' },
          '100%': { backgroundPosition: '40px 0' },
        },
        shake: {
          '0%, 100%': { transform: 'translateX(0)' },
          '25%': { transform: 'translateX(-2px)' },
          '75%': { transform: 'translateX(2px)' },
        },
        'fade-in-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
      },
      animation: {
        'pulse-hazard': 'pulse-hazard 1.4s ease-in-out infinite',
        'pulse-amber': 'pulse-amber 2s ease-in-out infinite',
        'hazard-stripes': 'hazard-stripes 1s linear infinite',
        shake: 'shake 0.4s ease-in-out',
        'fade-in-up': 'fade-in-up 220ms ease-out',
        'fade-in': 'fade-in 180ms ease-out',
      },
      backgroundImage: {
        'hazard-stripes':
          'repeating-linear-gradient(45deg, #111111 0px, #111111 10px, #D97706 10px, #D97706 20px)',
        'hazard-crimson':
          'repeating-linear-gradient(45deg, #111111 0px, #111111 10px, #DC2626 10px, #DC2626 20px)',
        'grid-concrete':
          'linear-gradient(#E2E0D9 1px, transparent 1px), linear-gradient(90deg, #E2E0D9 1px, transparent 1px)',
      },
      backgroundSize: {
        hazard: '40px 40px',
        'grid-md': '32px 32px',
      },
    },
  },
  plugins: [],
}
