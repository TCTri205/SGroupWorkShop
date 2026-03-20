import "dotenv/config";
const key = process.env.GOOGLE_API_KEY;
console.log("Raw Key:", `[${key}]`);
console.log("Type:", typeof key);
console.log("Starts with AIza:", key ? key.startsWith('AIza') : 'undefined');
console.log("Length:", key ? key.length : 0);
