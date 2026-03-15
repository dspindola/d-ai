import * as readline from "readline";
import { $ } from "bun";
import { createChat } from "./blackbox";
import type { Message } from "./blackbox";
import { loadConfig, resolvePreset } from "./config";
import type { Preset } from "./config";

// ============================================================================
// ANSI helpers
// ============================================================================

const ansi = {
  reset: "\x1b[0m",
  bold: (s: string) => `\x1b[1m${s}\x1b[22m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[22m`,
  italic: (s: string) => `\x1b[3m${s}\x1b[23m`,
  underline: (s: string) => `\x1b[4m${s}\x1b[24m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[39m`,
  green: (s: string) => `\x1b[32m${s}\x1b[39m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[39m`,
  red: (s: string) => `\x1b[31m${s}\x1b[39m`,
  magenta: (s: string) => `\x1b[35m${s}\x1b[39m`,
  blue: (s: string) => `\x1b[34m${s}\x1b[39m`,
  gray: (s: string) => `\x1b[90m${s}\x1b[39m`,
};

// ============================================================================
// Markdown → ANSI renderer via Bun.markdown.render()
// ============================================================================

function renderMarkdown(md: string): string {
  return Bun.markdown.render(
    md,
    {
      heading: (children, { level }) => {
        const prefix = "#".repeat(level) + " ";
        const styled =
          level === 1
            ? ansi.bold(ansi.cyan(children))
            : level === 2
              ? ansi.bold(ansi.blue(children))
              : ansi.bold(children);
        return `\n${ansi.dim(prefix)}${styled}\n`;
      },
      paragraph: (children) => children + "\n",
      strong: (children) => ansi.bold(children),
      emphasis: (children) => ansi.italic(children),
      strikethrough: (children) => `\x1b[9m${children}\x1b[29m`,
      codespan: (children) => ansi.yellow(`\`${children}\``),
      code: (children, meta) => {
        const lang = meta?.language ? ansi.dim(` ${meta.language}`) : "";
        const border = ansi.gray("─".repeat(48));
        const lines = children
          .trimEnd()
          .split("\n")
          .map((l) => ansi.gray("│ ") + ansi.yellow(l))
          .join("\n");
        return `\n${ansi.gray("┌")}${lang}${ansi.gray("─").repeat(Math.max(0, 48 - (meta?.language?.length ?? 0) - 1))}\n${lines}\n${border}\n`;
      },
      blockquote: (children) =>
        children
          .split("\n")
          .map((l) => ansi.gray("▌ ") + ansi.italic(l))
          .join("\n") + "\n",
      link: (children, { href }) =>
        `${ansi.cyan(ansi.underline(children))} ${ansi.dim(`(${href})`)}`,
      image: (_children, { src }) => ansi.dim(`[image: ${src}]`),
      list: (children) => children,
      listItem: (children, meta) => {
        const m = meta as unknown as
          | {
              depth?: number;
              ordered?: boolean;
              start?: number;
              index?: number;
            }
          | undefined;
        const depth = m?.depth ?? 0;
        const ordered = m?.ordered ?? false;
        const start = m?.start;
        const index = m?.index ?? 0;
        const indent = "  ".repeat(depth);
        const marker = ordered
          ? ansi.dim(`${(start ?? 1) + index}.`)
          : ansi.cyan("•");
        return `${indent}${marker} ${children.trimEnd()}\n`;
      },
      hr: () => ansi.gray("─".repeat(48)) + "\n",
    },
    { strikethrough: true, tasklists: true, autolinks: true },
  );
}

// ============================================================================
// Config + TUI state
// ============================================================================

const config = loadConfig();

// CLI: bun src/index.ts --preset coder
const cliPreset = (() => {
  const idx = process.argv.indexOf("--preset");
  return idx !== -1 ? process.argv[idx + 1] : undefined;
})();

let activePreset = resolvePreset(config, cliPreset);

function buildHistory(): Message[] {
  return [{ role: "system", content: activePreset.system.trim() }];
}

let history: Message[] = buildHistory();

let isThinking = false;
let thinkingInterval: ReturnType<typeof setInterval> | null = null;

function startThinking(rl: readline.Interface) {
  const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  let i = 0;
  isThinking = true;
  process.stdout.write("\n");
  thinkingInterval = setInterval(() => {
    process.stdout.write(
      `\r${ansi.cyan(frames[i++ % frames.length]!)} ${ansi.dim("thinking...")}`,
    );
  }, 80);
}

function stopThinking() {
  if (thinkingInterval) {
    clearInterval(thinkingInterval);
    thinkingInterval = null;
  }
  process.stdout.write("\r\x1b[2K"); // clear the spinner line
  isThinking = false;
}

// ============================================================================
// Banner
// ============================================================================

function printBanner() {
  const width = process.stdout.columns ?? 60;
  const border = ansi.cyan("═".repeat(width));
  console.log(border);
  console.log(
    ansi.bold(ansi.cyan("  BLACKBOX AI  ")) +
      ansi.dim(`  model: ${activePreset.model}`) +
      ansi.dim(`  preset: ${activePreset.name}`),
  );
  console.log(
    ansi.gray(`  Type your message. Commands: /clear  /preset  /model  /exit`),
  );
  console.log(border + "\n");
}

// ============================================================================
// Tab completion
// ============================================================================

const COMMANDS = ["/clear", "/exit", "/quit", "/model", "/preset", "/help"];

// Complete commands starting with "/" and re-suggest history words otherwise
function completer(line: string): [string[], string] {
  if (line.startsWith("/preset ")) {
    const partial = line.slice(8);
    const names = Object.keys(config.presets);
    const hits = names.filter((n) => n.startsWith(partial));
    return [hits.map((n) => `/preset ${n}`), line];
  }
  if (line.startsWith("/")) {
    const hits = COMMANDS.filter((c) => c.startsWith(line));
    return [hits.length ? hits : COMMANDS, line];
  }
  // Word completion from conversation history (last user words)
  const words = history
    .filter((m) => m.role === "user")
    .flatMap((m) => (m.content as string).split(/\s+/))
    .filter(
      (w) => w.length > 3 && w.toLowerCase().startsWith(line.toLowerCase()),
    );
  const unique = [...new Set(words)];
  return [unique, line];
}

async function repl() {
  const isTTY = process.stdin.isTTY;

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: isTTY,
    completer: isTTY ? completer : undefined,
    prompt: ansi.green("you") + ansi.dim(" › "),
  });

  if (isTTY) {
    printBanner();
    rl.prompt();
  }

  rl.on("line", async (line) => {
    const input = line.trim();
    if (!input) {
      rl.prompt();
      return;
    }

    // Built-in commands
    if (input === "/exit" || input === "/quit") {
      console.log(ansi.dim("\nbye.\n"));
      rl.close();
      process.exit(0);
    }

    if (input === "/clear") {
      history = buildHistory(); // reset with current preset's system prompt
      console.clear();
      printBanner();
      rl.prompt();
      return;
    }

    if (input.startsWith("/preset")) {
      const parts = input.split(" ");
      const name = parts[1];
      if (!name) {
        const names = Object.keys(config.presets);
        const lines = names
          .map((n) =>
            n === activePreset.name
              ? `  ${ansi.cyan("▸")} ${ansi.bold(n)} ${ansi.dim(`(${config.presets[n]!.model})`)}`
              : `    ${ansi.dim(n)} ${ansi.dim(`(${config.presets[n]!.model})`)}`,
          )
          .join("\n");
        console.log(`\n${ansi.bold("presets:")}\n${lines}\n`);
      } else {
        try {
          activePreset = resolvePreset(config, name);
          history = buildHistory();
          console.clear();
          printBanner();
          console.log(ansi.dim(`switched to preset: ${name}\n`));
        } catch (e) {
          console.log(ansi.red((e as Error).message));
        }
      }
      rl.prompt();
      return;
    }

    if (input.startsWith("/model")) {
      console.log(
        ansi.dim(
          `\ncurrent model: ${activePreset.model}  (preset: ${activePreset.name})\n`,
        ),
      );
      rl.prompt();
      return;
    }

    if (input === "/help") {
      console.log(
        `\n${ansi.bold("commands:")}\n` +
          `  ${ansi.cyan("/clear")}          ${ansi.dim("clear screen and history")}\n` +
          `  ${ansi.cyan("/preset")}         ${ansi.dim("list presets")}\n` +
          `  ${ansi.cyan("/preset <name>")}  ${ansi.dim("switch to a preset")}\n` +
          `  ${ansi.cyan("/model")}          ${ansi.dim("show current model")}\n` +
          `  ${ansi.cyan("/help")}           ${ansi.dim("show this help")}\n` +
          `  ${ansi.cyan("/exit")}           ${ansi.dim("quit")}\n` +
          `\n${ansi.bold("shell:")}\n` +
          `  ${ansi.cyan("!<cmd>")}          ${ansi.dim("run a shell command  e.g. !ls -la")}\n`,
      );
      rl.prompt();
      return;
    }

    // Block any other slash command from reaching the AI
    if (input.startsWith("/")) {
      console.log(
        ansi.red(`unknown command: ${input}`) + ansi.dim("  (try /help)"),
      );
      rl.prompt();
      return;
    }

    // Shell execution: !<command>
    if (input.startsWith("!")) {
      const cmd = input.slice(1).trim();
      if (!cmd) {
        rl.prompt();
        return;
      }

      process.stdout.write(ansi.dim(`\n$ ${cmd}\n`));

      const result = await $`${{ raw: cmd }}`.nothrow().arrayBuffer();
      const decoder = new TextDecoder();
      const out = decoder.decode(result);

      if (out.trim()) {
        process.stdout.write(out.endsWith("\n") ? out : out + "\n");
      }

      process.stdout.write("\n");
      rl.prompt();
      return;
    }

    // Pause input while waiting for response
    rl.pause();
    history.push({ role: "user", content: input });

    startThinking(rl);

    try {
      const chat = createChat(
        { model: activePreset.model, messages: history, stream: true },
        process.env.BLACKBOX_API_KEY!,
      );

      // Stop spinner, print the ai header
      stopThinking();
      process.stdout.write(
        `\n${ansi.magenta(ansi.bold("ai"))} ${ansi.dim("›")}\n`,
      );

      // Stream tokens live, track newlines to rewind cursor after
      let accumulated = "";
      let lineCount = 0;

      for await (const token of chat.streamContent()) {
        accumulated += token;
        process.stdout.write(token);
        lineCount += (token.match(/\n/g) ?? []).length;
      }

      // Rewind past raw streamed text and overwrite with rendered markdown
      if (lineCount > 0) {
        process.stdout.write(`\x1b[${lineCount}A\x1b[0J`);
      } else {
        process.stdout.write("\r\x1b[2K");
      }
      process.stdout.write(renderMarkdown(accumulated) + "\n");

      history.push({ role: "assistant", content: accumulated });
    } catch (err) {
      stopThinking();
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`\n${ansi.red("error:")} ${msg}\n`);
    }

    rl.resume();
    rl.prompt();
  });

  rl.on("close", () => {
    if (isTTY) console.log(ansi.dim("\nbye.\n"));
    process.exit(0);
  });
}

repl();
