import { describe, expect, it } from "vitest";
import { browserOpenCommand } from "../src/server.js";

describe("browserOpenCommand", () => {
  it("uses open on macOS", () => {
    expect(browserOpenCommand("file:///tmp/report/index.html", "darwin")).toEqual({
      command: "open",
      args: ["file:///tmp/report/index.html"]
    });
  });

  it("uses cmd start on Windows", () => {
    expect(browserOpenCommand("file:///C:/report/index.html", "win32")).toEqual({
      command: "cmd",
      args: ["/c", "start", "", "file:///C:/report/index.html"]
    });
  });

  it("uses xdg-open on Linux and other platforms", () => {
    expect(browserOpenCommand("file:///tmp/report/index.html", "linux")).toEqual({
      command: "xdg-open",
      args: ["file:///tmp/report/index.html"]
    });
  });
});
