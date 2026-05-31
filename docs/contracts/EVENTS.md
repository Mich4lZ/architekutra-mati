# Kontrakt eventow - kolejka wiadomosci

## Konfiguracja

```
Broker: RabbitMQ

Exchange:  trackflow.events  (typ: topic, durable)
DLQ:       trackflow.dead

Kolejki:
  trackflow.clicks         routing key: click.recorded
  trackflow.reports        routing key: report.requested
  trackflow.notifications  routing key: notification.send

Retry:
  trackflow.retry.1s
  trackflow.retry.5s
  trackflow.retry.30s
```

Wszystkie kolejki sa durable. Wiadomosci sa persistent. Consumer robi ACK dopiero po trwalym wykonaniu pracy.

## Format koperty (envelope)

```json
{
  "event_id": "uuid",
  "event_type": "click.recorded",
  "version": "1.0",
  "timestamp": "ISO8601",
  "payload": {}
}
```

## EVENT: click.recorded

**Publisher:** API Server, endpoint `GET /:short_code`

**Consumer:** Worker

**Kiedy:** po przygotowaniu odpowiedzi 302, asynchronicznie

**Gwarancja:** at-least-once

**Idempotency:** ten sam `event_id` moze przyjsc dwa razy - consumer musi to obsluzyc

**Routing key:** `click.recorded`

**Payload:**
```json
{
  "link_id": "uuid",
  "short_code": "xK9mP1",
  "clicked_at": "ISO8601",
  "ip_address": "192.168.1.0",
  "user_agent": "Mozilla/5.0...",
  "referrer": "string|null"
}
```

**Co robi consumer:**
```
1. Sprawdz czy event_id istnieje w tabeli clicks.
   -> tak: ACK i zakoncz.
2. Parsuj user_agent -> device_type, browser, os.
3. Geolokalizuj ip_address -> country, city.
4. Hashuj ip_address z sekretnym saltem -> ip_hash.
5. Zapisz do tabeli clicks.
6. ACK.

Przy bledzie geo/UA: zapisz null dla tych pol, nie failuj eventu.
Przy bledzie zapisu: NACK -> retry.
```

**Retry:** 3 proby, backoff: 1s -> 5s -> 30s -> DLQ

## EVENT: report.requested

**Publisher:** API Server, endpoint `POST /api/reports` albo cron `weekly-report`

**Consumer:** Worker

**Routing key:** `report.requested`

**Payload:**
```json
{
  "report_id": "uuid",
  "requested_by": "uuid",
  "client_id": "uuid|null",
  "link_ids": ["uuid"],
  "date_from": "ISO8601",
  "date_to": "ISO8601",
  "kind": "manual|weekly"
}
```

**Co robi consumer:**
```
1. Zaktualizuj reports.status = 'processing'.
2. Pobierz linki i statystyki dla zakresu.
3. Wygeneruj HTML raportu i wyrenderuj PDF.
4. Zapisz plik do PDF_STORAGE_PATH/report_{report_id}.pdf.
5. Zaktualizuj reports.status = 'done', file_path, completed_at.
6. Opublikuj notification.send typu report_ready albo weekly_report.

Przy bledzie: reports.status = 'failed', error_message = '...', ACK eventu po zapisie statusu failed.
```

**Retry:** 3 proby, backoff: 5s -> 30s -> 120s -> DLQ. Jesli blad jest walidacyjny, ustaw `failed` bez retry.

## EVENT: notification.send

**Publisher:** Worker

**Consumer:** Worker, osobna kolejka

**Routing key:** `notification.send`

**Payload:**
```json
{
  "type": "report_ready|alert_no_clicks|weekly_report",
  "recipient_email": "string",
  "subject": "string",
  "template": "report_ready|alert_no_clicks|weekly_report",
  "dedupe_key": "string",
  "data": {
    "report_id": "uuid|null",
    "link_id": "uuid|null",
    "download_url": "string|null",
    "campaign_name": "string|null",
    "short_code": "string|null",
    "date_from": "ISO8601|null",
    "date_to": "ISO8601|null"
  }
}
```

**Co robi consumer:**
```
1. Sprawdz notification_logs po dedupe_key.
2. Jesli istnieje i sent_at != null: ACK.
3. Wyslij e-mail przez SMTP.
4. Zapisz notification_logs.sent_at.
5. ACK.
```

**Retry:** 3 proby, backoff: 5s -> 30s -> 120s -> DLQ.

## Zadania cykliczne (cron)

### weekly-report

```
Harmonogram:  0 8 * * 1  (poniedzialek 8:00)
Tolerancja:   max 15 minut

Co robi:
1. Dla kazdego klienta pobierz zakres poprzedni poniedzialek 00:00 - niedziela 23:59:59 UTC.
2. Sprawdz notification_logs po dedupe_key weekly_report:{client_id}:{yyyy-ww}.
3. Jesli nie istnieje, utworz reports(kind='weekly', status='pending').
4. Opublikuj report.requested z kind='weekly'.
5. Report consumer po wygenerowaniu publikuje notification.send type='weekly_report'.
```

### alert-no-clicks

```
Harmonogram:  */15 * * * *  (co 15 minut)

Co robi:
1. Pobierz aktywne linki kampanii: active=true, deleted_at IS NULL, expires_at null albo w przyszlosci.
2. Dla kazdego linku sprawdz ostatnie klikniecie.
3. Jesli brak klikniec albo ostatnie klikniecie > 24h temu, opublikuj notification.send type='alert_no_clicks'.

Deduplikacja: dedupe_key alert_no_clicks:{link_id}:{yyyy-mm-dd}. Maksymalnie jeden alert dziennie dla jednego linku.
```

## Dead-letter queue

```
Kto monitoruje:    Developer/operator przez RabbitMQ Management UI i logi workera.
Co sie dzieje:     Wiadomosci po wyczerpaniu retry trafiaja do trackflow.dead z naglowkami bledu.
Mozliwy reprocess: Skrypt/komenda administracyjna pobiera wiadomosci z DLQ i publikuje ponownie na trackflow.events po naprawie przyczyny.
```
