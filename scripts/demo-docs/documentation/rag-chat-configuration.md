# RAG Chat Configuration

# Configuring RAG Chat

RAG (Retrieval-Augmented Generation) allows you to chat with your documents using AI.

## Enabling RAG

1. Navigate to your collection in the dashboard
2. Click "Settings" or the gear icon
3. Toggle "Enable RAG"
4. Select your LLM provider and model
5. Customize the system prompt (optional)

## API Usage

```typescript
// Single message
const response = await client.chat.send({
  collection: 'my-docs',
  message: 'What is the authentication flow?',
  include_sources: true
});

console.log(response.message);
console.log(response.sources);
```

## Streaming Responses

```typescript
await client.chat.stream({
  collection: 'my-docs',
  message: 'Explain the architecture',
  onChunk: (chunk) => process.stdout.write(chunk),
  onComplete: (response) => {
    console.log('\nSources:', response.sources);
  }
});
```

## Multi-turn Conversations

```typescript
const response1 = await client.chat.send({
  collection: 'my-docs',
  message: 'What is authentication?'
});

const response2 = await client.chat.continue(
  response1.conversation_id,
  'How do I implement it?'
);
```

## Configuration Options

| Option | Description | Default |
|--------|-------------|---------|
| temperature | Creativity (0-2) | 0.7 |
| max_tokens | Max response length | 1000 |
| top_k | Documents to retrieve | 5 |
| system_prompt | Custom instructions | Default RAG prompt |