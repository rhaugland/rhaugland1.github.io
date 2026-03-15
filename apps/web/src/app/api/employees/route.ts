import { auth } from "@/lib/auth";
import { prisma } from "@slushie/db";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const employees = await prisma.employee.findMany({
    orderBy: { name: "asc" },
  });

  return NextResponse.json(employees);
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { name, email } = body;

  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const employee = await prisma.employee.create({
    data: { name, email: email || null },
  });

  return NextResponse.json(employee);
}
