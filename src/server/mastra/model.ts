import { createAzure } from "@ai-sdk/azure";

const azure = createAzure({
  resourceName: process.env.AZURE_OPENAI_RESOURCE,
  apiKey: process.env.AZURE_OPENAI_API_KEY,
  apiVersion: "2025-03-01-preview",
});

const DEPLOYMENT = process.env.AZURE_OPENAI_DEPLOYMENT ?? "gpt-5.4-mini";

export const chatModel = () => azure(DEPLOYMENT);
