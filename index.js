const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('Hello World from Azure!');
});

// Add this to log when starting
app.listen(port, () => {
  console.log(`App listening on port ${port}`);
});

// Add this to catch any unexpected crashes
process.on('uncaughtException', err => {
  console.error('Uncaught Exception:', err);
});