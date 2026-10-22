import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ระบบกายภาพบำบัดโรงพยาบาล | Hospital Physical Therapy System',
  description: 'ระบบจัดการแผนกกายภาพบำบัด เวชระเบียน คอร์สฝึก และเช็คอินอัตโนมัติด้วยการสแกนใบหน้า',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th" className="dark h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
