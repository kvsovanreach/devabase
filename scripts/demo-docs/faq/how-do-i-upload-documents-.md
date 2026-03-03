# How do I upload documents?

**Q: How do I upload documents?**

A: There are multiple ways to upload documents:

1. **Dashboard**: Drag and drop files into a collection
2. **API**: POST to /v1/documents/upload with multipart form data
3. **SDK**: Use client.documents.upload()

Supported formats:
- PDF (.pdf)
- Markdown (.md)
- Plain text (.txt)
- HTML (.html)
- CSV (.csv)
- JSON (.json)
- Word documents (.docx)

Documents are automatically chunked, embedded, and indexed for search.