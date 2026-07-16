import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

// Dev proxy for the app's AI calls. With ANTHROPIC_API_KEY set (env or .env file),
// requests are forwarded to the real Anthropic API; without it, a canned reply
// comes back so every screen stays usable.
function claudeProxy() {
  return {
    name: "claude-proxy",
    configureServer(server) {
      server.middlewares.use("/api/claude", (req, res) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          return res.end();
        }
        let body = "";
        req.on("data", (c) => (body += c));
        req.on("end", async () => {
          const key = process.env.ANTHROPIC_API_KEY;
          res.setHeader("Content-Type", "application/json");
          if (!key) {
            res.end(
              JSON.stringify({
                content: [
                  {
                    type: "text",
                    text: "(Local demo mode — AI replies will appear here once an API key is connected. Everything else in the app works.)",
                  },
                ],
              })
            );
            return;
          }
          try {
            const r = await fetch("https://api.anthropic.com/v1/messages", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "x-api-key": key,
                "anthropic-version": "2023-06-01",
              },
              body,
            });
            res.statusCode = r.status;
            res.end(await r.text());
          } catch (e) {
            res.statusCode = 502;
            res.end(JSON.stringify({ error: String(e) }));
          }
        });
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  if (env.ANTHROPIC_API_KEY) process.env.ANTHROPIC_API_KEY = env.ANTHROPIC_API_KEY;
  return {
    plugins: [react(), claudeProxy(), authStub()],
    build: {
      rollupOptions: {
        input: {
          landing: resolve(__dirname, "index.html"),
          app: resolve(__dirname, "app/index.html"),
        },
      },
    },
  };
});

// Dev stub for accounts — production uses functions/api/auth.js.
// Any valid-looking email + 8-char password works so the Pro UI can be
// exercised locally without KV or Lemon Squeezy.
function authStub() {
  return {
    name: "auth-stub",
    configureServer(server) {
      server.middlewares.use("/api/auth", (req, res) => {
        if (req.method !== "POST") { res.statusCode = 405; return res.end(); }
        let body = "";
        req.on("data", (c) => (body += c));
        req.on("end", () => {
          res.setHeader("Content-Type", "application/json");
          let b = {};
          try { b = JSON.parse(body); } catch {}
          const email = String(b.email || "").trim().toLowerCase();
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
            return res.end(JSON.stringify({ ok: false, reason: "That email doesn't look right." }));
          if (String(b.password || "").length < 8)
            return res.end(JSON.stringify({ ok: false, reason: "Password needs at least 8 characters." }));
          res.end(JSON.stringify({ ok: true, token: "dev-token", email, dev: true }));
        });
      });
    },
  };
}
