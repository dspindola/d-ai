import { createChat } from "./blackbox";

const chat = createChat(
  {
    model: "blackboxai/openai/gpt-5.3-codex",
    messages: [{ role: "user", content: "What files are in the project?" }],
    tools: [
      {
        type: "function",
        function: {
          name: "list_files",
          description: "List files",
          parameters: { type: "object", properties: {}, required: [] },
        },
      },
    ],
    tool_choice: "auto",
  },
  process.env.BLACKBOX_API_KEY!,
);

const result = await chat.runAgentLoop(async (name, args) => {
  if (name === "list_files")
    return JSON.stringify(["src/index.ts", "src/blackbox.ts"]);
  return "unknown tool";
});

console.log(result);
