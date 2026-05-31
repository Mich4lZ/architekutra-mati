# Model danych - TrackFlow

## Zasady

- Kazda tabela ma `id uuid` generowane przez aplikacje albo PostgreSQL `gen_random_uuid()`.
- Kazda tabela biznesowa ma `created_at timestamptz NOT NULL DEFAULT now()`.
- Soft delete jest wymagany dla `links`, bo usuniecie linku nie moze kasowac historii klikniec.
- Indeksy sa opisane w `docs/architecture/ARCHITECTURE.md` sekcja 8.

## Tabela: users

| Kolumna | Typ | Ograniczenia | Opis |
|---------|-----|--------------|------|
| id | uuid | PK | Id uzytkownika. |
| email | text | UNIQUE, NOT NULL | Email logowania. |
| password_hash | text | NOT NULL | Hash hasla. |
| role | text | NOT NULL, CHECK role IN ('marketer','client') | Rola systemowa. |
| client_id | uuid | NULL, FK -> clients.id | Wypelnione dla uzytkownikow typu client. |
| created_at | timestamptz | NOT NULL DEFAULT now() | Data utworzenia. |

## Tabela: clients

| Kolumna | Typ | Ograniczenia | Opis |
|---------|-----|--------------|------|
| id | uuid | PK | Id klienta agencji. |
| name | text | NOT NULL | Nazwa firmy klienta. |
| contact_email | text | NOT NULL | Email do raportow tygodniowych. |
| created_at | timestamptz | NOT NULL DEFAULT now() | Data utworzenia. |

## Tabela: links

| Kolumna | Typ | Ograniczenia | Opis |
|---------|-----|--------------|------|
| id | uuid | PK | Id linku. |
| short_code | text | UNIQUE, NOT NULL, CHECK length(short_code) BETWEEN 5 AND 12 | Kod np. xK9mP. Domyslnie base62 6 znakow. |
| original_url | text | NOT NULL | Docelowy URL. |
| campaign_name | text | NULL | Nazwa kampanii. |
| client_id | uuid | NOT NULL, FK -> clients.id | Klient agencji, do ktorego nalezy link. |
| created_by | uuid | NOT NULL, FK -> users.id | Marketer tworzacy link. |
| active | boolean | NOT NULL DEFAULT true | Czy link moze redirectowac. |
| expires_at | timestamptz | NULL | NULL = nie wygasa; maksymalnie 365 dni od utworzenia. |
| created_at | timestamptz | NOT NULL DEFAULT now() | Data utworzenia. |
| updated_at | timestamptz | NOT NULL DEFAULT now() | Data aktualizacji. |
| deleted_at | timestamptz | NULL | Soft delete. |

## Tabela: clicks

| Kolumna | Typ | Ograniczenia | Opis |
|---------|-----|--------------|------|
| id | uuid | PK | Id klikniecia. |
| link_id | uuid | NOT NULL, FK -> links.id | Link, ktory kliknieto. |
| event_id | uuid | UNIQUE, NOT NULL | Idempotency key z eventu. |
| clicked_at | timestamptz | NOT NULL | Czas klikniecia z eventu. |
| country | text | NULL | Kod kraju z geolokalizacji. |
| city | text | NULL | Miasto z geolokalizacji. |
| device_type | text | NULL, CHECK device_type IN ('mobile','desktop','tablet') | Typ urzadzenia. |
| browser | text | NULL | Przegladarka z UA. |
| os | text | NULL | System operacyjny z UA. |
| referrer | text | NULL | Header Referer. |
| ip_hash | text | NULL | SHA-256 z IP + salt, bez przechowywania IP. |
| created_at | timestamptz | NOT NULL DEFAULT now() | Data zapisu w DB. |

## Tabela: reports

| Kolumna | Typ | Ograniczenia | Opis |
|---------|-----|--------------|------|
| id | uuid | PK | Id raportu. |
| status | text | NOT NULL, CHECK status IN ('pending','processing','done','failed') | Status generowania. |
| requested_by | uuid | NOT NULL, FK -> users.id | Uzytkownik lub systemowy marketer. |
| client_id | uuid | NULL, FK -> clients.id | Klient raportu, jesli dotyczy. |
| date_from | timestamptz | NOT NULL | Poczatek zakresu raportu. |
| date_to | timestamptz | NOT NULL | Koniec zakresu raportu. |
| link_ids | uuid[] | NULL | NULL = wszystkie linki klienta/uzytkownika w zakresie. |
| kind | text | NOT NULL, CHECK kind IN ('manual','weekly') | Typ raportu. |
| file_path | text | NULL | Sciezka do PDF gdy gotowy. |
| error_message | text | NULL | Blad generowania. |
| created_at | timestamptz | NOT NULL DEFAULT now() | Data utworzenia. |
| completed_at | timestamptz | NULL | Data zakonczenia. |

## Tabela: notification_logs

| Kolumna | Typ | Ograniczenia | Opis |
|---------|-----|--------------|------|
| id | uuid | PK | Id wpisu. |
| type | text | NOT NULL, CHECK type IN ('report_ready','alert_no_clicks','weekly_report') | Typ powiadomienia. |
| recipient_email | text | NOT NULL | Odbiorca. |
| link_id | uuid | NULL, FK -> links.id | Link dla alertu. |
| report_id | uuid | NULL, FK -> reports.id | Raport dla maila. |
| period_key | text | NOT NULL | Klucz dedupe, np. `2026-05-25` albo `link:{id}:2026-05-25T10`. |
| sent_at | timestamptz | NULL | Kiedy wyslano. |
| created_at | timestamptz | NOT NULL DEFAULT now() | Data utworzenia. |

Unique constraint: `(type, recipient_email, coalesce(link_id,'00000000-0000-0000-0000-000000000000'), period_key)` implementowany jako indeks funkcyjny w migracji albo przez dodatkowy `dedupe_key text UNIQUE`.

## Relacje

```
clients   1--* users       (klient agencji moze miec wielu uzytkownikow readonly)
clients   1--* links       (klient agencji ma wiele linkow)
users     1--* links       (marketer tworzy wiele linkow)
links     1--* clicks      (link ma wiele klikniec)
users     1--* reports     (marketer zleca wiele raportow)
clients   1--* reports     (raport moze dotyczyc klienta)
reports   1--* notification_logs
links     1--* notification_logs
```

## Co NIE idzie do PostgreSQL

| Co | Gdzie | Dlaczego nie w PG |
|----|-------|-------------------|
| Cache redirectu (short_code -> URL) | Redis | Musi byc bardzo szybki i latwo wygasac. |
| Surowy adres IP | Nie przechowujemy; tylko event chwilowo w RabbitMQ, potem hash | Minimalizacja danych osobowych. |
| Surowy User-Agent | RabbitMQ event, potem tylko sparsowane pola | Do statystyk wystarcza device/browser/os. |
| Pliki PDF | Filesystem volume `PDF_STORAGE_PATH` | Pliki nie powinny powiekszac bazy danych. |
| Wiadomosci oczekujace/retry | RabbitMQ | Broker odpowiada za ACK/NACK, retry i DLQ. |
