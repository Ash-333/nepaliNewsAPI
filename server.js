const express = require('express');
const { MongoClient } = require('mongodb');
const axios = require('axios');
const xml2js = require('xml2js');
const { JSDOM } = require('jsdom');
require('dotenv').config();
const port = process.env.PORT || 3000;

const app = express();

// Initialize MongoDB Atlas connection
const client = new MongoClient(process.env.MONGODB_URL);

// Specify the MongoDB database and collection
let collection;


const tele_url = "http://telegraphnepal.com/feed/"  
const online_url = "http://english.onlinekhabar.com/feed/" 
async function connectToDatabase() {
  try {
    await client.connect();
    const db = client.db('News');
    collection = db.collection('items');
    console.log('Connected to MongoDB Atlas');
  } catch (error) {
    console.error('Error connecting to MongoDB Atlas:', error);
  }
}

// Function to fetch data from a given URL
async function fetch_data(url) {
  try {
    // Fetch XML data from the URL
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
        const existing_item = await collection.findOne({ link });
        if (existing_item === null) {
          console.log(`fetched: ${link}`);
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
            await collection.insertOne(new_item_data);
          }
        }
      }
    }
  } catch (error) {
    console.error('Error fetching or parsing data:', error);
  }
}

// Create a scheduler to periodically update data
async function startScheduler() {
  await fetch_data(tele_url);
  await fetch_data(online_url);

  setInterval(async () => {
    await fetch_data(tele_url);
  }, 5 * 60 * 1000); // Run every 5 minutes

  setInterval(async () => {
    await fetch_data(online_url);
  }, 7 * 60 * 1000); // Run every 7 minutes
}

// ...

app.get('/items', async (req, res) => {
  try {
    // Retrieve all data from the MongoDB Atlas collection
    const items = await collection.find().toArray();

    // Format the items as a list of dictionaries
    const item_list = items.map((item) => ({
      title: item.title,
      link: item.link,
      description: item.description,
      img_url: item.img_url,
    }));

    // Return the list of items as JSON
    res.json(item_list);
  } catch (error) {
    console.error('Error retrieving items:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

async function startServer() {
  await connectToDatabase();
  await startScheduler();

  app.listen(3000, () => {
    console.log(`Server started on port ${port}`);
  });
}

startServer();
