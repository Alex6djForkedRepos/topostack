import { unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { DEFAULT_PROJECT, type FabricationPackageV1 } from "@topostack/core";
import { prepareProjectDownload, prepareProjectSettings, prepareSelectedDownload } from "$lib/studio/native-export";

describe("native export", () => {
  it("packages every project file into one clearly named download", async () => {
    const master = { filename: "mount-rainier-master.svg", blob: new Blob(["<svg />"], { type: "image/svg+xml" }) };
    const output: FabricationPackageV1 = {
      schemaVersion: 1,
      master,
      files: [master, { filename: "README.txt", blob: new Blob(["Build guide"], { type: "text/plain" }) }],
    };

    const download = await prepareProjectDownload(output);
    const files = unzipSync(new Uint8Array(await download.blob.arrayBuffer()));

    expect(download.filename).toBe("mount-rainier-project-files.zip");
    expect(download.fileCount).toBe(2);
    expect(Object.keys(files)).toEqual(["mount-rainier-master.svg", "README.txt"]);
    expect(new TextDecoder().decode(files["README.txt"])).toBe("Build guide");
  });
});


describe("export choices", () => {
  const file = (filename: string) => ({ filename, blob: new Blob([filename], { type: filename.endsWith(".svg") ? "image/svg+xml" : "text/plain" }) });
  const master = file("ridge-layer-01-master.svg");
  const output: FabricationPackageV1 = { schemaVersion: 1, master, files: [master,
    file("ridge-layer-01-layer-01.svg"), file("ridge-layer-01-layer-01-engrave.svg"),
    file("ridge-layer-01-panel-02-layers-02-03.svg"), file("ridge-layer-01-panel-02-layers-02-03-engrave.svg"),
    file("ridge-layer-01-assembly-guide.html"), file("README.txt"), file("ATTRIBUTION.txt"),
  ] };

  it.each(["panels", "engravings"] as const)("downloads only the selected %s plus supporting files", async (option) => {
    const download = await prepareSelectedDownload(output, option);
    const files = unzipSync(new Uint8Array(await download.blob.arrayBuffer()));
    const suffix = option === "engravings" ? "-engrave.svg" : ".svg";
    expect(Object.keys(files)).toEqual([
      `ridge-layer-01-layer-01${suffix}`, `ridge-layer-01-panel-02-layers-02-03${suffix}`,
      "README.txt", "ATTRIBUTION.txt",
    ]);
    expect(download.filename).toBe(`ridge-layer-01-${option === "panels" ? "cut" : "engraving"}-panels.zip`);
    expect(download.fileCount).toBe(4);
  });

  it.each(["panels", "engravings"] as const)("includes every work-area cell sheet in %s", async (option) => {
    const sheets = ["ridge-layer-01-a1", "ridge-layer-01-b2", "ridge-layer-01-a1-2", "ridge-panel-03-layers-03-04-c1"];
    const split: FabricationPackageV1 = { schemaVersion: 1, master, files: [master,
      ...sheets.flatMap((sheet) => [file(`${sheet}.svg`), file(`${sheet}-engrave.svg`)]),
      file("ridge-assembly-guide.html"), file("README.txt"), file("ATTRIBUTION.txt"),
    ] };
    const files = unzipSync(new Uint8Array(await (await prepareSelectedDownload(split, option)).blob.arrayBuffer()));
    const suffix = option === "engravings" ? "-engrave.svg" : ".svg";
    expect(Object.keys(files)).toEqual([...sheets.map((sheet) => `${sheet}${suffix}`), "README.txt", "ATTRIBUTION.txt"]);
  });

  it("keeps paint templates out of the panel bundles and offers them on their own", async () => {
    const sheets = ["ridge-layer-01", "ridge-layer-03-a1", "ridge-panel-03-layers-03-04-c1-2"];
    const painted: FabricationPackageV1 = { schemaVersion: 1, master, files: [master,
      ...sheets.flatMap((sheet) => [file(`${sheet}.svg`), file(`${sheet}-engrave.svg`), file(`${sheet}-paint-water.svg`)]),
      file("ridge-assembly-guide.html"), file("README.txt"), file("ATTRIBUTION.txt"),
    ] };
    for (const option of ["panels", "engravings"] as const) {
      const files = unzipSync(new Uint8Array(await (await prepareSelectedDownload(painted, option)).blob.arrayBuffer()));
      expect(Object.keys(files).some((name) => name.includes("-paint-"))).toBe(false);
    }
    const download = await prepareSelectedDownload(painted, "paint");
    const files = unzipSync(new Uint8Array(await download.blob.arrayBuffer()));
    expect(Object.keys(files)).toEqual([...sheets.map((sheet) => `${sheet}-paint-water.svg`), "README.txt", "ATTRIBUTION.txt"]);
    expect(download.filename).toBe("ridge-layer-01-paint-templates.zip");
    await expect(prepareSelectedDownload(output, "paint")).rejects.toThrow(/no paint templates/i);
  });

  it("downloads individual files without wrapping them in a ZIP", async () => {
    expect(await prepareSelectedDownload(output, "master")).toEqual({ ...master, fileCount: 1 });
    expect((await prepareSelectedDownload(output, "assembly")).filename).toBe("ridge-layer-01-assembly-guide.html");
  });

  it("rejects panel exports for a flat engraving package", async () => {
    await expect(prepareSelectedDownload({ schemaVersion: 1, master, files: [master] }, "panels")).rejects.toThrow("not available");
  });

  it("backs up importable settings without generated geometry", async () => {
    const { parseProject } = await import("$lib/storage/storage");
    const download = prepareProjectSettings({ ...DEFAULT_PROJECT, name: "My / mountain" });
    expect(download.filename).toBe("my-mountain-project.json");
    const data = JSON.parse(await download.blob.text());
    expect(parseProject(data.project)).toEqual({ ...DEFAULT_PROJECT, name: "My / mountain" });
  });
});
