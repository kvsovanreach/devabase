# Configuring RAG Chat

RAG (Retrieval-Augmented Generation) allows you to chat with your documents using AI.

## Enabling RAG on a Collection

### Via Dashboard

1. Navigate to your collection
2. Click "Settings" or the gear icon
3. Toggle "Enable RAG"
4. Select your LLM provider and model
5. Customize the system prompt (optional)
6. Save changes

### Via API

```bash
curl -X PATCH http://localhost:8080/v1/collections/my-docs \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Project-ID: $PROJECT_ID" \
  -d '{
    "rag_enabled": true,
    "rag_config": {
      "llm_provider_id": "your-provider-id",
      "model": "gpt-4o",
      "temperature": 0.7,
      "max_tokens": 1000,
      "top_k": 5
    }
  }'
```

## Chat API Usage

### Single Message

```typescript
const response = await client.chat.send({
  collection: 'my-docs',
  message: 'What is the authentication flow?',
  include_sources: true
});

console.log(response.message);
console.log(response.sources);
```

### Streaming Responses

For real-time streaming:

```typescript
await client.chat.stream({
  collection: 'my-docs',
  message: 'Explain the architecture in detail',
  onChunk: (chunk) => process.stdout.write(chunk),
  onComplete: (response) => {
    console.log('\nSources:', response.sources);
  }
});
```

### Multi-turn Conversations

Maintain context across messages:

```typescript
// First message
const response1 = await client.chat.send({
  collection: 'my-docs',
  message: 'What is authentication?'
});

// Follow-up using conversation ID
const response2 = await client.chat.continue(
  response1.conversation_id,
  'How do I implement it in my app?'
);

// Continue the conversation
const response3 = await client.chat.continue(
  response1.conversation_id,
  'What about OAuth2?'
);
```

## Configuration Options

| Option | Description | Default |
|--------|-------------|---------|
| `temperature` | Creativity level (0-2) | 0.7 |
| `max_tokens` | Maximum response length | 1000 |
| `top_k` | Number of documents to retrieve | 5 |
| `system_prompt` | Custom system instructions | Default RAG prompt |

## Custom System Prompts

Customize how the AI responds:

```typescript
const response = await client.chat.send({
  collection: 'support-docs',
  message: 'How do I reset my password?',
  system_prompt: `You are a helpful customer support agent.
Answer questions based on the provided documentation.
Be concise and friendly. If you don't know, say so.`
});
```

## Multi-Collection Chat

Chat across multiple knowledge bases:

```typescript
const response = await client.chat.send({
  collections: ['docs', 'faq', 'tutorials'],
  message: 'How do I get started?'
});
```

## Best Practices

1. **Chunk Size**: Use 400-600 tokens for optimal retrieval
2. **Overlap**: Set 50-100 token overlap between chunks
3. **Reranking**: Enable for better relevance
4. **Temperature**: Use 0.3-0.5 for factual responses, 0.7-1.0 for creative
5. **Context Limit**: Be mindful of LLM context windows
