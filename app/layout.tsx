import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '火锅排队监控',
  description: '提供数据分析和预测',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
