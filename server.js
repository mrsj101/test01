const express = require('express');
const bodyParser = require('body-parser');
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.json());
app.use(cors());
app.use(express.static('public'));

// Endpoint to download tweet
app.post('/download', async (req, res) => {
  const { url } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'Tweet URL is required.' });
  }

  try {
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();

    // Navigate to the tweet page
    await page.goto(url, { waitUntil: 'networkidle2' });

    // Extract tweet text
    const tweetText = await page.evaluate(() => {
      const tweetElement = document.querySelector('article[data-testid="tweet"] div[lang]');
      return tweetElement ? tweetElement.textContent.trim() : null;
    });

    if (!tweetText) {
      throw new Error('Failed to extract tweet text.');
    }

    // Extract media URLs
    const mediaUrls = await page.evaluate(() => {
      const imageElements = Array.from(document.querySelectorAll('img[src^="https://pbs.twimg.com/media/"]'));
      const videoElements = Array.from(document.querySelectorAll('video source[type="video/mp4"]'));

      const imageUrls = imageElements.map(img => img.src);
      const videoUrls = videoElements.map(video => video.src);

      return [...imageUrls, ...videoUrls];
    });

    // Create unique folder
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outputFolder = path.join(__dirname, `tweets/${timestamp}`);
    fs.mkdirSync(outputFolder, { recursive: true });

    // Save tweet text
    const outputPath = path.join(outputFolder, 'tweet_output.txt');
    fs.writeFileSync(outputPath, `Tweet Text:\n${tweetText}\n\nMedia URLs:\n${mediaUrls.join('\n')}`);

    // Download media
    if (mediaUrls.length > 0) {
      const mediaFolder = path.join(outputFolder, 'media');
      fs.mkdirSync(mediaFolder);

      for (let i = 0; i < mediaUrls.length; i++) {
        const response = await page.goto(mediaUrls[i]);
        const contentType = response.headers()['content-type'];
        let extension = '.jpg';
        if (contentType.includes('image/jpeg')) {
          extension = '.jpg';
        } else if (contentType.includes('image/png')) {
          extension = '.png';
        } else if (contentType.includes('video/mp4')) {
          extension = '.mp4';
        }

        const fileName = `media_${i + 1}${extension}`;
        const filePath = path.join(mediaFolder, fileName);
        const buffer = await response.buffer();
        fs.writeFileSync(filePath, buffer);
      }
    }

    await browser.close();
    res.json({ success: true, message: 'Tweet downloaded successfully.', folder: outputFolder });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to download tweet.', details: error.message });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});