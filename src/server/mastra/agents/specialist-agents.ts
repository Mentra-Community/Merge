import { AppSession } from "@mentra/sdk";
import { Agent } from "@mastra/core/agent";
import { openai } from "@ai-sdk/openai";
import { createTool } from "@mastra/core";
import { RuntimeContext } from "@mastra/core/di";
import { z } from "zod";
import { Action, AgentType, type AgentInsight, type ComputationPayload, type WebSearchPayload, type PlacesPayload, type WeatherPayload } from "../types";
import { calculateDistance } from "../utils/geo";
import { LocationManager } from "../../manager/LocationManager";

// API keys from environment (NOT hardcoded)
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;
const GOOGLE_WEATHER_API_KEY = process.env.GOOGLE_WEATHER_API_KEY || process.env.GOOGLE_MAPS_API_KEY;

// Definer Agent - for acronyms and technical terms
export const definerAgent = new Agent({
  name: "DefinerAgent",
  model: openai("gpt-4.1-mini"),
  instructions: `You are a specialist agent that defines acronyms and technical terms.

INPUT: You receive a technical term, acronym, or jargon that needs definition.

OUTPUT REQUIREMENTS:
- Format: "TERM: Definition" (e.g., "ASR: Automatic Speech Recognition")
- Maximum 60 characters (about 10 words)
- Only define technical/professional terms, not common words
- Use standard expansions for acronyms
- Avoid unnecessary words like "a", "the" when space is tight

EXAMPLES:
- "API: Application Programming Interface"
- "ML: Machine Learning"
- "CRUD: Create Read Update Delete"
- "OAuth: Open Authorization"
- "IoT: Internet of Things"`
});

// FactChecker Agent - for verifying claims
export const factCheckerAgent = new Agent({
  name: "FactCheckerAgent",
  model: openai("gpt-4.1-mini"),
  instructions: `You are a fact-checking specialist for smart glasses that clarifies false statements. You must start your response with "False: " and then provide the correct fact.

INPUT: Claims or statements that need verification.

OUTPUT REQUIREMENTS:
- Format MUST follow this exact format: "False: [correct fact]"
- Maximum 60 characters
- Include the most important correction
- Use percentages, numbers, dates when relevant
- Focus on facts that impact decisions

EXAMPLES:
- "False: Android has 70% global share"
- "False: Vaccine-autism link disproven"
- "False: Napoleon was short (average height)"

PRIORITIES:
1. Health/safety misinformation
2. Financial/business facts
3. Technical specifications
4. Historical accuracy`
});

// Import the real SerpAPI search tool
import { serpApiSearchTool } from "../tools/serpapi-search";

export const webSearchAgent = new Agent({
  name: "WebSearchAgent",
  model: openai("gpt-4.1-mini"),
  instructions: `You are a web search synthesizer for smart glasses. Your goal is to synthesize structured search results into a single, definitive, concise insight.

INPUT: A JSON object containing structured search results which may include an 'answer_box', a 'knowledge_graph', and a list of 'organic_results'.

OUTPUT REQUIREMENTS:
- **Analyze all inputs:** Look at the answer_box, knowledge_graph, and top organic results to find the most accurate and direct answer.
- **Synthesize:** Create a single, concise sentence that directly answers the original query.
- **Max 60 characters:** The final output MUST be under 60 characters.

SPECIAL HANDLING FOR DIFFERENT QUERY TYPES:

**NEWS QUERIES (Israel, politics, current events):**
- Synthesize the main story from organic_results headlines and snippets
- Focus on the most recent and significant development
- Format: "Gaza strikes continue, 90+ killed today"
- Prioritize casualty numbers, major developments, or breaking news
- If multiple stories, pick the most significant or recent one

**STOCK PRICES:**
- Look for stock price data in ALL fields including knowledge_graph, answer_box, organic_results
- Extract the current price and format as "AAPL: $210.02" or "$210.02 +0.40%"
- Check organic_results snippets for: "$XXX.XX", "XXX.XX USD", percentage changes

**WEATHER:**
- Extract temperature and conditions: "72°F Sunny"
- Look in answer_box, knowledge_graph, or organic snippets

**SPORTS SCORES:**
- Format as "Team1 2-1 Team2" or "Lakers beat Celtics 110-95"

**CALCULATIONS:**
- Show the numeric result directly

**DEFINITIONS:**
- Format as "Term: Definition"

SYNTHESIS APPROACH:
1. **Check answer_box first** - if it has a direct answer, use it
2. **Check knowledge_graph** - for structured data like prices, definitions
3. **Synthesize from organic_results** - especially for news, extract key facts from multiple headlines/snippets
4. **For news:** Look for numbers (casualties, dates), locations, key actions
5. **For any query:** Extract the most relevant and recent information

EXTRACTION PATTERNS:
- **News:** Look for: numbers, locations, actions, recent developments
- **Stocks:** Look for: "$XXX.XX", "XXX.XX USD", "+/-X.X%", "price", "shares"
- **Weather:** Look for: "°F", "°C", weather conditions
- **Sports:** Look for: scores, "beat", "defeated", team names

FALLBACK RULE:
- **NEVER respond with "No definitive answer found" unless there is absolutely no relevant information**
- **For news:** If you find ANY headline or snippet, synthesize the main point
- **For stocks:** If you find ANY price mention, extract it
- **For weather:** If you find ANY temperature or condition, use it
- **Always extract and present available data, even if not perfectly formatted**

IMPORTANT RULE:
- You are a silent observer and cannot ask for clarification.
- If the search results are ambiguous or unclear, you MUST synthesize the most likely answer based on the available information.
- NEVER ask the user for more details.

EXAMPLES:
- Query: "Israel news" → "Gaza strikes continue, 90+ killed today"
- Query: "Apple stock" → "AAPL: $210.02 +0.40%"
- Query: "Weather in SF" → "68°F Foggy"
- Query: "Lakers score" → "Lakers beat Celtics 110-95"

Your only job is to synthesize the provided data into useful insights.`,
  tools: { serpApiSearchTool }
});

export const placesAgent = new Agent({
  name: "PlacesAgent",
  model: openai("gpt-4.1-mini"),
  instructions: `You are the Places Agent. Your goal is to provide a concise, natural-sounding answer to the user's query using the structured data provided.

**Core Rule: For every place you mention in your response, you MUST include its distance.** This is a non-negotiable rule.

Analyze the user's original query to understand their specific intent and follow these guidelines:
- If the user asks for the "nearest," you MUST use the place where the "is_nearest" flag is true.
- If the user asks about a single, specific place, focus only on that result but ensure you state its distance.
- If the user asks for general recommendations ("where should I eat," "good food"), list the top 2-3 most relevant results, mentioning their rating and distance.
- Keep your response conversational and directly answer the user's question.
- **IMPORTANT: Your final response MUST be under 15 words.**`,
});

export const weatherAgent = new Agent({
  name: "WeatherAgent",
  model: openai("gpt-4.1-mini"),
  instructions: `You are the Weather Agent. Your goal is to provide a concise, natural-sounding summary of the weather data provided.

- The user wants to know the current temperature and the general condition (e.g., "Clear", "Clouds", "Rain").
- Always provide the temperature in Fahrenheit.
- Format the response like: "It's 75°F and Sunny." or "75°F, Clear skies." for the user's current location.
- If the query was for a specific location, format it as: "It's 88°F and Sunny in Miami."
- Keep your response under 15 words.`,
});

// Computation Agent - for calculations
const calculationTool = createTool({
  id: "calculate",
  description: "Perform mathematical calculations on multiple expressions",
  inputSchema: z.object({
    expressions: z.array(z.string()).describe("Array of mathematical expressions to evaluate")
  }),
  execute: async ({ context }) => {
    const results: { expression: string; result: string; error?: string }[] = [];

    for (const expression of context.expressions) {
      try {
        // Simple eval for demo - in production use a proper math parser like mathjs
        const result = eval(expression);

        if (typeof result === 'number' && !isNaN(result)) {
          const formatted = result.toLocaleString('en-US', {
            maximumFractionDigits: 10
          });
          results.push({ expression, result: formatted });
        } else {
          results.push({ expression, result: "Invalid result", error: "Non-numeric result" });
        }
      } catch (error) {
        results.push({
          expression,
          result: "Error",
          error: error instanceof Error ? error.message : "Calculation failed"
        });
      }
    }

    return results;
  }
});

export const computationAgent = new Agent({
  name: "ComputationAgent",
  model: openai("gpt-4.1-mini"),
  instructions: `You are a calculation specialist for smart glasses display.

CAPABILITIES:
- Basic arithmetic: +, -, *, /, % (modulo), ** (power)
- Parentheses for order of operations
- JavaScript Math functions: Math.sqrt(), Math.pow(), Math.abs(), etc.

LIMITATIONS:
- NO variables or algebra (x + 2 = 5 won't work)
- NO symbolic math or calculus
- NO unit conversions (must be done separately)
- Numbers only - no complex numbers or matrices

IMPORTANT RULE:
- If a calculation cannot be performed due to missing information or an invalid expression or any other reason, you MUST NOT ask the user for more information.
- Instead, respond with a clear error message like "Cannot calculate [calculation]".


INPUT: You receive an array of calculation results with expressions and their computed values.

OUTPUT: Format results for smart glasses display:
- Single result: Just the number (e.g., "248,171")
- Multiple results: "Expr1: 248,171 | Expr2: 15.5%"
- Keep under 60 characters total
- Use | to separate multiple results
- Add % for percentages when appropriate
- Round to reasonable precision (2-4 decimal places max)`,
  tools: { calculationTool }
});

// Router function to execute specialist agents
export async function routeToSpecialist(
  session: AppSession,
  targetAgent: AgentType,
  payload: ComputationPayload | WebSearchPayload | any,
  timestamp: number,
  locationManager?: LocationManager
): Promise<AgentInsight> {
  let output = "";
  let agentInput = payload;
  const currentDate = new Date(timestamp).toISOString();

  try {
    switch (targetAgent) {
      case AgentType.PlacesAgent:
        const placesPayload = payload as PlacesPayload;
        session.logger.info(`[routeToSpecialist] PlacesAgent processing query: ${placesPayload.query}`);

        try {
          if (!GOOGLE_MAPS_API_KEY) {
            throw new Error("GOOGLE_MAPS_API_KEY not configured");
          }

          // Step 1: Get user's location via one-time poll
          const location = await session.location.getLatestLocation({ accuracy: 'high' });
          const { lat: userLat, lng: userLng } = location;
          session.logger.info(`User location: ${userLat}, ${userLng}`);

          // Handle "location" search_type — reverse geocode to get the user's address
          if (placesPayload.search_type === 'location') {
            if (!locationManager) {
              throw new Error("LocationManager not available");
            }
            // Update coordinates and reverse geocode (cached)
            locationManager.updateCoordinates(userLat, userLng);
            const ctx = await locationManager.fetchContextIfNeeded();
            if (ctx) {
              const parts: string[] = [];
              if (ctx.streetAddress) parts.push(ctx.streetAddress);
              if (ctx.neighborhood) parts.push(ctx.neighborhood);
              parts.push(`${ctx.city}, ${ctx.state}`);
              output = `You're at ${parts.join(', ')} (${userLat.toFixed(5)}, ${userLng.toFixed(5)})`;
            } else {
              output = `You're at ${userLat.toFixed(5)}, ${userLng.toFixed(5)}`;
            }
            break;
          }

          // Step 2: Conditionally call Google Places API based on search_type
          let placesData;
          if (placesPayload.search_type === 'nearest') {
            const searchParams = new URLSearchParams({
              keyword: placesPayload.query,
              location: `${userLat},${userLng}`,
              rankby: 'distance',
              key: GOOGLE_MAPS_API_KEY,
            });
            const searchUrl = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?${searchParams.toString()}`;
            const placesResponse = await fetch(searchUrl);
            placesData = await placesResponse.json();
          } else {
            const searchParams = new URLSearchParams({
              query: placesPayload.query,
              location: `${userLat},${userLng}`,
              radius: '50000',
              key: GOOGLE_MAPS_API_KEY,
            });
            const searchUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?${searchParams.toString()}`;
            const placesResponse = await fetch(searchUrl);
            placesData = await placesResponse.json();
          }

          session.logger.info({ placesData }, `[routeToSpecialist] Google Places API response`);

          if (placesData.status !== 'OK' && placesData.status !== 'ZERO_RESULTS') {
            throw new Error(`Google Places API Error: ${placesData.status} - ${placesData.error_message || 'No details'}`);
          }

          // Step 3: Process results and calculate distances
          let processedPlaces = (placesData.results || []).slice(0, 15).map((place: any) => {
            const placeLat = place.geometry.location.lat;
            const placeLng = place.geometry.location.lng;
            const distance = calculateDistance(userLat, userLng, placeLat, placeLng);
            return {
              name: place.name,
              rating: place.rating,
              distance_miles: parseFloat(distance.toFixed(1)),
              address: place.formatted_address,
              is_nearest: false,
            };
          });

          if (processedPlaces.length === 0) {
            output = "Sorry, I couldn't find any relevant places nearby.";
            break;
          }

          // Find the nearest place and set the flag
          let nearestPlaceIndex = -1;
          let minDistance = Infinity;
          processedPlaces.forEach((place: { distance_miles: number }, index: number) => {
            if (place.distance_miles < minDistance) {
              minDistance = place.distance_miles;
              nearestPlaceIndex = index;
            }
          });

          if (nearestPlaceIndex !== -1) {
            processedPlaces[nearestPlaceIndex].is_nearest = true;
          }

          // Step 4: Invoke the PlacesAgent LLM for synthesis
          const synthesisPrompt = `Original User Query: "${placesPayload.query}"\n\nStructured Data:\n${JSON.stringify({ places: processedPlaces }, null, 2)}\n\nYour concise, helpful response:`;
          const agentResponse = await placesAgent.generate(synthesisPrompt);
          output = agentResponse.text || "I found some places but couldn't generate a response.";

        } catch (error) {
          session.logger.error(`Error in PlacesAgent logic: ${error}`);
          output = "Sorry, I had trouble finding places information.";
        }
        break;

      case AgentType.WeatherAgent:
        const weatherPayload = payload as WeatherPayload;
        session.logger.info(`[routeToSpecialist] WeatherAgent processing payload:`, weatherPayload);

        try {
          if (!GOOGLE_WEATHER_API_KEY) {
            throw new Error("GOOGLE_WEATHER_API_KEY not configured");
          }

          let lat: number, lng: number;

          if (weatherPayload.location) {
            // Forward geocode named location via Google Maps Geocoding API
            const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(weatherPayload.location)}&key=${GOOGLE_MAPS_API_KEY}`;
            const geocodeResponse = await fetch(geocodeUrl);
            const geocodeData = await geocodeResponse.json();
            if (geocodeData.status !== 'OK' || !geocodeData.results?.length) {
              throw new Error(`Could not find coordinates for location: ${weatherPayload.location}`);
            }
            lat = geocodeData.results[0].geometry.location.lat;
            lng = geocodeData.results[0].geometry.location.lng;
          } else {
            const location = await session.location.getLatestLocation({ accuracy: 'high' });
            lat = location.lat;
            lng = location.lng;
          }

          // Fetch weather via Google Weather API (same as New-Mentra-AI)
          const weatherUrl = `https://weather.googleapis.com/v1/currentConditions:lookup?key=${GOOGLE_WEATHER_API_KEY}&location.latitude=${lat}&location.longitude=${lng}`;
          const weatherResponse = await fetch(weatherUrl, {
            method: 'GET',
            headers: { 'Accept': 'application/json' },
          });

          if (!weatherResponse.ok) {
            throw new Error(`Google Weather API Error: ${weatherResponse.status}`);
          }

          const weatherData = await weatherResponse.json();

          const synthesisPrompt = `Original User Query: "${weatherPayload.location || 'current location'}"\n\nStructured Weather Data:\n${JSON.stringify(weatherData, null, 2)}\n\nYour concise, helpful response:`;
          const agentResponse = await weatherAgent.generate(synthesisPrompt);
          output = agentResponse.text || "I found the weather but couldn't generate a response.";

        } catch (error) {
          session.logger.error(`Error in WeatherAgent logic: ${error}`);
          output = "Sorry, I had trouble getting the weather.";
        }
        break;

      case AgentType.WebSearch:
        const searchPayload = payload as WebSearchPayload;
        const searchQueries = searchPayload.queries;
        session.logger.info(
          `[routeToSpecialist] WebSearchAgent processing queries: ${searchQueries.join(
            ", "
          )}`
        );

        if (serpApiSearchTool.execute) {
            const searchToolResult = await serpApiSearchTool.execute({
                context: { queries: searchQueries, includeImages: false },
                runtimeContext: new RuntimeContext(),
            });

            const synthesisPrompt = `Based on the following search results, provide a single, concise insight (max 60 chars) for the query "${searchQueries.join(', ')}":\n\n${JSON.stringify(searchToolResult, null, 2)}`;

            const searchResponse = await webSearchAgent.generate(synthesisPrompt);

            session.logger.info(`WebSearchAgent: Synthesized response text: "${searchResponse.text}"`);
            const rawOutput = searchResponse.text || "No definitive results found.";
            output = `from the web: ${rawOutput}`;
        } else {
            output = "Search tool is not executable.";
            session.logger.error("WebSearchAgent: serpApiSearchTool.execute is not defined.");
        }
        break;

      case AgentType.Computation:
        const calcPayload = payload as ComputationPayload;
        const calcResponse = await computationAgent.generate(
          `Calculate these expressions: ${JSON.stringify(calcPayload.computations)}\n\nPerform the calculations and format the results.`
        );
        output = calcResponse.text || "Calculation failed";
        break;

      // Definer and FactChecker should not be routed to anymore
      case AgentType.Definer:
      case AgentType.FactChecker:
        session.logger.warn(`Warning: ${targetAgent} should be handled as instant insight, not routed`);
        output = "This should be an instant insight";
        break;

      default:
        session.logger.error(`Routing failed: Unknown agent type "${targetAgent}"`);
        output = "Agent not implemented";
    }
  } catch (error) {
    session.logger.error(`Specialist agent error for ${targetAgent}:`, error);
    output = "Processing error";
  }

  return {
    type: Action.INSIGHT,
    reasoning: `Routed to ${targetAgent} specialist`,
    timestamp: timestamp + 1,
    output,
    confidence: 0.8,
    metadata: {
      agentType: targetAgent,
      agentInput
    }
  };
}
