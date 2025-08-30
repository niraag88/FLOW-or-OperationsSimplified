# Replit Storage API Server

This Express.js server provides RESTful API endpoints for interacting with Replit Object Storage and PostgreSQL database, designed to integrate with the Base44 operations management suite.

**We use Replit App Storage via @replit/object-storage. Uppy in the React UI handles client-side file uploads.**

## Features

- ✅ **Object Storage Integration**: Full Replit Object Storage support with proxy-based signed URLs
- ✅ **Database Monitoring**: PostgreSQL size tracking and monitoring  
- ✅ **Secure File Operations**: Token-based file upload/download with expiration
- ✅ **Input Validation**: Strict validation for file paths, types, and sizes
- ✅ **Authentication**: Role-based access control for all storage operations
- ✅ **API Endpoints**: Complete REST API for storage operations
- ✅ **Error Handling**: Comprehensive error handling and logging

## Environment Variables

The following environment variables are automatically configured by Replit:

```bash
# Database Connection
DATABASE_URL=postgresql://...
PGDATABASE=...
PGHOST=...
PGPASSWORD=...
PGPORT=...
PGUSER=...

# Object Storage
DEFAULT_OBJECT_STORAGE_BUCKET_ID=replit-objstore-...
PRIVATE_OBJECT_DIR=/replit-objstore-.../private
PUBLIC_OBJECT_SEARCH_PATHS=/replit-objstore-.../public
```

## API Endpoints

### Health Check
```
GET /api/health
```
Returns server status and timestamp.

### Storage Operations

#### Get Upload Token (Requires Auth: Admin/Staff/Manager)
```
POST /api/storage/sign-upload
Content-Type: application/json

{
  "key": "invoices/invoice-123.pdf",
  "contentType": "application/pdf",
  "fileSize": 2048000,
  "checksum": "optional-md5-hash"
}
```

**Validation Rules:**
- Key must start with `invoices/` or `delivery/`
- Content type must be `application/pdf`
- File size must be ≤ 25 MB
- Staff/Manager can only upload to their own files (contains their user ID)

#### Upload File
```
PUT /api/storage/upload/{token}
Content-Type: application/octet-stream

[file data]
```

#### Get Download Token (Requires Auth: Admin only)
```
GET /api/storage/signed-get?key=invoices/invoice-123.pdf
```

#### Download File
```
GET /api/storage/download/{token}
```

#### List Objects (Requires Auth: Admin only)
```
GET /api/storage/list-prefix?prefix=invoices/
```

#### Get Total Storage Size (Requires Auth: Admin only)
```
GET /api/storage/total-size
```

#### Get Object Info (Requires Auth: Admin only)
```
GET /api/storage/object-info?key=invoices/invoice-123.pdf
```

#### Delete Object (Requires Auth: Admin only)
```
DELETE /api/storage/object?key=invoices/invoice-123.pdf
```

### Database Operations

#### Get Database Size
```
GET /api/db/size
```

Returns:
```json
{
  "bytes": 7528448,
  "pretty": "7352 kB"
}
```

## Security Features

- **Role-based Authentication**: All storage endpoints require authenticated sessions
  - **Admin**: Full access to all storage operations
  - **Staff/Manager**: Can upload files to their own invoices/delivery orders only
- **Token-based File Operations**: Secure signed tokens for upload/download operations
- **Token Expiration**: Upload tokens expire in 10 minutes, download tokens in 1 hour
- **Automatic Cleanup**: Expired tokens are automatically cleaned up every hour
- **Strict Input Validation**: 
  - File paths must start with `invoices/` or `delivery/`
  - Only PDF files allowed (`application/pdf`)
  - Maximum file size of 25 MB
  - Checksum validation when provided
- **File Size Enforcement**: Real-time validation against declared file sizes

## Integration with Base44 Suite

This server is designed to work with the Base44 operations management frontend, providing:

1. **Storage Monitoring**: Real-time tracking of Replit's three storage types:
   - SQL Database (10 GiB limit)
   - App Storage (pay-per-use)
   - Key-Value Store (50 MiB limit)

2. **File Operations**: Secure file upload/download for documents, images, and other assets

3. **Business Operations**: Backend support for customer management, project tracking, and financial data

## Development

The server runs on port 5000 (the only non-firewalled port on Replit) and serves both the API and static files.

```bash
# Start development server
npm run dev

# The server will be available at:
# - API: http://localhost:5000/api/*
# - Frontend: http://localhost:5000/
```

## Storage Architecture

The server implements a proxy pattern for Replit Object Storage since native signed URLs aren't supported:

1. **Upload Flow**: Client requests token → Server generates secure token → Client uploads via proxy endpoint → Server forwards to Replit storage
2. **Download Flow**: Client requests token → Server generates secure token → Client downloads via proxy endpoint → Server streams from Replit storage

This ensures secure access while maintaining compatibility with the Base44 frontend's expected API patterns.

## Error Handling

All endpoints include comprehensive error handling:
- **400**: Bad Request (missing parameters)
- **401**: Unauthorized (invalid/expired tokens)
- **404**: Not Found (object doesn't exist)
- **500**: Internal Server Error (storage/database issues)

Error responses include descriptive messages to help with debugging and integration.