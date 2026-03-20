async function testChat() {
  try {
    const response = await fetch("http://localhost:3000/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "Hello", sessionId: "test-session" })
    });
    const data = await response.json();
    console.log("Chat Response:", JSON.stringify(data, null, 2));
  } catch (error) {
    console.error("Chat Error:", error.message);
  }
}
testChat();
