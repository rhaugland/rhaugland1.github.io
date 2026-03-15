import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { TeamMenu } from "@/components/team-menu";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session) redirect("/api/auth/signin");

  return (
    <div className="min-h-screen bg-background">
      <nav className="border-b border-gray-200 bg-foreground px-6 py-3">
        <div className="flex items-center justify-between">
          <span className="text-lg font-extrabold text-primary">slushie</span>
          <div className="flex items-center gap-6 text-sm text-muted">
            <Link href="/dashboard" className="hover:text-white">meetings</Link>
            <Link href="/dashboard/builds" className="hover:text-white">builds</Link>
            <Link href="/dashboard/clients" className="hover:text-white">clients</Link>
            <Link href="/dashboard/bookings" className="hover:text-white">bookings</Link>
            <Link href="/dashboard/postmortems" className="hover:text-white">postmortems</Link>
            <Link href="/dashboard/analytics" className="hover:text-white">analytics</Link>
            <Link href="/dashboard/dev/chat" className="hover:text-white">dev chat</Link>
          </div>
          <div className="flex items-center gap-3">
            <TeamMenu />
            <span className="text-sm text-muted">{session.user?.email}</span>
            <a href="/api/auth/signout" className="text-sm text-primary hover:underline">sign out</a>
          </div>
        </div>
      </nav>
      <main className="p-6">{children}</main>
    </div>
  );
}
