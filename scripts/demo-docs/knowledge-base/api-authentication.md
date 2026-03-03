# API Authentication Guide

This guide covers all authentication methods available in Devabase.

## Authentication Methods

### 1. JWT Token Authentication

Best for: User-facing applications

```bash
# Login
curl -X POST http://localhost:8080/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com", "password": "secret"}'
```

Response:
```json
{
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "user@example.com",
    "name": "John Doe"
  },
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIs..."
}
```

Using the token:
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
     -H "X-Project-ID: YOUR_PROJECT_ID" \
     http://localhost:8080/v1/collections
```

### 2. API Key Authentication

Best for: Server-to-server communication, CI/CD pipelines

Create an API key in the dashboard or via API:
```bash
curl -X POST http://localhost:8080/v1/keys \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "X-Project-ID: YOUR_PROJECT_ID" \
  -d '{"name": "Production API Key", "scopes": ["read", "write"]}'
```

Response:
```json
{
  "api_key": {
    "id": "...",
    "name": "Production API Key",
    "key_preview": "dvb_...abc"
  },
  "key": "dvb_live_a1b2c3d4e5f6..."  // Only shown once!
}
```

Using API key:
```bash
curl -H "Authorization: Bearer dvb_live_a1b2c3d4e5f6..." \
     -H "X-Project-ID: YOUR_PROJECT_ID" \
     http://localhost:8080/v1/collections
```

### 3. App User Authentication

Best for: End-users of your application

```typescript
// Register a user for your app
const auth = await client.appAuth.register({
  email: 'user@example.com',
  password: 'securePassword123',
  name: 'John Doe'
});

// Login
const auth = await client.appAuth.login({
  email: 'user@example.com',
  password: 'securePassword123'
});

// Use access token
client.appAuth.setToken(auth.access_token);
```

## Token Refresh

JWT tokens expire. Use refresh tokens to get new access tokens:

```bash
curl -X POST http://localhost:8080/v1/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refresh_token": "YOUR_REFRESH_TOKEN"}'
```

## API Key Scopes

| Scope | Description |
|-------|-------------|
| `read` | Read access to all resources |
| `write` | Write access to all resources |
| `admin` | Admin operations (team, settings) |
| `collections:read` | Read collections only |
| `collections:write` | Write collections only |
| `documents:read` | Read documents only |
| `documents:write` | Write documents only |
| `tables:read` | Read tables only |
| `tables:write` | Write tables only |

## Security Best Practices

1. **Never expose API keys in client-side code**
2. **Use environment variables** for sensitive credentials
3. **Rotate API keys** periodically
4. **Use scoped keys** with minimum required permissions
5. **Set key expiration** for temporary access
6. **Monitor key usage** in the dashboard
7. **Revoke compromised keys** immediately

## Rate Limiting

Default rate limits:
- 100 requests per minute per API key
- 1000 requests per minute per project

Headers returned:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1609459200
```

## Error Responses

| Status | Error | Description |
|--------|-------|-------------|
| 401 | Unauthorized | Missing or invalid token |
| 403 | Forbidden | Insufficient permissions |
| 429 | Rate Limited | Too many requests |

Example error response:
```json
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Invalid or expired token"
  }
}
```
