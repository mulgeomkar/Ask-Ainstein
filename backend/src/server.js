import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import { WebSocket, WebSocketServer } from "ws";
import { generateLearningCard, generateLearningCards } from "./gemini.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../.env") });
dotenv.config();

const PORT = Number(process.env.PORT || 4000);
const CARD_COUNT = 3;
const DELAY_BETWEEN_CARDS_MS = 650;

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (_request, response) => {
  response.json({ status: "ok" });
});

const server = app.listen(PORT, () => {
  console.log(`HTTP and WebSocket server running on http://localhost:${PORT}`);
});

const wss = new WebSocketServer({ server });

function send(socket, payload) {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(payload));
  }
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function streamCards(socket, session) {
  send(socket, {
    type: "generation_started",
    requestId: session.requestId,
    topic: session.topic,
    totalCards: CARD_COUNT
  });

  let generatedCards;
  try {
    generatedCards = await generateLearningCards(session.topic);
  } catch (error) {
    send(socket, {
      type: "error",
      requestId: session.requestId,
      message: error.message || "Something went wrong while generating cards."
    });
    return;
  }

  for (let cardNumber = 1; cardNumber <= CARD_COUNT; cardNumber += 1) {
    await wait(DELAY_BETWEEN_CARDS_MS);

    if (session.mode === "failure" && cardNumber === 3 && !session.retryCompleted) {
      session.failedCardNumber = 3;
      send(socket, {
        type: "card_error",
        requestId: session.requestId,
        cardNumber,
        message: "Intentional failure for Card 3. Cards 1 and 2 stay visible — click Retry to regenerate this card."
      });
      return;
    }

    try {
      const card = generatedCards[cardNumber - 1];
      send(socket, {
        type: "card",
        requestId: session.requestId,
        cardNumber,
        card
      });
    } catch (error) {
      send(socket, {
        type: "card_error",
        requestId: session.requestId,
        cardNumber,
        message: error.message || `Card ${cardNumber} failed while generating.`
      });
      return;
    }
  }

  send(socket, {
    type: "generation_complete",
    requestId: session.requestId,
    message: "All 3 learning cards generated successfully."
  });
}

async function retryFailedCard(socket, session, cardNumber) {
  if (!session || session.failedCardNumber !== cardNumber) {
    send(socket, {
      type: "retry_error",
      message: "There is no matching failed card to retry."
    });
    return;
  }

  send(socket, {
    type: "retry_started",
    requestId: session.requestId,
    cardNumber
  });

  try {
    await wait(DELAY_BETWEEN_CARDS_MS);
    const card = await generateLearningCard(session.topic, cardNumber);
    session.retryCompleted = true;
    session.failedCardNumber = null;

    send(socket, {
      type: "card",
      requestId: session.requestId,
      cardNumber,
      card
    });

    send(socket, {
      type: "generation_complete",
      requestId: session.requestId,
      message: "Retry succeeded. All 3 learning cards are now complete."
    });
  } catch (error) {
    send(socket, {
      type: "card_error",
      requestId: session.requestId,
      cardNumber,
      message: error.message || "Retry failed while generating the card."
    });
  }
}

wss.on("connection", (socket) => {
  const connectionState = {
    activeSession: null
  };

  send(socket, {
    type: "connected",
    message: "Connected to Ask Ainstein WebSocket server."
  });

  socket.on("message", async (rawMessage) => {
    let message;

    try {
      message = JSON.parse(rawMessage.toString());
    } catch {
      send(socket, {
        type: "error",
        message: "Invalid JSON message."
      });
      return;
    }

    if (message.type === "generate") {
      const topic = String(message.topic || "").trim();
      const mode = message.mode === "failure" ? "failure" : "success";

      if (!topic) {
        send(socket, {
          type: "error",
          message: "Please enter a learning topic before generating cards."
        });
        return;
      }

      const session = {
        requestId: message.requestId || randomUUID(),
        topic,
        mode,
        failedCardNumber: null,
        retryCompleted: false
      };

      connectionState.activeSession = session;

      try {
        await streamCards(socket, session);
      } catch (error) {
        send(socket, {
          type: "error",
          requestId: session.requestId,
          message: error.message || "Something went wrong while generating cards."
        });
      }

      return;
    }

    if (message.type === "retry") {
      await retryFailedCard(socket, connectionState.activeSession, Number(message.cardNumber || 3));
      return;
    }

    send(socket, {
      type: "error",
      message: `Unsupported message type: ${message.type}`
    });
  });
});
