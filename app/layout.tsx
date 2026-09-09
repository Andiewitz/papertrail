import type { Metadata } from "next";
import "./globals.css";
import DashboardShell from "@/client/dashboard-shell";

export const metadata: Metadata = {
  title: "Papertrail",
  description: "A calmer, private workspace for your notes and ideas.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><DashboardShell>{children}</DashboardShell></body></html>;
}
