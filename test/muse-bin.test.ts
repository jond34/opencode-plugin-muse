/**
 * D134: the Windows resolver, pinned on Linux.
 *
 * Node refuses to spawn a `.cmd` without a shell (the CVE-2024-27980 fix), and
 * the vendor's Windows installer answers that by putting a native
 * `muse-bin-<version>.exe` beside the `muse.cmd` shim, with `.muse-version`
 * naming the active one. Every rule below is filesystem logic, so it is held by
 * injected inputs; the spawn contract itself is `test/seam/windows-spawn.mjs`,
 * which needs a real Windows runner.
 */
import { describe, expect, test } from "bun:test";
import { win32 } from "node:path";
import {
  museBinFailure,
  pathEntriesFrom,
  resolveMuseBin,
  type MuseBin,
  type MuseBinInput,
} from "../src/host.js";

interface FakeFile {
  readonly content?: string;
  readonly mtime?: number;
}

/** A directory listing derived from the file paths, so a test writes no disk. */
function fakeFs(files: Record<string, FakeFile>): Pick<MuseBinInput, "readFile" | "readdir" | "statMtime"> {
  const dirs = new Map<string, string[]>();
  for (const path of Object.keys(files)) {
    const dir = win32.dirname(path);
    dirs.set(dir, [...(dirs.get(dir) ?? []), win32.basename(path)]);
  }
  return {
    readFile: (path) => files[path]?.content,
    readdir: (path) => dirs.get(path),
    statMtime: (path) => files[path]?.mtime,
  };
}

interface ResolveOptions {
  readonly pathEntries: readonly string[];
  readonly env?: NodeJS.ProcessEnv;
  readonly platform?: NodeJS.Platform;
}

function resolve(files: Record<string, FakeFile>, options: ResolveOptions): MuseBin {
  return resolveMuseBin({
    platform: options.platform ?? "win32",
    env: options.env ?? {},
    pathEntries: options.pathEntries,
    ...fakeFs(files),
  });
}

const SHIM = "C:\\Users\\me\\AppData\\Local\\muse";
const OTHER = "C:\\ProgramData\\muse";
const VERSION = "1.4.25-R9361.1";

function installedLayout(): Record<string, FakeFile> {
  return {
    [`${SHIM}\\muse.cmd`]: { content: "@echo off\r\n" },
    [`${SHIM}\\.muse-version`]: { content: `${VERSION}\r\n` },
    [`${SHIM}\\muse-bin-${VERSION}.exe`]: { mtime: 10 },
  };
}

describe("MUSE_BIN is the first answer", () => {
  test("an explicit path wins over everything on PATH", () => {
    const bin = resolve(installedLayout(), {
      pathEntries: [SHIM],
      env: { MUSE_BIN: "D:\\tools\\muse.exe" },
    });
    expect(bin).toEqual({ command: "D:\\tools\\muse.exe", source: "env" });
  });

  test("a blank setting is not a setting", () => {
    const bin = resolve(installedLayout(), { pathEntries: [SHIM], env: { MUSE_BIN: "   " } });
    expect(bin.source).toBe("version-file");
  });
});

describe("POSIX keeps the plain name", () => {
  test("a launcher script needs no resolution", () => {
    const bin = resolve({ "/usr/local/bin/muse": { content: "#!/bin/sh\n" } }, {
      pathEntries: ["/usr/local/bin"],
      platform: "linux",
    });
    expect(bin).toEqual({ command: "muse", source: "fallback" });
  });

  test("MUSE_BIN still wins on POSIX", () => {
    const bin = resolve({}, { pathEntries: [], platform: "darwin", env: { MUSE_BIN: "/opt/muse" } });
    expect(bin).toEqual({ command: "/opt/muse", source: "env" });
  });
});

describe("Windows resolves past the shim", () => {
  test("a native muse.exe on PATH is already spawnable", () => {
    const bin = resolve({ "C:\\bin\\muse.exe": { mtime: 1 } }, { pathEntries: ["C:\\bin"] });
    expect(bin).toEqual({ command: "C:\\bin\\muse.exe", source: "path-exe" });
  });

  test("muse.exe beats a shim earlier on PATH", () => {
    const bin = resolve(
      { ...installedLayout(), "C:\\bin\\muse.exe": { mtime: 1 } },
      { pathEntries: [SHIM, "C:\\bin"] },
    );
    expect(bin.source).toBe("path-exe");
    expect(bin.command).toBe("C:\\bin\\muse.exe");
  });

  test("the version file names the active binary", () => {
    const bin = resolve(installedLayout(), { pathEntries: [SHIM] });
    expect(bin).toEqual({
      command: `${SHIM}\\muse-bin-${VERSION}.exe`,
      source: "version-file",
      shimDir: SHIM,
      version: VERSION,
    });
  });

  test("a .ps1 shim is a shim too", () => {
    const files = installedLayout();
    delete files[`${SHIM}\\muse.cmd`];
    files[`${SHIM}\\muse.ps1`] = { content: "& $binary @args\n" };
    expect(resolve(files, { pathEntries: [SHIM] }).source).toBe("version-file");
  });

  test("the first shim directory on PATH wins", () => {
    const files: Record<string, FakeFile> = {
      ...installedLayout(),
      [`${OTHER}\\muse.cmd`]: { content: "@echo off\n" },
      [`${OTHER}\\.muse-version`]: { content: "9.9.9\n" },
      [`${OTHER}\\muse-bin-9.9.9.exe`]: { mtime: 99 },
    };
    const bin = resolve(files, { pathEntries: [SHIM, OTHER] });
    expect(bin.command).toBe(`${SHIM}\\muse-bin-${VERSION}.exe`);
  });

  test("a version naming a missing binary falls through to the newest", () => {
    const files: Record<string, FakeFile> = {
      [`${SHIM}\\muse.cmd`]: { content: "@echo off\n" },
      [`${SHIM}\\.muse-version`]: { content: "9.9.9\n" },
      [`${SHIM}\\muse-bin-1.0.0.exe`]: { mtime: 1 },
      [`${SHIM}\\muse-bin-2.0.0.exe`]: { mtime: 2 },
    };
    const bin = resolve(files, { pathEntries: [SHIM] });
    expect(bin.source).toBe("newest");
    expect(bin.command).toBe(`${SHIM}\\muse-bin-2.0.0.exe`);
    expect(bin.version).toBe("9.9.9");
  });

  test("a missing version file falls through to the newest", () => {
    const files: Record<string, FakeFile> = {
      [`${SHIM}\\muse.cmd`]: { content: "@echo off\n" },
      [`${SHIM}\\muse-bin-1.0.0.exe`]: { mtime: 1 },
    };
    expect(resolve(files, { pathEntries: [SHIM] }).source).toBe("newest");
  });

  test("equal mtimes pick a stable name, not listing order", () => {
    const files: Record<string, FakeFile> = {
      [`${SHIM}\\muse.cmd`]: { content: "@echo off\n" },
      [`${SHIM}\\muse-bin-b.exe`]: { mtime: 5 },
      [`${SHIM}\\muse-bin-a.exe`]: { mtime: 5 },
    };
    expect(resolve(files, { pathEntries: [SHIM] }).command).toBe(`${SHIM}\\muse-bin-a.exe`);
  });

  test("a path-like version is refused rather than joined", () => {
    const files: Record<string, FakeFile> = {
      [`${SHIM}\\muse.cmd`]: { content: "@echo off\n" },
      [`${SHIM}\\.muse-version`]: { content: "..\\..\\evil\n" },
      [`${SHIM}\\muse-bin-1.0.0.exe`]: { mtime: 1 },
    };
    const bin = resolve(files, { pathEntries: [SHIM] });
    expect(bin.source).toBe("newest");
    expect(bin.command.startsWith(`${SHIM}\\`)).toBe(true);
  });

  test("nothing to resolve falls back with the directory it searched", () => {
    const files: Record<string, FakeFile> = { [`${SHIM}\\muse.cmd`]: { content: "@echo off\n" } };
    const bin = resolve(files, { pathEntries: [SHIM] });
    expect(bin).toEqual({ command: "muse", source: "fallback", shimDir: SHIM });
  });

  test("no shim at all falls back without a directory", () => {
    const bin = resolve({}, { pathEntries: ["C:\\bin"] });
    expect(bin).toEqual({ command: "muse", source: "fallback" });
  });
});

describe("PATH splitting follows the platform", () => {
  test("Windows splits on semicolons and drops empty entries", () => {
    expect(pathEntriesFrom({ PATH: "C:\\a;;C:\\b;" }, "win32")).toEqual(["C:\\a", "C:\\b"]);
  });

  test("POSIX splits on colons", () => {
    expect(pathEntriesFrom({ PATH: "/a::/b" }, "linux")).toEqual(["/a", "/b"]);
  });

  test("a missing PATH is an empty list", () => {
    expect(pathEntriesFrom({}, "linux")).toEqual([]);
  });
});

describe("the fallback failure is an instruction", () => {
  test("it names MUSE_BIN, the expected binary, and the directory", () => {
    const fallback: MuseBin = { command: "muse", source: "fallback", shimDir: SHIM, version: VERSION };
    const message = museBinFailure(fallback, "win32");
    expect(message).toContain("MUSE_BIN");
    expect(message).toContain(`muse-bin-${VERSION}.exe`);
    expect(message).toContain(SHIM);
  });

  test("an unknown version says what shape to expect", () => {
    const message = museBinFailure({ command: "muse", source: "fallback" }, "win32");
    expect(message).toContain("muse-bin-<version>.exe");
  });

  test("a resolved binary and a POSIX host have nothing to explain", () => {
    expect(museBinFailure({ command: "muse", source: "env" }, "win32")).toBeUndefined();
    expect(museBinFailure({ command: "muse", source: "fallback" }, "linux")).toBeUndefined();
  });
});
