const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { BlobServiceClient } = require('@azure/storage-blob');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// Validate environment variables
if (!process.env.AZURE_STORAGE_CONNECTION_STRING || !process.env.AZURE_STORAGE_CONTAINER) {
  console.error("❌ Missing required environment variables: AZURE_STORAGE_CONNECTION_STRING and/or AZURE_STORAGE_CONTAINER");
  process.exit(1);
}

const upload = multer({ dest: 'uploads/' });

const blobServiceClient = BlobServiceClient.fromConnectionString(process.env.AZURE_STORAGE_CONNECTION_STRING);
const containerClient = blobServiceClient.getContainerClient(process.env.AZURE_STORAGE_CONTAINER);

app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static('uploads'));

app.get('/', async (req, res) => {
  try {
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
  } catch (err) {
    console.error('Error listing blobs:', err.message);
    res.status(500).send('Error listing blobs');
  }
});

app.post('/upload', upload.single('file'), async (req, res) => {
  const blobName = req.file.originalname;
  const filePath = req.file.path;

  try {
    console.log(`⬆️ Uploading file: ${blobName}`);
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);
    await blockBlobClient.uploadFile(filePath);
    console.log(`✅ Uploaded: ${blobName}`);
  } catch (err) {
    console.error('❌ Upload failed:', err.message);
  } finally {
    fs.unlinkSync(filePath); // clean up local file
  }

  res.redirect('/');
});

app.get('/download/:name', async (req, res) => {
  const blobName = req.params.name;
  const blockBlobClient = containerClient.getBlockBlobClient(blobName);

  try {
    console.log(`⬇️ Downloading file: ${blobName}`);
    const downloadBlockBlobResponse = await blockBlobClient.download();
    res.setHeader('Content-Disposition', `attachment; filename="${blobName}"`);
    downloadBlockBlobResponse.readableStreamBody.pipe(res);
  } catch (err) {
    console.error('❌ Download failed:', err.message);
    res.status(500).send('Download failed');
  }
});

app.post('/delete/:name', async (req, res) => {
  const blobName = req.params.name;
  const blockBlobClient = containerClient.getBlockBlobClient(blobName);

  try {
    console.log(`🗑️ Deleting file: ${blobName}`);
    await blockBlobClient.delete();
    console.log(`✅ Deleted: ${blobName}`);
  } catch (err) {
    console.error('❌ Delete failed:', err.message);
  }

  res.redirect('/');
});

// Catch fatal errors
process.on('uncaughtException', err => {
  console.error('❌ Uncaught Exception:', err);
});
process.on('unhandledRejection', err => {
  console.error('❌ Unhandled Rejection:', err);
});

app.listen(port, () => {
  console.log(`✅ App listening on port ${port}`);
});