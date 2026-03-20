import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { cacheGet, cacheSet, cacheDelete, cacheClear, cacheSize } from "../src/lib/cache.mjs";

describe("Cache Module", () => {
  beforeEach(() => {
    cacheClear();
  });

  describe("cacheSet / cacheGet", () => {
    it("should store and retrieve a value", () => {
      cacheSet("key1", { data: "hello" });
      const result = cacheGet("key1");
      assert.deepStrictEqual(result, { data: "hello" });
    });

    it("should return undefined for missing key", () => {
      assert.strictEqual(cacheGet("nonexistent"), undefined);
    });

    it("should return undefined after TTL expires", async () => {
      cacheSet("short", "value", 0.05);
      await new Promise((resolve) => setTimeout(resolve, 100));
      assert.strictEqual(cacheGet("short"), undefined);
    });

    it("should not expire before TTL", async () => {
      cacheSet("long", "value", 10);
      await new Promise((resolve) => setTimeout(resolve, 50));
      assert.strictEqual(cacheGet("long"), "value");
    });

    it("should overwrite existing key", () => {
      cacheSet("dup", "first");
      cacheSet("dup", "second");
      assert.strictEqual(cacheGet("dup"), "second");
    });

    it("should evict old entries when max size is exceeded", () => {
      for (let index = 0; index < 220; index += 1) {
        cacheSet(`key-${index}`, index, 10);
      }
      assert.ok(cacheSize() <= 200);
      assert.strictEqual(cacheGet("key-0"), undefined);
      assert.strictEqual(cacheGet("key-219"), 219);
    });
  });

  describe("cacheDelete", () => {
    it("should remove a cached entry", () => {
      cacheSet("toRemove", 42);
      cacheDelete("toRemove");
      assert.strictEqual(cacheGet("toRemove"), undefined);
    });

    it("should not throw when deleting non-existent key", () => {
      assert.doesNotThrow(() => cacheDelete("ghost"));
    });
  });

  describe("cacheClear", () => {
    it("should remove all entries", () => {
      cacheSet("a", 1);
      cacheSet("b", 2);
      cacheClear();
      assert.strictEqual(cacheSize(), 0);
    });
  });

  describe("cacheSize", () => {
    it("should reflect number of stored entries", () => {
      assert.strictEqual(cacheSize(), 0);
      cacheSet("x", 1);
      cacheSet("y", 2);
      assert.strictEqual(cacheSize(), 2);
    });
  });
});
