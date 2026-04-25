import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readSetting, writeSetting } from "../src/storage";

interface StorageStub extends Storage {
  readonly entries: Map<string, string>;
}

function createStorageStub(behavior: {
  getThrows?: Error;
  setThrows?: Error;
} = {}): StorageStub {
  const entries = new Map<string, string>();
  return {
    entries,
    get length() {
      return entries.size;
    },
    clear() {
      entries.clear();
    },
    getItem(key: string) {
      if (behavior.getThrows) throw behavior.getThrows;
      return entries.get(key) ?? null;
    },
    key(index: number) {
      return Array.from(entries.keys())[index] ?? null;
    },
    removeItem(key: string) {
      entries.delete(key);
    },
    setItem(key: string, value: string) {
      if (behavior.setThrows) throw behavior.setThrows;
      entries.set(key, value);
    },
  };
}

let originalLocalStorage: PropertyDescriptor | undefined;

beforeEach(() => {
  originalLocalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
});

afterEach(() => {
  if (originalLocalStorage) {
    Object.defineProperty(globalThis, "localStorage", originalLocalStorage);
  }
});

function installLocalStorage(stub: StorageStub): void {
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: stub,
  });
}

describe("readSetting", () => {
  it("returns the stored value when present", () => {
    const stub = createStorageStub();
    stub.entries.set("doublcov-theme", "ci-dark");
    installLocalStorage(stub);
    expect(readSetting("doublcov-theme")).toBe("ci-dark");
  });

  it("returns null when the key is unset", () => {
    installLocalStorage(createStorageStub());
    expect(readSetting("missing")).toBeNull();
  });

  it("returns null when reading throws (private mode / SecurityError)", () => {
    installLocalStorage(
      createStorageStub({ getThrows: new Error("SecurityError: storage blocked") }),
    );
    expect(() => readSetting("anything")).not.toThrow();
    expect(readSetting("anything")).toBeNull();
  });
});

describe("writeSetting", () => {
  it("persists the value when storage is available", () => {
    const stub = createStorageStub();
    installLocalStorage(stub);
    writeSetting("doublcov-theme", "paper");
    expect(stub.entries.get("doublcov-theme")).toBe("paper");
  });

  it("swallows write failures (quota exceeded / storage blocked)", () => {
    installLocalStorage(
      createStorageStub({
        setThrows: new Error("QuotaExceededError"),
      }),
    );
    expect(() => writeSetting("doublcov-theme", "paper")).not.toThrow();
  });
});
