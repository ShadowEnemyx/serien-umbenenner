import { describe, expect, it } from "vitest";
import { aliasKeyForStem, createProposals, findPrefixCandidates, readableStem, titleLookupQueries } from "../src/lib/rename";
import type { VideoFile } from "../src/lib/types";

const file = (name: string): VideoFile => {
  const dot = name.lastIndexOf(".");
  return {
    id: name,
    path: `/media/${name}`,
    name,
    stem: name.slice(0, dot),
    extension: name.slice(dot),
  };
};

describe("readableStem", () => {
  it("removes a confirmed prefix and keeps the episode", () => {
    expect(readableStem("tvkids.danny.phantom.s01e15", [{ value: "tvkids", action: "remove" }])).toEqual({
      stem: "Danny Phantom S01E15",
      appliedPrefix: "tvkids",
    });
  });

  it("formats German joining words and alternate episode notation", () => {
    expect(readableStem("tvarchiv.zack.und.cody.1x1", [{ value: "TVArchiv", action: "remove" }]).stem).toBe(
      "Zack und Cody S01E01",
    );
  });

  it("does not remove an unconfirmed leading title token", () => {
    expect(readableStem("danny.phantom.s01e15", []).stem).toBe("Danny Phantom S01E15");
  });

  it("handles dashes and removes confirmed technical suffixes", () => {
    const options = { removeTechnical: true };
    expect(readableStem("tvr-soa-s01e01-720p", [{ value: "tvr", action: "remove" }], [], options).stem).toBe(
      "Soa S01E01",
    );
    expect(aliasKeyForStem("tvr-soa-s01e01-720p", [{ value: "tvr", action: "remove" }], options)).toBe("soa");
  });

  it("uses a saved title alias for every matching filename", () => {
    expect(
      readableStem(
        "tvr-soa-s01e01-720p",
        [{ value: "tvr", action: "remove" }],
        [{ value: "soa", title: "Sons of Anarchy" }],
      ).stem,
    ).toBe("Sons of Anarchy S01E01");
    expect(
      readableStem(
        "tvr-soa-s03e04-720p",
        [{ value: "tvr", action: "remove" }],
        [{ value: "soa", title: "Sons of Anarchy" }],
      ).stem,
    ).toBe("Sons of Anarchy S03E04");
  });

  it("adds a supplied title to episode-only filenames without changing the episode", () => {
    expect(readableStem("s8e1", [], [], { removeTechnical: true, episodeTitle: "Dragonball" }).stem).toBe(
      "Dragonball S08E01",
    );
  });

  it("does not add a supplied episode title when the filename already has a title", () => {
    expect(readableStem("Dragonball S08E01", [], [], { removeTechnical: true, episodeTitle: "Another Show" }).stem).toBe(
      "Dragonball S08E01",
    );
  });

  it("replaces an existing title while preserving the episode and extension metadata", () => {
    expect(
      readableStem(
        "tvr-soa-s01e01-720p",
        [{ value: "tvr", action: "remove" }],
        [],
        { removeTechnical: true, titleOverride: "Sons of Anarchy" },
      ).stem,
    ).toBe("Sons of Anarchy S01E01");
  });

  it("preserves a film year when replacing the title", () => {
    expect(
      readableStem("tvarchiv-the-matrix-1999-1080p", [{ value: "tvarchiv", action: "remove" }], [], {
        removeTechnical: true,
        titleOverride: "The Matrix",
      }).stem,
    ).toBe("The Matrix 1999");
  });
});

describe("proposal and candidate creation", () => {
  it("only selects changed file names", () => {
    const [proposal] = createProposals([file("tvkids.danny.phantom.s01e15.mkv")], [
      { value: "tvkids", action: "remove" },
    ]);
    expect(proposal).toMatchObject({ targetName: "Danny Phantom S01E15.mkv", selected: true });
  });

  it("selects episode-only files after adding a supplied title", () => {
    const proposals = createProposals(
      [file("S08E01.avi"), file("S08E02.avi")],
      [],
      [],
      { removeTechnical: true, episodeTitle: "Dragonball" },
    );
    expect(proposals).toMatchObject([
      { targetName: "Dragonball S08E01.avi", selected: true, appliedAlias: "Dragonball" },
      { targetName: "Dragonball S08E02.avi", selected: true, appliedAlias: "Dragonball" },
    ]);
  });

  it("selects title-only episodes after a per-file title override", () => {
    const proposals = createProposals(
      [file("S08E01.avi"), file("S08E02.avi")],
      [],
      [],
      { removeTechnical: true, titleOverrides: { "S08E01.avi": "Dragonball" } },
    );
    expect(proposals).toMatchObject([
      { targetName: "Dragonball S08E01.avi", selected: true },
      { targetName: "S08E02.avi", selected: false },
    ]);
  });

  it("groups unknown leading tokens and excludes saved rules", () => {
    const candidates = findPrefixCandidates(
      [file("tvkids.danny.phantom.s01e15.mkv"), file("tvkids.danny.phantom.s01e16.mkv"), file("archive.x.s01e01.mkv")],
      [{ value: "archive", action: "keep" }],
    );
    expect(candidates).toEqual([{ value: "tvkids", count: 2, examples: ["tvkids.danny.phantom.s01e15.mkv", "tvkids.danny.phantom.s01e16.mkv"] }]);
  });

  it("finds a prefix in dash-separated filenames", () => {
    expect(findPrefixCandidates([file("tvr-soa-s01e01-720p.mkv")], [])).toEqual([
      { value: "tvr", count: 1, examples: ["tvr-soa-s01e01-720p.mkv"] },
    ]);
  });
});

describe("TMDb lookup queries", () => {
  it("uses a known removal rule before looking up a title", () => {
    expect(titleLookupQueries("tvkids.danny.phantom.s01e15", [{ value: "tvkids", action: "remove" }], { removeTechnical: true }))
      .toEqual(["danny phantom"]);
  });

  it("falls back to a query without an unknown leading prefix", () => {
    expect(titleLookupQueries("tvr-soa-s01e01-720p", [], { removeTechnical: true }))
      .toEqual(["tvr soa", "soa"]);
  });
});
