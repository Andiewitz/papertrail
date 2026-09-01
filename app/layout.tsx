import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Turso Notes",
  description: "A serverless Next.js starter backed by Turso.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
