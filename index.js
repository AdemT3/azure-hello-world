const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { BlobServiceClient } = require('@azure/storage-blob');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;
const upload = multer({ dest: 'uploads/' });

const blobServiceClient = BlobServiceClient.fromConnectionString(process.env.AZURE_STORAGE_CONNECTION_STRING);
const containerClient = blobServiceClient.getContainerClient(process.env.AZURE_STORAGE_CONTAINER);

app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static('uploads'));

app.get('/', async (req, res) => {
  let blobs = [];
  for await (const blob of containerClient.listBlobsFlat()) {
    blobs.push(blob.name);
  }

  let html = `
    <h1>Azure Blob Storage Browser</h1>
    <form action="/upload" method="post" enctype="multipart/form-data">
      <input type="file" name="file" required />
      <button type="submit">Upload</button>
    </form>
    <ul>
  `;

  blobs.forEach(blob => {
    html += `
      <li>${blob}
        <a href="/download/${encodeURIComponent(blob)}">Download</a>
        <form action="/delete/${encodeURIComponent(blob)}" method="post" style="display:inline;">
          <button type="submit">Delete</button>
        </form>
      </li>
    `;
  });

  html += '</ul>';
  res.send(html);
});

app.post('/upload', upload.single('file'), async (req, res) => {
  const blobName = req.file.originalname;
  const filePath = req.file.path;

  try {
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);
    await blockBlobClient.uploadFile(filePath);
  } catch (err) {
    console.error('Upload failed:', err.message);
  } finally {
    fs.unlinkSync(filePath); // clean up local file
  }

  res.redirect('/');
});

app.get('/download/:name', async (req, res) => {
  const blobName = req.params.name;
  const blockBlobClient = containerClient.getBlockBlobClient(blobName);

  try {
    const downloadBlockBlobResponse = await blockBlobClient.download();
    res.setHeader('Content-Disposition', `attachment; filename="${blobName}"`);
    downloadBlockBlobResponse.readableStreamBody.pipe(res);
  } catch (err) {
    res.status(500).send('Download failed');
  }
});

app.post('/delete/:name', async (req, res) => {
  const blobName = req.params.name;
  const blockBlobClient = containerClient.getBlockBlobClient(blobName);

  try {
    await blockBlobClient.delete();
  } catch (err) {
    console.error('Delete failed:', err.message);
  }

  res.redirect('/');
});

app.listen(port, () => {
  console.log(`App listening on port ${port}`);
});