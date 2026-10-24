"""Read Delphi binary form streams (TPF0) from a PE file's RCDATA resources.

Usage: uv run --with pefile python tools/delphi_dfm.py <exe> [FORM ...]
Prints the component tree of each form (default: all TPF0 resources).
As a module: load_forms(exe) -> {resource name: Component}.
"""
import struct
import sys
from dataclasses import dataclass, field

import pefile


@dataclass
class Binary:
    data: bytes

    def __repr__(self):
        return f'<binary {len(self.data)} bytes>'


@dataclass
class Component:
    cls: str
    name: str
    props: dict = field(default_factory=dict)
    children: list = field(default_factory=list)

    def find(self, name):
        if self.name == name:
            return self
        for c in self.children:
            hit = c.find(name)
            if hit:
                return hit
        return None


class Reader:
    def __init__(self, data):
        self.b, self.p = data, 0

    def u8(self):
        v = self.b[self.p]
        self.p += 1
        return v

    def take(self, n):
        v = self.b[self.p:self.p + n]
        self.p += n
        return v

    def peek(self):
        return self.b[self.p]

    def sstr(self):
        return self.take(self.u8()).decode('latin1')

    def value(self):
        t = self.u8()
        if t == 0:  # vaNull
            return None
        if t == 1:  # vaList
            items = []
            while self.peek():
                items.append(self.value())
            self.u8()
            return items
        if t == 2:
            return struct.unpack('<b', self.take(1))[0]
        if t == 3:
            return struct.unpack('<h', self.take(2))[0]
        if t == 4:
            return struct.unpack('<i', self.take(4))[0]
        if t == 5:  # vaExtended (80-bit float), kept raw
            return ('extended', self.take(10).hex())
        if t in (6, 7):  # vaString, vaIdent
            return self.sstr()
        if t == 8:
            return False
        if t == 9:
            return True
        if t == 10:  # vaBinary
            return Binary(self.take(struct.unpack('<i', self.take(4))[0]))
        if t == 11:  # vaSet
            items = set()
            while True:
                s = self.sstr()
                if not s:
                    return items
                items.add(s)
        if t == 12:  # vaLString
            return self.take(struct.unpack('<i', self.take(4))[0]).decode('latin1')
        if t == 13:  # vaNil
            return None
        if t == 14:  # vaCollection: items are vaList-framed property lists
            items = []
            while self.peek():
                if self.peek() in (2, 3, 4):  # optional item order
                    self.value()
                assert self.u8() == 1
                items.append(self.props())
            self.u8()
            return items
        raise ValueError(f'unknown value type {t} at {self.p - 1}')

    def props(self):
        out = {}
        while True:
            k = self.sstr()
            if not k:
                return out
            out[k] = self.value()

    def component(self):
        if self.peek() & 0xF0 == 0xF0:  # filer flags (inherited/child pos)
            flags = self.u8()
            if flags & 2:
                self.value()
        c = Component(self.sstr(), self.sstr())
        c.props = self.props()
        while self.peek():
            c.children.append(self.component())
        self.u8()
        return c


def load_forms(exe):
    pe = pefile.PE(exe)
    forms = {}
    for t in pe.DIRECTORY_ENTRY_RESOURCE.entries:
        for n in t.directory.entries:
            if not n.name:
                continue
            d = n.directory.entries[0].data.struct
            data = pe.get_data(d.OffsetToData, d.Size)
            if data[:4] == b'TPF0':
                r = Reader(data)
                r.take(4)
                forms[str(n.name)] = r.component()
    return forms


def dump(c, depth=0):
    print('  ' * depth + f'{c.name}: {c.cls}')
    for k, v in c.props.items():
        if isinstance(v, list) and v and isinstance(v[0], dict):
            print('  ' * depth + f'    {k} = [{len(v)} items]')
            for i, item in enumerate(v):
                print('  ' * depth + f'      [{i}] {item}')
        else:
            print('  ' * depth + f'    {k} = {v!r}')
    for ch in c.children:
        dump(ch, depth + 1)


if __name__ == '__main__':
    forms = load_forms(sys.argv[1])
    for name in sys.argv[2:] or forms:
        print('=====', name)
        dump(forms[name])
