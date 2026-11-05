"use client";

import { useEffect, useRef, useState } from "react";

const CHARSET = "ABCDEFGHIJKLMNOPQRSTUVWXYZÆØÅ";
const TICK_MS = 70;
const HOLD_MS = 2800;
/** Letters a tile passes through on its way to the next word, like a real departure board. */
const PASSES = 7;

function pad(word: string, tiles: number) {
  return word.padEnd(tiles, " ").split("");
}

function Flap({ char, previous, turn }: { char: string; previous: string; turn: number }) {
  return (
    <span className="lp-flap">
      <span className="lp-half lp-top"><span>{char}</span></span>
      <span className="lp-half lp-bottom"><span>{previous}</span></span>
      {turn > 0 && char !== previous ? (
        <>
          <span key={`a${turn}`} className="lp-half lp-top lp-leaf-out"><span>{previous}</span></span>
          <span key={`b${turn}`} className="lp-half lp-bottom lp-leaf-in"><span>{char}</span></span>
        </>
      ) : null}
    </span>
  );
}

/**
 * A split-flap sign that turns through the things MedAK can report. The words are in the page
 * heading for screen readers, so the board itself is hidden from them.
 */
export function FlapBoard({ words, pauseLabel, playLabel }: { words: readonly string[]; pauseLabel: string; playLabel: string }) {
  const tiles = Math.max(...words.map((w) => w.length));
  const [chars, setChars] = useState(() => pad(words[0]!, tiles));
  const [previous, setPrevious] = useState(() => pad(words[0]!, tiles));
  const [turn, setTurn] = useState(0);
  const [paused, setPaused] = useState(false);
  const [still, setStill] = useState(true);
  const state = useRef({ word: 0, queues: [] as string[][], current: pad(words[0]!, tiles) });

  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setStill(motion.matches);
    update();
    motion.addEventListener("change", update);
    return () => motion.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (still || paused) return;
    const s = state.current;
    let holdUntil = performance.now() + HOLD_MS;

    const startNextWord = () => {
      s.word = (s.word + 1) % words.length;
      const target = pad(words[s.word]!, tiles);
      s.queues = target.map((to, i) => {
        if (to === s.current[i]) return [];
        // Tiles start one after another from the left, so the change runs across the board.
        const wait = Array.from({ length: i }, () => s.current[i]!);
        const passes = Array.from({ length: PASSES }, () => CHARSET[Math.floor(Math.random() * CHARSET.length)]!);
        return [...wait, ...passes, to];
      });
    };

    const timer = window.setInterval(() => {
      if (document.hidden) return;
      if (!s.queues.some((q) => q.length > 0)) {
        if (performance.now() < holdUntil) return;
        startNextWord();
        holdUntil = Infinity;
      }
      const before = s.current;
      const after = before.map((c, i) => s.queues[i]!.shift() ?? c);
      s.current = after;
      setPrevious(before);
      setChars(after);
      setTurn((n) => n + 1);
      if (!s.queues.some((q) => q.length > 0)) holdUntil = performance.now() + HOLD_MS;
    }, TICK_MS);
    return () => window.clearInterval(timer);
  }, [still, paused, words, tiles]);

  return (
    <div className="lp-board-wrap">
      <div className="lp-board" aria-hidden="true" style={{ "--tiles": tiles } as React.CSSProperties}>
        <div className="lp-board-row">
          {chars.map((char, i) => <Flap key={i} char={char} previous={previous[i]!} turn={turn} />)}
        </div>
      </div>
      {still ? null : (
        <button type="button" className="lp-pause" onClick={() => setPaused(!paused)}>
          {paused ? playLabel : pauseLabel}
        </button>
      )}
    </div>
  );
}
