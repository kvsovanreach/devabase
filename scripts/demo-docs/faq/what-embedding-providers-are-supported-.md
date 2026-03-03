# What embedding providers are supported?

**Q: What embedding providers are supported?**

A: Devabase supports multiple embedding providers:

| Provider | Models | Dimensions |
|----------|--------|------------|
| OpenAI | text-embedding-3-small, text-embedding-3-large | 1536, 3072 |
| Cohere | embed-english-v3.0, embed-multilingual-v3.0 | 1024 |
| Voyage | voyage-large-2, voyage-code-2 | 1536 |
| Custom | Any OpenAI-compatible API (Ollama, etc.) | Configurable |

Configure your provider in Project Settings > Providers.