import { prisma } from "@slushie/db";
import { notFound } from "next/navigation";
import { SurveyClient } from "./survey-client";

export default async function SurveyPage({
  params,
}: {
  params: Promise<{ bookingId: string }>;
}) {
  const { bookingId } = await params;

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { tracker: { select: { currentStep: true, npsScore: true } } },
  });

  if (!booking?.tracker) notFound();

  return (
    <SurveyClient
      bookingId={booking.id}
      businessName={booking.businessName}
      name={booking.name}
      currentStep={booking.tracker.currentStep}
      existingScore={booking.tracker.npsScore}
    />
  );
}
