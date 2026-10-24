#!/bin/sh
# Decompile the game's own code (units wunioid, Info, CourseEdit, Project1) with Ghidra headless into
# original_source/extracted/ghidra/game.txt, creating the functions auto-analysis misses (entries from the VMTs
# and published method tables, see tools/delphi_rtti.py).
# Usage: tools/ghidra_dump.sh [start] [end] [output name, default game]
set -e
root="$(cd "$(dirname "$0")/.." && pwd)"
export JAVA_HOME="$HOME/opt/jdk-21.0.12.1+1"
ghidra="$HOME/opt/ghidra_12.1.4_PUBLIC"
start=${1:-0x416a00}; end=${2:-0x41d600}
out="$root/original_source/extracted/ghidra"; mkdir -p "$out/project"; name=${3:-game}
python3 "$root/tools/delphi_rtti.py" "$root/original_source/WUNIOID.EXE" --json "$out/rtti.json" >/dev/null
entries=$(python3 -c "
import json,sys
s=set()
for c in json.load(open('$out/rtti.json')):
    s.update(m['addr'] for m in c['methods'])
    s.update(c['virtuals'][i] for i in c['overrides'])
print(' '.join(hex(a) for a in sorted(s) if $start <= a < $end))")
"$ghidra/support/analyzeHeadless" "$out/project" wunioid -deleteProject \
  -import "$root/original_source/WUNIOID.EXE" -scriptPath "$root/tools/ghidra" \
  -postScript DumpGame.java "$out/$name.txt" "$start" "$end" $entries > "$out/headless.log" 2>&1
grep -c '^FUNCTION' "$out/$name.txt"
