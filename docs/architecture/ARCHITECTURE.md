# Architektura systemu - TrackFlow

## 1. Back-of-envelope math

Dane z briefu: 200 000 klikniec/miesiac dzis -> 2 000 000 za rok.

```
Klikniec / dzien (dzis):           ~6 667
Klikniec / sekundę (dzis):         ~0.08 srednio
Klikniec / dzien (za rok):         ~66 667
Klikniec / sekundę (za rok):       ~0.77 srednio
Rekordow w tabeli clicks po roku:  ~24 000 000 przy 2 mln/miesiac
Szacowana wielkosc tabeli clicks:  ~8-15 GB z indeksami
Raporty PDF / tydzien:             ~40 dzis, ~200 za rok + raporty na zadanie
```

Wnioski:

```
Bottleneck #1 to redirect poniewaz kazde klikniecie przechodzi przez ten endpoint.
Bottleneck #2 to zapytania statystyk poniewaz tabela clicks rosnie do milionow rekordow.
Redirect NIE moze isc zawsze do bazy poniewaz DB latency i locki moga zlamac limit 80ms.
Cache jest potrzebny dla redirectu i trzymam w nim short_code -> link_id/original_url/expires_at.
Zapis klikniecia jest asynchroniczny poniewaz UA parsing, geo i INSERT nie moga blokowac 302.
```

Sredni ruch jest maly, ale architektura zaklada piki kampanijne. Krytyczna sciezka redirectu ma byc O(1), bez geolokalizacji i bez synchronicznego zapisu klikniecia.

## 2. C1 - Context Diagram

```
[Marketer] --tworzy linki, oglada statystyki, generuje PDF--> [TRACKFLOW]
[Klient agencji] --czyta swoje statystyki i raporty--> [TRACKFLOW]
[Osoba klikajaca] --GET /:short_code--> [TRACKFLOW] --302--> [Docelowy URL]
[TRACKFLOW] --wysyla e-mail--> [SMTP/Mailhog]
[TRACKFLOW] --lokalna baza GeoIP--> [Biblioteka GeoIP]
```

| Element | Typ | Co robi |
|---------|-----|---------|
| Marketer | Aktor | Zarzadza linkami, kampaniami, raportami i statystykami. |
| Klient agencji | Aktor | Ma dostep tylko do odczytu statystyk przypisanych do swojej firmy. |
| Osoba klikajaca | Aktor | Uzywa krotkiego linku i otrzymuje przekierowanie. |
| Biblioteka GeoIP | System zewnetrzny/lokalna baza | Zamienia IP na kraj i miasto w workerze. |
| SMTP/Mailhog | System zewnetrzny | Wysyla raporty i alerty e-mail. |

## 3. C2 - Container Diagram

| Kontener | Technologia | Odpowiedzialnosc |
|----------|-------------|------------------|
| frontend | React + Vite + Tailwind | UI logowania, dashboardu, linkow, statystyk i raportow. |
| api | Node.js + TypeScript + Fastify + Prisma | REST API, JWT, redirect, publisher eventow. |
| worker | Node.js + TypeScript + Prisma | Consumery RabbitMQ, crony, PDF, e-mail, geo/UA processing. |
| postgres | PostgreSQL 16 | Trwale dane: users, clients, links, clicks, reports, notification_logs. |
| redis | Redis 7 | Cache redirectu short_code -> metadata linku. |
| rabbitmq | RabbitMQ 3 Management | Kolejki eventow, retry, DLQ, at-least-once delivery. |
| mailhog | Mailhog | Lokalny SMTP i UI do testow maili. |

```
[Browser] --HTTP--> [frontend]
[frontend] --HTTP JSON Bearer JWT--> [api]
[Clicker] --HTTP GET /:short_code--> [api]
[api] --SQL/TCP--> [postgres]
[api] --RESP/TCP--> [redis]
[api] --AMQP/TCP publish--> [rabbitmq]
[worker] --AMQP/TCP consume/publish--> [rabbitmq]
[worker] --SQL/TCP--> [postgres]
[worker] --SMTP--> [mailhog]
[worker] --filesystem volume--> [reports PDFs]
```

Dlaczego Worker jest osobnym kontenerem?

Worker wykonuje wolniejsze i awaryjne zadania: UA parsing, geo, PDF, e-mail, crony i retry. Oddzielenie go chroni API i redirect przed blokowaniem CPU/I/O oraz pozwala skalowac workery niezaleznie.

Dlaczego klikniecie nie idzie od razu do bazy?

Wymaganie redirectu < 80ms jest wazniejsze niz natychmiastowy zapis. Klikniecie trafia do RabbitMQ, a worker zapisuje je w tle z gwarancja at-least-once i idempotencja po event_id.

Co trzymasz w cache i dlaczego?

Redis przechowuje aktywne mapowanie `short_code -> { link_id, original_url, expires_at }`, aby najczestszy redirect nie wymagal zapytania do PostgreSQL. TTL cache nie przekracza czasu wygasniecia linku.

## 4. Przeplyw - Redirect (< 80ms)

| Krok | Opis | Czas (ms) |
|------|------|-----------|
| 1 | Fastify routing + walidacja short_code | ~1 |
| 2 | Redis GET `redirect:{short_code}` | ~1-3 |
| 3 | Jesli hit: sprawdzenie expires_at i przygotowanie 302 | ~1 |
| 4 | Wyslanie odpowiedzi 302 Location | ~1-5 |
| 5 | Po odpowiedzi: publish `click.recorded` do RabbitMQ bez blokowania 302 | poza sciezka 302 |
| **Suma cache hit** | | **~4-10ms + siec** |

```
Co przy cache miss:      API czyta link z PostgreSQL, sprawdza aktywnosc/wygasniecie, zapisuje Redis z TTL i zwraca 302.
Co gdy Redis jest down:  API robi fallback do PostgreSQL, loguje blad cache, nadal probuje zwrocic 302; metryka/alert wymagane.
```

Cache miss moze byc wolniejszy, ale nadal powinien miescic sie w 80ms przy lokalnym PostgreSQL i indeksie `links.short_code`. Publish eventu nie moze byc awaitowany przed wyslaniem redirectu.

## 5. Przeplyw - Przetwarzanie klikniecia (max 5s)

| Krok | Opis | Kto |
|------|------|-----|
| 1 | API publikuje envelope `click.recorded` do RabbitMQ | API |
| 2 | Worker pobiera event z `trackflow.clicks` | Worker |
| 3 | Worker sprawdza czy `clicks.event_id` juz istnieje | Worker/PostgreSQL |
| 4 | Worker parsuje UA, liczy hash IP, geolokalizuje IP | Worker |
| 5 | Worker zapisuje rekord w `clicks` | Worker/PostgreSQL |
| 6 | Worker robi ACK dopiero po zapisie | Worker/RabbitMQ |

```
Co gwarantuje ze dane nie zgina:   RabbitMQ durable exchange/queue, persistent messages, ACK po zapisie do DB, retry i DLQ.
Jak zapewniasz idempotentnosc:     UNIQUE(clicks.event_id), przed insert check po event_id, duplicate ACK bez drugiego zapisu.
```

## 6. Przeplyw - Generowanie raportu PDF

| Krok | Opis |
|------|------|
| 1 | Marketer klika "Generuj raport". |
| 2 | API tworzy rekord `reports` ze statusem `pending` i publikuje `report.requested`. |
| 3 | Worker ustawia `processing`, pobiera statystyki, renderuje PDF. |
| 4 | Worker zapisuje PDF w wolumenie `reports` jako `report_{id}.pdf`. |
| 5 | Worker ustawia `done`, `file_path`, `completed_at` i publikuje `notification.send` typu `report_ready`. |

```
Dlaczego async:                    PDF moze trwac sekundy i nie powinien blokowac requestu HTTP.
Gdzie jest przechowywany PDF:      Lokalny filesystem volume `PDF_STORAGE_PATH` w Docker Compose.
Jak marketer dostaje info:         Frontend polluje GET /api/reports/:id co 3s, dodatkowo worker wysyla e-mail.
```

## 7. Failure scenarios

| Komponent pada | Co robi system | Dane bezpieczne? |
|---------------|----------------|------------------|
| Redis | API robi fallback do PostgreSQL dla redirectu, nie zapisuje cache do czasu powrotu Redis. | Tak, Redis to cache. Mozliwy wolniejszy redirect. |
| Broker kolejki | Redirect nadal zwraca 302, API loguje blad publikacji. Dla pelnej gwarancji w produkcji trzeba dodac outbox w DB; w v1 monitorujemy i alertujemy. | Czesciowo: ryzyko utraty klikniec gdy RabbitMQ niedostepny w momencie publish. |
| Worker | Eventy zostaja w RabbitMQ bez ACK, po powrocie worker przetwarza zaleglosci. | Tak. |
| PostgreSQL | API nie moze tworzyc linkow ani obsluzyc cache miss; worker nie ACKuje eventow i retry/DLQ chroni dane. | Tak dla zakolejkowanych eventow, niedostepne operacje DB failuja. |
| API geo | Uzywamy lokalnej biblioteki GeoIP. Przy bledzie/timeout worker zapisuje `country=null`, `city=null` i ACK. | Tak, klikniecie zapisane bez geo. |

Uwaga: wymaganie "zadne klikniecie nie moze zginac" jest najmocniejsze przy dostepnym RabbitMQ. Jesli zespol chce gwarancji takze przy padzie brokera w momencie redirectu, trzeba dodac transactional outbox w PostgreSQL kosztem potencjalnego wplywu na redirect.

## 8. Indeksy bazy danych

| Tabela | Kolumna(y) | Uzasadnienie |
|--------|------------|--------------|
| users | email UNIQUE | Login po emailu. |
| clients | name | Lista/filtrowanie klientow. |
| links | short_code UNIQUE | Krytyczny lookup redirectu i cache miss. |
| links | created_by | Lista linkow marketera. |
| links | client_id | Widok klienta i raporty klienta. |
| links | active, expires_at | Alerty i filtrowanie aktywnych linkow. |
| clicks | event_id UNIQUE | Idempotencja consumerow. |
| clicks | link_id, clicked_at | Statystyki linku w zakresie czasu. |
| clicks | clicked_at | Raporty tygodniowe i retencja/partycjonowanie w przyszlosci. |
| reports | requested_by, created_at | Lista raportow uzytkownika. |
| reports | status | Worker i polling. |
| notification_logs | type, link_id, period_key UNIQUE | Deduplikacja alertow i raportow cyklicznych. |

Po przekroczeniu kilkudziesieciu milionow klikniec nalezy rozwazyc partycjonowanie `clicks` po miesiacu `clicked_at` oraz agregaty dzienne dla dashboardu.
