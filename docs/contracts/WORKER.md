# Kontrakt Workera

Worker to osobny proces Node.js/TypeScript, ktory konsumuje eventy i uruchamia crony. Worker NIE obsluguje requestow HTTP.

## Odpowiedzialnosci

- [x] Consumer: click.recorded
- [x] Consumer: report.requested
- [x] Consumer: notification.send
- [x] Cron: weekly-report (poniedzialek 8:00)
- [x] Cron: alert-no-clicks (co 15 minut)
- [x] Retry i DLQ dla nieudanych eventow
- [x] Idempotencja zapisu klikniec i powiadomien

## Integracje

### Geolokalizacja IP

```
Biblioteka:  geoip-lite albo rownowazna lokalna biblioteka GeoIP
Timeout:     max 100ms
Przy timeout: zapisz null, nie failuj eventu
```

Geo nie moze byc zewnetrznym HTTP call w krytycznej sciezce. W workerze blad geo nie powoduje NACK.

### Parser User-Agent

```
Biblioteka:  ua-parser-js
Pola:        device_type (mobile/desktop/tablet), browser, os
```

Mapowanie device_type:

- `mobile` -> `mobile`
- `tablet` -> `tablet`
- brak typu lub desktopowy UA -> `desktop`
- nieparsowalny UA -> `null` dla device_type/browser/os

### Generowanie PDF

```
Biblioteka:       Playwright Chromium albo Puppeteer
Gdzie zapisujesz: filesystem volume z PDF_STORAGE_PATH
Format nazwy:     report_{report_id}.pdf
Po wygenerowaniu: reports.status='done', file_path, completed_at; publikacja notification.send
```

HTML raportu generuje worker na podstawie danych z PostgreSQL. PDF musi zawierac: zakres dat, klienta, liczbe klikniec, unikalne klikniecia, top kraje, top urzadzenia, top referrery i serie czasu.

### Wysylanie e-maili

```
Dev:   Mailhog - lokalny SMTP, UI: http://localhost:8025
Prod:  nodemailer + SMTP provider
From:  noreply@trackflow.io
```

Szablony e-mail:

- `report_ready`: link do pobrania raportu manualnego.
- `weekly_report`: informacja o raporcie tygodniowym i link do pobrania.
- `alert_no_clicks`: kampania/link bez klikniec od ponad 24h.

## Zmienne srodowiskowe

```env
NODE_ENV=development
DATABASE_URL=postgresql://trackflow:trackflow@postgres:5432/trackflow
REDIS_URL=redis://redis:6379
RABBITMQ_URL=amqp://trackflow:trackflow@rabbitmq:5672
SMTP_HOST=mailhog
SMTP_PORT=1025
SMTP_FROM=noreply@trackflow.io
PDF_STORAGE_PATH=/app/storage/reports
IP_HASH_SALT=change-me-in-dev
APP_BASE_URL=http://localhost:3000
```

## Testy ktore agent musi napisac

### Jednostkowe

- [ ] Parser UA: iPhone -> device_type: "mobile"
- [ ] Parser UA: nieznany -> null, nie rzuca wyjatku
- [ ] Idempotency: drugi event z tym samym event_id jest ignorowany
- [ ] Geolokalizacja: timeout -> { country: null, city: null }
- [ ] Notification dedupe: ten sam dedupe_key nie wysyla drugiego maila

### Integracyjne

- [ ] click.recorded -> rekord w tabeli clicks
- [ ] Ten sam event_id dwa razy -> jeden rekord
- [ ] report.requested -> plik PDF istnieje + reports.status = done
- [ ] weekly-report -> e-mail w Mailhogu
- [ ] alert-no-clicks -> jeden e-mail dziennie dla tego samego linku

## Zasady ACK/NACK

- `click.recorded`: ACK tylko po insert do `clicks` albo po wykryciu duplikatu `event_id`.
- `report.requested`: ACK po `done` albo po trwalym ustawieniu `failed` dla bledow nieretryowalnych.
- `notification.send`: ACK po wyslaniu maila i zapisie `notification_logs.sent_at`, albo po wykryciu duplikatu.
- Bledy bazy danych: NACK/retry.
- Bledy parsowania UA/geo: nie retry, zapisz null.
