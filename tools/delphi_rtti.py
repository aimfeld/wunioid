#!/usr/bin/env python3
"""List the Delphi 3 classes in WUNIOID.EXE from their VMTs.

For each class: VMT address, name, instance size, parent, published methods (method table), published
fields (field table) and the virtual-method slots, marking the slots a class overrides (differs from its
parent). Delphi 3 VMT layout (negative offsets from the VMT pointer): -64 self pointer, -60 interface table,
-56 auto table, -52 init table, -48 type info, -44 field table, -40 method table, -36 dynamic table,
-32 class name, -28 instance size, -24 parent (pointer to the parent's VMT pointer), -20 SafeCallException,
-16 DefaultHandler, -12 NewInstance, -8 FreeInstance, -4 Destroy; virtual methods from offset 0.

Usage: python3 tools/delphi_rtti.py [original_source/WUNIOID.EXE] [--json out.json]
"""
import json
import struct
import sys

IMAGE_BASE_CODE = 0x401000  # CODE section VA, file offset 0x400
CODE_FILE_OFF = 0x400
CODE_END = 0x41E000


def main():
    args = sys.argv[1:]
    out_json = None
    if '--json' in args:
        i = args.index('--json')
        out_json = args[i + 1]
        del args[i:i + 2]
    path = args[0] if args else 'original_source/WUNIOID.EXE'
    d = open(path, 'rb').read()

    def off(va):
        return va - IMAGE_BASE_CODE + CODE_FILE_OFF

    def u32(va):
        return struct.unpack_from('<I', d, off(va))[0]

    def u16(va):
        return struct.unpack_from('<H', d, off(va))[0]

    def sstr(va):
        n = d[off(va)]
        return d[off(va) + 1:off(va) + 1 + n].decode('latin-1')

    def in_code(va):
        return IMAGE_BASE_CODE <= va < CODE_END

    # Find VMTs: a dword at VMT-64 that equals VMT.
    vmts = []
    for o in range(CODE_FILE_OFF, off(CODE_END) - 64, 4):
        va = o - CODE_FILE_OFF + IMAGE_BASE_CODE
        if struct.unpack_from('<I', d, o)[0] == va + 64:
            vmt = va + 64
            namep = u32(vmt - 32)
            if in_code(namep) and 1 <= d[off(namep)] < 64:
                vmts.append(vmt)
    vmtset = set(vmts)
    classes = {}
    for vmt in vmts:
        name = sstr(u32(vmt - 32))
        parentp = u32(vmt - 24)
        parent = u32(parentp) if parentp and in_code(parentp) else 0
        c = {'vmt': vmt, 'name': name, 'size': u32(vmt - 28), 'parent_vmt': parent,
             'methods': [], 'fields': [], 'virtuals': []}
        mt = u32(vmt - 40)
        if mt and in_code(mt):
            n = u16(mt)
            p = mt + 2
            for _ in range(n):
                size = u16(p)
                c['methods'].append({'addr': u32(p + 2), 'name': sstr(p + 6)})
                p += size
        ft = u32(vmt - 44)
        if ft and in_code(ft):
            n = u16(ft)
            p = ft + 6  # count, class table pointer
            for _ in range(n):
                c['fields'].append({'offset': u32(p), 'class_index': u16(p + 4), 'name': sstr(p + 6)})
                p += 7 + d[off(p + 6)]
        # Virtual slots end where the next structure (often the class name or another table) starts.
        stops = {u32(vmt - k) for k in (32, 40, 44, 48, 52, 56, 60)} | {v - 64 for v in vmtset if v > vmt}
        stop = min([s for s in stops if s > vmt] + [vmt + 4 * 200])
        p = vmt
        while p < stop and in_code(u32(p)):
            c['virtuals'].append(u32(p))
            p += 4
        classes[vmt] = c

    for c in classes.values():
        par = classes.get(c['parent_vmt'])
        c['parent'] = par['name'] if par else hex(c['parent_vmt'])
        pv = par['virtuals'] if par else []
        c['overrides'] = [i for i, a in enumerate(c['virtuals']) if i >= len(pv) or pv[i] != a]

    for c in sorted(classes.values(), key=lambda c: c['vmt']):
        print(f"{c['vmt']:#x} {c['name']} size={c['size']:#x} parent={c['parent']} "
              f"virtuals={len(c['virtuals'])}")
        for i in c['overrides']:
            print(f"    slot {i:3d} (+{4 * i:#05x}) -> {c['virtuals'][i]:#x}")
        for m in c['methods']:
            print(f"    published {m['addr']:#x} {m['name']}")
        for f in c['fields']:
            print(f"    field +{f['offset']:#x} {f['name']}")
    if out_json:
        json.dump(sorted(classes.values(), key=lambda c: c['vmt']), open(out_json, 'w'), indent=1)


if __name__ == '__main__':
    main()
