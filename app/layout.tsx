import type { Metadata } from "next";
import "./globals.css";
import DashboardShell from "@/client/dashboard-shell";
import { currentUser } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Papertrail",
  description: "A calmer, private workspace for your notes and ideas.",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const user = await currentUser().catch(() => null);
  return <html lang="en"><body><DashboardShell initialUser={user}>{children}</DashboardShell></body></html>;
}
