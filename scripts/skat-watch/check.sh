#!/usr/bin/env bash
# Detects when Skattestyrelsen publishes a new AKSA 2278 Excel template or a new version
# of the guidance that MedAK's engine is built from.
#
#   scripts/skat-watch/check.sh            compare skat.dk with skat.lock
#   scripts/skat-watch/check.sh --update   record the current state in skat.lock
#
# Exit codes: 0 unchanged, 1 changed (report written), 2 could not read skat.dk.
# Set REPORT_FILE to write a Markdown report (used for the GitHub issue).
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
lock="$here/skat.lock"

# Pages that link to the AKSA 2278 templates.
pages=(
  "https://skat.dk/erhverv/ekapital/vaerdipapirer/selskabers-indberetning-af-medarbejderaktier-og-koeb-af-egne-aktier"
  "https://skat.dk/erhverv/ekapital/vaerdipapirer/indberetning-af-kapitalindskud-i-selskaber-investorfradrag"
  "https://skat.dk/erhverv/ekapital/vaerdipapirer/selskabers-og-investeringsforeningers-indberetning-af-likvidationsprovenu"
)
# Guidance documents on info.skat.dk (medarbejderaktier/egne aktier, investorfradrag, likvidationsprovenu).
guides=(2289412 16096 1918)

fetch() { curl -sfL --retry 3 --retry-delay 5 -A "MedAK template watcher (+https://github.com/JJGeHa/MedAK)" "$@"; }
sha256() {
  if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | cut -d' ' -f1
  else shasum -a 256 "$1" | cut -d' ' -f1; fi
}
fail() { echo "error: $*" >&2; exit 2; }

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
current="$tmp/current"
: >"$current"

# Templates: every .xlsm link with "aksa2278" in its path, downloaded and hashed.
links="$(for p in "${pages[@]}"; do fetch "$p" || fail "could not fetch $p"; done |
  grep -oE 'href="/media/[^"]*aksa2278[^"]*\.xlsm"' | sed -E 's/^href="//; s/"$//' | sort -u)" || true
[ -n "$links" ] || fail "no AKSA 2278 template links found; the skat.dk page layout may have changed"
for path in $links; do
  name="$(basename "$path")"
  fetch "https://skat.dk$path" -o "$tmp/$name" || fail "could not download https://skat.dk$path"
  printf 'template\t%s\t%s\thttps://skat.dk%s\n' "$name" "$(sha256 "$tmp/$name")" "$path" >>"$current"
done

# Guidance: the "Dato for offentliggørelse" shown on each document.
for oid in "${guides[@]}"; do
  url="https://info.skat.dk/data.aspx?oid=$oid"
  published="$(fetch "$url" | tr -d '\r' | tr '\n' ' ' | sed -E 's/<[^>]*>/ /g; s/&nbsp;/ /g; s/ +/ /g' |
    grep -oE 'Dato for offentligg[^ ]* [0-9]{1,2} [A-Za-z]{3} [0-9]{4}( [0-9]{2}:[0-9]{2})?' | head -1 |
    sed -E 's/^Dato for offentligg[^ ]* //')" || true
  [ -n "$published" ] || fail "could not read the publication date of $url"
  # skat.dk varies the month between Danish and English and upper/lower case; normalise to ISO.
  published="$(echo "$published" | awk '{
    split("jan feb mar apr maj jun jul aug sep okt nov dec", da, " ")
    split("jan feb mar apr may jun jul aug sep oct nov dec", en, " ")
    m = tolower($2); n = 0
    for (i = 1; i <= 12; i++) if (m == da[i] || m == en[i]) n = i
    if (n == 0) exit 1
    printf "%04d-%02d-%02d%s\n", $3, n, $1, (NF >= 4 ? " " $4 : "")
  }')" || fail "unrecognised publication date on $url"
  printf 'guidance\toid=%s\t%s\t%s\n' "$oid" "$published" "$url" >>"$current"
done

sort -o "$current" "$current"

if [ "${1:-}" = "--update" ]; then
  {
    echo "# What MedAK's engine and golden files were built from. Updated with: scripts/skat-watch/check.sh --update"
    echo "# kind<TAB>name<TAB>sha256 or publication date<TAB>url"
    cat "$current"
  } >"$lock"
  echo "Updated $lock"
  exit 0
fi

if diff -u <(grep -v '^#' "$lock") "$current" >"$tmp/diff"; then
  echo "SKAT's AKSA 2278 templates and guidance are unchanged."
  exit 0
fi

report="${REPORT_FILE:-/dev/stdout}"
{
  echo "Skattestyrelsen has published something new that MedAK's engine is built from."
  echo
  echo '```diff'
  cat "$tmp/diff"
  echo '```'
  echo
  echo "## What to do"
  echo
  echo "1. **New template:** download it, compare the VBA and the hidden Konfiguration sheet with"
  echo "   the previous version, and update the engine (codes, lists, TEMPLATE_VERSION) if needed."
  echo "   Then regenerate the golden files; see [docs/testing.md](../blob/master/docs/testing.md)."
  echo "2. **New guidance:** read the sections marked \"Væsentlige ændringer\" and update"
  echo "   docs/2278-format.md, docs/validation-rules.md and the engine where rules changed."
  echo "3. Run \`scripts/skat-watch/check.sh --update\` and commit the new skat.lock."
} >"$report"
cat "$tmp/diff"
exit 1
