// ADR-0030: a stand-in for every service a community widget talks to. Records each request (method, URL, headers,
// body) as one JSON line in /log/requests.jsonl and answers 200 with an empty JSON object.
import { appendFileSync } from "node:fs";
import { createServer } from "node:http";

createServer((req, res) => {
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    const body = Buffer.concat(chunks).toString("utf8");
    appendFileSync("/log/requests.jsonl", `${JSON.stringify({ t: Date.now(), method: req.method, url: req.url, headers: req.headers, body })}\n`);
    res.writeHead(200, { "content-type": "application/json" });
    res.end("{}");
  });
}).listen(8000);
