# iPhone QA checklist

Run through this on both phones after the first deploy and after big updates. Tick what works, write down what does not (or use "Zgłoś błąd" in the app).

## Install and access

- [ ] Safari opens the workers.dev URL; the access screen accepts the code and rejects a wrong one.
- [ ] Share, "Do ekranu początkowego": the icon (red panda) and the name look right; the app opens full screen without Safari bars.
- [ ] The splash screen shows in light and dark mode; no white flash.
- [ ] Notch and home indicator: nothing is hidden under them (top bar, tab bar, lesson buttons).

## Profiles and sync

- [ ] Create a profile on phone A; it appears on phone B after opening the app there.
- [ ] Finish a lesson on phone A in airplane mode; turn the network on: the sync status in the profile sheet goes back to "Zsynchronizowano".
- [ ] Export a backup (Share sheet) and import it again.
- [ ] Change the access code with `wrangler secret put`: both phones ask for the new code once.

## Lessons

- [ ] Lesson 1 opens on day one; lesson 2 opens the next day after local midnight (or two days later in the relaxed pace).
- [ ] Kana lessons: stroke order animates; "Kolejność kresek" works; romaji typing accepts si/shi, tu/tsu.
- [ ] From lesson 4: "Nowe słówka" shows each word with audio; typing a word in romaji shows the kana preview.
- [ ] From lesson 17: the grammar note has two pages; tiles can be placed and removed; gap fill and listening work.
- [ ] The conversation (needs internet and an AI key): replies come in a few seconds; "Podpowiedź" fills a suggested answer; "Pomiń rozmowę" always works; offline it says so and lets you continue.
- [ ] From lesson 61: kanji cards, kanji exercises, and known words switch to kanji with furigana.
- [ ] A test (lesson 7) shows only the test step and gives a hanko.

## Audio and speech

- [ ] The speaker buttons read Japanese with a Japanese voice (Settings, Accessibility, Spoken Content, Voices, Japanese, if missing).
- [ ] The sound switch in the profile sheet silences automatic audio after answers.

## Accessibility

- [ ] VoiceOver: every button has a name; Japanese is read with the Japanese voice; the lesson moves focus to each new question.
- [ ] Larger Text (Dynamic Type at the largest sizes): nothing overlaps, buttons stay tappable.
- [ ] Reduce Motion: no petal animation, stroke order shown at once with numbers, no smooth scrolling in the chat.
- [ ] Light and dark theme both readable (also outdoors in sunlight).

## Offline and updates

- [ ] After one visit with internet, airplane mode: lessons, Słówka, Gramatyka and Alfabet all work.
- [ ] After `npm run deploy`, the app shows "Nowa wersja aplikacji" and "Odśwież" reloads into the new version without losing progress.

## Edge cases

- [ ] Change of time zone while travelling: the next lesson does not open early or late by a day.
- [ ] The night of a DST change (last Sunday of March and October): unlocking still happens at local midnight.
- [ ] Two lessons done on the same day (relaxed pace off): reviews do not pile up beyond the session cap.
