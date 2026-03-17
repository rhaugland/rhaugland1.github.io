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
      <nav className="border-b border-border bg-surface px-6 py-3">
        <div className="flex items-center justify-between">
          <span className="text-lg font-extrabold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">slushie</span>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-3 text-muted">
              {/* cup icon */}
              <Link href="/dashboard" className="hover:text-foreground transition-colors" title="slushie machine">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                  <path d="M5 6h14" />
                  <path d="M6 6l1.5 12a2 2 0 0 0 2 1.8h5a2 2 0 0 0 2-1.8L18 6" />
                  <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                  <path d="M8 10h8" />
                </svg>
              </Link>
              {/* gravestone icon */}
              <Link href="/dashboard/postmortems" className="hover:text-foreground transition-colors" title="postmortems">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                  <path d="M7 20h10" />
                  <path d="M7 20V8a5 5 0 0 1 10 0v12" />
                  <path d="M12 12v3" />
                  <path d="M10 12h4" />
                </svg>
              </Link>
              {/* dashboard icon */}
              <Link href="/dashboard/analytics" className="hover:text-foreground transition-colors" title="analytics">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                  <rect x="3" y="3" width="7" height="7" rx="1" />
                  <rect x="14" y="3" width="7" height="7" rx="1" />
                  <rect x="3" y="14" width="7" height="7" rx="1" />
                  <rect x="14" y="14" width="7" height="7" rx="1" />
                </svg>
              </Link>
              {/* person icon */}
              <TeamMenu />
            </div>
            <span className="text-sm text-muted">{session.user?.email}</span>
            <a href="/api/auth/signout" className="text-sm text-primary hover:underline">sign out</a>
          </div>
        </div>
      </nav>
      <main className="p-6">{children}</main>
    </div>
  );
}
