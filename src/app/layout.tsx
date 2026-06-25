import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mele Machine — OOTP Perfect Team Companion",
  description:
    "Rating intelligence, collection analysis, and PT Live recommendations for Out of the Park Baseball Perfect Team.",
};

const NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/cards", label: "Card Explorer" },
  { href: "/collection", label: "My Collection" },
  { href: "/ptlive", label: "PT Live" },
  { href: "/seasoncrafter", label: "Season Crafter" },
  { href: "/about", label: "Engine" },
];

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <div className="min-h-screen">
          <header className="border-b border-edge bg-panel/80 backdrop-blur sticky top-0 z-20">
            <div className="mx-auto max-w-[1400px] px-5 py-3 flex items-center gap-6">
              <Link href="/" className="flex items-center gap-2 shrink-0">
                <span className="text-accent text-xl font-black tracking-tight">
                  ⚙ MELE
                </span>
                <span className="text-sm text-gray-400 font-medium">
                  MACHINE
                </span>
              </Link>
              <nav className="flex items-center gap-1 text-sm">
                {NAV.map((n) => (
                  <Link
                    key={n.href}
                    href={n.href}
                    className="px-3 py-1.5 rounded-md text-gray-300 hover:bg-panel2 hover:text-white transition-colors"
                  >
                    {n.label}
                  </Link>
                ))}
              </nav>
            </div>
          </header>
          <main className="mx-auto max-w-[1400px] px-5 py-6">{children}</main>
        </div>
      </body>
    </html>
  );
}
