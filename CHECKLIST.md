# CHECKLIST — przed uruchomieniem agenta

> Sprawdź każdy punkt. Niezaznaczony = agent zgadnie źle.

---

## Architektura

- [x] Back-of-envelope: obliczenia i wnioski wypełnione
- [x] C1: wszyscy aktorzy, systemy zewnętrzne z etykietami strzałek
- [x] C2: każdy kontener ma technologię i odpowiedzialność
- [x] C2: każde połączenie ma protokół
- [x] C2: Worker jest osobnym kontenerem
- [x] Przepływ redirect: tabela z czasami, suma < 80ms
- [x] Przepływ kliknięcia: kroki + idempotency
- [x] Przepływ PDF: kroki + gdzie plik + jak user dostaje info
- [x] Failure scenarios: tabela wypełniona dla 5 komponentów
- [x] Indeksy: tabela z uzasadnieniami

## ADR

- [x] ADR-001 (backend): min. 2 opcje, uzasadnienie do briefu
- [x] ADR-002 (baza): min. 2 opcje
- [x] ADR-003 (cache): odwołanie do liczb z back-of-envelope
- [x] ADR-004 (kolejka): uzasadnienie "dane nie mogą zginąć"
- [x] ADR-005+: każda inna istotna decyzja

## Model danych

- [x] Tabela links: wszystkie pola z typami
- [x] Tabela clicks: pole event_id (idempotency) jest
- [x] Tabela reports: statusy są
- [x] Relacje opisane
- [x] Sekcja Redis wypełniona

## Kontrakty

- [x] API.md: endpoint redirect opisany
- [x] API.md: endpoint stats z wszystkimi polami response
- [x] API.md: endpoint reports — 202 + polling
- [x] EVENTS.md: click.recorded — payload + kroki consumer + retry
- [x] EVENTS.md: idempotency opisana
- [x] EVENTS.md: cron weekly-report — kroki
- [x] EVENTS.md: cron alert-no-clicks — deduplikacja
- [x] EVENTS.md: DLQ — co się dzieje
- [x] WORKER.md: geolokalizacja — biblioteka + fallback
- [x] WORKER.md: PDF — biblioteka + gdzie plik
- [x] WORKER.md: e-mail — provider

## CLAUDE.md

- [x] Stack wypełniony (język, framework, kolejka)
- [x] Sekcja "Dodatkowe instrukcje" wypełniona
- [x] Seed danych opisany

## docker-compose.yml

- [x] Stworzona konwencja infrastruktury
- [x] JWT_SECRET wypełniony
- [x] Zmienne środowiskowe API kompletne
- [x] Zmienne środowiskowe Worker kompletne

---

## Prompt startowy do Claude Code

> Gdy wszystkie punkty odhaczone — otwórz terminal w katalogu projektu, wpisz `claude`, wklej:

```
Jesteś seniorem [WYPEŁNIJ: język i framework].

Przeczytaj w tej kolejności:
1. docs/BRIEF.md
2. docs/architecture/ARCHITECTURE.md
3. docs/architecture/DECISIONS.md
4. docs/architecture/DATA_MODEL.md
5. docs/contracts/API.md
6. docs/contracts/EVENTS.md
7. docs/contracts/WORKER.md
8. CLAUDE.md

Po przeczytaniu odpowiedz na trzy pytania i czekaj na moją zgodę:
1. Jakie kontenery zbudujesz (lista z technologią każdego)?
2. Jak wygląda przepływ redirect — krok po kroku z czasem każdego kroku?
3. Czy czegoś brakuje w dokumentach żebyś mógł zacząć?

Nie pisz żadnego kodu dopóki nie powiem "OK, zacznij od Kroku 1".
```

---

## Kryteria oceny

| Kryterium | Punkty |
|-----------|--------|
| Back-of-envelope — poprawne obliczenia i wnioski | /10 |
| C1 i C2 — kompletne, spójne z implementacją | /10 |
| ADR — min. 4, każdy z alternatywami i uzasadnieniem | /10 |
| Kontrakt API — kompletny | /10 |
| Kontrakt eventów — idempotency, retry, DLQ | /10 |
| Redirect < 80ms (zmierzone curl) | /15 |
| Kliknięcie w statystykach w max 5s | /10 |
| Worker przetwarza eventy | /10 |
| Testy przechodzą | /10 |
| docker-compose up działa bez ręcznej konfiguracji | /5 |
| **SUMA** | **/100** |
