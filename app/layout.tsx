import type { Metadata } from "next";
import "./globals.css";
import "./overrides.css";

export const metadata: Metadata = {
  title: "選曲室｜為此刻排一段歌",
  description: "說出一個心情，讓 AI 替你排好一段值得聽完的音樂。",
  openGraph: {
    title: "選曲室｜為此刻排一段歌",
    description: "說出一個心情，讓 AI 替你排好一段值得聽完的音樂。",
    images: [{ url: "/og.png", width: 1680, height: 945, alt: "選曲室｜為此刻排一段歌" }],
  },
  twitter: { card: "summary_large_image", title: "選曲室｜為此刻排一段歌", images: ["/og.png"] },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-Hant">
      <body>{children}</body>
    </html>
  );
}
