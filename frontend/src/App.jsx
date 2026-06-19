import React, { useEffect, useMemo, useRef, useState } from "react";

const WS_URL = import.meta.env.VITE_WS_URL || "ws://localhost:4000";

const emptyCards = [
  { cardNumber: 1, status: "waiting", data: null, error: "" },
  { cardNumber: 2, status: "waiting", data: null, error: "" },
  { cardNumber: 3, status: "waiting", data: null, error: "" }
];

function createRequestId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function App() {
  const socketRef = useRef(null);
  const [topic, setTopic] = useState("");
  const [mode, setMode] = useState("success");
  const [connectionStatus, setConnectionStatus] = useState("connecting");
  const [cards, setCards] = useState(emptyCards);
  const [activeRequestId, setActiveRequestId] = useState(null);
  const [statusMessage, setStatusMessage] = useState("Connecting to the learning engine...");
  const [isGenerating, setIsGenerating] = useState(false);

  const failedCard = useMemo(
    () => cards.find((card) => card.status === "error"),
    [cards]
  );

  useEffect(() => {
    const socket = new WebSocket(WS_URL);
    socketRef.current = socket;

    socket.addEventListener("open", () => {
      setConnectionStatus("connected");
      setStatusMessage("Ready. Pick a topic and generate learning cards.");
    });

    socket.addEventListener("close", () => {
      setConnectionStatus("disconnected");
      setIsGenerating(false);
      setStatusMessage("WebSocket disconnected. Refresh the page to reconnect.");
    });

    socket.addEventListener("error", () => {
      setConnectionStatus("disconnected");
      setIsGenerating(false);
      setStatusMessage("Unable to reach the WebSocket server.");
    });

    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      handleSocketMessage(message);
    });

    return () => socket.close();
  }, []);

  function handleSocketMessage(message) {
    if (message.type === "connected") {
      return;
    }

    if (message.type === "generation_started") {
      setActiveRequestId(message.requestId);
      setIsGenerating(true);
      setStatusMessage(`Generating 3 cards about ${message.topic}...`);
      setCards((currentCards) =>
        currentCards.map((card) => ({ ...card, status: "loading", data: null, error: "" }))
      );
      return;
    }

    if (message.type === "card") {
      setCards((currentCards) =>
        currentCards.map((card) =>
          card.cardNumber === message.cardNumber
            ? { ...card, status: "complete", data: message.card, error: "" }
            : card
        )
      );
      setStatusMessage(`Card ${message.cardNumber} arrived.`);
      return;
    }

    if (message.type === "card_error") {
      setIsGenerating(false);
      setCards((currentCards) =>
        currentCards.map((card) =>
          card.cardNumber === message.cardNumber
            ? { ...card, status: "error", data: null, error: message.message }
            : card
        )
      );
      setStatusMessage(message.message || `Card ${message.cardNumber} failed while generating.`);
      return;
    }

    if (message.type === "retry_started") {
      setIsGenerating(true);
      setCards((currentCards) =>
        currentCards.map((card) =>
          card.cardNumber === message.cardNumber
            ? { ...card, status: "loading", error: "" }
            : card
        )
      );
      setStatusMessage("Retrying Card 3 on the same WebSocket connection...");
      return;
    }

    if (message.type === "generation_complete") {
      setIsGenerating(false);
      setStatusMessage(message.message);
      return;
    }

    if (message.type === "error" || message.type === "retry_error") {
      setIsGenerating(false);
      setStatusMessage(message.message);
    }
  }

  function sendMessage(payload) {
    const socket = socketRef.current;

    if (!socket || socket.readyState !== WebSocket.OPEN) {
      setStatusMessage("WebSocket is not connected yet.");
      return false;
    }

    socket.send(JSON.stringify(payload));
    return true;
  }

  function handleGenerate(event) {
    event.preventDefault();

    const cleanTopic = topic.trim();
    if (!cleanTopic) {
      setStatusMessage("Please enter a topic first.");
      return;
    }

    const requestId = createRequestId();
    setActiveRequestId(requestId);
    setCards(emptyCards);
    setStatusMessage("Sending topic through WebSocket...");

    sendMessage({
      type: "generate",
      requestId,
      topic: cleanTopic,
      mode
    });
  }

  function handleRetry() {
    if (!failedCard) return;

    sendMessage({
      type: "retry",
      requestId: activeRequestId,
      cardNumber: failedCard.cardNumber
    });
  }

  return (
    <main className="app-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">Ask Ainstein Trial Task</p>
          <h1>AI Learning Card Generator</h1>
          
        </div>
        <div className={`connection-pill ${connectionStatus}`}>
          <span />
          {connectionStatus}
        </div>
      </section>

      <section className="panel">
        <form className="generator-form" onSubmit={handleGenerate}>
          <label htmlFor="topic">Learning topic</label>
          <div className="input-row">
            <input
              id="topic"
              type="text"
              value={topic}
              onChange={(event) => setTopic(event.target.value)}
              placeholder="Photosynthesis, Newton's Laws, Artificial Intelligence..."
              disabled={isGenerating}
            />
            <button disabled={isGenerating || connectionStatus !== "connected"}>
              {isGenerating ? "Generating..." : "Generate"}
            </button>
          </div>

          <div className="mode-toggle" aria-label="Generation mode">
            <button
              type="button"
              className={mode === "success" ? "active" : ""}
              onClick={() => setMode("success")}
              disabled={isGenerating}
            >
              Success Mode
            </button>
            <button
              type="button"
              className={mode === "failure" ? "active" : ""}
              onClick={() => setMode("failure")}
              disabled={isGenerating}
            >
              Failure Mode
            </button>
          </div>
        </form>

        <div className="status-bar">
          <div className={isGenerating ? "spinner" : "status-dot"} />
          <p>{statusMessage}</p>
        </div>
      </section>

      <section className="cards-grid" aria-live="polite">
        {cards.map((card) => (
          <article className={`learning-card ${card.status}`} key={card.cardNumber}>
            <div className="card-topline">
              <span>Card {card.cardNumber}</span>
              <strong>{card.status}</strong>
            </div>

            {card.status === "waiting" && (
              <div className="placeholder">Waiting for this card to stream in.</div>
            )}

            {card.status === "loading" && (
              <div className="placeholder shimmer">Generating this card...</div>
            )}

            {card.status === "complete" && card.data && (
              <>
                <h2>{card.data.title}</h2>
                <h3>Key Concept</h3>
                <p>{card.data.keyConcept}</p>
                <h3>Fun Fact</h3>
                <p>{card.data.funFact}</p>
              </>
            )}

            {card.status === "error" && (
              <div className="error-box">
                <h2>Card failed</h2>
                <p>{card.error}</p>
              </div>
            )}
          </article>
        ))}
      </section>

      {failedCard && (
        <section className="retry-panel">
          <div>
            <h2>Recovery test</h2>
            <p>Cards 1 and 2 remain visible. Retry only regenerates Card 3 using this same socket.</p>
          </div>
          <button onClick={handleRetry} disabled={isGenerating}>
            Retry Card {failedCard.cardNumber}
          </button>
        </section>
      )}
    </main>
  );
}

export default App;
