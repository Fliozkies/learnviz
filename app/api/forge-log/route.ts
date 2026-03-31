import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const logsDir = join(process.cwd(), "logs");
    await mkdir(logsDir, { recursive: true });

    const filePath = join(logsDir, "latest_log.json");
    await writeFile(filePath, JSON.stringify(body, null, 2), "utf-8");

    return NextResponse.json({ ok: true, path: filePath });
  } catch (err) {
    console.error("[forge-log API]", err);
    return NextResponse.json(
      { ok: false, error: String(err) },
      { status: 500 },
    );
  }
}