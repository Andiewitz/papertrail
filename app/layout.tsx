import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Papertrail",
  description: "A calmer, private workspace for your notes and ideas.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
