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

# Security Configuration
SESSION_SECRET=your-secure-session-secret
SESSION_MAX_AGE=3600000  # Session timeout in ms (default: 1 hour)
NODE_ENV=production      # Enables secure cookies in production
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

### Document Management

#### Delete Invoice (Requires Auth: Admin only)
```
DELETE /api/invoices/:id
```

**Retention Policy Checks:**
- ❌ 403 if `legal_hold = true`
- ❌ 403 if `created_at + 5 years > now()`
- ✅ Allowed after 5-year retention period expires

#### Delete Delivery Order (Requires Auth: Admin only)  
```
DELETE /api/delivery-orders/:id
```

Same retention policy as invoices.

### Backup Operations

#### Trigger Manual Backup (Requires Auth: Admin + OPS_TOKEN)
```
POST /api/ops/run-backups
X-OPS-Token: {your-ops-token}
```

#### Get Backup Status (Requires Auth: Admin only)
```
GET /api/ops/backup-status
```

Returns:
```json
{
  "latestDbBackup": {
    "filename": "db-20250830.sql.gz",
    "size": 1024000,
    "timestamp": "2025-08-30T02:00:00Z"
  },
  "latestManifestBackup": {
    "filename": "manifest-20250830.json", 
    "size": 2048,
    "timestamp": "2025-08-30T02:01:00Z"
  }
}
```

## Security Features

### Hardened Session Cookies

Session cookies are configured with enterprise-grade security:

- **httpOnly: true** - Prevents JavaScript access to cookies, protecting against XSS attacks
- **secure: true** - Cookies only sent over HTTPS in production (auto-detected by NODE_ENV)
- **sameSite: 'lax'** - CSRF protection while maintaining usability
- **Configurable maxAge** - Default 1 hour session timeout (set via `SESSION_MAX_AGE` environment variable)

### Role-Based Access Control

The system implements strict role-based authorization with three user levels:

#### Admin
- Full system access and can override any role restriction
- User management (create, read, update, delete users)
- System settings and configuration
- Storage management and file deletion
- All business operations

#### Manager  
- Business operations (products, suppliers, customers, purchase orders)
- File uploads (limited to own files for Staff-level operations)
- Read access to most data

#### Staff
- Limited business operations
- File uploads (restricted to own files only)
- Read access to assigned data

### Authentication Middleware

Two authentication middleware functions provide layered security:

1. **requireAuth(roles[])** - Flexible multi-role authorization
2. **requireRole(role)** - Strict single-role enforcement (Admin always passes)

### File Upload Security

- **Magic-byte Validation**: PDF uploads validated with actual file signature ("%PDF")
- **Role-based Authentication**: All storage endpoints require authenticated sessions
  - **Admin**: Full access to all storage operations
  - **Staff/Manager**: Can upload files to their own invoices/delivery orders only
- **Token-based File Operations**: Secure signed tokens for upload/download operations
- **Token Expiration**: Upload tokens expire in 10 minutes, download tokens in 1 hour
- **Automatic Cleanup**: Expired tokens are automatically cleaned up every hour
- **Strict Input Validation**: 
  - File paths must start with `invoices/` or `delivery/`
  - Only PDF files allowed (`application/pdf`)
  - Magic-byte validation prevents malicious files disguised as PDFs
  - Maximum file size of 25 MB
  - Checksum validation when provided
- **File Size Enforcement**: Real-time validation against declared file sizes

## Document Retention & Compliance

**All invoice/DO scans retained for 5 years minimum. Backups run nightly at 02:00. Admin can trigger manually via /api/ops/run-backups.**

### Retention Policy
- **5-Year Minimum**: Invoice and delivery order documents cannot be deleted until 5 years after creation
- **Legal Hold**: Documents under legal hold cannot be deleted regardless of age
- **Admin Only**: Only Admin users can delete documents (after retention period expires)
- **Audit Trail**: All deletions are logged with timestamp, actor, and affected files

### Backup System
- **Database Backups**: Automated pg_dump compressed and stored to `backups/db/`
- **Object Manifest**: Daily inventory of all stored files in `backups/objects/`
- **Manual Triggers**: Admin can trigger backups via API with OPS_TOKEN
- **Status Monitoring**: Latest backup timestamps and sizes available in Settings

## Integration with Base44 Suite

This server is designed to work with the Base44 operations management frontend, providing:

1. **Storage Monitoring**: Real-time tracking of Replit's three storage types:
   - SQL Database (10 GiB limit)
   - App Storage (pay-per-use)
   - Key-Value Store (50 MiB limit)

2. **File Operations**: Secure file upload/download for documents, images, and other assets

3. **Business Operations**: Backend support for customer management, project tracking, and financial data

4. **Compliance Features**: 5-year retention policy, legal hold, and comprehensive audit logging

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