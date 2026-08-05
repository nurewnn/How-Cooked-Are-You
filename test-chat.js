require('dotenv').config();
const chat = require('./api/chat.js');

const req = {
    method: 'POST',
    body: {
        messages: [{ role: 'user', content: 'test' }]
    }
};

const res = {
    setHeader: () => {},
    status: function(code) {
        this.statusCode = code;
        return this;
    },
    json: function(data) {
        console.log("Status:", this.statusCode);
        console.log("Data:", data);
    },
    end: function() {
        console.log("End called");
    }
};

chat(req, res).catch(console.error);