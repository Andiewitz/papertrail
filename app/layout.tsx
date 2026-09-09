import type { Metadata } from "next";
import { Nunito } from "next/font/google";
import "./globals.css";
import DashboardShell, { type Collab } from "@/client/dashboard-shell";
import { currentUser } from "@/lib/auth";
import { listCollabs } from "@/lib/collab";

const nunito = Nunito({
  subsets: ["latin"],
  variable: "--font-nunito",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Papertrail",
  description: "A calmer, private workspace for your notes and ideas.",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const user = await currentUser().catch(() => null);
  const collabs: Collab[] | null = user ? await listCollabs(user.id).catch(() => null) : [];
  return <html lang="en"><body className={nunito.variable}><DashboardShell initialCollabs={collabs} initialUser={user}>{children}</DashboardShell></body></html>;
}
