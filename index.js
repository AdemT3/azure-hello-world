const express = require('express');
const formidable = require('formidable');
const path = require('path');
const fs = require('fs');
const { BlobServiceClient } = require('@azure/storage-blob');
require('dotenv').config();

console.log('Starting Azure Blob Storage UI App...');

const app = express();
const port = process.env.PORT || 3000;

// Validate environment variables
if (!process.env.AZURE_STORAGE_CONNECTION_STRING || !process.env.AZURE_STORAGE_CONTAINER) {
  console.error("Missing required environment variables: AZURE_STORAGE_CONNECTION_STRING and/or AZURE_STORAGE_CONTAINER");
  process.exit(1);
}

let containerClient;

console.log('Storage connection length:', process.env.AZURE_STORAGE_CONNECTION_STRING?.length);

try {
  const blobServiceClient = BlobServiceClient.fromConnectionString(process.env.AZURE_STORAGE_CONNECTION_STRING);
  containerClient = blobServiceClient.getContainerClient(process.env.AZURE_STORAGE_CONTAINER);
  console.log(`Connected to Azure Blob container: ${process.env.AZURE_STORAGE_CONTAINER}`);
} catch (err) {
  console.error('Failed to connect to Azure Blob Storage:', err);
  process.exit(1);
}

app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static('uploads'));

app.get('/', async (req, res) => {
  try {
    const blobs = [];
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

app.post('/upload', (req, res) => {
  const form = formidable({ uploadDir: './uploads', keepExtensions: true });

  form.parse(req, async (err, fields, files) => {
    if (err) {
      console.error('Upload parse error:', err);
      return res.status(400).send('Upload failed');
    }

    const file = files.file;
    const blobName = file.originalFilename || file.newFilename;
    const filePath = file.filepath;

    try {
      console.log(`Uploading file: ${blobName}`);
      const blockBlobClient = containerClient.getBlockBlobClient(blobName);
      await blockBlobClient.uploadFile(filePath);
      console.log(`Upload successful: ${blobName}`);
    } catch (err) {
      console.error('Upload failed:', err.message);
    } finally {
      fs.unlinkSync(filePath);
    }

    res.redirect('/');
  });
});

app.get('/download/:name', async (req, res) => {
  const blobName = req.params.name;
  const blockBlobClient = containerClient.getBlockBlobClient(blobName);

  try {
    console.log(`Downloading file: ${blobName}`);
    const downloadBlockBlobResponse = await blockBlobClient.download();
    res.setHeader('Content-Disposition', `attachment; filename="${blobName}"`);
    downloadBlockBlobResponse.readableStreamBody.pipe(res);
  } catch (err) {
    console.error('Download failed:', err.message);
    res.status(500).send('Download failed');
  }
});

app.post('/delete/:name', async (req, res) => {
  const blobName = req.params.name;
  const blockBlobClient = containerClient.getBlockBlobClient(blobName);

  try {
    console.log(`Deleting file: ${blobName}`);
    await blockBlobClient.delete();
    console.log(`File deleted: ${blobName}`);
  } catch (err) {
    console.error('Delete failed:', err.message);
  }

  res.redirect('/');
});

process.on('uncaughtException', err => {
  console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', err => {
  console.error('Unhandled Rejection:', err);
});

app.listen(port, () => {
  console.log(`App listening on port ${port}`);
});