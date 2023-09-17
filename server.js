const express = require('express');
const mongoose = require('mongoose');
const axios = require('axios');
const xml2js = require('xml2js');
const { JSDOM } = require('jsdom');
require('dotenv').config();
const port = process.env.PORT;

const app = express();

// Initialize MongoDB Atlas connection
mongoose.connect(process.env.MONOGO_DB_URL, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

// Create a Mongoose schema for the news items
const newsItemSchema = new mongoose.Schema({
  title: String,
  link: String,
  description: String,
  img_url: String,
});

// Create a Mongoose model based on the schema
const NewsItem = mongoose.model('NewsItem', newsItemSchema);

const tele_url = "https://telegraphnepal.com/feed/";
const online_url = "https://english.onlinekhabar.com/feed/";

// Function to fetch data from a given URL
async function fetch_data(url) {
  try {
    // Fetch XML data from the URL
    console.log(`running fetch on ${url}`);
    const response = await axios.get(url);
    if (response.status === 200) {
      const xml_data = response.data;

      // Parse the XML
      const parser = new xml2js.Parser();
      const result = await parser.parseStringPromise(xml_data);

      // Iterate through <item> elements and prepare new items
      for (const item_elem of result.rss.channel[0].item) {
        const title = item_elem.title[0];
        const link = item_elem.link[0];
        const description = item_elem.description[0];

        // Check if the item with the same link already exists in the collection
        const existing_item = await NewsItem.findOne({ link });
        if (existing_item === null) {
          console.log(`found new item: ${title}`);
          // Extract image URL from <content:encoded> and <img> elements
          const encoded_content = item_elem['content:encoded'][0];
          if (encoded_content) {
            const dom = new JSDOM(encoded_content);
            const img_tags = dom.window.document.querySelectorAll('img');
            const img_src = img_tags.length > 0 ? img_tags[0].src : null;

            // Create a document for each new item
            const new_item_data = {
              title,
              link,
              description,
              img_url: img_src,
            };

            // Insert the new item into the collection
            await NewsItem.create(new_item_data);
            console.log(`added new item ${new_item_data}`)
          }
        } else {
          console.log(`duplicate element from ${title}`);
        }
      }
    }
  } catch (error) {
    console.error('Error fetching or parsing data:', error);
  }
}

app.get('/items', async (req, res) => {
  try {
    // Retrieve all data from the MongoDB collection
    const items = await NewsItem.find().exec();

    // Format the items as a list of dictionaries
    const item_list = items.map((item) => ({
      title: item.title,
      link: item.link,
      description: item.description,
      img_url: item.img_url,
    }));
    const reversedItemList = item_list.reverse();

    // Return the list of items as JSON
    res.json(reversedItemList);
  } catch (error) {
    console.error('Error retrieving items:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.get('/', async (req, res) => {
  res.json("msg : welcome to nepali news api t get list of new goto /items endpoint");
});

async function startServer() {
  app.listen(port, () => {
    console.log(`Server started on port ${port}`);
  });

  // Invoke fetch_data initially after 5 seconds
  setTimeout(async () => {
    await fetch_data(tele_url);
    await fetch_data(online_url);
  }, 5000);

  // Set up recurring fetch_data calls every 5 minutes
  setInterval(async () => {
    await fetch_data(tele_url);
    await fetch_data(online_url);
  }, 15 * 60 * 1000); // Run every 5 minutes
}

startServer();
