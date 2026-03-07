import { createTool } from "@mastra/core";
import { z } from "zod";

const SERPAPI_API_KEY = process.env.SERPAPI_API_KEY;

// Helper function to extract price patterns from text
function extractPricePatterns(text: string): string[] {
  if (!text) return [];

  const patterns = [
    /\$\d+\.\d{2}/g,           // $123.45
    /\d+\.\d{2}\s*USD/g,       // 123.45 USD
    /\d+\.\d{2}\s*dollars?/gi, // 123.45 dollars
    /\d+\.\d{1,2}%/g,          // 1.23% or 1.2%
    /[+-]\d+\.\d{2}/g,         // +1.23 or -1.23
    /[+-]\d+\.\d{1,2}%/g       // +1.23% or -1.2%
  ];

  const matches: string[] = [];
  patterns.forEach(pattern => {
    const found = text.match(pattern);
    if (found) {
      matches.push(...found);
    }
  });

  return matches;
}

// Tool for searching the web using SerpAPI
export const serpApiSearchTool = createTool({
  id: "serpapi_search",
  description: "Search the web for current information using SerpAPI Google search",
  inputSchema: z.object({
    queries: z.array(z.string()).describe("Array of search queries to execute"),
    includeImages: z.boolean().optional().default(false).describe("Whether to include image results")
  }),
  execute: async ({ context }) => {
    const structuredResults: any[] = [];

    // Check if API key is available
    if (!SERPAPI_API_KEY || SERPAPI_API_KEY === 'dummy_serpapi_key') {
      console.warn("Search aborted: No valid SERPAPI_API_KEY available");
      return [{
        query: context.queries.join(', '),
        error: "No API key",
        content: "[DEMO MODE] No search performed."
      }];
    }

    // Process each query
    for (const query of context.queries) {
      try {
        // Detect if this is a stock price query
        const isStockQuery = /\b(stock|share|price|AAPL|MSFT|GOOGL|AMZN|TSLA)\b/i.test(query);

        const searchParams = new URLSearchParams({
          q: query,
          engine: 'google',
          api_key: SERPAPI_API_KEY,
          hl: 'en',
          gl: 'us',
          num: isStockQuery ? '3' : '1', // Get more results for stock queries
          no_cache: 'false' // Okay to use cached results for speed.
        });

        const searchUrl = `https://serpapi.com/search?${searchParams.toString()}`;

        const response = await fetch(searchUrl);
        const data = await response.json();

        console.log(`--- RAW SERPAPI RESPONSE for "${query}": ---\n`, JSON.stringify(data, null, 2));

        // Extract structured information with special handling for stocks
        const usefulContent = {
          query: query,
          answer_box: data.answer_box?.answer || data.answer_box?.snippet || data.answer_box,
          knowledge_graph: data.knowledge_graph?.description || data.knowledge_graph,
          organic_results: (data.organic_results || []).map((r: any) => ({
            title: r.title,
            snippet: r.snippet,
            // Extract any price patterns from snippets
            price_patterns: extractPricePatterns(r.snippet || r.title)
          })).slice(0, isStockQuery ? 3 : 1),
          // For stock queries, also check for finance-specific data
          stocks_results: data.stocks_results,
          finance_results: data.finance_results,
          // Raw data for debugging
          raw_answer_box: data.answer_box,
          raw_knowledge_graph: data.knowledge_graph
        };

        structuredResults.push(usefulContent);

      } catch (error) {
        console.error(`Error searching for "${query}":`, error);
        structuredResults.push({
          query,
          error: error instanceof Error ? error.message : "Unknown error"
        });
      }
    }

    return structuredResults;
  }
});

// Helper function to format search results for smart glasses display
function formatSearchResults(data: any, query: string): string {
  const parts: string[] = [];

  // Check for direct answer box
  if (data.answer_box) {
    const answer = data.answer_box.answer || data.answer_box.snippet;
    if (answer) {
      return answer.substring(0, 60); // Direct answer for glasses
    }
  }

  // Check for knowledge graph
  if (data.knowledge_graph) {
    const kg = data.knowledge_graph;
    if (kg.description) {
      return kg.description.substring(0, 60);
    }
  }

  // Get organic results
  const organic = data.organic_results || [];
  if (organic.length > 0) {
    const firstResult = organic[0];
    if (firstResult.snippet) {
      return firstResult.snippet.substring(0, 60);
    }
  }

  // Check for weather
  if (data.answer_box?.weather || data.answer_box?.type === 'weather_results') {
    const weather = data.answer_box?.weather_results || data.answer_box;
    if (weather) {
      const temp = weather.temperature;
      const unit = weather.unit || 'F';
      const condition = weather.weather || weather.conditions;
      return `${temp}°${unit.charAt(0).toUpperCase()} ${condition}`;
    }
  }

  // Check for sports scores
  if (data.sports_results) {
    const game = data.sports_results.game_spotlight;
    if (game) {
      return `${game.teams[0].name} ${game.teams[0].score} - ${game.teams[1].score} ${game.teams[1].name}`;
    }
  }

  // Check for calculator results
  if (data.answer_box?.type === 'calculator') {
    return data.answer_box.result;
  }

  // Default message if no good results
  return "No clear answer found";
}

// Alternative: Create a more detailed search tool for development/testing
export const serpApiDetailedSearchTool = createTool({
  id: "serpapi_detailed_search",
  description: "Search with detailed results (for testing/development)",
  inputSchema: z.object({
    query: z.string().describe("Search query"),
    numResults: z.number().optional().default(3).describe("Number of results to return")
  }),
  execute: async ({ context }) => {
    if (!SERPAPI_API_KEY) {
      return {
        error: "No SERPAPI_API_KEY configured",
        demoResult: `Would search for: "${context.query}"`
      };
    }

    try {
      const searchParams = new URLSearchParams({
        q: context.query,
        engine: 'google',
        api_key: SERPAPI_API_KEY,
        hl: 'en',
        gl: 'us',
        num: context.numResults.toString()
      });

      const response = await fetch(`https://serpapi.com/search?${searchParams.toString()}`);
      const data = await response.json();

      return {
        query: context.query,
        answerBox: data.answer_box,
        knowledgeGraph: data.knowledge_graph,
        organicResults: data.organic_results?.slice(0, context.numResults),
        sportsResults: data.sports_results,
        relatedSearches: data.related_searches
      };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : "Search failed",
        query: context.query
      };
    }
  }
});
