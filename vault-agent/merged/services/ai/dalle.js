'use strict';

const OpenAI = require('openai');
const logger = require('../../lib/logger');

let client = null;
function getClient() {
  if (!client) {
    if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY not set');
    client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return client;
}

async function generateImage({ prompt, size = '1024x1024', quality = 'standard', n = 1 }) {
  logger.info('DALL-E image generation', { prompt: prompt.slice(0, 80), size, quality });
  const response = await getClient().images.generate({
    model: 'dall-e-3',
    prompt,
    n,
    size,
    quality,
    response_format: 'url',
  });
  return response.data.map(img => ({
    url: img.url,
    revisedPrompt: img.revised_prompt,
  }));
}

async function editImage({ imageBuffer, maskBuffer, prompt, size = '1024x1024', n = 1 }) {
  const response = await getClient().images.edit({
    image: imageBuffer,
    mask: maskBuffer,
    prompt,
    n,
    size,
    response_format: 'url',
  });
  return response.data.map(img => ({ url: img.url }));
}

module.exports = { generateImage, editImage };
