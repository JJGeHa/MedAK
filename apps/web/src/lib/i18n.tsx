"use client";

import { createContext, type ReactNode, useContext } from "react";
import type { Lang } from "./types";

const LangContext = createContext<Lang>("da");

export function LangProvider({ lang, children }: { lang: Lang; children: ReactNode }) {
  return <LangContext.Provider value={lang}>{children}</LangContext.Provider>;
}

/** Every string is written in both languages where it is used, so neither can be forgotten. */
export function useT() {
  const lang = useContext(LangContext);
  return { lang, t: (da: string, en: string) => (lang === "da" ? da : en) };
}

/** Friendly text for the error codes server actions return. */
export function errorText(code: string, t: (da: string, en: string) => string): string {
  const texts: Record<string, string> = {
    save: t("Det kunne ikke gemmes. Prøv igen.", "It could not be saved. Please try again."),
    notAllowed: t("Du har ikke adgang til at gøre dette.", "You don't have access to do this."),
    nameRequired: t("Skriv et navn.", "Enter a name."),
    seInvalid: t("Cvr-/se-nr. skal være 8 cifre.", "The CVR/SE number must be 8 digits."),
    seChecksum: t("Det cvr-nr. findes ikke (kontrolcifferet passer ikke). Tjek for tastefejl.", "That CVR number can't exist (the check digit is wrong). Check for typos."),
    tooLong: t("Teksten er for lang til SKATs fil.", "The text is too long for SKAT's file."),
    companyExists: t("Selskabet findes allerede i dette arbejdsområde.", "This company already exists in this workspace."),
    emailInvalid: t("Skriv en gyldig e-mailadresse.", "Enter a valid email address."),
    inviteInvalid: t("Invitationen er ikke gyldig for denne konto. Den kan være brugt eller udløbet, eller sendt til en anden e-mailadresse.", "This invitation isn't valid for this account. It may have been used or have expired, or was sent to another email address."),
    lastOwner: t("Et arbejdsområde skal have mindst én ejer.", "A workspace must have at least one owner."),
    hasErrors: t("Ret fejlene, før filen kan dannes.", "Fix the errors before the file can be made."),
    nothingToCorrect: t("Der er ingen ændringer i forhold til det, SKAT har godkendt.", "Nothing has changed from what SKAT accepted."),
    tooLarge: t("Der er for mange data. Kontakt os.", "There is too much data. Please contact us."),
    rateUnavailable: t("Kursen kunne ikke hentes. Skriv den selv.", "The rate could not be fetched. Please enter it yourself."),
  };
  return texts[code] ?? texts.save!;
}
