import "dotenv/config";
console.log("GOOGLE_API_KEY length:", process.env.GOOGLE_API_KEY ? process.env.GOOGLE_API_KEY.length : "undefined");
console.log("GOOGLE_API_KEY starts with AIzaSy:", process.env.GOOGLE_API_KEY ? process.env.GOOGLE_API_KEY.startsWith("AIzaSy") : "false");
