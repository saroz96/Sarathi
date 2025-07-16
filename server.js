// server.js
const app = require('./app');

const PORT = 3000;

app.listen(PORT, () => {
    (`Server is running on port ${PORT}`);
});
