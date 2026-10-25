import type { Metadata, Viewport } from 'next';
import { Atkinson_Hyperlegible, Patrick_Hand } from 'next/font/google';
import { RegisterSW } from '@/components/register-sw';
import { TimeZoneCookie } from '@/components/time-zone-cookie';
import './globals.css';

const atkinson = Atkinson_Hyperlegible({ weight: ['400', '700'], subsets: ['latin'], variable: '--font-atkinson' });
// Hand-lettered caps for headings only (the J-card's side heads); everything read stays in Atkinson (DESIGN.md).
const hand = Patrick_Hand({ weight: '400', subsets: ['latin'], variable: '--font-patrick' });

export const metadata: Metadata = { title: 'Scholar', description: 'Learn anything, remember it.' };
export const viewport: Viewport = { viewportFit: 'cover' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${atkinson.variable} ${hand.variable}`}>
      <body>
        {children}
        <RegisterSW />
        <TimeZoneCookie />
      </body>
    </html>
  );
}
