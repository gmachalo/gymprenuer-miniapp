import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GymPrenuer — Train. Build. Earn.",
  description:
    "The Web3 fitness simulation game. Build your character, own a gym, and earn GYMFIT tokens on Base.",
  manifest: "/manifest.json",
  openGraph: {
    title: "GymPrenuer",
    description: "Train. Build. Earn. The Web3 gym simulation on Base.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#080b12",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <div className="bg-orb bg-orb-1" aria-hidden="true" />
        <div className="bg-orb bg-orb-2" aria-hidden="true" />
        {children}
      </body>
    </html>
  );
}
