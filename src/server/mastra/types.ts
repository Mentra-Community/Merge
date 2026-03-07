// Core conversation types
interface ConversationSegment {
    type: 'transcript';
    text: string;
    timestamp: number;
}

// Action types for agent responses
enum Action {
    INSIGHT = 'insight',           // Show insight to user
    SILENT = 'silent',             // Stay quiet
    ROUTE = 'route',               // Pass to specialist agent
}

// Phase 1 agent types
enum AgentType {
    // Phase 1 - Immediate
    Initial = 'Initial',           // The traffic controller
    Definer = 'Definer',          // ASR: Automatic Speech Recognition
    FactChecker = 'FactChecker',  // False: ~3B people wear glasses

    // Phase 1 - Routing agents
    WebSearch = 'WebSearch',       // Current data, prices, weather
    Computation = 'Computation',   // Math, calculations, conversions

    // Phase 2+ - Future agents
    PlacesAgent = 'PlacesAgent',
    WeatherAgent = 'WeatherAgent',
    GSuiteChecker = 'GSuiteChecker',
    DeepResearcher = 'DeepResearcher',
    Historian = 'Historian',
    Statistician = 'Statistician',
    DevilsAdvocate = 'DevilsAdvocate',
    CognitiveBiasDetector = 'CognitiveBiasDetector',
    IdeaGenerator = 'IdeaGenerator',
    QuestionGenerator = 'QuestionGenerator',
}

// Agent response types
interface AgentInsight {
    type: Action.INSIGHT;
    reasoning: string;
    timestamp: number;
    output: string;                // Glass-ready text
    confidence: number;            // 0-1 how confident in this insight

    // Simple metadata for tracking
    metadata: {
        agentType: AgentType;      // Which agent generated this
        agentInput?: any;          // What data was passed to the agent
    };
}

interface AgentSilent {
    type: Action.SILENT;
    reasoning: string;
    timestamp: number;
}

interface AgentRoute {
    type: Action.ROUTE;
    reasoning: string;
    timestamp: number;
    targetAgent: AgentType;
    payload: ComputationPayload | WebSearchPayload | GSuitePayload | PlacesPayload | WeatherPayload;
}

// Payloads for different agent types
interface ComputationPayload {
    computations: string[];        // List of expressions to compute
}

interface WebSearchPayload {
    queries: string[];             // Multiple search queries
}

interface PlacesPayload {
    query: string; // The user's search query for a place
    search_type: 'nearest' | 'recommendation' | 'location'; // The type of search to perform
}

interface WeatherPayload {
    location?: string; // Optional location for weather query
}

interface GSuitePayload {
    action: 'check_calendar' | 'find_email' | 'get_contacts';
    parameters: any;
}

// Union type for all agent responses
type AgentResponse = AgentInsight | AgentSilent | AgentRoute;

// The main conversation flow
type Conversation = (ConversationSegment | AgentResponse)[];

// Mock test case structure
interface MockTestCase {
    id: string;
    description: string;
    // Exactly what gets fed to Initial Agent
    conversation: Conversation;
    // What we expect back
    expectedResponse: AgentResponse;
}

// Export everything
export {
    Action,
    AgentType,
    type ConversationSegment,
    type AgentInsight,
    type AgentSilent,
    type AgentRoute,
    type AgentResponse,
    type Conversation,
    type MockTestCase,
    type ComputationPayload,
    type WebSearchPayload,
    type PlacesPayload,
    type WeatherPayload,
    type GSuitePayload,
};
