import { cookies } from "next/headers";
import type { Lang } from "@/lib/types";

export async function getLang(): Promise<Lang> {
  return (await cookies()).get("medak-lang")?.value === "en" ? "en" : "da";
}
