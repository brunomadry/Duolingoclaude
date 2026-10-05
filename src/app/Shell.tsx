import { useState } from 'preact/hooks';
import { Avatar } from '../mascot/Mascot.tsx';
import type { ProfileRecord } from '../shared/api.ts';
import { GrammarScreen } from '../screens/GrammarScreen.tsx';
import { VocabScreen } from '../screens/VocabScreen.tsx';
import { AlphabetScreen } from '../screens/AlphabetScreen.tsx';
import { LicensesScreen } from '../screens/LicensesScreen.tsx';
import { ProfileEditor } from '../screens/ProfileEditor.tsx';
import { TodayScreen } from '../screens/TodayScreen.tsx';
import { StampsScreen } from '../screens/StampsScreen.tsx';
import { LessonPlayer } from '../screens/lesson/LessonPlayer.tsx';
import { BackIcon, BrushIcon, CardsIcon, ToriiIcon } from '../ui/icons.tsx';
import { SettingsSheet } from './SettingsSheet.tsx';
import { TABS, goBack, navigate, usePath } from './router.ts';

const TAB_ICONS: Record<string, () => preact.JSX.Element> = {
  '/': () => <ToriiIcon />,
  '/alfabet': () => (
    <span class="tabbar__glyph" lang="ja">
      あ
    </span>
  ),
  '/slowka': () => <CardsIcon />,
  '/gramatyka': () => <BrushIcon />,
};

interface Route {
  title: string;
  tab: boolean;
  render: () => preact.JSX.Element;
}

export function Shell({ profile }: { profile: ProfileRecord }) {
  const path = usePath();
  const [settingsOpen, setSettingsOpen] = useState(false);

  const home: Route = { title: 'Dziś', tab: true, render: () => <TodayScreen profile={profile} /> };
  const routes: Record<string, Route> = {
    '/': home,
    '/alfabet': { title: 'Alfabet', tab: true, render: () => <AlphabetScreen profile={profile} /> },
    '/slowka': { title: 'Słówka', tab: true, render: () => <VocabScreen profile={profile} /> },
    '/gramatyka': {
      title: 'Gramatyka',
      tab: true,
      render: () => <GrammarScreen profile={profile} />,
    },
    '/zrodla': { title: 'Źródła i licencje', tab: false, render: () => <LicensesScreen /> },
    '/pieczatki': {
      title: 'Pieczątki',
      tab: false,
      render: () => <StampsScreen profile={profile} />,
    },
  };

  // Full-screen flows without the tab bar.
  const lessonMatch = /^\/lekcja\/(\d{1,3})$/.exec(path);
  if (lessonMatch) {
    return <LessonPlayer key={path} profile={profile} mode="lesson" n={Number(lessonMatch[1])} />;
  }
  const sessionMatch = /^\/(powtorki|cwicz)(?:\/(kana|slowka))?$/.exec(path);
  if (sessionMatch) {
    return (
      <LessonPlayer
        key={path}
        profile={profile}
        mode={sessionMatch[1] === 'powtorki' ? 'reviews' : 'extra'}
        filter={
          sessionMatch[2] === 'kana' ? 'kana' : sessionMatch[2] === 'slowka' ? 'words' : 'all'
        }
      />
    );
  }

  if (path === '/profil') {
    return <ProfileEditor profile={profile} onDone={() => goBack()} onCancel={() => goBack()} />;
  }

  const route = routes[path] ?? home;

  return (
    <div class="shell">
      <header class="topbar">
        <div class="row" style={{ gap: 'var(--space-1)', minWidth: 0 }}>
          {!route.tab && (
            <button class="icon-button topbar__back" onClick={() => goBack()} aria-label="Wróć">
              <BackIcon />
            </button>
          )}
          <h1 class="topbar__title">{route.title}</h1>
        </div>
        <button
          class="avatar-button"
          onClick={() => setSettingsOpen(true)}
          aria-label={`Profil ${profile.name} i ustawienia`}
          aria-haspopup="dialog"
        >
          <Avatar id={profile.avatar} size={42} decorative />
        </button>
      </header>

      <main class="page" id="main">
        {route.render()}
      </main>

      <nav class="tabbar" aria-label="Główne sekcje">
        {TABS.map((t) => (
          <button
            key={t.path}
            class="tabbar__item"
            aria-current={path === t.path ? 'page' : undefined}
            onClick={() => navigate(t.path)}
          >
            <span class="tabbar__icon">{TAB_ICONS[t.path]?.()}</span>
            {t.label}
          </button>
        ))}
      </nav>

      <SettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} profile={profile} />
    </div>
  );
}
