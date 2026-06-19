import { GoogleGenAI } from "@google/genai";

const DEFAULT_MODEL_CANDIDATES = [
  "gemini-3.5-flash",
  "gemini-3.1-flash-lite",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash"
];

let cachedApiKey = "";
let cachedClient = null;

function getApiKey() {
  const apiKey = String(process.env.GEMINI_API_KEY || "").trim();

  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured. Add it to backend/.env and restart the backend.");
  }

  return apiKey;
}

function getGeminiClient() {
  const apiKey = getApiKey();

  if (!cachedClient || cachedApiKey !== apiKey) {
    cachedApiKey = apiKey;
    cachedClient = new GoogleGenAI({ apiKey });
  }

  return cachedClient;
}

function getModelCandidates() {
  const configuredModel = String(process.env.GEMINI_MODEL || "").trim();
  return [...new Set([configuredModel, ...DEFAULT_MODEL_CANDIDATES].filter(Boolean))];
}

function cleanText(value) {
  return String(value || "").trim();
}

function sanitizeErrorMessage(error) {
  return cleanText(error?.message || error)
    .replace(/AIza[0-9A-Za-z_-]+/g, "[redacted-api-key]")
    .replace(/\bAQ\.[0-9A-Za-z._-]+\b/g, "[redacted-api-key]")
    .replace(/key=[^&\s]+/gi, "key=[redacted-api-key]");
}

function isAuthError(error) {
  const message = sanitizeErrorMessage(error).toLowerCase();
  return message.includes("api key not valid") || message.includes("permission denied") || message.includes("401") || message.includes("403");
}

function extractJson(text) {
  const cleaned = text
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();

  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  const jsonText = firstBrace >= 0 && lastBrace >= 0
    ? cleaned.slice(firstBrace, lastBrace + 1)
    : cleaned;

  return JSON.parse(jsonText);
}

function normalizeCard(card, cardNumber) {
  const title = cleanText(card?.title);
  const keyConcept = cleanText(card?.keyConcept || card?.key_concept);
  const funFact = cleanText(card?.funFact || card?.fun_fact);

  if (!title || !keyConcept || !funFact) {
    throw new Error(`Gemini returned an incomplete card ${cardNumber}.`);
  }

  return {
    title,
    keyConcept,
    funFact
  };
}

async function generateJson(prompt, label) {
  const genAI = getGeminiClient();
  const errors = [];

  for (const modelName of getModelCandidates()) {
    try {
      const result = await genAI.models.generateContent({
        model: modelName,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          temperature: 0.8
        }
      });
      return extractJson(result.text);
    } catch (error) {
      const message = sanitizeErrorMessage(error);
      errors.push(`${modelName}: ${message}`);
      console.warn(`Gemini model ${modelName} failed: ${message}`);

      if (isAuthError(error)) {
        break;
      }
    }
  }

  const lastError = errors.at(-1) || "No Gemini models were available.";
  throw new Error(`Gemini could not generate ${label}. ${lastError}`);
}

function buildCardsPrompt(topic) {
  return `
Create exactly 3 distinct learning cards for the topic "${topic}".

Return only valid JSON with this exact shape:
{
  "cards": [
    {
      "title": "short unique card title",
      "keyConcept": "2-3 beginner-friendly sentences explaining a unique concept",
      "funFact": "one concise fun fact"
    }
  ]
}

The cards must not repeat the same key concept.
Card 1 should explain the foundation.
Card 2 should explain a process, mechanism, or example.
Card 3 should explain importance, application, or a surprising connection.
`;
}

function buildSingleCardPrompt(topic, cardNumber) {
  return `
Create card ${cardNumber} of 3 for the topic "${topic}".

Return only valid JSON with this exact shape:
{
  "card": {
    "title": "short unique card title",
    "keyConcept": "2-3 beginner-friendly sentences explaining one useful concept",
    "funFact": "one concise fun fact"
  }
}

Use this role for the card:
- Card 1: explain the foundation.
- Card 2: explain a process, mechanism, or example.
- Card 3: explain importance, application, or a surprising connection.
`;
}

export async function generateLearningCard(topic, cardNumber) {
  const parsed = await generateJson(buildSingleCardPrompt(topic, cardNumber), `card ${cardNumber}`);
  const card = parsed.card || (Array.isArray(parsed.cards) ? parsed.cards[0] : parsed);
  return normalizeCard(card, cardNumber);
}

export async function generateLearningCards(topic) {
  const parsed = await generateJson(buildCardsPrompt(topic), "learning cards");
  const cards = Array.isArray(parsed.cards) ? parsed.cards : parsed;

  if (!Array.isArray(cards) || cards.length < 3) {
    throw new Error("Gemini returned fewer than 3 cards.");
  }

  return cards.slice(0, 3).map((card, index) => normalizeCard(card, index + 1));
}
