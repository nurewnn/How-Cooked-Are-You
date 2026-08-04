const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = 3000;

// Load API Keys from .env file
let geminiApiKey = '';
let groqApiKey = '';
const envPath = path.join(__dirname, '.env');
try {
    if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf8');

        const geminiMatch = envContent.match(/GEMINI_API_KEY\s*=\s*([^\r\n]*)/);
        if (geminiMatch) {
            geminiApiKey = geminiMatch[1].trim().replace(/['"]/g, '');
        }

        const groqMatch = envContent.match(/GROQ_API_KEY\s*=\s*([^\r\n]*)/);
        if (groqMatch) {
            groqApiKey = groqMatch[1].trim().replace(/['"]/g, '');
        }
    }
} catch (e) {
    console.error("Warning: Failed to read .env file:", e.message);
}

// Log loaded API key status
if (groqApiKey && groqApiKey !== 'YOUR_GROQ_API_KEY_HERE') {
    console.log("✅ Groq API key loaded successfully. (Using Llama-3.3-70b-versatile)");
} else if (geminiApiKey && geminiApiKey !== 'YOUR_GEMINI_API_KEY_HERE') {
    console.log("✅ Google Gemini API key loaded successfully. (Using Gemini-2.5-Flash)");
} else {
    console.log("\n⚠️  WARNING: Neither GEMINI_API_KEY nor GROQ_API_KEY is configured in your .env file.");
    console.log("Please add your key in the .env file to enable AI dialogue.\n");
}

// Helper to make API requests to either Groq or Gemini based on loaded keys
function callGemini(prompt, systemInstruction) {
    return new Promise((resolve, reject) => {
        // 1. Prioritize Groq if Key exists
        if (groqApiKey && groqApiKey !== 'YOUR_GROQ_API_KEY_HERE') {
            const url = 'https://api.groq.com/openai/v1/chat/completions';
            const payload = JSON.stringify({
                model: 'llama-3.3-70b-versatile',
                messages: [
                    { role: 'system', content: systemInstruction },
                    { role: 'user', content: prompt }
                ],
                max_tokens: 1024,
                temperature: 0.8
            });

            const req = https.request(url, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${groqApiKey}`,
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(payload)
                }
            }, (res) => {
                let responseData = '';
                res.on('data', chunk => responseData += chunk);
                res.on('end', () => {
                    try {
                        const parsed = JSON.parse(responseData);
                        if (res.statusCode !== 200) {
                            reject(new Error(parsed.error?.message || `HTTP ${res.statusCode} Error`));
                            return;
                        }
                        const text = parsed.choices?.[0]?.message?.content || '';
                        resolve(text);
                    } catch (e) {
                        reject(new Error("Failed to parse Groq response: " + e.message));
                    }
                });
            });

            req.on('error', (err) => {
                reject(new Error("Network connection to Groq failed: " + err.message));
            });

            req.write(payload);
            req.end();
        }
        // 2. Fallback to Gemini
        else if (geminiApiKey && geminiApiKey !== 'YOUR_GEMINI_API_KEY_HERE') {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`;
            const payload = JSON.stringify({
                contents: [{
                    parts: [{ text: prompt }]
                }],
                systemInstruction: {
                    parts: [{ text: systemInstruction }]
                },
                generationConfig: {
                    maxOutputTokens: 1024,
                    temperature: 0.8
                }
            });

            const req = https.request(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(payload)
                }
            }, (res) => {
                let responseData = '';
                res.on('data', chunk => responseData += chunk);
                res.on('end', () => {
                    try {
                        const parsed = JSON.parse(responseData);
                        if (res.statusCode !== 200) {
                            reject(new Error(parsed.error?.message || `HTTP ${res.statusCode} Error`));
                            return;
                        }
                        const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text || '';
                        resolve(text);
                    } catch (e) {
                        reject(new Error("Failed to parse Gemini response: " + e.message));
                    }
                });
            });

            req.on('error', (err) => {
                reject(new Error("Network connection to Gemini failed: " + err.message));
            });

            req.write(payload);
            req.end();
        } else {
            reject(new Error("No valid API key configured. Please add GEMINI_API_KEY or GROQ_API_KEY to your .env file."));
        }
    });
}

// Server requests dispatcher
const server = http.createServer((req, res) => {
    const url = req.url;
    const method = req.method;

    // 1. GET Requests: Serve Static Files
    if (method === 'GET') {
        if (url === '/' || url === '/index.html') {
            fs.readFile(path.join(__dirname, 'index.html'), 'utf8', (err, content) => {
                if (err) {
                    res.writeHead(500, { 'Content-Type': 'text/plain' });
                    res.end('Error loading index.html');
                    return;
                }
                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end(content);
            });
        } else if (url === '/fuzzyEngine.js') {
            fs.readFile(path.join(__dirname, 'fuzzyEngine.js'), 'utf8', (err, content) => {
                if (err) {
                    res.writeHead(500, { 'Content-Type': 'text/plain' });
                    res.end('Error loading fuzzyEngine.js');
                    return;
                }
                res.writeHead(200, { 'Content-Type': 'application/javascript' });
                res.end(content);
            });
        } else {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Not Found');
        }
    }
    // 2. POST Requests: API Proxy Router
    else if (method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            let parsedRequest = {};
            try {
                parsedRequest = JSON.parse(body);
            } catch (e) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: "Invalid JSON body" }));
                return;
            }

            if (url === '/api/mum-advice') {
                const systemInstruction = `
                    You are a loving, caring, and slightly worried Malaysian mother checking on your university child through WhatsApp.
                    Speak mostly in natural English, but occasionally use simple Malaysian words like "lah", "anak", "makan", "tidur", "sayang", "risau", "ya tuhan", and "adoi". Keep it sounding warm and realistic.
                    Give gentle advice based on the student's condition. If they are stressed, tired, overloaded, or low on money, show concern and remind them to take care of themselves. If they are doing well, praise them and remind them not to neglect their health or studies.
                    Be supportive rather than overly dramatic. Sound like a real mother who worries because she cares.
                    Keep the response concise (3-5 sentences maximum).
                    Do not mention numbers, percentages, mathematics, fuzzy logic, or game mechanics.
                    Do not use emojis.
                `;

                try {
                    const text = await callGemini(parsedRequest.prompt, systemInstruction);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ text }));
                } catch (err) {
                    res.writeHead(502, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: err.message }));
                }
            } else if (url === '/api/companion-reaction') {
                const systemInstruction = `
                    You are a chill Malaysian university roommate giving honest opinions and practical advice to help your friend survive the semester.
                    Speak mainly in casual English, but occasionally use Malaysian slang and words. Keep the tone funny, relatable, and supportive.
                    React to the situation with light humour and a bit of Gen-Z energy, but always include useful advice. Avoid excessive memes or random slang.
                    Keep your response concise (1-2 sentences maximum).
                    Do not mention numbers, percentages, fuzzy logic, game mechanics, or technical details.
                    Do not use emojis.
                `;

                try {
                    const text = await callGemini(parsedRequest.prompt, systemInstruction);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ text }));
                } catch (err) {
                    res.writeHead(502, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: err.message }));
                }
            } else if (url === '/api/chat') {
                // New diary chat endpoint — accepts OpenAI-style messages array
                const messages = parsedRequest.messages || [];
                if (!Array.isArray(messages) || messages.length === 0) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: "Missing or empty 'messages' array" }));
                    return;
                }

                // Extract system instruction from first message if role is system
                let systemInstruction = '';
                let chatMessages = [];
                for (const msg of messages) {
                    if (msg.role === 'system') {
                        systemInstruction = msg.content;
                    } else {
                        chatMessages.push({ role: msg.role, content: msg.content });
                    }
                }

                // If no system instruction found, use a default
                if (!systemInstruction) {
                    systemInstruction = 'You are a helpful assistant.';
                }

                // Build the prompt from user messages (last user message)
                const lastUserMsg = chatMessages.filter(m => m.role === 'user').pop();
                const prompt = lastUserMsg ? lastUserMsg.content : '';

                try {
                    const text = await callGemini(prompt, systemInstruction);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ text }));
                } catch (err) {
                    res.writeHead(502, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: err.message }));
                }
            } else {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: "API Endpoint Not Found" }));
            }
        });
    } else {
        res.writeHead(405, { 'Content-Type': 'text/plain' });
        res.end('Method Not Allowed');
    }
});

server.listen(PORT, () => {
    console.log(`\n🚀 Game running at: http://localhost:${PORT}/`);
    console.log(`Press Ctrl+C to terminate the server.\n`);
});