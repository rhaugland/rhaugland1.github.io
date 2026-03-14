import { auth } from "@/lib/auth";
import { prisma } from "@slushie/db";
import { NextResponse } from "next/server";
import path from "path";
import fs from "fs/promises";
import { extract as tarExtract } from "tar";
import extractZip from "extract-zip";
import { randomUUID } from "crypto";

const WORKSPACE_ROOT = process.env.WORKSPACE_ROOT ?? "/tmp/slushie-workspaces";
const MAX_SIZE = 100 * 1024 * 1024; // 100MB

const VALID_EXTENSIONS = [".zip", ".tar.gz", ".tgz"];
const ZIP_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const GZIP_MAGIC = Buffer.from([0x1f, 0x8b]);

export async function POST(request: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const clientId = formData.get("clientId") as string | null;

  if (!file) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }

  if (!clientId) {
    return NextResponse.json({ error: "clientId is required" }, { status: 400 });
  }

  // validate client exists
  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) {
    return NextResponse.json({ error: "client not found" }, { status: 404 });
  }

  // validate file extension
  const filename = file.name;
  const ext = filename.endsWith(".tar.gz")
    ? ".tar.gz"
    : path.extname(filename).toLowerCase();

  if (!VALID_EXTENSIONS.includes(ext)) {
    return NextResponse.json(
      { error: "invalid file type — accepted: .zip, .tar.gz, .tgz" },
      { status: 400 }
    );
  }

  // validate file size
  if (file.size > MAX_SIZE) {
    return NextResponse.json(
      { error: "file too large — max 100MB" },
      { status: 400 }
    );
  }

  // validate magic bytes
  const buffer = Buffer.from(await file.arrayBuffer());
  const isZip = ext === ".zip" && buffer.subarray(0, 4).equals(ZIP_MAGIC);
  const isGzip =
    (ext === ".tar.gz" || ext === ".tgz") &&
    buffer.subarray(0, 2).equals(GZIP_MAGIC);

  if (!isZip && !isGzip) {
    return NextResponse.json(
      { error: "file content does not match extension" },
      { status: 400 }
    );
  }

  // create workspace directory
  const dirName = `codebase-${randomUUID()}`;
  const extractDir = path.join(WORKSPACE_ROOT, dirName);

  try {
    await fs.mkdir(extractDir, { recursive: true });

    if (isZip) {
      const tmpPath = path.join(WORKSPACE_ROOT, `${dirName}.zip`);
      await fs.writeFile(tmpPath, buffer);
      await extractZip(tmpPath, { dir: extractDir });
      await fs.unlink(tmpPath);
    } else {
      const tmpPath = path.join(WORKSPACE_ROOT, `${dirName}.tar.gz`);
      await fs.writeFile(tmpPath, buffer);
      await tarExtract({ file: tmpPath, cwd: extractDir });
      await fs.unlink(tmpPath);
    }

    // calculate extracted size
    const sizeBytes = await getDirSize(extractDir);

    // create codebase record
    const codebase = await prisma.codebase.create({
      data: {
        clientId,
        source: "uploaded",
        path: dirName,
        filename,
        sizeBytes,
      },
    });

    return NextResponse.json({
      codebaseId: codebase.id,
      filename,
    });
  } catch (err) {
    console.error("upload extraction failed:", err);
    await fs.rm(extractDir, { recursive: true, force: true }).catch(() => {});
    return NextResponse.json(
      { error: "failed to extract archive" },
      { status: 500 }
    );
  }
}

async function getDirSize(dir: string): Promise<number> {
  let size = 0;
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      size += await getDirSize(fullPath);
    } else {
      const stat = await fs.stat(fullPath);
      size += stat.size;
    }
  }
  return size;
}
