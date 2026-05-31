const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { URL } = require("node:url");

const content = require("./data/ds160-content.js");

const host = process.env.HOST || "127.0.0.1";
const port = Number(process.env.PORT || 4173);
const rootDir = __dirname;

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml; charset=utf-8",
};

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(body);
}

function sendNotFound(res) {
  sendJson(res, 404, { error: "Not Found" });
}

function normalizeText(value) {
  return String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function fieldMatchesProfile(field, profile) {
  return (
    !profile ||
    profile === "all" ||
    field.appliesTo.includes("all") ||
    field.appliesTo.includes(profile)
  );
}

function filterFields(searchParams) {
  const profile = searchParams.get("profile") || "all";
  const section = searchParams.get("section") || "all";
  const query = normalizeText(searchParams.get("q"));

  return content.fields.filter((field) => {
    const inProfile = fieldMatchesProfile(field, profile);
    const inSection = section === "all" || field.sectionId === section;
    const haystack = normalizeText(
      [
        field.id,
        field.name,
        field.part,
        field.condition,
        field.format,
        field.meaning,
        field.examples.join(" "),
        field.mistakes.join(" "),
      ].join(" "),
    );

    return inProfile && inSection && (!query || haystack.includes(query));
  });
}

function handleApi(req, res, url) {
  if (url.pathname === "/api/health") {
    sendJson(res, 200, {
      ok: true,
      service: "ds160-assistant",
      fieldCount: content.fields.length,
      coverageStatus: content.coverage?.status || "unknown",
    });
    return true;
  }

  if (url.pathname === "/api/meta") {
    sendJson(res, 200, {
      coverage: content.coverage,
      sections: content.sections,
      visaProfiles: content.visaProfiles,
      workflowFacts: content.workflowFacts,
      officialSources: content.officialSources,
    });
    return true;
  }

  if (url.pathname === "/api/fields") {
    const fields = filterFields(url.searchParams);
    sendJson(res, 200, {
      count: fields.length,
      coverageStatus: content.coverage?.status || "unknown",
      fields,
    });
    return true;
  }

  if (url.pathname.startsWith("/api/fields/")) {
    const id = decodeURIComponent(url.pathname.replace("/api/fields/", ""));
    const field = content.fields.find((item) => item.id === id);
    if (!field) {
      sendNotFound(res);
      return true;
    }
    sendJson(res, 200, field);
    return true;
  }

  if (url.pathname === "/api/sources") {
    sendJson(res, 200, {
      officialSources: content.officialSources,
    });
    return true;
  }

  return false;
}

function serveStatic(res, pathname) {
  const requestPath = pathname === "/" ? "/index.html" : pathname;
  const decodedPath = decodeURIComponent(requestPath);
  const absolutePath = path.resolve(rootDir, `.${decodedPath}`);

  if (!absolutePath.startsWith(rootDir)) {
    sendNotFound(res);
    return;
  }

  fs.readFile(absolutePath, (error, file) => {
    if (error) {
      sendNotFound(res);
      return;
    }

    const ext = path.extname(absolutePath).toLowerCase();
    res.writeHead(200, {
      "content-type": mimeTypes[ext] || "application/octet-stream",
      "cache-control": ext === ".html" ? "no-store" : "public, max-age=3600",
    });
    res.end(file);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || `${host}:${port}`}`);

  if (req.method !== "GET") {
    sendJson(res, 405, { error: "Method Not Allowed" });
    return;
  }

  if (url.pathname.startsWith("/api/") && handleApi(req, res, url)) {
    return;
  }

  serveStatic(res, url.pathname);
});

server.listen(port, host, () => {
  console.log(`DS-160 assistant running at http://${host}:${port}`);
});
