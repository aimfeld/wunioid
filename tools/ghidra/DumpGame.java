// Ghidra headless script: create functions at the given entry addresses (VMT slots and published methods that
// auto-analysis misses), then at plausible procedure starts in the gaps of the range, and write decompiled C
// and assembly of every function in [start, end) to an output file.
// Args: <out.txt> <start> <end> <addr>...   (see tools/ghidra_dump.sh)
import ghidra.app.script.GhidraScript;
import ghidra.app.cmd.disassemble.DisassembleCommand;
import ghidra.app.decompiler.*;
import ghidra.program.model.address.*;
import ghidra.program.model.listing.*;
import java.io.*;
import java.util.*;

public class DumpGame extends GhidraScript {
    @Override
    public void run() throws Exception {
        String[] a = getScriptArgs();
        PrintWriter out = new PrintWriter(new FileWriter(a[0]));
        Address start = toAddr(Long.decode(a[1])), end = toAddr(Long.decode(a[2]));
        Listing listing = currentProgram.getListing();
        for (int i = 3; i < a.length; i++) makeFunction(toAddr(Long.decode(a[i])));
        // Gaps: a 4-aligned address after a function's end whose first instruction is a usual prologue.
        boolean found = true;
        while (found) {
            found = false;
            for (Address p = start; p.add(3).compareTo(end) < 0; p = p.add(4)) {
                if (listing.getFunctionContaining(p) != null) continue;
                Data dt = listing.getDefinedDataContaining(p);
                if (dt != null && !dt.isPointer() && dt.getLength() > 4) continue;
                int b0 = getByte(p) & 0xff, b1 = getByte(p.add(1)) & 0xff, b2 = getByte(p.add(2)) & 0xff;
                boolean prologue = (b0 == 0x55 && b1 == 0x8b && b2 == 0xec) || b0 == 0x53 || b0 == 0x56
                    || (b0 == 0x83 && b1 == 0xc4) || b0 == 0xa1 || (b0 == 0x33 && b1 == 0xd2) || (b0 == 0x8b && (b1 == 0xc0 || b1 == 0xd0 || b1 == 0x40));
                if (prologue && makeFunction(p)) { found = true; }
            }
        }
        DecompInterface dec = new DecompInterface();
        dec.openProgram(currentProgram);
        FunctionIterator it = listing.getFunctions(new AddressSet(start, end), true);
        while (it.hasNext()) {
            Function f = it.next();
            out.println("=================================================================");
            out.println("FUNCTION " + f.getEntryPoint() + " " + f.getName() + "  [" + f.getBody().getMinAddress()
                + " - " + f.getBody().getMaxAddress() + "]");
            DecompileResults r = dec.decompileFunction(f, 60, monitor);
            out.println(r.decompileCompleted() ? r.getDecompiledFunction().getC() : "// decompile failed");
            out.println("---- assembly");
            InstructionIterator ii = listing.getInstructions(f.getBody(), true);
            while (ii.hasNext()) {
                Instruction ins = ii.next();
                String c = "";
                for (ghidra.program.model.symbol.Reference ref : ins.getReferencesFrom()) {
                    Function t = listing.getFunctionAt(ref.getToAddress());
                    if (t != null) c += " ; -> " + t.getName(true);
                }
                out.println("  " + ins.getAddress() + "  " + ins + c);
            }
        }
        out.close();
    }

    private boolean makeFunction(Address p) {
        Listing listing = currentProgram.getListing();
        if (listing.getFunctionAt(p) != null) return false;
        if (listing.getInstructionAt(p) == null) {
            listing.clearCodeUnits(p, p.add(3), false);
            new DisassembleCommand(p, null, true).applyTo(currentProgram, monitor);
        }
        if (listing.getInstructionAt(p) == null) return false;
        Function f = createFunction(p, null);
        return f != null;
    }
}
