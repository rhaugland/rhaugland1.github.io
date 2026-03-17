import { NextResponse } from "next/server";
import { prisma } from "@slushie/db";

// Serves the raw HTML bundle for a prototype, used in iframe rendering.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const prototype = await prisma.prototype.findUnique({
    where: { id },
    select: { htmlBundle: true },
  });

  if (!prototype?.htmlBundle) {
    return new NextResponse("not found", { status: 404 });
  }

  return new NextResponse(prototype.htmlBundle, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
