import { prisma } from "@slushie/db";
import { notFound } from "next/navigation";
import { CredentialsClient } from "./credentials-client";

export default async function CredentialsPage({
  params,
}: {
  params: Promise<{ bookingId: string }>;
}) {
  const { bookingId } = await params;

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { tracker: { select: { currentStep: true, pluginCredentials: true, pluginStatus: true } } },
  });

  if (!booking?.tracker) notFound();

  // Extract services from description (look for "tools/tech stack:" line)
  const techMatch = booking.description.match(/tools\/tech stack:\s*(.+)/i);
  const services = techMatch
    ? techMatch[1].split(",").map(s => s.trim()).filter(Boolean)
    : ["service 1", "service 2"];

  return (
    <CredentialsClient
      bookingId={booking.id}
      businessName={booking.businessName}
      name={booking.name}
      services={services}
      currentStep={booking.tracker.currentStep}
      existingCredentials={(booking.tracker.pluginCredentials as Array<{ service: string; value: string }>) ?? null}
    />
  );
}
