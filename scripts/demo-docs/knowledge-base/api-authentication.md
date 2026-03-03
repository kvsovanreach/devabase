# API Authentication

# API Authentication

Devabase uses JWT-based authentication for API access.

## Getting a Token

### Login
```bash
curl -X POST http://localhost:9002/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com", "password": "secret"}'
```

Response:
```json
{
  "user": { "id": "...", "email": "user@example.com" },
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "refresh_token": "..."
}
```

## Using the Token

Include the token in the Authorization header:
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
     -H "X-Project-ID: YOUR_PROJECT_ID" \
     http://localhost:9002/v1/collections
```

## API Keys

For production, use API keys instead of JWT tokens:
```bash
curl -H "Authorization: Bearer dvb_your_api_key" \
     -H "X-Project-ID: YOUR_PROJECT_ID" \
     http://localhost:9002/v1/collections
```

Create API keys in the dashboard under Project Settings > API Keys.