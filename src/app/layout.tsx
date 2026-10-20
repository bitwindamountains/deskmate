import type { Metadata } from 'next';
import { Atkinson_Hyperlegible } from 'next/font/google';
import './globals.css';

const atkinson = Atkinson_Hyperlegible({ weight: ['400', '700'], subsets: ['latin'], variable: '--font-atkinson' });

export const metadata: Metadata = { title: 'Scholar', description: 'Learn anything, remember it.' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={atkinson.variable}>
      <body>{children}</body>
    </html>
  );
}
