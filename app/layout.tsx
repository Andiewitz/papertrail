import type { Metadata } from "next";
import { Nunito } from "next/font/google";
import "./globals.css";
import DashboardShell from "@/client/dashboard-shell";
import { currentUser } from "@/lib/auth";

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
  return <html lang="en"><body className={nunito.variable}><DashboardShell initialUser={user}>{children}</DashboardShell></body></html>;
}
