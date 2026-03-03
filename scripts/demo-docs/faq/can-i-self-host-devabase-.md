# Can I self-host Devabase?

**Q: Can I self-host Devabase?**

A: Yes! Devabase is fully open-source and designed for self-hosting.

Requirements:
- PostgreSQL 16+ with pgvector extension
- 2GB RAM minimum (4GB+ recommended)
- Docker (optional but recommended)

Quick start with Docker:
```bash
git clone https://github.com/kvsovanreach/devabase.git
cd devabase
docker compose up -d
```

Or run from source:
```bash
cargo run --release -- serve
```

All data stays on your infrastructure. No external dependencies required (except for AI providers if using cloud APIs).