#!/usr/bin/env python3
"""Print the floating-point constants (_DAT_ symbols in the CODE section) referenced by a Ghidra dump, in the
three x87 sizes (single, double, extended); the instruction that loads one tells which size applies."""
import re, struct, sys
d = open('original_source/WUNIOID.EXE', 'rb').read()
t = open(sys.argv[1] if len(sys.argv) > 1 else 'original_source/extracted/ghidra/game.txt').read()
for a in sorted(set(re.findall(r'_DAT_(00[0-9a-f]{6})', t))):
    va = int(a, 16)
    if va >= 0x41e000:
        continue
    b = d[va - 0x401000 + 0x400:][:10]
    f = struct.unpack('<f', b[:4])[0]
    g = struct.unpack('<d', b[:8])[0]
    m, e = int.from_bytes(b[:8], 'little'), int.from_bytes(b[8:10], 'little')
    try:
        x = (m / 2**63) * 2.0**((e & 0x7fff) - 16383) * (-1 if e & 0x8000 else 1)
    except OverflowError:
        x = float('nan')
    # The size used: find the x87 load in the assembly (FLD dword/qword/tword ptr [addr]).
    sizes = set(re.findall(r'(float|double|extended double|dword|qword) ptr \[0x' + a + r'\]', t))
    vals = {'float': f'{f:.7g}', 'double': f'{g:.10g}', 'extended double': f'{x:.10g}'}
    shown = [vals[s] for s in sorted(sizes) if s in vals]
    print(f"{a} {'/'.join(sorted(sizes)) or '?':16} " + (' '.join(shown) if shown else
          f"f32={f:.7g} f64={g:.10g} f80={x:.10g}"))
