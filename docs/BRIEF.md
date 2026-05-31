# Brief klienta — TrackFlow v1.0

> ✅ Ten dokument jest już wypełniony. Przeczytaj go uważnie przed wypełnieniem architektury.

---

**Od:** Marek Kowalski, CEO TrackFlow
**Do:** Zespół developerski

## Kontekst biznesowy

Prowadzimy agencję marketingową obsługującą 40 klientów. Każdy klient prowadzi kampanie reklamowe — e-mail, social media, SMS. Dziś używamy bit.ly i arkuszy Excel. To nie skaluje się i nie daje nam danych w jednym miejscu.

Chcemy własne narzędzie. Za 6 miesięcy planujemy sprzedawać dostęp innym agencjom w modelu SaaS. Obecni klienci to faza beta.

## Użytkownicy

**Marketerzy** (~15 osób) — tworzą linki dla kampanii klientów, przeglądają statystyki, generują raporty.

**Klienci agencji** (~40 firm) — dostęp tylko do odczytu swoich statystyk.

**Osoby klikające w linki** — setki tysięcy miesięcznie. Nie wiedzą że istnieje TrackFlow.

## Co system musi robić

### Tworzenie linków
Marketer wkleja długi URL, system generuje krótki link (trckflw.io/xK9mP).
Można dodać: nazwę kampanii, przypisanie do klienta agencji, datę wygaśnięcia.
Link może być aktywny maksymalnie 365 dni.

### Redirect
Ktoś klika skrócony link → system przekierowuje na oryginalny URL.
**To musi być nieodczuwalne dla klikającego. Max 80ms od requestu do odpowiedzi 301/302.**

### Zbieranie danych o kliknięciu
Przy każdym kliknięciu zapisujemy:
- timestamp
- kraj i miasto (z IP)
- typ urządzenia: mobile / desktop / tablet
- przeglądarka i system operacyjny (z User-Agent)
- referrer (skąd przyszedł user)

Dane z IP i User-Agent wymagają przetworzenia — to nie jest natychmiastowe.

### Dashboard statystyk
Marketer widzi dla każdego linku:
- łączna i unikalna liczba kliknięć
- wykres kliknięć w czasie (godzina / dzień / tydzień)
- mapa świata z kliknięciami
- top 5 krajów, urządzeń, referrerów

### Raporty PDF
- **Automatycznie:** w poniedziałek o 8:00 każdy klient agencji dostaje e-mail z raportem PDF z ostatniego tygodnia
- **Na żądanie:** marketer generuje PDF i pobiera przez przeglądarkę

### Alerty
Jeśli link z aktywnej kampanii nie miał kliknięcia przez 24h → marketer dostaje e-mail z alertem.

## Wymagania nienaruszalne

| Wymaganie | Wartość | Konsekwencja złamania |
|-----------|---------|----------------------|
| Czas redirectu | **< 80ms** | Klienci tracą zaufanie do kampanii |
| Dane o kliknięciach | **żadne nie mogą zginąć** | Dane to nasz produkt |
| Raport poniedziałkowy | opóźnienie **max 15 min** | Złamana obietnica klientom |
| Skalowalność | obsługa **10x wzrostu** bez przepisywania | Planujemy SaaS za 6 miesięcy |

## Skala — dziś i za rok

| Metryka | Dziś (beta) | Za rok (SaaS) |
|---------|-------------|---------------|
| Klientów agencji | 40 | 200 |
| Marketerów | 15 | 75 |
| Kliknięć / miesiąc | 200 000 | 2 000 000 |
| Aktywnych linków | 500 | 5 000 |

## Czego NIE robimy w v1
- Płatności i plany subskrypcyjne
- Własna geolokalizacja IP (użyj gotowej biblioteki)
- Mobile app
- A/B testing linków
- Custom domeny dla klientów

## Infrastruktura
Serwer VPS: 8 vCPU, 32GB RAM, Linux.
Wymaganie: całość działa przez Docker Compose.
Jeden developer utrzymuje — brak DevOpsa.

## Definicja "gotowe" dla v1
- Marketer tworzy link i redirect działa < 80ms
- Każde kliknięcie pojawia się w statystykach w max 5 sekund
- Raport PDF z ostatniego tygodnia generuje się poprawnie
- System działa po restarcie Docker Compose bez utraty danych
