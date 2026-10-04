import { useState } from 'preact/hooks';
import { Avatar } from '../mascot/Mascot.tsx';
import { appState, selectProfile } from '../state/app.ts';
import { useStore } from '../state/store.ts';
import { PencilIcon, PlusIcon } from '../ui/icons.tsx';
import type { ProfileRecord } from '../shared/api.ts';
import { ProfileEditor } from './ProfileEditor.tsx';
import { EmptyState } from '../ui/EmptyState.tsx';

export const MAX_PROFILES = 6;

type Mode = { kind: 'list' } | { kind: 'create' } | { kind: 'edit'; profile: ProfileRecord };

export function ProfilePicker() {
  const { profiles, lastProfileId, sync } = useStore(appState);
  const [editing, setEditing] = useState(false);
  const [mode, setMode] = useState<Mode>({ kind: 'list' });

  // No profiles yet: wait for the first sync (another device may have created them)
  // before offering to create the very first profile.
  if (mode.kind === 'list' && profiles.length === 0) {
    if (sync.status === 'syncing') {
      return (
        <main class="screen centered-screen" aria-busy="true">
          <EmptyState
            title="Wczytuję profile…"
            text="Sprawdzam, czy masz już konto na innym urządzeniu."
            pose="thinking"
          />
        </main>
      );
    }
    return <ProfileEditor onDone={() => setMode({ kind: 'list' })} first />;
  }

  if (mode.kind === 'create') {
    return (
      <ProfileEditor
        onDone={() => setMode({ kind: 'list' })}
        onCancel={() => setMode({ kind: 'list' })}
      />
    );
  }
  if (mode.kind === 'edit') {
    return (
      <ProfileEditor
        profile={mode.profile}
        onDone={() => setMode({ kind: 'list' })}
        onCancel={() => setMode({ kind: 'list' })}
      />
    );
  }

  return (
    <main class="screen picker waves">
      <h1 class="picker__title">{editing ? 'Edytuj profile' : 'Kto się dziś uczy?'}</h1>
      <ul class="profile-grid" role="list" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {profiles.map((p) => (
          <li key={p.id}>
            <button
              class={`profile-card btn--block${!editing && p.id === lastProfileId ? ' profile-card--last' : ''}`}
              onClick={() =>
                editing ? setMode({ kind: 'edit', profile: p }) : selectProfile(p.id)
              }
              aria-label={editing ? `Edytuj profil ${p.name}` : `Ucz się jako ${p.name}`}
            >
              <Avatar id={p.avatar} size={96} decorative />
              <span class="profile-card__name">{p.name}</span>
              {editing && (
                <span class="profile-card__edit" aria-hidden="true">
                  <PencilIcon />
                </span>
              )}
            </button>
          </li>
        ))}
        {!editing && profiles.length < MAX_PROFILES && (
          <li>
            <button
              class="profile-card profile-card--add btn--block"
              onClick={() => setMode({ kind: 'create' })}
            >
              <span class="plus" aria-hidden="true">
                <PlusIcon size={32} />
              </span>
              <span class="profile-card__name">Dodaj profil</span>
            </button>
          </li>
        )}
      </ul>
      {profiles.length > 0 && (
        <button
          class="btn"
          style={{ alignSelf: 'center' }}
          onClick={() => setEditing(!editing)}
          aria-pressed={editing}
        >
          {editing ? 'Gotowe' : 'Edytuj'}
        </button>
      )}
    </main>
  );
}
