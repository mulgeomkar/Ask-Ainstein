# Ask Ainstein - AI Learning Card Generator

A full-stack trial project that generates 3 learning cards for any topic. The frontend is built with React, the backend uses Node.js, and cards stream progressively over a WebSocket connection. Gemini is used for AI generation with the `GEMINI_API_KEY` configured in `backend/.env`.

## Tech Stack

- Frontend: React + Vite
- Backend: Node.js + Express
- Real-time communication: WebSockets with `ws`
- AI: Gemini via `@google/genai`

## Setup

```bash
npm install
```

Create a backend environment file:

```bash
cp backend/.env.example backend/.env
```

Add your Gemini key:

```bash
GEMINI_API_KEY=your_gemini_api_key_here
PORT=4000
GEMINI_MODEL=gemini-2.5-flash
```

The backend requires `GEMINI_API_KEY`. If Gemini rate-limits or rejects the request, the UI shows the real error instead of silently displaying static fallback cards.

## Run the Project

Start frontend and backend together:

```bash
npm run dev
```

Or run them separately:

```bash
npm run dev --workspace backend
npm run dev --workspace frontend
```

Default URLs:

- Frontend: `http://localhost:5173`
- Backend health check: `http://localhost:4000/health`
- WebSocket: `ws://localhost:4000`

If the backend runs on another URL, create `frontend/.env`:

```bash
VITE_WS_URL=ws://localhost:4000
```

## WebSocket Flow

1. The React app opens one WebSocket connection when the page loads.
2. On Generate, the frontend sends:

```json
{
  "type": "generate",
  "requestId": "client-generated-id",
  "topic": "Photosynthesis",
  "mode": "success"
}
```

3. The backend responds with `generation_started`.
4. The backend generates each card one at a time and streams each card as:

```json
{
  "type": "card",
  "requestId": "client-generated-id",
  "cardNumber": 1,
  "card": {
    "title": "Card title",
    "keyConcept": "2-3 sentence explanation",
    "funFact": "Fun fact"
  }
}
```

5. When all cards are complete, the backend sends `generation_complete`.

## Success Mode

In Success Mode, the backend generates and streams all 3 cards. The UI shows each card as it arrives and then displays a completion message.

## Failure and Retry Mode

In Failure Mode:

1. Card 1 streams successfully.
2. Card 2 streams successfully.
3. Card 3 intentionally fails.
4. Cards 1 and 2 remain visible.
5. The UI shows a clear Card 3 error and a Retry button.

Retry sends this message over the same WebSocket connection:

```json
{
  "type": "retry",
  "requestId": "same-request-id",
  "cardNumber": 3
}
```

The backend then generates Card 3 successfully and sends `generation_complete`.

## Project Structure

```flashcard-app/
│
├── backend/
│   ├── node_modules/
│   ├── src/
│   │   ├── config/
│   │   │   └── gemini.js          # Gemini API configuration
│   │   ├── routes/
│   │   │   └── flashcards.js      # Flashcard generation endpoint
│   │   ├── websocket/
│   │   │   └── socket.js          # WebSocket server
│   │   ├── services/
│   │   │   └── geminiService.js   # AI prompt and response handling
│   │   └── server.js              # Express server entry point
│   ├── .env
│   ├── package.json
│   └── package-lock.json
│
├── frontend/
│   ├── public/
│   ├── src/
│   │   ├── assets/
│   │   ├── components/
│   │   │   ├── Flashcard.jsx
│   │   │   ├── FlashcardList.jsx
│   │   │   ├── InputForm.jsx
│   │   │   ├── Loading.jsx
│   │   │   └── ErrorMessage.jsx
│   │   ├── pages/
│   │   │   └── Home.jsx
│   │   ├── hooks/
│   │   │   └── useWebSocket.js
│   │   ├── services/
│   │   │   └── api.js
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   └── index.css
│   ├── package.json
│   ├── vite.config.js
│   └── package-lock.json
│
├── README.md
└── .gitignore
```


