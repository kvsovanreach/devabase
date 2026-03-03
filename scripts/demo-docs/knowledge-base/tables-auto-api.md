# Tables & Auto-API Guide

Create PostgreSQL tables and get instant REST endpoints automatically.

## Creating Tables

### Via SDK

```typescript
const table = await client.tables.create({
  name: 'customers',
  columns: [
    { name: 'id', type: 'uuid', primary: true, default: 'gen_random_uuid()' },
    { name: 'email', type: 'text', nullable: false, unique: true },
    { name: 'name', type: 'text', nullable: false },
    { name: 'company', type: 'text' },
    { name: 'plan', type: 'text', default: "'free'" },
    { name: 'created_at', type: 'timestamptz', default: 'now()' }
  ]
});
```

### Via API

```bash
curl -X POST http://localhost:9002/v1/tables \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Project-ID: $PROJECT_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "customers",
    "columns": [
      {"name": "id", "type": "uuid", "primary": true, "default": "gen_random_uuid()"},
      {"name": "email", "type": "text", "nullable": false, "unique": true},
      {"name": "name", "type": "text", "nullable": false}
    ]
  }'
```

## Column Types

| Type | PostgreSQL | Description |
|------|------------|-------------|
| `uuid` | UUID | Unique identifier |
| `text` | TEXT | Variable-length string |
| `integer` / `int` | INTEGER | 32-bit integer |
| `bigint` | BIGINT | 64-bit integer |
| `numeric` | NUMERIC | Arbitrary precision number |
| `boolean` / `bool` | BOOLEAN | True/false |
| `timestamp` | TIMESTAMP | Date and time |
| `timestamptz` | TIMESTAMPTZ | Date and time with timezone |
| `date` | DATE | Date only |
| `json` | JSON | JSON data |
| `jsonb` | JSONB | Binary JSON (indexed) |

## CRUD Operations

### Create (Insert)

```typescript
const customer = await client.tables.rows('customers').insert({
  email: 'alice@example.com',
  name: 'Alice Johnson',
  company: 'TechCorp',
  plan: 'pro'
});
```

### Read (Query)

```typescript
// Get all with pagination
const result = await client.tables.rows('customers').query({
  page: 1,
  per_page: 20,
  order: 'created_at:desc'
});

// Filter results
const proCustomers = await client.tables.rows('customers').query({
  filter: 'plan.eq=pro'
});

// Multiple filters
const result = await client.tables.rows('customers').query({
  filter: 'plan.eq=pro&company.like=Tech'
});
```

### Update

```typescript
await client.tables.rows('customers').update(customerId, {
  plan: 'enterprise'
});
```

### Delete

```typescript
await client.tables.rows('customers').delete(customerId);
```

## Filter Operators

| Operator | Description | Example |
|----------|-------------|---------|
| `eq` | Equal | `status.eq=active` |
| `neq` | Not equal | `status.neq=deleted` |
| `gt` | Greater than | `age.gt=18` |
| `gte` | Greater or equal | `price.gte=100` |
| `lt` | Less than | `quantity.lt=10` |
| `lte` | Less or equal | `rating.lte=5` |
| `like` | Contains (case-insensitive) | `name.like=john` |
| `is` | Is null/true/false | `deleted_at.is=null` |

## Sorting

```typescript
// Single column
const result = await client.tables.rows('customers').query({
  order: 'created_at:desc'
});

// Multiple columns
const result = await client.tables.rows('customers').query({
  order: 'plan:asc,created_at:desc'
});
```

## Pagination

### Offset-based

```typescript
const page1 = await client.tables.rows('customers').query({
  page: 1,
  per_page: 20
});

console.log(page1.pagination);
// {
//   total: 150,
//   count: 20,
//   page: 1,
//   total_pages: 8,
//   has_next: true,
//   has_previous: false
// }
```

### Cursor-based

```typescript
const page1 = await client.tables.rows('customers').query({
  limit: 20
});

const page2 = await client.tables.rows('customers').query({
  cursor: page1.pagination.next_cursor
});
```

## Import & Export

### Import CSV

```bash
curl -X POST http://localhost:9002/v1/tables/customers/import \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@customers.csv"
```

### Export

```bash
# CSV
curl http://localhost:9002/v1/tables/customers/export?format=csv \
  -H "Authorization: Bearer $TOKEN" \
  -o customers.csv

# JSON
curl http://localhost:9002/v1/tables/customers/export?format=json \
  -H "Authorization: Bearer $TOKEN" \
  -o customers.json
```

## SQL Editor

For complex queries, use the SQL Editor in the dashboard or the SQL API:

```bash
curl -X POST http://localhost:9002/v1/sql \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Project-ID: $PROJECT_ID" \
  -d '{
    "query": "SELECT plan, COUNT(*) as count FROM customers GROUP BY plan"
  }'
```

## Foreign Keys

Create relationships between tables:

```typescript
await client.tables.create({
  name: 'orders',
  columns: [
    { name: 'id', type: 'uuid', primary: true },
    { name: 'customer_id', type: 'uuid', references_table: 'customers', references_column: 'id', on_delete: 'CASCADE' },
    { name: 'total', type: 'numeric' }
  ]
});
```
