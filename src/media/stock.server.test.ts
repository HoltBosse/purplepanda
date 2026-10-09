import { afterEach, describe, expect, it, vi } from "vitest";
import { importStockPhoto, searchStockPhotos, stockPhotosEnabled } from "./stock.server.js";

vi.mock("../db/db.js", () => ({
  // No photo is in the library yet.
  getDb: () => ({ select: () => ({ from: () => ({ where: () => ({ limit: async () => [] }) }) }) }),
}));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("stock photos", () => {
  it("are off without an API key", async () => {
    vi.stubEnv("PEXELS_API_KEY", "");
    expect(stockPhotosEnabled()).toBe(false);
    await expect(searchStockPhotos("forest")).rejects.toThrow(/PEXELS_API_KEY/);
  });

  it("search Pexels with the key and map results", async () => {
    vi.stubEnv("PEXELS_API_KEY", "test-key");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          photos: [{ id: 42, width: 4000, height: 3000, alt: "Misty forest", photographer: "Ana", src: { tiny: "https://images.pexels.com/t.jpg", large2x: "https://images.pexels.com/l.jpg" } }],
        }),
      ),
    );
    expect(stockPhotosEnabled()).toBe(true);
    expect(await searchStockPhotos("misty forest", 2)).toEqual([
      { id: "42", description: "Misty forest", photographer: "Ana", thumbnailUrl: "https://images.pexels.com/t.jpg", width: 4000, height: 3000 },
    ]);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.pexels.com/v1/search?query=misty+forest&page=2&per_page=10");
    expect(init.headers).toEqual({ Authorization: "test-key" });
    expect(init.redirect).toBe("error");
  });

  it("drop results whose thumbnail isn't on Pexels' image host", async () => {
    vi.stubEnv("PEXELS_API_KEY", "test-key");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          photos: [{ id: 7, width: 1, height: 1, alt: null, photographer: "X", src: { tiny: "https://evil.example/t.jpg", large2x: "https://images.pexels.com/l.jpg" } }],
        }),
      ),
    );
    expect(await searchStockPhotos("forest")).toEqual([]);
  });
});

describe("importing a stock photo", () => {
  const photo = { id: 42, width: 1, height: 1, alt: "Forest", photographer: "Ana", src: { tiny: "https://images.pexels.com/t.jpg", large2x: "https://images.pexels.com/l.jpg" } };
  const input = { id: "42", title: "Forest", alt: "", userId: "u" };

  function mockDownload(download: Response) {
    vi.stubEnv("PEXELS_API_KEY", "test-key");
    return vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify(photo))).mockResolvedValueOnce(download);
  }

  it("refuses redirects when downloading", async () => {
    const fetchMock = mockDownload(new Response("", { status: 500 }));
    await expect(importStockPhoto(input)).rejects.toThrow(/failed \(500\)/);
    const [, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(init.redirect).toBe("error");
  });

  it("refuses formats other than JPEG, PNG and WebP", async () => {
    mockDownload(new Response("<svg/>", { headers: { "content-type": "image/svg+xml" } }));
    await expect(importStockPhoto(input)).rejects.toThrow(/Downloading the stock photo failed/);
  });

  it("refuses a download declared larger than the limit before reading it", async () => {
    mockDownload(new Response("x", { headers: { "content-type": "image/jpeg", "content-length": String(21 * 1024 * 1024) } }));
    await expect(importStockPhoto(input)).rejects.toThrow(/too large/);
  });

  it("refuses a download that turns out larger than the limit", async () => {
    mockDownload(new Response(new Uint8Array(21 * 1024 * 1024), { headers: { "content-type": "image/jpeg" } }));
    await expect(importStockPhoto(input)).rejects.toThrow(/too large/);
  });
});
