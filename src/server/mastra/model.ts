import { createAzure } from "@ai-sdk/azure";

const azure = createAzure({
  baseURL: process.env.AZURE_OPENAI_BASE_URL,
  apiKey: process.env.AZURE_OPENAI_API_KEY,
  apiVersion: "preview",
});

const DEPLOYMENT = process.env.AZURE_OPENAI_DEPLOYMENT ?? "gpt-5.4-mini";

export const chatModel = () => azure(DEPLOYMENT);
