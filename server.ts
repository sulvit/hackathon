import { createServer, IncomingMessage, ServerResponse } from "http";
import { parse } from "url";
import next from "next";
import "./schema"; // Import schema.tsx to run setupDatabase()
// OpenAI, fs, os, path, uuidv4 are not needed for this minimal test

const dev = process.env.NODE_ENV !== "production";
const hostname = "localhost";
const port = 3000;

const app = next({ dev, hostname, port });
const nextJsHandle = app.getRequestHandler();

// No custom client tracking for this minimal test

app.prepare().then(() => {
  const httpServer = createServer(
    async (req: IncomingMessage, res: ServerResponse) => {
      try {
        const parsedUrl = parse(req.url || "", true);
        await nextJsHandle(req, res, parsedUrl);
      } catch (err) {
        console.error("Error handling HTTP request via Next.js:", err);
        if (!res.writableEnded) {
          res.statusCode = 500;
          res.end("Internal server error");
        } else {
          console.error(
            "Response already ended, cannot send 500 error for request:",
            req.url,
          );
        }
      }
    },
  );

  httpServer.listen(port, () => {
    console.log(`> Next.js Ready on http://${hostname}:${port}`);
  });
});

// handleAudioData function is not needed for this test
