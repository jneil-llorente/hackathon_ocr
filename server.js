const express = require('express');
const path = require('path');
const fs = require('fs');
const poppler = require('pdf-poppler');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const port = 3000;
const GEMINI_API_KEY = 'AIzaSyCDYb9Z5iN_qAFIsFVMBA1EoUDS1OuMJ7A'; // 🔐 Replace this with your Gemini API key

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

app.use(express.static('public'));
app.use(express.json());

app.post('/upload-pdf', async (req, res) => {
  try {
    const pdfPath = path.join(__dirname, 'test_pdf.pdf');

    if (!fs.existsSync(pdfPath)) {
      console.error('PDF not found:', pdfPath);
      return res.status(400).send('PDF file not found.');
    }

    console.log('✅ PDF file found, starting conversion...');

    // Step 1: Clean images folder
    clearImagesFolder();

    // Step 2: Convert PDF to images
    await convertPdfToImages(pdfPath);
    console.log('✅ PDF converted to images.');

    // Step 3: Process with Gemini
    const tableData = await extractTablesWithGemini();
    console.log('✅ Gemini OCR completed.');

    res.json(tableData);

  } catch (err) {
    console.error('❌ Error:', err);
    res.status(500).send('Error processing PDF.');
  }
});

function clearImagesFolder() {
  const imagesDir = './images';
  if (fs.existsSync(imagesDir)) {
    const files = fs.readdirSync(imagesDir);
    files.forEach(file => fs.unlinkSync(path.join(imagesDir, file)));
  } else {
    fs.mkdirSync(imagesDir);
  }
}

async function convertPdfToImages(pdfPath) {
  const outputDir = './images';
  const options = {
    format: 'png',
    out_dir: outputDir,
    out_prefix: 'page',
    page: null
  };

  try {
    await poppler.convert(pdfPath, options);
  } catch (err) {
    console.error('❌ Error during PDF conversion:', err);
    throw err;
  }
}

function encodeImageToBase64(filePath) {
  try {
    const image = fs.readFileSync(filePath);
    return image.toString('base64');
  } catch (error) {
    console.error(`❌ Error reading image at ${filePath}:`, error);
    return null;
  }
}

async function extractTablesWithGemini() {
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' }); // Updated to gemini-1.5-flash
  const imageDir = './images';
  const files = fs.readdirSync(imageDir).filter(file => file.endsWith('.png'));

  let allTables = [];

  for (const file of files) {
    const filePath = path.join(imageDir, file);
    const base64Image = encodeImageToBase64(filePath);

    if (!base64Image) {
      console.warn(`⚠️ Could not read image ${file}`);
      continue;
    }

    const prompt = `
You are a table extraction AI. Your job is to extract only table(s) from this image.
Respond with only a JSON array of row objects, each object representing a row with column names.
Do NOT include text explanations.
`;

    try {
      const result = await model.generateContent([
        { text: prompt },
        {
          inlineData: {
            mimeType: 'image/png',
            data: base64Image,
          }
        }
      ]);

      const response = await result.response;
      const text = response.text();

      console.log(`📦 Gemini raw response for ${file}:`, text);

      const jsonStart = text.indexOf('[');
      const jsonEnd = text.lastIndexOf(']') + 1;
      const jsonText = text.slice(jsonStart, jsonEnd);

      const parsed = JSON.parse(jsonText);
      allTables = allTables.concat(parsed);
    } catch (err) {
      console.warn(`⚠️ Failed to extract table from ${file}:`, err.message);
    }
  }

  return allTables;
}

app.listen(port, () => {
  console.log(`🚀 Server running on http://localhost:${port}`);
});
