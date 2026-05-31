# TrackFlow — Projekt zespołowy

> System skracania i śledzenia linków dla agencji marketingowej.

---

## Twoja rola

Jesteś **architektem i product ownerem**.
Claude Code jest seniorem który implementuje.

**Twoje zadanie:** napisać dokumenty tak precyzyjnie, żeby agent zbudował system bez zgadywania.
**Zasada:** jeśli agent pyta o coś czego nie ma w dokumentach — dokument jest niekompletny. Uzupełnij go zamiast odpowiadać na czacie.

---

## Struktura projektu

```
trackflow/
├── docs/
│   ├── BRIEF.md                     ✅ gotowy — przeczytaj
│   ├── architecture/
│   │   ├── ARCHITECTURE.md          📝 wypełnij — C1, C2, bottlenecki, przepływy
│   │   ├── DECISIONS.md             📝 wypełnij — min. 4 ADR
│   │   └── DATA_MODEL.md            📝 wypełnij — schemat bazy danych
│   └── contracts/
│       ├── API.md                   📝 wypełnij — kontrakt REST API
│       ├── EVENTS.md                📝 wypełnij — kontrakt eventów w kolejce
│       └── WORKER.md                📝 wypełnij — kontrakt zadań workera
├── infra/
│   └── docker-compose.yml           📝 wypełnij — infra + zmienne środowiskowe
├── CLAUDE.md                        📝 wypełnij — instrukcje dla agenta
├── CHECKLIST.md                     ✅ gotowy — sprawdź przed uruchomieniem agenta
└── README.md                        ✅ ten plik
```

---

## Kolejność pracy

```
1.  Przeczytaj docs/BRIEF.md
2.  Zrób back-of-envelope math
3.  Wypełnij docs/architecture/ARCHITECTURE.md
4.  Wypełnij docs/architecture/DECISIONS.md  (min. 4 ADR)
5.  Wypełnij docs/architecture/DATA_MODEL.md
6.  Wypełnij docs/contracts/API.md
7.  Wypełnij docs/contracts/EVENTS.md
8.  Wypełnij docs/contracts/WORKER.md
9.  Napisz CLAUDE.md
10. Sprawdź CHECKLIST.md — odhaczyj każdy punkt
11. Uruchom agenta promptem poniżej
```

**Nie uruchamiaj agenta przed krokiem 10.**

---

## Stack — Twoja decyzja

Stack wybierasz sam i uzasadniasz w `docs/architecture/DECISIONS.md`.

Jedyne wymagania techniczne które są nienaruszalne:
- System działa przez **Docker Compose**
- Jest **kolejka wiadomości** (RabbitMQ, BullMQ, Kafka — Ty uzasadniasz)
- Jest **cache** (Redis — Ty uzasadniasz gdzie i dlaczego)
- Jest **relacyjna baza danych** (Ty uzasadniasz dlaczego relacyjna)

Dockerfile dla każdego serwisu piszesz razem z agentem po wypełnieniu dokumentów.

---

## Definicja "gotowe"

- [ ] `docker-compose up` odpala cały system bez błędów
- [ ] Redirect działa i jest < 80ms (zmierzone)
- [ ] Kliknięcie pojawia się w statystykach w max 5 sekund
- [ ] Worker przetwarza eventy z kolejki
- [ ] Raport PDF generuje się i jest pobieralny
- [ ] Testy przechodzą

---

## Pierwszy prompt do Claude Code

> Uzupełnij poniższy szablon gdy wszystkie punkty w CHECKLIST.md są odhaczone.
> Otwórz terminal w katalogu projektu, wpisz `claude`, a następnie wklej prompt.

```
Jesteś seniorem [WYPEŁNIJ: język i framework, np. "TypeScript z Fastify"].

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
2. Jak wygląda przepływ redirect — krok po kroku, z czasem każdego kroku?
3. Czy czegoś brakuje w dokumentach żebyś mógł zacząć?

Nie pisz żadnego kodu dopóki nie powiem "OK, zacznij od Kroku 1".
```
