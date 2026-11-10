import type { Metadata } from "next";
import "./fonts.css";
import "./phi.css";
import "./refinements.css";
import "./transfer.css";

export const metadata: Metadata = {
  title: "PHI VAULT · Phigros 成績庫",
  description: "每一次突破，都值得被記錄。你的 Phigros B27 + φ3、成績管理與課題模式。",
  icons: {
    icon: "/phi.svg",
    shortcut: "/phi.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-Hant">
      <body className="antialiased">{children}</body>
    </html>
  );
}
