import type { Metadata } from 'next';
import { AudioProvider } from '@/providers/AudioProvider';

export const metadata: Metadata = {
  title: 'Sonic Landing Page — Chord Example',
  description: 'A landing page where every scroll and click has sound, powered by Chord.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          background: '#0a0a0a',
          color: '#e0e0e0',
          // Audio-reactive glow on the body via CSS custom properties
          // (set by bindAudioToCSS in AudioProvider)
          boxShadow:
            'inset 0 0 120px rgba(96,165,250, calc(var(--chord-rms, 0) * 0.4))',
          transition: 'box-shadow 0.1s ease',
        }}
      >
        <AudioProvider>{children}</AudioProvider>
      </body>
    </html>
  );
}
