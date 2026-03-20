async function testChat() {
  try {
    const response = await fetch("http://localhost:3001/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "Hello", sessionId: "test-session-3001" })
    });
    const data = await response.json();
    console.log("Chat Response 3001:", JSON.stringify(data, null, 2));
  } catch (error) {
    console.error("Chat Error 3001:", error.message);
  }
}
testChat();
