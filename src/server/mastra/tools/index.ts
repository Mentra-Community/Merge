import { createTool } from "@mastra/core";
import { z } from "zod";

// Export SerpAPI search tools
export { serpApiSearchTool, serpApiDetailedSearchTool } from "./serpapi-search";

/**
 * Tool #1: The "Fast Path" Pseudo-Tool
 * The LLM calls this when it already knows the answer. It populates the 'answer'
 * field itself, and this tool simply passes it through.
 */
export const answer_from_knowledge = createTool({
    id: "answer_from_knowledge",
    description: "Use this tool to provide an answer directly when the information is already known and no web search is needed.",
    inputSchema: z.object({
        answer: z.string().describe("The concise, final answer to the user's question or the definition of a term."),
    }),
    execute: async ({ context }) => {
        // The "work" is already done by the LLM. We just return the answer.
        return context.answer;
    },
});
