import { auth } from "@/lib/auth";
import { prisma } from "@slushie/db";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function PostmortemsListPage() {
  // admin-only access
  const session = await auth();
  if (!session) redirect("/api/auth/signin");
  if (session.user.role !== "admin") {
    return (
      <div className="py-12 text-center">
        <h2 className="text-2xl font-bold">access denied</h2>
        <p className="mt-2 text-sm text-muted">
          only admins can access postmortem reviews
        </p>
      </div>
    );
  }

  const completedRuns = await prisma.pipelineRun.findMany({
    where: { status: "COMPLETED" },
    include: {
      client: true,
      postmortem: true,
      tracker: {
        select: {
          npsScore: true,
          booking: {
            select: {
              assignee: { select: { name: true } },
            },
          },
        },
      },
    },
    orderBy: { completedAt: "desc" },
  });

  return (
    <div>
      <h2 className="text-2xl font-bold">postmortems</h2>
      <p className="mt-1 text-sm text-muted">review agent performance on completed builds</p>

      {completedRuns.length === 0 ? (
        <p className="mt-8 text-sm text-muted">
          no completed builds yet. approve a build to enable postmortem review.
        </p>
      ) : (
        <div className="mt-6 space-y-3">
          {completedRuns.map((run) => {
            const hasPostmortem =
              run.postmortem?.employeeFeedback !== null &&
              run.postmortem?.employeeFeedback !== undefined;

            return (
              <Link
                key={run.id}
                href={`/dashboard/postmortems/${run.id}`}
                className="block rounded-lg border border-gray-200 p-4 hover:border-secondary hover:bg-gray-50"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{run.client.name}</p>
                    <p className="text-xs text-muted">
                      completed{" "}
                      {run.completedAt
                        ? new Date(run.completedAt).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })
                        : "unknown"}
                      {run.tracker?.booking?.assignee && (
                        <span> &middot; {run.tracker.booking.assignee.name}</span>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {run.tracker?.npsScore != null && (
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                          run.tracker.npsScore >= 9
                            ? "bg-green-100 text-green-700"
                            : run.tracker.npsScore >= 7
                            ? "bg-yellow-100 text-yellow-700"
                            : "bg-red-100 text-red-700"
                        }`}
                      >
                        NPS {run.tracker.npsScore}
                      </span>
                    )}
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        hasPostmortem
                          ? "bg-green-100 text-green-700"
                          : "bg-gray-100 text-gray-700"
                      }`}
                    >
                      {hasPostmortem ? "reviewed" : "pending"}
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
