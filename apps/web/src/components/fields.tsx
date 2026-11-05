"use client";

import { fromFixedDigits, toFixedDigits } from "@medak/engine";
import { type ReactNode, useEffect, useId, useState } from "react";
import { useT } from "@/lib/i18n";

export function TextField(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  error?: string;
  type?: "text" | "email" | "password" | "date";
  maxLength?: number;
  placeholder?: string;
  autoComplete?: string;
  required?: boolean;
  style?: React.CSSProperties;
  inputMode?: "numeric" | "text";
  mono?: boolean;
}) {
  const id = useId();
  return (
    <div className="field" style={props.style}>
      <label htmlFor={id}>{props.label}</label>
      <input
        id={id}
        type={props.type ?? "text"}
        value={props.value}
        maxLength={props.maxLength}
        placeholder={props.placeholder}
        autoComplete={props.autoComplete ?? "off"}
        required={props.required}
        inputMode={props.inputMode}
        className={`${props.error ? "bad" : ""} ${props.mono ? "mono" : ""}`}
        onChange={(e) => props.onChange(e.target.value)}
      />
      {props.error ? <span className="inline-error">{props.error}</span> : props.hint ? <span className="hint">{props.hint}</span> : null}
    </div>
  );
}

export function SelectField(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly { value: string; label: string }[];
  hint?: string;
  style?: React.CSSProperties;
}) {
  const id = useId();
  return (
    <div className="field" style={props.style}>
      <label htmlFor={id}>{props.label}</label>
      <select id={id} value={props.value} onChange={(e) => props.onChange(e.target.value)}>
        {props.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {props.hint ? <span className="hint">{props.hint}</span> : null}
    </div>
  );
}

/**
 * A number as people type it, stored as the file's digits. Typing "18.862,50" in Danish gives
 * "1886250". Malformed or ambiguous input shows an error and is never guessed at.
 */
export function NumberInput(props: {
  digits: string | undefined;
  decimals: number;
  onChange: (digits: string | undefined) => void;
  ariaLabel?: string;
  id?: string;
  minDecimals?: number;
  style?: React.CSSProperties;
  compact?: boolean;
}) {
  const { lang, t } = useT();
  const minDecimals = props.minDecimals ?? (props.decimals === 2 ? 2 : 0);
  const show = (digits: string | undefined) => (digits && /^\d+$/.test(digits) ? fromFixedDigits(digits, props.decimals, lang, minDecimals) : "");
  const [text, setText] = useState(show(props.digits));
  const [focused, setFocused] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Follow changes from elsewhere (language switch, undo, another step), but not while typing.
  useEffect(() => {
    if (!focused) setText(show(props.digits));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.digits, lang, focused]);

  const handle = (value: string) => {
    setText(value);
    if (value.trim() === "") { setError(null); props.onChange(undefined); return; }
    const parsed = toFixedDigits(value, props.decimals, lang);
    if (parsed.ok) { setError(null); props.onChange(parsed.digits); return; }
    setError(
      parsed.error === "tooManyDecimals"
        ? t(`Højst ${props.decimals} decimaler.`, `At most ${props.decimals} decimals.`)
        : parsed.error === "negative"
          ? t("Skriv tallet uden minus.", "Enter the number without a minus.")
          : t("Skriv tallet som 1.234,50.", "Write the number as 1,234.50."),
    );
  };

  return (
    <>
      <input
        id={props.id}
        type="text"
        inputMode="decimal"
        aria-label={props.ariaLabel}
        aria-invalid={error !== null}
        className={error ? "bad" : ""}
        style={props.style}
        value={text}
        onFocus={() => setFocused(true)}
        onBlur={() => { setFocused(false); if (!error) setText(show(props.digits)); }}
        onChange={(e) => handle(e.target.value)}
      />
      {error ? <span className="inline-error">{error}</span> : null}
    </>
  );
}

export function NumberField(props: {
  label: string;
  digits: string | undefined;
  decimals: number;
  minDecimals?: number;
  onChange: (digits: string | undefined) => void;
  hint?: string;
  style?: React.CSSProperties;
  action?: ReactNode;
}) {
  const id = useId();
  return (
    <div className="field" style={props.style}>
      <label htmlFor={id}>{props.label}</label>
      <NumberInput id={id} digits={props.digits} decimals={props.decimals} onChange={props.onChange} {...(props.minDecimals !== undefined ? { minDecimals: props.minDecimals } : {})} />
      {props.hint ? <span className="hint">{props.hint}</span> : null}
      {props.action}
    </div>
  );
}

export function Choice(props: {
  checked: boolean;
  onSelect: () => void;
  title: string;
  description?: string;
  code?: string;
}) {
  return (
    <div
      className="choice"
      role="radio"
      tabIndex={0}
      aria-checked={props.checked}
      onClick={props.onSelect}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); props.onSelect(); } }}
    >
      <span className="dot" />
      <div>
        <div className="t">{props.title}</div>
        {props.description ? <div className="d">{props.description}</div> : null}
      </div>
      {props.code ? <span className="chip code mono">{props.code}</span> : null}
    </div>
  );
}
