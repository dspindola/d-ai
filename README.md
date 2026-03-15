# d-ai

A terminal AI agent REPL built with [Bun](https://bun.sh) and [Blackbox AI](https://blackbox.ai). Streams responses token-by-token, renders Markdown with ANSI colors, runs shell commands inline, and supports swappable model presets — all from your terminal.

```
╔══════════════════════════════════════════════════════════╗
  BLACKBOX AI    model: blackboxai/google/gemini-2.5-flash  preset: default
  Type your message. Commands: /clear  /preset  /model  /exit
╚══════════════════════════════════════════════════════════╝

you › explain async iterators in TypeScript
⠙ thinking...

ai ›
## Async Iterators
An async iterator is an object with a `Symbol.asyncIterator` method...
```

## Requirements

- [Bun](https://bun.sh) v1.2+
- A [Blackbox AI](https://blackbox.ai) API key

## Setup

```sh
cd <dir>
bun install
```

Add your API key to `.env`:

```sh
BLACKBOX_API_KEY=your_key_here
```

## Usage

```sh
# Start with the default preset
dai

# Start with a specific preset
dai --preset coder
```

## Commands

All slash commands are handled locally and never consume API tokens.

| Command           | Description                                 |
| ----------------- | ------------------------------------------- |
| `/help`           | Show all commands                           |
| `/clear`          | Clear screen and reset conversation history |
| `/preset`         | List available presets                      |
| `/preset <name>`  | Switch to a preset (resets history)         |
| `/model`          | Show the active model                       |
| `/exit` / `/quit` | Quit                                        |
| `!<cmd>`          | Run a shell command                         |

### Tab completion

Press `Tab` to autocomplete slash commands. After `/preset ` press `Tab` to cycle preset names. Also completes words from your conversation history.

### Shell execution

Prefix any input with `!` to run it as a shell command via `Bun.$`:

```sh
!ls -la
!git status
!cat d-ai.config.yaml
```

Uses `Bun.$\`${{ raw: cmd }}\`.nothrow().arrayBuffer()` — non-zero exits don't throw, output is binary-safe.

## Presets

Presets bundle a model, system prompt, and temperature. Switching presets resets the conversation with the new system prompt.

| Preset     | Model                 | Temp | Description               |
| ---------- | --------------------- | ---- | ------------------------- |
| `default`  | gemini-2.5-flash      | 0.7  | General-purpose assistant |
| `coder`    | gpt-5.3-codex         | 0.2  | Expert software engineer  |
| `creative` | claude-sonnet-4.5     | 1.0  | Creative writing          |
| `fast`     | gemini-2.5-flash-lite | 0.5  | Short, direct answers     |

## Configuration

Edit `d-ai.config.yaml` to add or modify presets:

```yaml
default_preset: default

presets:
  default:
    model: blackboxai/google/gemini-2.5-flash
    system: |
      You are a helpful assistant. Format responses using Markdown.
    temperature: 0.7

  coder:
    model: blackboxai/openai/gpt-5.3-codex
    system: |
      You are an expert software engineer. Be concise and precise.
    temperature: 0.2
```

Any model from the Blackbox AI catalog can be used — the full list is in `src/blackbox.ts` as the `Model` type.

## Streaming & Markdown

Responses stream token-by-token via SSE. Tokens print live as they arrive. Once the stream ends, the raw text is replaced in-place with fully rendered ANSI Markdown using `Bun.markdown.render()` — no external dependencies.

Supported: headings, bold, italic, inline code, fenced code blocks, blockquotes, ordered/unordered lists, links, strikethrough.

## Docs

A local docs site is included at `./docs`, built with Bun's fullstack server + React + Tailwind.

```sh
bun --cwd docs run dev
```

Opens at `http://localhost:3000`. Content is driven by `docs/config.yaml`.

## Project structure

```
bb/
├── src/
│   ├── index.ts        # TUI REPL entry point
│   ├── blackbox.ts     # Blackbox AI client (streaming, tool calling, SSE)
│   └── config.ts       # YAML config loader + preset resolver
├── docs/
│   ├── src/
│   │   ├── index.ts    # Bun fullstack server
│   │   ├── App.tsx     # Docs React app
│   │   └── yaml.ts     # Minimal YAML parser
│   └── config.yaml     # Docs site content
├── d-ai.config.yaml    # Agent presets and models
└── .env                # API keys
```

## License

MIT
