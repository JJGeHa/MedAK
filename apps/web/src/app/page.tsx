import { FIELD_BY_KEY, type FieldKey, formatRow, LINE_LENGTH, type Row } from "@medak/engine";
import type { Metadata } from "next";
import { Schibsted_Grotesk } from "next/font/google";
import Link from "next/link";
import { FlapBoard } from "@/components/landing/FlapBoard";
import { type Fact, RecordExplainer } from "@/components/landing/RecordExplainer";
import { LangSwitch } from "@/components/LangSwitch";
import { supabaseServer } from "@/lib/supabase/server";
import { getLang } from "@/server/lang";
import "./landing.css";

const display = Schibsted_Grotesk({ subsets: ["latin"], weight: ["400", "500", "700", "800"], variable: "--font-landing" });

const REPO = "https://github.com/JJGeHa/MedAK";
const live = process.env.NEXT_PUBLIC_MEDAK_LIVE === "1";

export const metadata: Metadata = {
  title: "MedAK: employee shares reporting to SKAT",
  description: "Report employee shares, warrants, options and RSUs to SKAT by describing what happened, in Danish or English. Open source.",
  robots: { index: live, follow: live },
};

/** Fictional, from the engine's test cases. The CPR number is the example in SKAT's guidance. */
const EXAMPLE: Row = {
  OPSENR: "12345674", EJERSTATUKOD: "0", RETTEKOD: "0", FONDNOTANR: "1", PNRSENR: "0101584455",
  PAPIRIDENTNVN: "Nordlys Software ApS B-anparter", PAPIRTYPEKOD: "1", PAPIRLANDKOD: "DK",
  ASIDNR: "00000", OPTAGHANDEKOD: "2", DEPOTTYPEKOD: "0", HANDETID: "120000",
  STKFTG: "+", KURVAEOMSVALFTG: "+", OMKOMSVALFTG: "+", NTOAFROMSVALFTG: "+", NTOAFRAFRVALFTG: "+",
  KURVAEBSKVALFTG: "+", OMKBSKVALFTG: "+", NTOAFRBSKVALFTG: "+",
  STKANT: "400000000", AKTIPAPIRKURSPCT: "25000000",
  OMSVALKOD: "DKK", AFRVALKOD: "DKK", VALKURSPCT: "100000000",
  KURVAEOMSVALBLB: "2840000", OMKOMSVALBLB: "0", NTOAFROMSVALBLB: "2840000", NTOAFRAFRVALBLB: "2840000",
  KURVAEBSKVALBLB: "2840000", OMKBSKVALBLB: "0", NTOAFRBSKVALBLB: "2840000",
  HANDEDTO: "20260915", VALOEDTO: "20260915", INDKAAR: "2026", KOEBSALGKOD: "H",
};

export default async function Landing() {
  const lang = await getLang();
  const t = (da: string, en: string) => (lang === "da" ? da : en);

  let signedIn = false;
  try {
    const supabase = await supabaseServer();
    signedIn = Boolean((await supabase.auth.getUser()).data.user);
  } catch {
    // The page works without sign-in; the visitor just sees "Log in".
  }

  const fact = (id: string, key: FieldKey, words: string, after: string): Fact => ({
    id, words, after, fieldName: FIELD_BY_KEY[key].label[lang], start: FIELD_BY_KEY[key].start, length: FIELD_BY_KEY[key].length,
  });
  const facts = lang === "da"
    ? [
        fact("company", "OPSENR", "Nordlys Software ApS", " gav "),
        fact("person", "PNRSENR", "Anna Holm", " "),
        fact("shares", "STKANT", "400 aktier", " den "),
        fact("date", "HANDEDTO", "15. september 2026", " efter "),
        fact("scheme", "KOEBSALGKOD", "ligningslovens § 7 P", ". Anna betalte "),
        fact("price", "AKTIPAPIRKURSPCT", "25,00 kr. pr. aktie", ", og aktierne var "),
        fact("value", "KURVAEBSKVALBLB", "28.400,00 kr.", " værd."),
      ]
    : [
        fact("company", "OPSENR", "Nordlys Software ApS", " gave "),
        fact("person", "PNRSENR", "Anna Holm", " "),
        fact("shares", "STKANT", "400 shares", " on "),
        fact("date", "HANDEDTO", "15 September 2026", " under "),
        fact("scheme", "KOEBSALGKOD", "section 7 P", ". Anna paid "),
        fact("price", "AKTIPAPIRKURSPCT", "DKK 25.00 per share", ", and the shares were worth "),
        fact("value", "KURVAEBSKVALBLB", "DKK 28,400.00", "."),
      ];

  const words = lang === "da"
    ? ["MEDARBEJDERAKTIER", "WARRANTS", "AKTIEOPTIONER", "RSU'ER", "MATCHING-AKTIER"]
    : ["EMPLOYEE SHARES", "WARRANTS", "STOCK OPTIONS", "RSUS", "MATCHING SHARES"];

  return (
    <div className={`lp ${display.variable}`}>
      <section className="lp-hero">
        <header className="lp-nav">
          <Link href="/" className="lp-brand">MedAK</Link>
          <nav>
            <a href={REPO} className="lp-nav-github">GitHub</a>
            <LangSwitch />
            <Link href={signedIn ? "/app" : "/login"} className="lp-nav-action">{signedIn ? t("Gå til appen", "Go to the app") : t("Log ind", "Log in")}</Link>
          </nav>
        </header>

        <h1>
          <span>{t("Indberet", "Report")}</span>
          <span className="lp-sr">{t("medarbejderaktier, warrants, aktieoptioner og RSU'er", "employee shares, warrants, stock options and RSUs")}</span>
          <FlapBoard key={lang} words={words} pauseLabel={t("Stop skiltet", "Pause the sign")} playLabel={t("Start skiltet", "Play the sign")} />
          <span>{t("til SKAT uden regnearket", "to SKAT without the spreadsheet")}</span>
        </h1>

        <div className="lp-hero-foot">
          <p className="lp-lede">{t(
            "Fortæl, hvad der skete, på dansk eller engelsk. MedAK finder SKATs koder, tjekker tallene og laver filen, du uploader i TastSelv Erhverv.",
            "Say what happened, in Danish or English. MedAK works out SKAT's codes, checks the numbers and makes the file you upload in TastSelv Erhverv.",
          )}</p>
          <div className="lp-actions">
            <Link href={signedIn ? "/app" : "/login?mode=signUp"} className="lp-btn lp-btn-solid">{signedIn ? t("Gå til appen", "Go to the app") : t("Opret en konto", "Create an account")}</Link>
            <a href={REPO} className="lp-btn lp-btn-line">{t("Se koden på GitHub", "See the code on GitHub")}</a>
          </div>
          {live ? null : <p className="lp-status">{t("MedAK er under udvikling. Brug kun opdigtede data indtil videre.", "MedAK is still in development. Use made-up data only for now.")}</p>}
        </div>
      </section>

      <section className="lp-section">
        <h2>{t("Du skriver det her. SKAT får det her.", "You write this. SKAT gets this.")}</h2>
        <RecordExplainer facts={facts} line={formatRow(EXAMPLE).trimEnd()} total={LINE_LENGTH} />
        <p className="lp-after">{t(
          "SKATs skabelon beder dig udfylde hver række i et regneark, med samme dato og kurs for hver medarbejder. I MedAK skriver du en begivenhed én gang og tilføjer de personer, den gælder. Du kan indsætte dem fra et regneark, rette en indberetning senere og slå SKATs fejlliste op på den rigtige person.",
          "SKAT's template has you fill in a spreadsheet row by row, with the same date and price for every employee. In MedAK you enter an event once and add the people it covers. You can paste them from a spreadsheet, correct a report later and match SKAT's error list to the right person.",
        )}</p>
      </section>

      <section className="lp-section lp-versions" id="versions">
        <h2>{t("To måder at bruge MedAK på", "Two ways to use MedAK")}</h2>
        <div className="lp-columns">
          <div className="lp-column">
            <h3>{t("Open source", "Open source")}</h3>
            <p className="lp-column-status">{t("Gratis, og klar på GitHub i dag", "Free, and on GitHub today")}</p>
            <ul>
              <li>{t("Hele appen og filmotoren under Apache-2.0-licensen", "The whole app and file engine under the Apache-2.0 licence")}</li>
              <li>{t("Indberetning af medarbejderaktier på dansk og engelsk, med tjek, rettelser og filhistorik", "Employee-share reporting in Danish and English, with checks, corrections and file history")}</li>
              <li>{t("Teams, flere selskaber og log ind med link, adgangskode, Google, Microsoft eller single sign-on, når du selv har sat det op", "Teams, several companies, and sign-in by link, password, Google, Microsoft or single sign-on once you have set it up")}</li>
              <li>{t("Du kører den på din egen server og står selv for sikkerhed, backup og databeskyttelse", "You run it on your own server, and security, backups and data protection are yours to handle")}</li>
            </ul>
            <a href={REPO} className="lp-repo">github.com/JJGeHa/MedAK</a>
            <pre className="lp-clone"><code>git clone {REPO}.git</code></pre>
          </div>
          <div className="lp-column lp-column-paid">
            <h3>{t("Betalt version", "Paid version")}</h3>
            <p className="lp-column-status">{t("Planlagt. Den kan ikke købes endnu", "Planned. It can't be bought yet")}</p>
            <ul>
              <li>{t("Alt fra open source-versionen, uden at du skal drive noget selv", "Everything in the open source version, with nothing for you to run")}</li>
              <li>{t("Hosting i EU, backup, opdateringer og en databehandleraftale", "Hosting in the EU, backups, updates and a data processing agreement")}</li>
              <li>{t("Log ind med Google, Microsoft eller jeres eget single sign-on, sat op for jer", "Sign-in with Google, Microsoft or your own single sign-on, set up for you")}</li>
              <li>{t("Direkte indsendelse til SKAT, når SKAT giver adgang til FTPs Gateway", "Direct submission to SKAT, once SKAT gives access to its FTPs Gateway")}</li>
              <li>{t("Gennemgang hos en autoriseret rådgiver, som tager ansvaret for indberetningen", "Review by an authorised adviser, who takes responsibility for the report")}</li>
              <li>{t("Support, når du sidder fast", "Support when you get stuck")}</li>
            </ul>
            <a href={REPO} className="lp-repo">{t("Følg med på GitHub", "Follow progress on GitHub")}</a>
          </div>
        </div>
      </section>

      <footer className="lp-footer">
        <p>{t(
          "MedAK giver generel information og er ikke skatterådgivning. Søg professionel rådgivning, hvis du er i tvivl. Du har selv ansvaret for det, du indberetter.",
          "MedAK gives general information and is not tax advice. Seek professional advice if you are in any doubt. You remain responsible for what you report.",
        )}</p>
        <p>{t(
          "MedAK er et uafhængigt projekt og har ingen tilknytning til SKAT eller Skatteforvaltningen.",
          "MedAK is an independent project and has no connection to SKAT or the Danish Tax Agency.",
        )}</p>
      </footer>
    </div>
  );
}
