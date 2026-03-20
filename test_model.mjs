import "dotenv/config";
console.log("GOOGLE_MODEL:", process.env.GOOGLE_MODEL);
console.log("GOOGLE_API_KEY type:", typeof process.env.GOOGLE_API_KEY);
console.log("GOOGLE_API_KEY length:", process.env.GOOGLE_API_KEY ? process.env.GOOGLE_API_KEY.length : 0);
