import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'PlantPulse Scheduler',
  description:
    'Manufacturing wallboard and planning for multistep batch chain processes — fermentation, bioprocessing, and more.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
