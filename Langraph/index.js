import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { ChatOpenAI } from "@langchain/openai";
import { MessagesAnnotation, StateGraph } from "@langchain/langgraph";
const llm = new ChatOpenAI({
    model: "gpt-4o",
    apiKey:apiKey,
    baseUrl: endpoint,
});
const multiply = tool(
    async ({ a, b }) => {
      return a * b;
    },
    {
      name: "multiply",
      description: "Multiply two numbers together",
      schema: z.object({
        a: z.number().describe("first number"),
        b: z.number().describe("second number"),
      }),
    }
);

const add = tool(
    async ({ a, b }) => {
      return a + b;
    },
    {
      name: "Addition",
      description: "Addition two numbers together",
      schema: z.object({
        a: z.number().describe("first number"),
        b: z.number().describe("second number"),
      }),
    }
);

const tools =[multiply, add];
const toolsByName = Object.fromEntries(tools.map((tool) => [tool.name, tool]));
const llmWithTools = llm.bindTools(tools);
async function llmCall(state) {
    // LLM decides whether to call a tool or not
    const result = await llmWithTools.invoke([
      {
        role: "system",
        content: "You are a helpful assistant tasked with performing arithmetic on a set of inputs."
      },
      ...state.messages
    ]);
  
    return {
      messages: [result]
    };
}
async function toolNode(state) {
    // Performs the tool call
    const results = [];
    const lastMessage = state.messages.at(-1);
  
    if (lastMessage?.tool_calls?.length) {
      for (const toolCall of lastMessage.tool_calls) {
        const tool = toolsByName[toolCall.name];
        const observation = await tool.invoke(toolCall.args);
        results.push(
          new ToolMessage({
            content: observation,
            tool_call_id: toolCall.id,
          })
        );
      }
    }  
    return { messages: results };
} 
function shouldContinue(state) {
    const messages = state.messages;
    const lastMessage = messages.at(-1);
  
    // If the LLM makes a tool call, then perform an action
    if (lastMessage?.tool_calls?.length) {
      return "Action";
    }
    // Otherwise, we stop (reply to the user)
    return "__end__";
}
const agentBuilder = new StateGraph(MessagesAnnotation)
  .addNode("llmCall", llmCall)
  .addNode("tools", toolNode)
  .addEdge("__start__", "llmCall")
  .addConditionalEdges(
    "llmCall",
    shouldContinue,
    {
      // Name returned by shouldContinue : Name of next node to visit
      "Action": "tools",
      "__end__": "__end__",
    }
  )
  .addEdge("tools", "llmCall")
  .compile();

const messages = [{
    role: "user",
    content: "Add 3 and 4."
}];
  const result = await agentBuilder.invoke({ messages });
  console.log(result.messages);
  