# Table Auto-API

# Table Auto-API

Create PostgreSQL tables and get instant REST endpoints.

## Creating a Table

```typescript
const table = await client.tables.create({
  name: 'users',
  columns: [
    { name: 'id', type: 'uuid', primary: true },
    { name: 'email', type: 'text', unique: true },
    { name: 'name', type: 'text' },
    { name: 'created_at', type: 'timestamptz', default: 'now()' }
  ]
});
```

## CRUD Operations

```typescript
// Create
const user = await client.tables.rows('users').insert({
  email: 'user@example.com',
  name: 'John Doe'
});

// Read with filtering
const result = await client.tables.rows('users').query({
  filter: 'name.like=John',
  order: 'created_at:desc',
  limit: 10
});

// Update
await client.tables.rows('users').update(userId, {
  name: 'Jane Doe'
});

// Delete
await client.tables.rows('users').delete(userId);
```

## Filter Operators

| Operator | Description | Example |
|----------|-------------|---------|
| eq | Equal | status.eq=active |
| neq | Not equal | status.neq=deleted |
| gt | Greater than | age.gt=18 |
| gte | Greater or equal | age.gte=18 |
| lt | Less than | price.lt=100 |
| lte | Less or equal | price.lte=100 |
| like | Contains | name.like=john |
| is | Is null/true/false | deleted_at.is=null |