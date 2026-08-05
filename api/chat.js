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

    // Bulletproof Body Parser: Handles pre-parsed object, string, Buffer, or Stream
    let bodyObj = req.body;
    if (!bodyObj) {
        // Fallback: Read body from stream
        bodyObj = await new Promise((resolve) => {
            let chunkStr = '';
            req.on('data', chunk => chunkStr += chunk);
            req.on('end', () => {
                try {
                    resolve(JSON.parse(chunkStr));
                } catch (e) {
                    resolve({});
                }
            });
        });
    } else if (typeof bodyObj === 'string') {
        try {
            bodyObj = JSON.parse(bodyObj);
        } catch (e) {
            bodyObj = {};
        }
    } else if (Buffer.isBuffer(bodyObj)) {
        try {
            bodyObj = JSON.parse(bodyObj.toString());
        } catch (e) {
            bodyObj = {};
        }
    }

    const messages = bodyObj?.messages || [];
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

    if (!systemInstruction) {
        systemInstruction = 'You are a helpful assistant.';
    }

    const lastUserMsg = chatMessages.filter(m => m.role === 'user').pop();
    const prompt = lastUserMsg ? lastUserMsg.content : '';

    const groqApiKey = process.env.GROQ_API_KEY || '';
    const geminiApiKey = process.env.GEMINI_API_KEY || '';

    // Helper function to call Groq
    const callGroq = () => new Promise((resolve, reject) => {
        if (!groqApiKey || groqApiKey === 'YOUR_GROQ_API_KEY_HERE') return reject(new Error("No valid Groq Key configured on Vercel"));
        
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
                        reject(new Error(parsed.error?.message || `Groq HTTP ${response.statusCode} Error: ${responseData}`));
                        return;
                    }
                    const t = parsed.choices?.[0]?.message?.content || '';
                    resolve(t);
                } catch (e) {
                    reject(new Error("Failed to parse Groq response: " + e.message));
                }
            });
        });

        reqObj.on('error', (err) => reject(new Error("Network connection to Groq failed: " + err.message)));
        reqObj.write(payload);
        reqObj.end();
    });

    // Helper function to call Gemini
    const callGemini = () => new Promise((resolve, reject) => {
        if (!geminiApiKey || geminiApiKey === 'YOUR_GEMINI_API_KEY_HERE') return reject(new Error("No valid Gemini Key configured on Vercel"));

        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`;
        const payload = JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            systemInstruction: { parts: [{ text: systemInstruction }] },
            generationConfig: { maxOutputTokens: 1024, temperature: 0.8 }
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
                        reject(new Error(parsed.error?.message || `Gemini HTTP ${response.statusCode} Error: ${responseData}`));
                        return;
                    }
                    const t = parsed.candidates?.[0]?.content?.parts?.[0]?.text || '';
                    resolve(t);
                } catch (e) {
                    reject(new Error("Failed to parse Gemini response: " + e.message));
                }
            });
        });

        reqObj.on('error', (err) => reject(new Error("Network connection to Gemini failed: " + err.message)));
        reqObj.write(payload);
        reqObj.end();
    });

    let errors = [];

    try {
        let text;
        try {
            // Try Groq first
            text = await callGroq();
        } catch (groqErr) {
            console.warn("Groq failed, trying Gemini...", groqErr.message);
            errors.push("GroqError: " + groqErr.message);
            
            // If Groq fails (e.g. invalid key, expired), fallback to Gemini
            try {
                text = await callGemini();
            } catch (geminiErr) {
                errors.push("GeminiError: " + geminiErr.message);
                throw new Error("Both APIs failed.");
            }
        }
        res.status(200).json({ text });
    } catch (err) {
        // Return 502 with massive diagnostics payload
        res.status(502).json({ 
            error: "All AI APIs failed",
            details: errors,
            diagnostics: {
                hasGroqKey: !!groqApiKey && groqApiKey !== 'YOUR_GROQ_API_KEY_HERE',
                hasGeminiKey: !!geminiApiKey && geminiApiKey !== 'YOUR_GEMINI_API_KEY_HERE',
                groqLength: groqApiKey ? groqApiKey.length : 0,
                geminiLength: geminiApiKey ? geminiApiKey.length : 0,
                envKeysDetected: Object.keys(process.env).filter(k => k.includes('API') || k.includes('KEY') || k.includes('GROQ') || k.includes('GEMINI'))
            }
        });
    }
};