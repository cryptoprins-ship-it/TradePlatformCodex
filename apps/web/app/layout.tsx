import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "TradePlatformCodex",
  description: "BTCUSDT papertrading dashboard"
};

const navItems = [
  ["/dashboard", "Dashboard"],
  ["/signals", "Signals"],
  ["/papertrades", "Papertrades"],
  ["/settings", "Settings"],
  ["/logs", "Logs"]
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl">
      <body>
        <div className="shell">
          <aside className="sidebar">
            <div className="brand">TradePlatformCodex</div>
            <nav className="nav">
              {navItems.map(([href, label]) => (
                <Link href={href} key={href}>
                  {label}
                </Link>
              ))}
            </nav>
          </aside>
          <main className="main">{children}</main>
        </div>
      </body>
    </html>
  );
}

