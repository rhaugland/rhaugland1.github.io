import { prisma } from "@slushie/db";
import Link from "next/link";

const statusColors: Record<string, string> = {
  RUNNING: "bg-blue-100 text-blue-700",
  STALLED: "bg-yellow-100 text-yellow-700",
  COMPLETED: "bg-green-100 text-green-700",
  CANCELLED: "bg-red-100 text-red-700",
};

export default async function BuildsPage() {
  const runs = await prisma.pipelineRun.findMany({
    include: {
      client: true,
      call: {
        include: {
          analysis: {
            include: {
              buildSpecs: {
                orderBy: { version: "desc" },
                take: 1,
                include: {
                  prototypes: {
                    orderBy: { version: "desc" },
                    take: 1,
                    include: {
                      gapReports: {
                        orderBy: { version: "desc" },
                        take: 1,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    orderBy: { startedAt: "desc" },
  });

  return (
    <div>
      <h2 className="text-2xl font-bold">builds</h2>
      <p className="mt-1 text-sm text-muted">all pipeline runs</p>

      {runs.length === 0 ? (
        <p className="mt-8 text-sm text-muted">no builds yet. run a discovery call to start.</p>
      ) : (
        <div className="mt-6 overflow-hidden rounded-lg border border-gray-200">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-200 bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-muted">client</th>
                <th className="px-4 py-3 text-left font-medium text-muted">status</th>
                <th className="px-4 py-3 text-left font-medium text-muted">coverage</th>
                <th className="px-4 py-3 text-left font-medium text-muted">started</th>
                <th className="px-4 py-3 text-left font-medium text-muted">completed</th>
                <th className="px-4 py-3 text-left font-medium text-muted">actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {runs.map((run) => {
                const latestGapReport =
                  run.call.analysis?.buildSpecs[0]?.prototypes[0]?.gapReports[0] ?? null;
                const coverageScore = latestGapReport?.coverageScore ?? null;

                return (
                  <tr key={run.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">{run.client.name}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[run.status] ?? "bg-gray-100 text-gray-700"}`}
                      >
                        {run.status.toLowerCase()}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {coverageScore !== null ? (
                        <span
                          className={`text-sm font-bold ${
                            coverageScore >= 90
                              ? "text-green-600"
                              : coverageScore >= 70
                                ? "text-yellow-500"
                                : "text-red-600"
                          }`}
                        >
                          {coverageScore}
                        </span>
                      ) : (
                        <span className="text-xs text-muted">--</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted">
                      {new Date(run.startedAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="px-4 py-3 text-muted">
                      {run.completedAt
                        ? new Date(run.completedAt).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          })
                        : "--"}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/dashboard/preview/${run.id}`}
                        className="text-secondary hover:underline"
                      >
                        preview
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
