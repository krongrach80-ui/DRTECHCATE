import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'DrTech.Care — ระบบกายภาพบำบัดโรงพยาบาลอัจฉริยะ',
  description: 'Enterprise Hospital Physical Therapy Platform with Biometric Touchscreen Kiosks, Express 5 API & Merkle-Chained Medical Records',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="th">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Sarabun:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body style={{ margin: 0, padding: 0, fontFamily: "'Plus Jakarta Sans', 'Sarabun', -apple-system, BlinkMacSystemFont, sans-serif", background: '#090d16', color: '#f1f5f9' }}>
        {children}
      </body>
    </html>
  );
}
