import * as cheerio from 'cheerio';
import axios from 'axios';
import OpenAI from "openai";
import { ChromaClient, ChromaUniqueError } from "chromadb";

const token = "";
const endpoint = "";

const openai = new OpenAI({ baseURL: endpoint, apiKey: token });
const chromaClient = new ChromaClient({ path: "http://localhost:8000" });
chromaClient.heartbeat();

const WEB_COLLECTION = `WEB_SCRA_COLLECTION-1`;

async function scapeWebPage(url = '') {
    const { data } = await axios.get(url);

    const $ = cheerio.load(data);

    const pageHead = $('head').html();
    const pageBody = $('body').html();

    const internalLinks = [];
    const externalLinks = [];

    $('a').each((_, el) => {
        const link = $(el).attr('href');
        if (link === '/' || link === '#' || link === '') return;
        if (link.startsWith('http') || link.startsWith('https')) {
            externalLinks.push(link);
        } else {
            internalLinks.push(link);
        }
    });

    console.log(internalLinks);
    return { body: pageBody, head: pageHead, internalLinks, externalLinks };
}

function chunkText(text, chunkSize) {
    if (!text || chunkSize <= 0) {
        return []
    }

    let chunks = [];
    for (let i = 0; i < text.length; i += chunkSize) {
        chunks.push(text.slice(i, i + chunkSize));
    }
    return chunks;
}

async function getVectorEmbeding({ text }) {
    const embedding = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: text,
        encoding_format: "float",
    });
    return embedding.data[0].embedding;
}

async function insertdb({ embedding, url, body = '', head }) {
    let collection;

    try {
        collection = await chromaClient.getCollection({
            name: WEB_COLLECTION,
        });
    } catch (error) {
        if (error instanceof ChromaUniqueError) {
            collection = await chromaClient.createCollection({
                name: WEB_COLLECTION,
            });
        } else {
            throw error;
        }
    }

    await collection.add({
        ids: [url],
        embeddings: [embedding],
        metadatas: [{ url, body, head }],
    });
}

async function ingest(url = '') {
    const { body, head, internalLinks } = await scapeWebPage(url);

    const headEmbedding = await getVectorEmbeding({ text: head });
    await insertdb({ embedding: headEmbedding, url });

    const bodyChunks = chunkText(body, 2000);
    for (const chunk of bodyChunks) {
        const bodyEmbedding = await getVectorEmbeding({ text: chunk });
        await insertdb({ embedding: bodyEmbedding, url, head, body: chunk });
    }

    for (const link of internalLinks) {
        const _url = `${url}${link}`;
        await ingest(_url);
    }
}

async function getReply(userQuery) {
    // Generate embedding for the user query
    const queryEmbedding = await getVectorEmbeding({ text: userQuery });

    // Fetch the collection from ChromaDB
    const collection = await chromaClient.getCollection({ name: WEB_COLLECTION });

    // Find the most similar documents
    const searchResults = await collection.query({
        query_embeddings: [queryEmbedding],
        n_results: 3, // Top 3 similar results
    });

    // Process the results
    const relevantDocuments = searchResults['metadatas'].map(result => {
        return {
            url: result.url,
            body: result.body,
            head: result.head
        };
    });

    if (relevantDocuments.length === 0) {
        return "Sorry, I couldn't find relevant information.";
    }

    // Combine the top results to create a response
    let response = "Here are some relevant results I found:\n";
    relevantDocuments.forEach(doc => {
        response += `URL: ${doc.url}\nHead: ${doc.head}\nBody: ${doc.body.slice(0, 300)}...\n\n`; // Short body preview
    });

    return response;
}

// Example of usage
ingest('https://www.piyushgarg.dev/').then(() => {
    getReply("Tell me about web scraping").then(response => {
        console.log(response);
    });
});
