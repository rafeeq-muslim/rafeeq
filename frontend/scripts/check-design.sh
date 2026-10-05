#!/usr/bin/env bash
# Design-system guard for Rafeeq UI code. Run from design-system/:
#   bash scripts/check-design.sh
# Fails on the rules that break RTL or bypass the tokens (DESIGN.md).
set -u
cd "$(dirname "$0")/.."

fail=0
targets="${*:-src/components src/gallery src/App.tsx}"

check() {
  local title="$1" pattern="$2" filter="${3:-}"
  local hits
  hits=$(grep -rnoE "$pattern" $targets 2>/dev/null | { if [ -n "$filter" ]; then grep -vE "$filter"; else cat; fi; })
  if [ -n "$hits" ]; then
    printf '✗ %s\n%s\n\n' "$title" "$hits"
    fail=1
  else
    printf '✓ %s\n' "$title"
  fi
}

# Physical direction breaks RTL. Use ms/me, ps/pe, start/end, text-start, border-s/e.
check "No physical-direction classes" \
  '(^|[ "`])-?(ml|mr|pl|pr|left|right|border-l|border-r|rounded-l|rounded-r|rounded-tl|rounded-tr|rounded-bl|rounded-br|text-left|text-right)-[^ "`]*' \
  'rtl:|ltr:'

# Components use semantic tokens, not raw colours.
check "No raw hex colours in components" '#[0-9a-fA-F]{3,8}\b' 'src/gallery/'
check "No arbitrary colour values" '(bg|text|border|ring|fill|stroke)-\[(#|rgb|hsl|oklch)[^]]*\]' 'from_var'
check "No raw palette classes in Rafeeq components" \
  '(bg|text|border|ring|fill|stroke)-(violet|amber|purple|blue|red|green|yellow|orange|gray|zinc|neutral|slate|stone)-[0-9]+' \
  'src/gallery/'

# Arabic: no letter-spacing.
check "No tracking on Arabic text" 'tracking-(tight|tighter|wide|wider|widest)'

# shadcn rules.
check "No space-x/space-y (use gap)" '(^|[ "`])space-[xy]-[0-9]+' 'components/ui/avatar.tsx'

exit $fail
