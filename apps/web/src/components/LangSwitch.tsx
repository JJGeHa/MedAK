"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { useT } from "@/lib/i18n";
import type { Lang } from "@/lib/types";
import { setLanguage } from "@/server/actions";

export function LangSwitch() {
  const { lang } = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const choose = (next: Lang) => start(async () => {
    await setLanguage(next);
    router.refresh();
  });
  return (
    <div className="seg" role="group" aria-label="Sprog / Language">
      <button type="button" aria-pressed={lang === "da"} disabled={pending} onClick={() => choose("da")}>Dansk</button>
      <button type="button" aria-pressed={lang === "en"} disabled={pending} onClick={() => choose("en")}>English</button>
    </div>
  );
}
