import { createClient, type DevabaseClient } from 'devabase-sdk';

const DEVABASE_URL = import.meta.env.VITE_DEVABASE_URL || 'http://localhost:9002';
const DEVABASE_API_KEY = import.meta.env.VITE_DEVABASE_API_KEY || '';

let _client: DevabaseClient | null = null;

export function getClient(): DevabaseClient {
  if (!_client) {
    _client = createClient({
      baseUrl: DEVABASE_URL,
      apiKey: DEVABASE_API_KEY,
    });
  }
  return _client;
}

export function resetClient(): void {
  _client = null;
}
