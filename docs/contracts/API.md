# Kontrakt REST API - TrackFlow

## Konwencje

```
Autentykacja:  Bearer JWT w headerze Authorization
Format:        JSON
Bledy:         { "code": "ERROR_CODE", "message": "opis" }
Paginacja:     ?page=1&limit=20 -> { data: [], total: N, page: N }
Daty:          ISO 8601 UTC
```

## AUTH

### POST /auth/login

**Request:**
```json
{ "email": "string", "password": "string" }
```

**Response 200:**
```json
{ "token": "JWT", "user": { "id": "uuid", "email": "string", "role": "marketer|client", "client_id": "uuid|null" } }
```

**Response 401:** `{ "code": "INVALID_CREDENTIALS", "message": "Invalid email or password" }`

## REDIRECT

### GET /:short_code

Krytyczny endpoint - musi odpowiedziec w < 80ms. Publikuje event klikniecia do kolejki asynchronicznie po przygotowaniu odpowiedzi 302.

**Auth:** Brak, publiczny.

**Response 302:** Header `Location: <original_url>`

**Response 404:** `{ "code": "LINK_NOT_FOUND", "message": "Link not found" }`

Link wygasly, nieaktywny lub usuniety zwraca 404.

## CLIENTS

### GET /api/clients

**Auth:** Marketer

**Query params:** `page`, `limit`, `search`

**Response 200:**
```json
{
  "data": [{ "id": "uuid", "name": "Acme", "contact_email": "client@example.com", "created_at": "ISO8601" }],
  "total": 1,
  "page": 1
}
```

### POST /api/clients

**Auth:** Marketer

**Request:**
```json
{ "name": "string", "contact_email": "string" }
```

**Response 201:**
```json
{ "id": "uuid", "name": "string", "contact_email": "string", "created_at": "ISO8601" }
```

## LINKS

### GET /api/links

**Auth:** Marketer

**Query params:** `page`, `limit`, `client_id`, `campaign_name`, `active`

**Response 200:**
```json
{
  "data": [
    {
      "id": "uuid",
      "short_code": "xK9mP1",
      "original_url": "https://example.com",
      "campaign_name": "Spring 2026",
      "client_id": "uuid",
      "created_by": "uuid",
      "active": true,
      "expires_at": "ISO8601|null",
      "created_at": "ISO8601",
      "updated_at": "ISO8601"
    }
  ],
  "total": 42,
  "page": 1
}
```

### POST /api/links

**Auth:** Marketer

**Request:**
```json
{
  "original_url": "string URL",
  "client_id": "uuid",
  "campaign_name": "string|null",
  "expires_at": "ISO8601|null"
}
```

`expires_at` nie moze byc pozniej niz 365 dni od utworzenia. `short_code` generuje system.

**Response 201:**
```json
{
  "id": "uuid",
  "short_code": "xK9mP1",
  "original_url": "https://example.com",
  "campaign_name": "Spring 2026",
  "client_id": "uuid",
  "created_by": "uuid",
  "active": true,
  "expires_at": "ISO8601|null",
  "created_at": "ISO8601",
  "updated_at": "ISO8601"
}
```

**Response 400:** `{ "code": "VALIDATION_ERROR", "message": "..." }`

### GET /api/links/:id

**Auth:** Marketer albo Client przypisany do linku przez `client_id`.

**Response 200:** pelny obiekt linku jak w `POST /api/links`.

**Response 404:** `{ "code": "LINK_NOT_FOUND", "message": "Link not found" }`

### DELETE /api/links/:id

**Auth:** Marketer

Soft delete: ustawia `deleted_at`, `active=false`, usuwa cache Redis.

**Response 204:** Brak body.

## STATYSTYKI

### GET /api/links/:id/stats

**Auth:** Marketer albo Client przypisany do linku przez `client_id`.

**Query params:**
```
period:    "hour" | "day" | "week"
date_from: ISO 8601 (opcjonalny)
date_to:   ISO 8601 (opcjonalny)
```

**Response 200:**
```json
{
  "total_clicks": 1234,
  "unique_clicks": 890,
  "clicks_over_time": [{ "timestamp": "ISO8601", "count": 45 }],
  "by_country": [{ "country": "PL", "count": 500 }],
  "by_device": [{ "device_type": "mobile", "count": 700 }],
  "by_referrer": [{ "referrer": "instagram.com", "count": 300 }]
}
```

`unique_clicks` liczone jako `COUNT(DISTINCT ip_hash)` z pomijaniem null.

## RAPORTY

### POST /api/reports

Async - zwraca 202 natychmiast. PDF generuje sie w tle.

**Auth:** Marketer

**Request:**
```json
{
  "client_id": "uuid|null",
  "link_ids": ["uuid"],
  "date_from": "ISO8601",
  "date_to": "ISO8601"
}
```

`link_ids` moze byc puste albo pominiete - wtedy raport obejmuje wszystkie linki `client_id` albo wszystkie linki marketera w zakresie.

**Response 202:**
```json
{ "report_id": "uuid", "status": "pending" }
```

### GET /api/reports

**Auth:** Marketer

**Query params:** `page`, `limit`, `status`, `client_id`

**Response 200:**
```json
{
  "data": [
    {
      "id": "uuid",
      "status": "pending|processing|done|failed",
      "client_id": "uuid|null",
      "date_from": "ISO8601",
      "date_to": "ISO8601",
      "download_url": "string|null",
      "error_message": "string|null",
      "created_at": "ISO8601",
      "completed_at": "ISO8601|null"
    }
  ],
  "total": 1,
  "page": 1
}
```

### GET /api/reports/:id

**Auth:** Marketer

**Response 200:**
```json
{
  "id": "uuid",
  "status": "pending|processing|done|failed",
  "download_url": "string|null",
  "error_message": "string|null",
  "created_at": "ISO8601",
  "completed_at": "ISO8601|null"
}
```

Frontend polluje co 3 sekundy gdy status != done.

### GET /api/reports/:id/download

**Auth:** Marketer

**Response 200:** `application/pdf`

**Response 404:** raport nie istnieje albo PDF nie jest gotowy.

## HEALTH

### GET /health

**Auth:** Brak

**Response 200:** `{ "status": "ok" }`
