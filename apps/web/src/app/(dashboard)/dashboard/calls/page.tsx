import { prisma } from "@slushie/db";
import Link from "next/link";
import { DeleteCallButton } from "./delete-call-button";
import CodebaseNameInput from "@/components/call/codebase-name-input";

export default async function CallsPage() {
  const calls = await prisma.call.findMany({
    include: {
      client: true,
      pipelineRun: true,
      codebases: {
        where: { source: "generated", name: null },
        select: { id: true },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-2xl font-bold text-foreground">calls</h2>
        <Link
          href="/dashboard/calls/new"
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700"
        >
          start new call
        </Link>
      </div>

      {calls.length === 0 ? (
        <p className="text-sm text-muted">
          no calls yet. start one to pour your first slushie.
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="min-w-full divide-y divide-border">
            <thead className="bg-surface-light">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted">
                  client
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted">
                  industry
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted">
                  status
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted">
                  started
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted">
                  duration
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted">
                  codebase
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted">
                  actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-surface">
              {calls.map((call) => {
                const isLive = call.startedAt && !call.endedAt;
                const durationSec =
                  call.startedAt && call.endedAt
                    ? Math.round(
                        (call.endedAt.getTime() - call.startedAt.getTime()) /
                          1000
                      )
                    : null;
                const durationStr = durationSec
                  ? `${Math.floor(durationSec / 60)}m ${durationSec % 60}s`
                  : "--";

                return (
                  <tr key={call.id}>
                    <td className="px-4 py-3 text-sm text-foreground">
                      {call.client.name}
                    </td>
                    <td className="px-4 py-3 text-sm text-muted">
                      {call.client.industry}
                    </td>
                    <td className="px-4 py-3">
                      {isLive ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-semibold text-primary">
                          <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
                          live
                        </span>
                      ) : (
                        <span className="rounded-full bg-white/5 px-2.5 py-0.5 text-xs font-semibold text-muted">
                          {call.pipelineRun?.status?.toLowerCase() ?? "ended"}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-muted">
                      {call.startedAt
                        ? new Date(call.startedAt).toLocaleString()
                        : "--"}
                    </td>
                    <td className="px-4 py-3 text-sm text-muted">
                      {durationStr}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {call.codebases.length > 0 ? (
                        <CodebaseNameInput codebaseId={call.codebases[0].id} />
                      ) : (
                        <span className="text-xs text-muted">--</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {isLive && call.pipelineRun ? (
                          <Link
                            href={`/dashboard/calls/live/${call.pipelineRun.id}`}
                            className="text-sm font-semibold text-primary hover:underline"
                          >
                            join call
                          </Link>
                        ) : null}
                        <DeleteCallButton callId={call.id} />
                      </div>
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
