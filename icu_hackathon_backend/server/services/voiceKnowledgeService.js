const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const ROOT_LEVEL = path.resolve(REPO_ROOT, "..");
const ROUTES_DIR = path.resolve(REPO_ROOT, "server", "routes");
const SERVICES_DIR = path.resolve(REPO_ROOT, "server", "services");
const CLIENT_COMPONENTS_DIR = path.resolve(REPO_ROOT, "client", "src", "components");

const SOURCE_FILES = [
  path.resolve(REPO_ROOT, "README.md"),
  path.resolve(REPO_ROOT, "presentation.md"),
  path.resolve(REPO_ROOT, "docs", "setup-guide.md"),
  path.resolve(ROOT_LEVEL, "README.md"),
];

function uniqueArray(values) {
  return Array.from(new Set(values));
}

function readFileSafe(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return "";
  }
}

function toRelativeSourcePath(filePath) {
  if (filePath.startsWith(REPO_ROOT)) {
    return path.relative(REPO_ROOT, filePath).replace(/\\/g, "/");
  }

  if (filePath.startsWith(ROOT_LEVEL)) {
    return path.relative(ROOT_LEVEL, filePath).replace(/\\/g, "/");
  }

  return path.basename(filePath);
}

function normalizeText(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(text) {
  return normalizeText(text)
    .toLowerCase()
    .replace(/[^a-z0-9\u0900-\u097f\u0980-\u09ff\u0a00-\u0a7f\u0a80-\u0aff\u0b00-\u0b7f\u0b80-\u0bff\u0c00-\u0c7f\u0c80-\u0cff\u0d00-\u0d7f\u0600-\u06ff\s-]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3);
}

function parseMarkdownChunks(content) {
  const chunks = [];
  const lines = String(content || "").split(/\r?\n/);
  let heading = "Overview";
  let paragraphBuffer = [];
  let inCodeFence = false;

  function pushParagraph() {
    const paragraph = normalizeText(paragraphBuffer.join(" "));
    paragraphBuffer = [];

    if (!paragraph) {
      return;
    }

    chunks.push({
      heading,
      text: paragraph,
    });
  }

  for (const rawLine of lines) {
    const trimmed = String(rawLine || "").trim();

    if (/^```/.test(trimmed)) {
      inCodeFence = !inCodeFence;
      continue;
    }

    if (inCodeFence) {
      continue;
    }

    if (!trimmed) {
      pushParagraph();
      continue;
    }

    if (/^#{1,6}\s+/.test(trimmed)) {
      pushParagraph();
      heading = normalizeText(trimmed.replace(/^#{1,6}\s+/, "")) || "Overview";
      continue;
    }

    if (/^[-*+]\s+/.test(trimmed) || /^\d+\.\s+/.test(trimmed)) {
      pushParagraph();
      chunks.push({
        heading,
        text: normalizeText(trimmed.replace(/^[-*+]\s+/, "").replace(/^\d+\.\s+/, "")),
      });
      continue;
    }

    paragraphBuffer.push(trimmed);
  }

  pushParagraph();
  return chunks;
}

function listFilesSafe(dirPath, extensionPattern) {
  try {
    return fs
      .readdirSync(dirPath, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => path.resolve(dirPath, entry.name))
      .filter((filePath) => extensionPattern.test(filePath));
  } catch {
    return [];
  }
}

function buildRouteEndpointsCatalog() {
  const files = listFilesSafe(ROUTES_DIR, /\.js$/i);
  const endpoints = [];

  for (const filePath of files) {
    const content = readFileSafe(filePath);
    if (!content) {
      continue;
    }

    const routeName = path.basename(filePath, ".js");
    const matches = content.matchAll(/router\.(get|post|put|delete)\(\s*["'`](.+?)["'`]/gim);

    for (const match of matches) {
      endpoints.push({
        routeFile: routeName,
        method: String(match[1] || "").toUpperCase(),
        path: String(match[2] || "").trim(),
      });
    }
  }

  return endpoints;
}

function buildRepositoryFeatureCatalog() {
  const endpoints = buildRouteEndpointsCatalog();
  const services = listFilesSafe(SERVICES_DIR, /\.js$/i).map((filePath) => path.basename(filePath, ".js"));
  const clientPanels = listFilesSafe(CLIENT_COMPONENTS_DIR, /\.(ts|tsx|js|jsx)$/i).map((filePath) =>
    path.basename(filePath).replace(/\.(ts|tsx|js|jsx)$/i, "")
  );

  const realtimeSignals = [
    "Live telemetry ingestion and risk scoring pipeline",
    "Low-latency voice responses and LiveKit broadcast channel",
    "Continuous timeline + alert state persistence",
  ];

  return {
    generatedAt: new Date().toISOString(),
    endpointCount: endpoints.length,
    endpoints: endpoints.slice(0, 120),
    services: services.slice(0, 120),
    clientPanels: clientPanels.slice(0, 120),
    realtimeSignals,
  };
}

function buildKnowledgeIndex() {
  const sources = [];
  const chunks = [];

  for (const filePath of uniqueArray(SOURCE_FILES)) {
    const content = readFileSafe(filePath);
    if (!content) {
      continue;
    }

    const source = toRelativeSourcePath(filePath);
    const parsedChunks = parseMarkdownChunks(content)
      .map((chunk, index) => {
        const normalizedText = normalizeText(chunk.text);
        if (!normalizedText || normalizedText.length < 24) {
          return null;
        }

        return {
          id: `${source}::${index}`,
          source,
          heading: normalizeText(chunk.heading) || "Overview",
          text: normalizedText,
          textLower: normalizedText.toLowerCase(),
          tokens: new Set(tokenize(`${chunk.heading} ${normalizedText}`)),
        };
      })
      .filter(Boolean);

    sources.push({
      source,
      chunkCount: parsedChunks.length,
    });
    chunks.push(...parsedChunks);
  }

  return {
    builtAt: new Date().toISOString(),
    sources,
    chunks,
    featureCatalog: buildRepositoryFeatureCatalog(),
  };
}

let knowledgeIndex = buildKnowledgeIndex();

function scoreChunk(chunk, queryTokens, queryLower) {
  let score = 0;

  for (const token of queryTokens) {
    if (chunk.tokens.has(token)) {
      score += 2;
    }

    if (chunk.heading.toLowerCase().includes(token)) {
      score += 1;
    }
  }

  if (queryLower && chunk.textLower.includes(queryLower)) {
    score += 4;
  }

  if (/voice|language|assistant|api|patient|risk|summary/.test(chunk.textLower)) {
    score += 0.5;
  }

  return score;
}

function selectFallbackChunks(chunks, maxSnippets) {
  return chunks
    .filter((chunk) =>
      /overview|voice|feature|workflow|api|patient|summary/i.test(chunk.heading) ||
      /rapid ai|voice|patient|api|summary|risk|telemetry/i.test(chunk.textLower)
    )
    .slice(0, maxSnippets);
}

function getVoiceKnowledgeContext(query, options = {}) {
  const maxSnippets = Math.max(1, Math.min(10, Number(options.maxSnippets) || 6));
  const normalizedQuery = normalizeText(query);
  const queryLower = normalizedQuery.toLowerCase();
  const queryTokens = uniqueArray(tokenize(normalizedQuery));

  const ranked = knowledgeIndex.chunks
    .map((chunk) => ({
      chunk,
      score: scoreChunk(chunk, queryTokens, queryLower),
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score);

  const snippets = (ranked.length > 0
    ? ranked.slice(0, maxSnippets).map((entry) => entry.chunk)
    : selectFallbackChunks(knowledgeIndex.chunks, maxSnippets))
    .map((chunk) => ({
      source: chunk.source,
      heading: chunk.heading,
      text: chunk.text,
    }));

  return {
    builtAt: knowledgeIndex.builtAt,
    sourceCount: knowledgeIndex.sources.length,
    trainingSources: knowledgeIndex.sources,
    snippets,
    featureCatalog: knowledgeIndex.featureCatalog || buildRepositoryFeatureCatalog(),
  };
}

function refreshVoiceKnowledgeIndex() {
  knowledgeIndex = buildKnowledgeIndex();
  return {
    builtAt: knowledgeIndex.builtAt,
    sourceCount: knowledgeIndex.sources.length,
    chunkCount: knowledgeIndex.chunks.length,
    endpointCount: Number(knowledgeIndex.featureCatalog?.endpointCount || 0),
  };
}

module.exports = {
  getVoiceKnowledgeContext,
  refreshVoiceKnowledgeIndex,
};
