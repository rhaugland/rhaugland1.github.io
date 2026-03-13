import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";

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
            <Link href="/dashboard/calls" className="hover:text-white">calls</Link>
            <Link href="/dashboard/builds" className="hover:text-white">builds</Link>
            <Link href="/dashboard/clients" className="hover:text-white">clients</Link>
            <Link href="/dashboard/postmortems" className="hover:text-white">postmortems</Link>
            <Link href="/dashboard/dev/chat" className="hover:text-white">dev chat</Link>
          </div>
          <span className="text-sm text-muted">{session.user?.email}</span>
        </div>
      </nav>
      <main className="p-6">{children}</main>
    </div>
  );
}
