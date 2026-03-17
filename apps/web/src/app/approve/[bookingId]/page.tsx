import { prisma } from "@slushie/db";
import { notFound } from "next/navigation";
import { ApproveClient } from "./approve-client";

export default async function ApprovePage({
  params,
}: {
  params: Promise<{ bookingId: string }>;
}) {
  const { bookingId } = await params;

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      tracker: {
        include: {
          pipelineRun: {
            include: {
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
      },
    },
  });

  if (!booking?.tracker) notFound();

  const proto = booking.tracker.pipelineRun?.call?.analysis?.buildSpecs?.[0]?.prototypes?.[0];

  return (
    <ApproveClient
      bookingId={booking.id}
      businessName={booking.businessName}
      name={booking.name}
      previewUrl={proto?.previewUrl ?? null}
      prototypeId={proto?.id ?? null}
      currentStep={booking.tracker.currentStep}
    />
  );
}
