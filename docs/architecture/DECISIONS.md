# Architecture Decision Records

## ADR-001 - Wybor jezyka i frameworka backendu

**Status:** Zaakceptowana

**Kontekst:** TrackFlow musi obsluzyc publiczny redirect < 80ms, REST API, kolejke, workera, crony i frontend w jednym malym zespole.

**Problem:** Jak zbudowac API i Worker zeby spelnic redirect < 80ms przy wzroscie 10x?

**Opcje:**
- A: TypeScript + Fastify + Prisma - szybki HTTP framework, jeden jezyk dla API/workera/frontendu, dobra ergonomia. Wada: Node.js wymaga uwagi przy CPU-heavy PDF.
- B: Python + FastAPI + SQLAlchemy - szybki development i dobry ekosystem. Wada: jeden dodatkowy stack dla frontendu, mniej naturalny dla kolejki/frontendu w tym zespole.
- C: Go + chi/sqlc - bardzo szybkie API i niskie zuzycie RAM. Wada: wolniejszy development dashboardu i PDF, wiecej kodu infrastrukturalnego.

**Decyzja:** Wybieram opcje A: TypeScript + Fastify + Prisma.

**Uzasadnienie:** Sredni ruch za rok to ~0.77 klikniec/s, ale redirect musi byc bardzo szybki w pikach. Fastify ma niski overhead, Redis przejmuje glowny lookup, a TypeScript pozwala utrzymac wspolne typy kontraktow miedzy API, workerem i frontendem.

**Konsekwencje:**
(+) Jeden jezyk w wiekszosci systemu, szybka implementacja, dobre testowanie.
(-) Generowanie PDF musi byc izolowane w workerze, zeby nie blokowac API.

**Kiedy zrewidowac:** Gdy redirect lub worker osiagna stale wysokie CPU albo wymagany bedzie throughput rzedu setek requestow/s na jednym serwerze.

---

## ADR-002 - Wybor bazy danych

**Status:** Zaakceptowana

**Kontekst:** System przechowuje uzytkownikow, klientow, linki, klikniecia, raporty i wymaga spojnych relacji oraz zapytan statystycznych.

**Problem:** Jak przechowywac dane zeby zapewnic spojnosc i obsluzyc miliony klikniec?

**Opcje:**
- A: PostgreSQL - relacyjny model, indeksy, agregacje, transakcje, latwe uruchomienie w Docker Compose. Wada: przy bardzo duzej skali klikniec moze wymagac partycjonowania/agregatow.
- B: MongoDB - elastyczny schemat i latwy zapis dokumentow. Wada: slabiej pasuje do relacji uzytkownik-klient-link-klikniecie i raportow SQL.
- C: ClickHouse dla clicks + PostgreSQL dla reszty - bardzo szybka analityka. Wada: overengineering dla 2 mln klikniec/miesiac i jeden developer bez DevOpsa.

**Decyzja:** Wybieram PostgreSQL jako jedyna baze danych v1.

**Uzasadnienie:** 24 mln klikniec rocznie jest wykonalne w PostgreSQL z dobrymi indeksami. System potrzebuje relacji, JWT users, raportow i prostego Docker Compose. ClickHouse mozna dodac pozniej, jesli statystyki beda waskim gardlem.

**Konsekwencje:**
(+) Prostsza architektura, ACID, latwe migracje Prisma.
(-) Trzeba pilnowac indeksow i w przyszlosci partycjonowania tabeli `clicks`.

**Kiedy zrewidowac:** Gdy tabela `clicks` przekroczy kilkadziesiat milionow rekordow i zapytania statystyk nie beda miescic sie w akceptowalnym czasie mimo indeksow/agregatow.

---

## ADR-003 - Strategia cache dla redirectu

**Status:** Zaakceptowana

**Kontekst:** Publiczny endpoint `GET /:short_code` musi odpowiedziec w < 80ms i nie moze przeciazac PostgreSQL.

**Problem:** Jak zapewnic redirect < 80ms bez przeciazania bazy?

**Opcje:**
- A: Redis cache-aside `short_code -> metadata` - szybki lookup, DB tylko na miss. Wada: trzeba obslugiwac invalidacje i fallback.
- B: Tylko PostgreSQL z indeksem `short_code` - proste. Wada: piki klikniec uderzaja w DB, wieksze ryzyko >80ms.
- C: In-memory cache w API - bardzo szybki. Wada: niespojny przy wielu replikach, traci dane po restarcie, trudniejsza invalidacja.

**Decyzja:** Wybieram Redis cache-aside.

**Uzasadnienie:** Redirect to krytyczna sciezka. Redis daje lookup rzedu 1-3ms lokalnie. Przy cache miss API czyta PostgreSQL i wypelnia cache. TTL jest ustawiany do `expires_at` albo domyslnie 24h dla linkow bez daty wygasniecia.

**Konsekwencje:**
(+) Szybki redirect i mniejsze obciazenie PostgreSQL.
(-) Trzeba czyscic cache przy usunieciu/dezaktywacji linku.

**Kiedy zrewidowac:** Gdy cache hit ratio spadnie ponizej 95% albo Redis stanie sie waskim gardlem.

---

## ADR-004 - Wybor brokera kolejki

**Status:** Zaakceptowana

**Kontekst:** Klikniecia nie moga blokowac redirectu, a dane klikniec sa produktem. Worker musi miec retry, DLQ i ACK po zapisie.

**Problem:** Jak zagwarantowac at-least-once delivery klikniec i nie blokowac redirectu?

**Opcje:**
- A: RabbitMQ - dojrzaly broker AMQP, durable queues, ACK/NACK, DLQ, management UI. Wada: osobny serwis.
- B: BullMQ (Redis) - mniej serwisow, dobry DX w Node.js. Wada: Redis jako cache i broker zwieksza blast radius awarii.
- C: Kafka - duzy throughput i log eventow. Wada: overengineering przy ~0.77 klikniec/s srednio za rok.

**Decyzja:** Wybieram RabbitMQ.

**Uzasadnienie:** Wymaganie at-least-once i DLQ jest naturalne dla RabbitMQ. Oddzielenie Redis cache od kolejki zmniejsza ryzyko, ze awaria jednego komponentu zatrzyma zarowno redirect cache, jak i eventy.

**Konsekwencje:**
(+) Durable queues, retry, DLQ, latwa obserwowalnosc przez management UI.
(-) Jeden dodatkowy kontener do utrzymania.

**Kiedy zrewidowac:** Gdy zespol bedzie chcial event log/replay na duza skale albo wiele niezaleznych consumer group.

---

## ADR-005 - Przechowywanie raportow PDF

**Status:** Zaakceptowana

**Kontekst:** Raporty PDF sa generowane automatycznie i na zadanie. V1 ma dzialac na jednym VPS przez Docker Compose.

**Problem:** Gdzie przechowywac PDF-y zeby byly dostepne po restarcie Docker Compose?

**Opcje:**
- A: Lokalny filesystem volume - prosty, zgodny z jednym VPS, brak dodatkowych uslug. Wada: trudniejsza migracja na wiele serwerow.
- B: S3-compatible storage - skalowalne i dobre dla SaaS. Wada: dodatkowa usluga/konfiguracja w v1.
- C: PostgreSQL bytea - transakcyjne. Wada: duze pliki w DB utrudniaja backup i zwiekszaja rozmiar bazy.

**Decyzja:** Wybieram lokalny filesystem volume `PDF_STORAGE_PATH` w v1.

**Uzasadnienie:** Brief wymaga jednego VPS i Docker Compose. Wolumen zapewnia przetrwanie restartu, a przejscie na S3 mozna ukryc za prostym storage adapterem.

**Konsekwencje:**
(+) Najprostsze wdrozenie i backup razem z VPS.
(-) Przy wielu instancjach API/worker trzeba przeniesc PDF-y do shared storage.

**Kiedy zrewidowac:** Przed uruchomieniem multi-node/SaaS albo gdy raporty zajma istotna czesc dysku VPS.

---

## ADR-006 - Generowanie krotkiego kodu

**Status:** Zaakceptowana

**Kontekst:** Linki maja postac `trckflw.io/xK9mP`; aktywnych linkow dzis ~500, za rok ~5000.

**Problem:** Jak generowac krotki kod, zeby byl krotki, czytelny i odporny na kolizje?

**Opcje:**
- A: Losowy base62, 6 znakow - ~56 mld kombinacji, krotki URL, proste retry przy kolizji. Wada: nie jest sekwencyjny.
- B: Auto-increment zakodowany base62 - bez kolizji i bardzo krotki. Wada: ujawnia skale i sekwencje biznesowe.
- C: UUID fragment - latwe, ale mniej ladne i dluzsze.

**Decyzja:** Wybieram losowy base62, 6 znakow, z maksymalnie 5 probami i UNIQUE `links.short_code`.

**Uzasadnienie:** Przy 5000 aktywnych linkow prawdopodobienstwo kolizji jest znikome, a retry + unikalny indeks zamyka problem.

**Konsekwencje:**
(+) Krotkie i nieprzewidywalne linki.
(-) Trzeba obsluzyc rzadki retry przy kolizji.

**Kiedy zrewidowac:** Gdy liczba linkow dojdzie do milionow albo potrzebne beda custom aliasy.
