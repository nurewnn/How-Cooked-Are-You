const https = require('https');

module.exports = async (req, res) => {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        return res.status(204).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    // Vercel automatically parses JSON bodies into req.body
    const messages = req.body?.messages || [];
    if (!Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ error: "Missing or empty 'messages' array" });
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

    const groqApiKey = process.env.GROQ_API_KEY || '';
    const geminiApiKey = process.env.GEMINI_API_KEY || '';

    try {
        const text = await new Promise((resolve, reject) => {
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

                const reqObj = https.request(url, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${groqApiKey}`,
                        'Content-Type': 'application/json',
                        'Content-Length': Buffer.byteLength(payload)
                    }
                }, (response) => {
                    let responseData = '';
                    response.on('data', chunk => responseData += chunk);
                    response.on('end', () => {
                        try {
                            const parsed = JSON.parse(responseData);
                            if (response.statusCode !== 200) {
                                reject(new Error(parsed.error?.message || `HTTP ${response.statusCode} Error`));
                                return;
                            }
                            const t = parsed.choices?.[0]?.message?.content || '';
                            resolve(t);
                        } catch (e) {
                            reject(new Error("Failed to parse Groq response: " + e.message));
                        }
                    });
                });

                reqObj.on('error', (err) => {
                    reject(new Error("Network connection to Groq failed: " + err.message));
                });

                reqObj.write(payload);
                reqObj.end();
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

                const reqObj = https.request(url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Content-Length': Buffer.byteLength(payload)
                    }
                }, (response) => {
                    let responseData = '';
                    response.on('data', chunk => responseData += chunk);
                    response.on('end', () => {
                        try {
                            const parsed = JSON.parse(responseData);
                            if (response.statusCode !== 200) {
                                reject(new Error(parsed.error?.message || `HTTP ${response.statusCode} Error`));
                                return;
                            }
                            const t = parsed.candidates?.[0]?.content?.parts?.[0]?.text || '';
                            resolve(t);
                        } catch (e) {
                            reject(new Error("Failed to parse Gemini response: " + e.message));
                        }
                    });
                });

                reqObj.on('error', (err) => {
                    reject(new Error("Network connection to Gemini failed: " + err.message));
                });

                reqObj.write(payload);
                reqObj.end();
            } else {
                reject(new Error("No valid API key configured. Please add GEMINI_API_KEY or GROQ_API_KEY to your Vercel environment variables."));
            }
        });

        res.status(200).json({ text });
    } catch (err) {
        res.status(502).json({ error: err.message });
    }
};
