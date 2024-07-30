const { MongoClient } = require('mongodb');

const uri = process.env.DB_URL + process.env.DB_QUERY_PARAM; // Replace with your MongoDB URI
let client;

async function connectDB() {
    if (!client) {
        client = new MongoClient(uri, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        await client.connect();
        console.log('Connected to MongoDB');
    }
    return client;
}

async function getDB() {
    if (!client) {
        await connectDB();
    }
    return client.db('test'); // Replace with your database name
}

module.exports = { getDB };