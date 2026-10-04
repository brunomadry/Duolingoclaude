# Japoński dla dwóch osób: research pod aplikację (PWA, iPhone, interfejs po polsku)

Data researchu: 4 października 2026. Źródła na końcu pliku. Rzeczy oznaczone jako "moja propozycja" albo "z mojej wiedzy" nie pochodzą z przeszukanych stron, więc warto je potraktować jako hipotezy do sprawdzenia.

---

## 0. Najważniejsze wnioski w 7 punktach

1. **Kolejność nauki jest w źródłach zgodna:** najpierw hiragana (1 do 2 tygodni), potem katakana (około tygodnia, bo dźwięki już znasz), potem podstawowa gramatyka i słówka. Kanji dopiero na końcu i zawsze razem ze słówkami, nie osobno.
2. **Dziura na rynku, którą możecie wypełnić:** Duolingo jest powszechnie krytykowane za brak wyjaśnień gramatyki, nienaturalne zdania i brak prawdziwej rozmowy. Wasza apka powinna mieć krótkie, konkretne wyjaśnienia po polsku i dużo gadania.
3. **Treści (kana, słówka, kanji, zdania przykładowe) bierzcie z otwartych danych**, nie z AI i nie z podręczników. Są gotowe zbiory na licencjach pozwalających na użycie z podaniem autorów.
4. **AI używajcie do ćwiczeń i rozmowy, nie jako źródła prawdy z gramatyki.** Modele potrafią pewnym tonem powiedzieć nieprawdę o japońskim, a wy nie macie jak tego łatwo wychwycić.
5. **Powtórki:** nowoczesny standard to algorytm FSRS (używa go Anki od 2023). Dla dwóch osób wystarczy też prosty system pudełek.
6. **Darmowe API AI działa dla 2 osób, ale limity zmieniają się co kilka miesięcy**, więc trzeba mieć plan B i nie wpisywać klucza API w kod strony.
7. **Audio za darmo:** przeglądarka na iPhonie ma wbudowany głos japoński, więc nie musicie niczego nagrywać.

---

## 1. Kolejność nauki: co mówią źródła

| Etap | Co | Ile czasu (wg źródeł) |
|---|---|---|
| 1 | Hiragana (46 znaków + znaki z kreskami, które dają razem 71 dźwięków) | 1 do 2 tygodni przy codziennej praktyce |
| 2 | Katakana (46 znaków, te same dźwięki) | około tygodnia |
| 3 | Podstawowa gramatyka i słówka równolegle | tygodnie do miesięcy |
| 4 | Kanji przez słówka, na początek 3 do 5 dziennie przy tempie intensywnym | miesiące |

Dodatkowe zasady, które powtarzają się w kilku źródłach:

* Jedna nowa struktura gramatyczna na sesję, nie pięć naraz.
* Słówka zawsze w zdaniach, nie jako gołe listy.
* Nie ucz się z romaji dłużej niż to konieczne, bo mózg zaczyna czytać po angielsku zamiast po japońsku.
* Zdania w szyku podmiot, dopełnienie, orzeczenie i **cząstki (は, を, に, で)** to pierwsza duża rzecz, którą trzeba zrozumieć.
* Formy grzecznościowe です i ます to dobry początek.
* Przykładowy dzień nauki z jednego źródła: 5 minut powtórek starych słówek, potem nowe rzeczy, całość około 30 minut. Dla was 15 do 20 minut na lekcję to rozsądny cel.
* JLPT N5 to dobry pierwszy cel, bo ma jasno określony zakres słówek, kanji i gramatyki.

---

## 2. Kursy i podręczniki: porównanie

| Materiał | Język | Styl | Mocne strony | Słabe strony | Co z tym zrobić |
|---|---|---|---|---|---|
| **Genki I i II** | angielski | klasyczny podręcznik z ćwiczeniami | najczęściej polecany do samodzielnej nauki, przejrzysty, ćwiczenia, tom II to mniej więcej poziom N4 (opinia z forum) | płatny, odpowiedzi osobno, projektowany do klasy | inspiracja kolejnością tematów, **nie kopiować treści** |
| **Minna no Nihongo** | japoński (wyjaśnienia w osobnej książce) | immersyjny, kontekst dorosłych | bardzo dokładny, N5 do N4 w dwóch tomach | trudny na start, wiele dodatkowych książek, drogi komplet | nie dla was |
| **Marugoto** | angielski, rōmaji | podejście Japan Foundation, poziomy A1 do C2 | dużo ilustracji i kontekstu życia w Japonii | słabsze wyjaśnienia gramatyki, trzeba korzystać z dodatkowych stron i audio | tylko inspiracja tematyczna |
| **Tae Kim's Guide** | angielski, **jest tłumaczenie polskie** | darmowy przewodnik po gramatyce | tłumaczy "dlaczego", nie tylko "jak", dobre wyjaśnienie cząstek | zakłada, że już znasz kana, część osób zgłasza uproszczenia i błędy | **główne źródło kolejności gramatyki**, licencja niekomercyjna (patrz sekcja 6) |
| **Duolingo** | różne | gamifikacja | motywacja, niski próg wejścia | prawie brak wyjaśnień, nienaturalne zdania, nie nauczy rozmowy | wzorzec UX, nie wzorzec treści |
| **Bunpro** | angielski | gramatyka z powtórkami | gramatyka + SRS | płatne | wzorzec działania |
| **LingoDeer** | angielski | lekcje z notatkami gramatycznymi na początku | każda lekcja zaczyna się wyjaśnieniem | płatne | dobry wzorzec: krótka notka, potem ćwiczenia |

Ważne praktyczne ostrzeżenie z forów: Genki i Minna wprowadzają materiał w **innej kolejności**, więc mieszanie serii zostawia dziury w wiedzy. U nas to znaczy: wybieramy jedną kolejność gramatyki i trzymamy się jej.

---

## 3. Czym wasza apka ma się różnić od Duolingo

Z recenzji i dyskusji uczących się wychodzą te same zarzuty:

* Brak wyjaśnień gramatyki, trzeba zgadywać wzorce.
* Zdania poprawne, ale takie, których nikt w Japonii by nie powiedział.
* Ćwiczenia mówienia sprawdzają pojedyncze zdania, nie ma prawdziwej rozmowy.
* Słaby system kanji.

Wasza odpowiedź na to:

1. **Krótka notka po polsku przed każdą nową strukturą** (3 do 5 zdań + 3 przykłady z audio).
2. **Mini rozmowa z AI w każdej lekcji**, ograniczona do słówek, które już znacie.
3. **Przykładowe zdania z prawdziwego korpusu** (Tatoeba), nie wymyślane na bieżąco.
4. Brak presji i brak powiadomień, zgodnie z waszym pomysłem: tryb codzienny albo co 2 dni.

---

## 4. Proponowany program (moja propozycja na bazie powyższych źródeł)

Założenie: **1 lekcja = 1 dzień w trybie codziennym, co 2 dni w trybie spokojnym.** Cały zakres N5 to około 100 lekcji, czyli około 3 do 4 miesięcy codziennie albo 6 do 7 miesięcy w trybie spokojnym.

### Faza A: pismo (lekcje 1 do 16)

| Lekcje | Zawartość |
|---|---|
| 1 do 5 | Hiragana: około 2 rzędy na lekcję (あ か さ た な / は ま や ら わ ん) |
| 6 | Hiragana: znaki z kreskami (が, ざ, だ, ば, ぱ) |
| 7 | Hiragana: połączenia (きゃ, しゅ, ちょ itd.) i mały っ |
| 8 | Test i powtórka hiragany |
| 9 do 13 | Katakana: rzędy, szybciej, bo dźwięki znane |
| 14 | Katakana: kreski, połączenia, długa samogłoska ー |
| 15 | Hiragana vs katakana: czytanie słów mieszanych |
| 16 | Test kana |

Równolegle od lekcji 4: 3 do 5 prostych słów w kana na lekcję (powitania, liczby), żeby od razu czytać prawdziwe słowa.

### Faza B: pierwsze zdania (lekcje 17 do 60), jedna struktura na 2 lekcje

Moja propozycja kolejności (zbliżona do tego, jak układają to podręczniki N5, ale do weryfikacji względem Tae Kim):

1. X は Y です (identyfikacja) i pytania z か
2. Wskazywanie: これ, それ, あれ, この, その, あの
3. Cząstki の i も
4. Czasowniki w formie ます (teraźniejszość) i cząstka を
5. Cząstki に i で (miejsce, czas, środek)
6. Przeszłość z ました i przeczenie ません
7. Przymiotniki na い i na な
8. あります i います (istnienie)
9. Liczby, godziny, daty, liczniki
10. Prośby: ～てください, forma て
11. ～たい (chcę), ～ましょう (zróbmy)
12. Porównania i zdania z から, でも

Lekcje parzyste w tej fazie to **ćwiczenia i rozmowa**, nieparzyste to **nowa struktura**.

### Faza C: formy nieformalne i kanji (lekcje 61 do 100)

* Forma prosta (plain form) i rozmowa nieformalna (tu Tae Kim jest mocny).
* ～ている, ～ない, ～た.
* Kanji N5 (79 znaków wg zbioru OpenJLPT), około 2 na lekcję od lekcji 40, zawsze w słowach.
* Test końcowy odpowiadający poziomowi N5.

### Liczby kontrolne

* Słówka N5 w zbiorze OpenJLPT: 662, czyli około 6 do 7 nowych słów na lekcję przy 100 lekcjach.
* Kanji N5: 79.

---

## 5. Struktura jednej lekcji (15 do 20 minut)

1. **Powtórka** zaległych kart z poprzednich lekcji (3 do 5 min).
2. **Nowa rzecz:** rząd kana albo jedna struktura gramatyczna, z krótką notką po polsku i audio.
3. **Nowe słówka:** 5 do 7, każde z przykładowym zdaniem i audio.
4. **Produkcja:** ułóż zdanie z klocków, uzupełnij lukę, napisz odpowiedź.
5. **Mini rozmowa z AI** (3 do 5 wymian) wyłącznie na znanym słownictwie.
6. **Szybki quiz i podsumowanie** ("dziś nauczyłeś się...").

Co 7. lekcja: test tygodniowy. Co miesiąc: sprawdzian etapu.

**Tryby:** codzienny (kolejna lekcja odblokowuje się następnego dnia) i spokojny (co 2 dni). Odblokowanie liczysz lokalnie z daty, więc **żadne powiadomienia nie są potrzebne.** Dobry pomysł: brak kar za opuszczenie dnia, najwyżej "zaległe powtórki".

---

## 6. Dane i licencje

Uwaga: to nie jest porada prawna. Dla prywatnej apki dla kilku znajomych ryzyko jest małe, ale dobrze mieć stronę "Źródła i licencje" w apce.

| Zasób | Co zawiera | Licencja (wg źródeł) | Jak użyć |
|---|---|---|---|
| **JMdict / KANJIDIC** | słownik japoński i dane o kanji | `CC BY-SA 4.0` | baza słówek i kanji, z podaniem autorów |
| **OpenJLPT** | słówka i kanji N5 do N1 jako JSON, CSV, SQLite; N5: 662 słówka i 79 kanji; zdania przykładowe z Tatoeba przy około 89% słówek | `CC BY-SA 4.0` | **najlepszy punkt startowy dla programu** |
| **Tanos (Jonathan Waller)** | listy słówek JLPT | `CC BY` | alternatywne listy poziomów |
| **Tatoeba** | miliony zdań, część z audio | prawa należą do współtwórców, wymagane podanie autorów (sprawdź dokładną licencję przy pobieraniu) | zdania przykładowe |
| **Tae Kim's Guide** | gramatyka | `CC BY-NC-SA` (niekomercyjnie, z zachowaniem licencji) | inspiracja i ewentualnie tłumaczenie fragmentów, prywatnie OK |
| **KanjiVG** | animacje kolejności kresek | `CC BY-SA 3.0` | opcjonalnie animowane kreski |
| **Genki, Minna, Marugoto** | podręczniki | prawa autorskie | **nie kopiować treści** |

Ważny wniosek praktyczny: **wszystkie te zbiory są po angielsku.** Polskie znaczenia trzeba wygenerować raz (np. przez AI), przejrzeć wyrywkowo i zapisać jako statyczne pliki JSON w projekcie. Nie generować tego na żywo przy każdej lekcji.

---

## 7. AI: co może, czego nie, i jak to zrobić bezpiecznie

### 7.1 Darmowe API (stan na połowę 2026, zmienia się często)

| Dostawca | Co wiadomo ze źródeł | Uwagi |
|---|---|---|
| **Groq** | około 30 zapytań na minutę, od 1 tys. do 14,4 tys. zapytań dziennie zależnie od modelu, bez karty | limity są teraz osobne dla każdego modelu |
| **Google Gemini** | od kwietnia 2026 darmowo tylko modele Flash i Flash-Lite, limity mocno obcięte | źródła podają różne liczby (od 5 do 15 zapytań na minutę), a prompty z darmowego planu mogą trafiać do trenowania |
| **Mistral** | darmowy plan "Experiment", niski limit na minutę | zapas |
| **OpenRouter** | darmowe modele z limitem dziennym | zapas |

Wniosek: dla 2 osób i kilku zapytań na lekcję to w zupełności wystarczy, ale trzeba **zrobić warstwę, która może przełączyć dostawcę**, i **cache'ować** wygenerowane ćwiczenia.

### 7.2 Dokładność modeli z japońskim

* Autor bloga Self Taught Japanese sprawdził ChatGPT na gramatyce cząstek: większość wyjaśnień była dobra, ale znalazł przypadek w pełni błędny.
* Użytkownicy forów zgodnie ostrzegają, że modele mówią błędy tak samo pewnie jak prawdy, a początkujący nie ma jak tego zweryfikować.
* Praktycy, którzy zbudowali własne narzędzia, mówią, że niska temperatura i dokładny prompt wystarczają, żeby było użyteczne dla poziomu N5.

### 7.3 Zasady projektowe (moja propozycja)

1. **Wyjaśnienia gramatyki piszecie wy (albo Claude, ale weryfikowane) jako statyczna treść.** AI ich nie wymyśla na żywo.
2. AI generuje: zdania ćwiczeniowe, dialogi, feedback do odpowiedzi.
3. **Lista dozwolonych słów** wysyłana do AI w każdym zapytaniu, a odpowiedź walidowana w kodzie (słowa spoza listy oznaczać albo odrzucać).
4. **Dwa osobne prompty:** jeden do prowadzenia rozmowy (prosty japoński, bez poprawiania na bieżąco), drugi do poprawiania wypowiedzi ucznia (poprawia tylko to, co uczeń napisał, nie tłumaczy rzeczy, które były poprawne).
5. Odpowiedzi w **ustrukturyzowanym JSON**, niska temperatura.
6. Przycisk **"Zgłoś błąd"** przy każdym zdaniu AI, żeby lista problemów rosła.
7. Wstępnie generować lekcje i cache'ować, żeby nie czekać na API w trakcie nauki.

### 7.4 Bezpieczeństwo klucza API (z mojej wiedzy)

Jeśli klucz API siedzi w kodzie strony, każdy go zobaczy. Rozwiązanie: **maleńkie proxy** (np. Cloudflare Worker, darmowy plan wystarcza), które trzyma klucz i przepuszcza tylko zapytania z waszej apki.

---

## 8. Powtórki (SRS)

* **FSRS** to nowoczesny algorytm, który dopasowuje odstępy do tego, jak sam zapominasz. Anki ma go wbudowanego od wersji 23.10 (listopad 2023).
* Domyślna docelowa pamięć to **90%**. 95% oznacza więcej powtórek dziennie, 85% oznacza dłuższe odstępy i więcej zapominania.
* Alternatywa: prosty system pudełek (Leitner) albo klasyczny SM-2. Dla 2 osób w zupełności wystarczy.
* Gotowe biblioteki FSRS istnieją w JavaScript (z mojej wiedzy m.in. `ts-fsrs`, do sprawdzenia przed użyciem).
* Typy kart: rozpoznanie kana, słówko po japońsku → znaczenie, znaczenie → słówko, słuchanie, zdanie z luką.
* Nie przepychać przez SRS całych gramatycznych "pakietów" po 10 zdań, jedno zdanie = jedna karta.

---

## 9. Audio i wymowa

* Przeglądarka ma wbudowane `speechSynthesis`. Na iOS Safari działa głos japoński **Kyoko** (i Otoya według jednego ze źródeł), co potwierdziły testy na iOS 17.
* Trzeba uruchamiać mowę **po geście użytkownika** (kliknięcie), inaczej iOS nie odtworzy.
* Lista głosów ładuje się asynchronicznie: nasłuchuj `onvoiceschanged`.
* Znany błąd: przy dłuższym tekście mowa może się zaciąć. Obejście: wywołać `speechSynthesis.cancel()` przed kolejnym `speak()`.
* Ustaw `utterance.lang = "ja-JP"` oraz wybierz głos z `lang` pasującym do `ja-JP` lub `ja_JP`.
* Nie da się zapisać wygenerowanego audio do pliku, ale dla ćwiczeń słuchania nie jest to potrzebne.
* **Rozpoznawanie mowy (ocena wymowy)** ma w przeglądarkach bardzo ograniczone wsparcie, więc **poza zakresem**. Wymowę ćwiczycie przez słuchanie i powtarzanie.

---

## 10. Decyzje techniczne dla Claude Code

| Temat | Rekomendacja |
|---|---|
| Typ apki | PWA, instalowana na ekranie głównym iPhone'a |
| Treści | pliki JSON w repozytorium (kana, słówka, lekcje, notki gramatyczne po polsku) |
| Dane użytkownika | IndexedDB lub localStorage + **przycisk eksportu/importu** na kopię zapasową (z mojej wiedzy Safari może czyścić dane stron, z których długo nie korzystasz, więc kopia zapasowa jest tania ubezpieczeniem) |
| Offline | service worker z cache na treści i fonty |
| AI | tylko do rozmowy i ćwiczeń, przez proxy z kluczem po stronie serwera |
| Hosting | darmowy statyczny hosting (GitHub Pages albo Cloudflare Pages) |
| Dwóch użytkowników | każdy ma własny postęp lokalnie, synchronizacja niepotrzebna na start |
| Powiadomienia | brak, zgodnie z założeniem. **Sprostowanie do wcześniejszej rozmowy:** web push na iPhone'ach działa od iOS 16.4 dla apek dodanych do ekranu głównego (z mojej wiedzy), więc opcjonalne przypomnienie można dodać później |

---

## 11. Ryzyka i otwarte pytania

1. **Weryfikacja treści.** Nikt z was nie czyta japońskiego na poziomie, który wyłapie błędy. Zabezpieczenie: dane z korpusów (Tatoeba, JMdict), notki gramatyczne porównywane z Tae Kimem, przycisk zgłaszania błędów.
2. **Romaji.** Źródła odradzają uczenie się z romaji. Propozycja: przez pierwsze lekcje pokazywać transkrypcję jako pomoc i stopniowo ją ukrywać.
3. **Kiedy zaczynać kanji.** Źródła mówią "po podstawach kana i gramatyki". Propozycja: od lekcji 40.
4. **Tempo.** 6 do 7 słów dziennie i 2 kanji na lekcję to tempo umiarkowane. Źródła o szybkim tempie podają 3 do 5 kanji dziennie, ale dla 15 do 20 minut dziennie to za dużo.
5. **Mnemoniki do kana.** Metody obrazkowe działają (są na nich oparte popularne książki), ale ich treści są chronione. Można poprosić AI o **własne, oryginalne mnemoniki po polsku** i przejrzeć je ręcznie.
6. **Limity API mogą się znowu zmienić**, więc warstwa dostawców powinna być wymienialna.

---

## 12. Plan budowy (fazy)

1. **Faza 1 (około tydzień):** trener kana z SRS, audio, tryb spokojny/codzienny, eksport danych.
2. **Faza 2:** słówka i zdania z OpenJLPT + Tatoeba, struktura lekcji z JSON.
3. **Faza 3:** proxy i rozmowy z AI z walidacją słownictwa.
4. **Faza 4:** notki gramatyczne, testy tygodniowe, kanji, strona "Źródła i licencje".

---

## 13. Brief do wklejenia do Claude Code (po angielsku)

```
Build a Polish-language PWA for learning Japanese (2 users, iPhone Safari, installed to Home Screen).
Constraints: no push notifications, no paid services, local-first storage (IndexedDB), JSON content files in repo.
Lesson model: 1 lesson per day OR per 2 days (user-selectable), ~15-20 min:
 SRS review -> new item (kana row or one grammar point with short Polish note + audio) -> 5-7 new words
 with example sentences -> production exercise -> short AI mini-dialogue limited to known vocabulary -> quick quiz.
Curriculum: ~100 lessons: hiragana (L1-8), katakana (L9-16), N5 grammar + vocab (L17-60), plain forms + kanji (L61-100).
Data: OpenJLPT N5 vocab/kanji (CC BY-SA 4.0) and Tatoeba sentences; translate glosses to Polish once, store as static JSON.
Audio: Web Speech API, lang ja-JP, trigger on user gesture, call speechSynthesis.cancel() before speak().
SRS: FSRS (e.g. ts-fsrs) or simple Leitner boxes.
AI: via a tiny proxy (e.g. Cloudflare Worker) holding the API key; provider-agnostic layer (Groq / Gemini Flash fallback);
 low temperature, JSON output, whitelist of known words sent in each prompt and validated on the response;
 separate prompts for conversation and for correction; "report error" button; cache generated exercises.
Never let the AI be the source of truth for grammar explanations; those are static, reviewed content.
Include a "Sources and licenses" screen (JMdict/KANJIDIC, OpenJLPT, Tatoeba, Tae Kim, KanjiVG).
Include export/import of user progress as a JSON file.
```

---

## Źródła

* [The Best Study Routine for Beginner Japanese Learners (Polyglottist)](https://www.polyglottistlanguageacademy.com/language-culture-travelling-blog/2026/5/21/the-best-study-routine-for-beginner-japanese-learners)
* [Japanese for Beginners: How to Start Learning Japanese in 2026 (KanaDojo)](https://kanadojo.com/academy/japanese-for-beginners-how-to-start)
* [How to Learn Japanese by Yourself (JIVX)](https://jivx.com/blog/how-to-learn-japanese-by-yourself)
* [Learn Japanese for beginners: the complete guide (Sakuraflow)](https://www.sakuraflow.app/blog/japanese-for-beginners)
* [Genki vs Minna no Nihongo (Migaku)](https://migaku.com/blog/japanese/genki-vs-minna-no-nihongo)
* [Top Picks: Best Japanese Learning Textbooks (Migaku)](https://migaku.com/blog/japanese/best-japanese-textbooks)
* [5 Best Japanese Textbooks For Beginners (Lingopie)](https://lingopie.com/blog/best-japanese-textbooks/)
* [Best Japanese Textbooks for Self Study 2026 (HelloTalk)](https://www.hellotalk.com/en/blog/best-japanese-textbooks-for-self-study-2026)
* [Best way to reach N5 with self study? (WaniKani forum)](https://community.wanikani.com/t/best-way-to-reach-n5-with-self-study/65925?page=2)
* [Are the Genki books actually any good? (WaniKani forum)](https://community.wanikani.com/t/are-the-genki-books-actually-any-good/59102)
* [Tae Kim's Guide, strona oficjalna z tłumaczeniami](https://guidetojapanese.org/learn/?p=625)
* [Tae Kim's Japanese guide to Japanese grammar (ibiblio)](https://ibiblio.org/catalog/items/show/4118)
* [Tae Kim's Guide, recenzja (All Language Resources)](https://www.alllanguageresources.com/?p=20680)
* [OpenJLPT (PyPI)](https://pypi.org/project/openjlpt/)
* [KanaDojo, źródła danych i licencje](https://kanadojo.com/credits)
* [Kumi, źródła danych i licencje](https://kumi.app/attributions)
* [Spaced Repetition in 2026 (Migaku)](https://migaku.com/blog/language-fun/spaced-repetition-in-2026-what-actually-works-for-language-learners)
* [Spaced repetition recap, FSRS (Domenic Denicola)](https://domenic.me/fsrs/)
* [Awesome FSRS](https://github.com/open-spaced-repetition/awesome-fsrs)
* [Duolingo Japanese Review (Migaku)](https://migaku.com/blog/japanese/duolingo-japanese-review)
* [Is Duolingo enough to learn Japanese? (Sakuraflow)](https://www.sakuraflow.app/blog/is-duolingo-enough-japanese)
* [Duolingo (why you hate?) (WaniKani forum)](https://community.wanikani.com/t/duolingo-why-you-hate/19819)
* [The dangers of using AI to learn Japanese grammar (Self Taught Japanese)](https://selftaughtjapanese.com/2025/07/10/the-dangers-of-using-ai-to-learn-japanese-grammar-a-case-of-hallucinating-chatgpt/)
* [Language learning and AI (Bunpro forum)](https://community.bunpro.jp/t/language-learning-and-ai/130136?page=3)
* [Using AI as a practice tool (Bunpro forum)](https://community.bunpro.jp/t/using-ai-as-a-practice-tool/162162/10)
* [Gemini API pricing changes 2026 (AgentDeals)](https://agentdeals.dev/gemini-api-pricing-changes)
* [Free LLM API Comparison 2026 (Novita)](https://blogs.novita.ai/free-llm-api-comparison-2026/)
* [Best Free AI APIs for Developers 2026 (DEV)](https://dev.to/hirak8/best-free-ai-apis-for-developers-2026-with-real-rate-limits-1k5l)
* [Web Speech API and Japanese voices on iOS (gist)](https://gist.github.com/wtnabe/03419571caec92d4bfb0a897c31dd15a)
* [Japanese Text to Speech (Web Speech API, voices)](https://www.gyanmirai.com/tools/japanese-text-to-speech)
