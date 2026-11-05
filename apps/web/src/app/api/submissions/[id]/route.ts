import { type NextRequest, NextResponse } from "next/server";
import { readSubmissionBytes, session } from "@/server/data";

/** Download a file made for SKAT. Access is decided by row-level security on the user's session. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await session();
  const sub = await readSubmissionBytes(supabase, id);
  if (!sub) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(new Uint8Array(sub.bytes), {
    headers: {
      "Content-Type": "text/plain; charset=windows-1252",
      "Content-Disposition": `attachment; filename="${sub.row.file_name.replace(/[^\w.-]/g, "_")}"`,
      "Cache-Control": "no-store",
    },
  });
}
