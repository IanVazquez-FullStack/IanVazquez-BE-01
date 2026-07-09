const http = require("http");
const port = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
  res.setHeader("Content-Type", "application/json");

  if (req.url === "/api/health" && req.method === "GET") {
    res.writeHead(200);
    res.end(JSON.stringify({ status: "ok", timestamp: new Date().toISOString() }));
  } else if (req.url === "/api/hello" && req.method === "GET") {
    res.writeHead(200);
    res.end(JSON.stringify({ message: "Hello, World!" }));
  } else {
    res.writeHead(404);
    res.end(JSON.stringify({ error: "Not found" }));
  }
});

server.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
