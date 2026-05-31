# AGENTS.md - Instrukcje dla agenta

## Kim jestes i co budujesz

Jestes seniorem TypeScript/Node.js implementujacym TrackFlow - system skracania i sledzenia linkow dla agencji marketingowej.

## Dokumenty ktore czytasz PRZED pisaniem kodu

1. docs/BRIEF.md
2. docs/architecture/ARCHITECTURE.md
3. docs/architecture/DECISIONS.md
4. docs/architecture/DATA_MODEL.md
5. docs/contracts/API.md
6. docs/contracts/EVENTS.md
7. docs/contracts/WORKER.md

Jesli cokolwiek jest niejasne - ZATRZYMAJ SIE i zapytaj. Nie zgaduj.

## Stack technologiczny

Backend:
  Jezyk:        TypeScript
  Framework:    Fastify
  ORM:          Prisma

Frontend:
  Framework:    React + Vite
  Stylowanie:   Tailwind CSS

Infrastruktura:
  Cache:        Redis
  Kolejka:      RabbitMQ
  Baza danych:  PostgreSQL
  E-mail (dev): Mailhog

Testy:
  Jednostkowe:  Vitest
  Integracyjne: Vitest + Supertest + Docker Compose dependencies

## Zasady ktorych ZAWSZE przestrzegasz

**Kontrakty sa nienaruszalne**
- API implementujesz DOKLADNIE zgodnie z docs/contracts/API.md
- Payload eventow DOKLADNIE zgodny z docs/contracts/EVENTS.md

**Redirect jest krytyczny**
- GET /:short_code musi odpowiedziec w < 80ms
- Kolejnosc: sprawdz Redis -> miss -> sprawdz PostgreSQL -> zapisz do Redis -> 302 -> opublikuj event
- Publikacja eventu jest ASYNCHRONICZNA - nie blokuje 302
- Redirect nie parsuje User-Agent, nie geolokalizuje IP i nie robi synchronicznego INSERT do clicks

**At-least-once delivery**
- Consumer sprawdza event_id przed przetworzeniem
- ACK dopiero po zapisie do bazy albo po wykryciu duplikatu
- Retry i DLQ zgodnie z docs/contracts/EVENTS.md

**Testy sa obowiazkowe**
- Po kazdym module uruchom testy
- Testy z WORKER.md sekcja "Testy ktore agent musi napisac" sa obowiazkowe

## Kolejnosc implementacji

Po kazdym kroku uruchom testy i zaraportuj.

```
Krok 1:  Inicjalizacja projektu, Docker Compose, Dockerfile(i), zmienne srodowiskowe
Krok 2:  Schemat bazy danych + migracje
Krok 3:  Auth - login, JWT middleware
Krok 4:  Endpoint redirect GET /:short_code (z cache Redis)
Krok 5:  Publisher eventu click.recorded
Krok 6:  CRUD linkow i klientow
Krok 7:  Consumer click.recorded (UA parser + geo + zapis)
Krok 8:  Endpointy statystyk
Krok 9:  Consumer report.requested + PDF
Krok 10: Consumer notification.send + e-mail
Krok 11: Cron weekly-report
Krok 12: Cron alert-no-clicks
Krok 13: Frontend - auth, dashboard, lista linkow
Krok 14: Frontend - statystyki i wykresy
Krok 15: Frontend - raporty (polling statusu)
Krok 16: Testy integracyjne end-to-end
Krok 17: Weryfikacja docker-compose up
```

## Format raportowania

```
Krok N ukonczony
  Zbudowalem: [1 zdanie]
  Testy: [X passed, Y failed]
  Do sprawdzenia przez zespol: [tak/nie + co]
```

## Weryfikacja redirectu

```bash
curl -o /dev/null -s -w "Total: %{time_total}s\n" http://localhost:3000/xK9mP1
# Oczekiwane: < 0.080s
```

## Dane testowe

Utworz seed ktory dodaje:
- 2 uzytkownikow: marketer@test.com i client@test.com (haslo: test123)
- 1 klienta agencji przypisanego do client@test.com
- 5 linkow z roznymi krotkimi kodami base62, w tym `xK9mP1`
- 100 klikniec z ostatnich 7 dni

## Dodatkowe instrukcje

1. Kod krotki: domyslnie losowy base62 6 znakow, retry max 5 razy przy kolizji, UNIQUE w DB.
2. Link moze byc aktywny maksymalnie 365 dni od utworzenia.
3. Klient agencji widzi tylko statystyki linkow ze swoim `client_id`.
4. PDF-y zapisuj w `PDF_STORAGE_PATH` jako `report_{id}.pdf`.
5. Nie przechowuj surowego IP w PostgreSQL; zapisuj tylko `ip_hash`.
