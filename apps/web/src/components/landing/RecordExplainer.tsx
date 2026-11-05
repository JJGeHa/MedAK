"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n";

export interface Fact {
  readonly id: string;
  /** The words in the sentence that stand for this fact. */
  readonly words: string;
  /** Plain text following the words, up to the next fact. */
  readonly after: string;
  readonly fieldName: string;
  readonly start: number;
  readonly length: number;
}

/** Long runs of unused fields say more as a count than as a screenful of nothing. */
function compact(text: string, blankLabel: (count: number) => string): React.ReactNode[] {
  return text.split(/( {40,})/).map((part, i) =>
    i % 2 === 1 ? <span key={i} className="lp-gap">{blankLabel(part.length)}</span> : part);
}

/** A real line of SKAT's file, with the sentence that produced it. Choosing a fact finds it in the line. */
export function RecordExplainer({ facts, line, total }: { facts: readonly Fact[]; line: string; total: number }) {
  const { t } = useT();
  const [selected, setSelected] = useState(facts[2]?.id ?? facts[0]!.id);
  const active = facts.find((f) => f.id === selected)!;
  const ordered = [...facts].sort((a, b) => a.start - b.start);

  const end = active.start + active.length - 1;
  const written = line.slice(active.start - 1, end);

  const blank = (count: number) => t(`${count} tomme tegn`, `${count} blank characters`);
  const parts: React.ReactNode[] = [];
  let at = 0;
  for (const fact of ordered) {
    const from = fact.start - 1;
    parts.push(...compact(line.slice(at, from), blank));
    parts.push(<mark key={fact.id} className={fact.id === selected ? "lp-on" : ""}>{line.slice(from, from + fact.length)}</mark>);
    at = from + fact.length;
  }
  parts.push(...compact(line.slice(at), blank));

  return (
    <div className="lp-explain">
      <p className="lp-sentence">
        {facts.map((fact) => (
          <span key={fact.id}>
            <button
              type="button"
              aria-pressed={fact.id === selected}
              onClick={() => setSelected(fact.id)}
              onMouseEnter={() => setSelected(fact.id)}
              onFocus={() => setSelected(fact.id)}
            >{fact.words}</button>
            {fact.after}
          </span>
        ))}
      </p>
      <div className="lp-record">
        <p className="lp-caption" aria-live="polite">
          {t(
            `${active.fieldName}: tegn ${active.start} til ${end} af ${total}, skrevet som ${written}`,
            `${active.fieldName}: characters ${active.start} to ${end} of ${total}, written as ${written}`,
          )}
        </p>
        <pre className="lp-line">{parts}</pre>
      </div>
    </div>
  );
}
