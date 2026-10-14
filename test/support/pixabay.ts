// A stand-in for Pixabay's API (shapes from pixabay.com/api/docs, read 2026-10-14; the invalid-key answer as tested
// against the real API the same day). Key "test-key-1234" is valid; "limit-key-0000" always gets 429.
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { solidPng } from "./png.ts";

export const PIXABAY_KEY = "test-key-1234";

export interface PixabayStandIn {
  api: string;
  requests: string[];
  close(): Promise<void>;
}

export async function startPixabay(): Promise<PixabayStandIn> {
  const requests: string[] = [];
  let base = "";
  const server = createServer((req, res) => {
    requests.push(req.url ?? "");
    const u = new URL(req.url ?? "/", "http://x");
    const img = /^\/img\/(\d+)\.jpg$/.exec(u.pathname);
    if (img) {
      const n = Number(img[1]);
      return void res.writeHead(200, { "content-type": "image/jpeg" }).end(solidPng([(n * 40) % 256, 80, 160]));
    }
    if (u.pathname !== "/api/") return void res.writeHead(404).end();
    const key = u.searchParams.get("key");
    if (key === "limit-key-0000") return void res.writeHead(429, { "content-type": "text/plain" }).end("API rate limit exceeded.");
    if (key !== PIXABAY_KEY) return void res.writeHead(400, { "content-type": "text/html" }).end("[ERROR 400] Invalid or missing API key (https://pixabay.com/api/docs/).");
    const page = Number(u.searchParams.get("page") ?? 1);
    const per = Number(u.searchParams.get("per_page") ?? 20);
    const cat = u.searchParams.get("category") ?? "";
    const hits = Array.from({ length: Math.min(per, 50) }, (_, i) => {
      const id = page * 1000 + i + (cat.length * 100000);
      return {
        id, pageURL: `https://pixabay.example/photos/${id}/`, type: "photo", tags: `${cat}, test`, previewURL: `${base}/img/${i}.jpg`,
        largeImageURL: `${base}/img/${i + page}.jpg`, imageWidth: 1920, imageHeight: 1280, user: `photographer${i}`,
      };
    });
    res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ total: 500, totalHits: 500, hits }));
  });
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { api: `${base}/api/`, requests, close: () => new Promise((ok) => server.close(() => ok())) };
}
