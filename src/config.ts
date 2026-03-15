import { readFileSync } from "fs";
import type { Model } from "./blackbox";

// ============================================================================
// Types
// ============================================================================

export type Preset = {
  model: Model;
  system: string;
  temperature?: number;
};

export type Config = {
  default_preset: string;
  presets: Record<string, Preset>;
};

// ============================================================================
// YAML parser (Bun has no built-in YAML, use a minimal hand-rolled parser
// sufficient for this flat structure — avoids adding a dependency)
// ============================================================================

function parseYaml(src: string): unknown {
  const lines = src.split("\n");
  const root: Record<string, unknown> = {};
  let current: Record<string, unknown> = root;
  let currentKey: string | null = null;
  let parentKey: string | null = null;
  let inMultiline = false;
  let multilineKey: string | null = null;
  let multilineLines: string[] = [];
  let depth = 0;

  const flush = () => {
    if (inMultiline && multilineKey && current) {
      current[multilineKey] = multilineLines.join("\n").trimEnd() + "\n";
      inMultiline = false;
      multilineKey = null;
      multilineLines = [];
    }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();

    // Skip comments and blank lines (unless in multiline)
    if (
      !inMultiline &&
      (line.trimStart().startsWith("#") || line.trim() === "")
    )
      continue;

    const indent = line.length - line.trimStart().length;

    if (inMultiline) {
      // End of multiline block when indent drops back
      if (line.trim() !== "" && indent <= depth) {
        flush();
        // fall through to parse this line normally
      } else {
        multilineLines.push(line.slice(depth + 2)); // strip base indent
        continue;
      }
    }

    const trimmed = line.trimStart();

    if (indent === 0) {
      // Top-level key
      const m = trimmed.match(/^(\w[\w_-]*):\s*(.*)$/);
      if (m) {
        const [, key, val] = m;
        if (val === "" || val === undefined) {
          root[key!] = {};
          current = root[key!] as Record<string, unknown>;
          parentKey = key!;
          currentKey = null;
        } else {
          root[key!] = coerce(val!.trim());
          current = root;
        }
      }
    } else if (indent === 2) {
      // Second-level key (preset name or top-level field)
      const m = trimmed.match(/^(\w[\w_-]*):\s*(.*)$/);
      if (m) {
        const [, key, val] = m;
        if (val === "" || val === undefined) {
          (root[parentKey!] as Record<string, unknown>)[key!] = {};
          current = (root[parentKey!] as Record<string, unknown>)[
            key!
          ] as Record<string, unknown>;
          currentKey = key!;
        } else {
          (root[parentKey!] as Record<string, unknown>)[key!] = coerce(
            val!.trim(),
          );
        }
      }
    } else if (indent === 4) {
      // Third-level key (preset fields)
      const m = trimmed.match(/^(\w[\w_-]*):\s*(.*)$/);
      if (m) {
        const [, key, val] = m;
        if (val === "|") {
          // Block scalar
          inMultiline = true;
          multilineKey = key!;
          multilineLines = [];
          depth = indent;
        } else {
          current[key!] = coerce((val ?? "").trim());
        }
      }
    }
  }

  flush();
  return root;
}

function coerce(val: string): unknown {
  if (val === "true") return true;
  if (val === "false") return false;
  if (val === "null" || val === "~") return null;
  const n = Number(val);
  if (!isNaN(n) && val !== "") return n;
  // Strip surrounding quotes
  if (
    (val.startsWith('"') && val.endsWith('"')) ||
    (val.startsWith("'") && val.endsWith("'"))
  ) {
    return val.slice(1, -1);
  }
  return val;
}

// ============================================================================
// Loader
// ============================================================================

const CONFIG_PATH = "d-ai.config.yaml";

const DEFAULT_CONFIG: Config = {
  default_preset: "default",
  presets: {
    default: {
      model: "blackboxai/google/gemini-2.5-flash",
      system:
        "You are a helpful assistant. Format your responses using Markdown — use headings, code blocks, lists, and emphasis where appropriate.",
    },
  },
};

export function loadConfig(): Config {
  try {
    const text = readFileSync(CONFIG_PATH, "utf8");
    const raw = parseYaml(text) as Config;
    return raw ?? DEFAULT_CONFIG;
  } catch {
    return DEFAULT_CONFIG;
  }
}

export function resolvePreset(
  config: Config,
  name?: string,
): Preset & { name: string } {
  const key = name ?? config.default_preset ?? "default";
  const preset = config.presets[key];
  if (!preset) {
    const available = Object.keys(config.presets).join(", ");
    throw new Error(`Preset "${key}" not found. Available: ${available}`);
  }
  return { ...preset, name: key };
}
