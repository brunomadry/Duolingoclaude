import { useState } from 'preact/hooks';
import { Avatar } from '../mascot/Mascot.tsx';
import { AVATARS } from '../mascot/parts.ts';
import { AVATAR_IDS, type AvatarId } from '../shared/avatars.ts';
import { MAX_NAME_LENGTH, defaultSettings, deviceTimeZone } from '../shared/defaults.ts';
import type { ProfileRecord, ProfileSettings } from '../shared/api.ts';
import {
  createProfile,
  deleteProfile,
  exportProfile,
  selectProfile,
  updateProfile,
} from '../state/app.ts';
import { Modal } from '../ui/Modal.tsx';
import { Segmented } from '../ui/Segmented.tsx';
import { showToast } from '../ui/toast.tsx';

interface ProfileEditorProps {
  /** Edit this profile; omit to create a new one. */
  profile?: ProfileRecord;
  first?: boolean;
  onDone: () => void;
  onCancel?: () => void;
}

export function ProfileEditor({ profile, first, onDone, onCancel }: ProfileEditorProps) {
  const [name, setName] = useState(profile?.name ?? '');
  const [avatar, setAvatar] = useState<AvatarId>(profile?.avatar ?? AVATAR_IDS[0]);
  const [pace, setPace] = useState<ProfileSettings['pace']>(profile?.settings.pace ?? 'daily');
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  const save = async (e: Event) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Wpisz imię albo ksywkę.');
      return;
    }
    setBusy(true);
    if (profile) {
      await updateProfile(profile.id, { name: trimmed, avatar, settings: { pace } });
      showToast('Zapisano profil.');
      onDone();
    } else {
      const created = await createProfile(trimmed, avatar, {
        ...defaultSettings(deviceTimeZone()),
        pace,
      });
      onDone();
      selectProfile(created.id);
    }
    setBusy(false);
  };

  const exportFirst = async () => {
    if (!profile) return;
    const result = await exportProfile(profile.id);
    if (result !== 'cancelled') showToast('Kopia zapisana. Możesz teraz usunąć profil.');
  };

  const remove = async () => {
    if (!profile) return;
    await deleteProfile(profile.id);
    setConfirmDelete(false);
    showToast(`Usunięto profil ${profile.name}.`);
    onDone();
  };

  return (
    <main class="screen stack waves">
      <h1 class="display" style={{ fontSize: 'var(--fs-xl)' }}>
        {profile ? 'Edytuj profil' : first ? 'Witaj! Kim jesteś?' : 'Nowy profil'}
      </h1>
      <form class="stack" onSubmit={save} noValidate>
        <div class="field">
          <label class="field__label" for="profile-name">
            Imię albo ksywka
          </label>
          <input
            id="profile-name"
            class="input"
            maxLength={MAX_NAME_LENGTH}
            autoComplete="off"
            value={name}
            onInput={(e) => {
              setName(e.currentTarget.value);
              setError(null);
            }}
            aria-invalid={error ? 'true' : undefined}
            aria-describedby={error ? 'profile-name-error' : undefined}
          />
          {error && (
            <p id="profile-name-error" class="field__error" role="alert">
              {error}
            </p>
          )}
        </div>

        <fieldset class="field" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend class="field__label" style={{ marginBottom: 'var(--space-2)' }}>
            Awatar
          </legend>
          <div class="avatar-choices">
            {AVATAR_IDS.map((id) => (
              <div class="avatar-choice" key={id}>
                <input
                  type="radio"
                  id={`avatar-${id}`}
                  name="avatar"
                  value={id}
                  checked={avatar === id}
                  onChange={() => setAvatar(id)}
                />
                <label for={`avatar-${id}`}>
                  <Avatar id={id} size={64} decorative />
                  {AVATARS[id].label}
                </label>
              </div>
            ))}
          </div>
        </fieldset>

        <div class="field">
          <span class="field__label" id="pace-label">
            Tempo
          </span>
          <Segmented
            label="Tempo"
            value={pace}
            onChange={setPace}
            options={[
              { value: 'daily', label: 'Codziennie' },
              { value: 'relaxed', label: 'Co 2 dni' },
            ]}
          />
          <p class="setting__hint">
            {pace === 'daily'
              ? 'Nowa lekcja co dzień o północy. Bez kar za przerwy.'
              : 'Nowa lekcja co dwa dni. Spokojnie i bez presji.'}
          </p>
        </div>

        <button class="btn btn--primary btn--block" type="submit" disabled={busy}>
          {profile ? 'Zapisz' : 'Zaczynamy'}
        </button>
        {onCancel && (
          <button class="btn btn--block" type="button" onClick={onCancel}>
            Anuluj
          </button>
        )}
        {profile && (
          <button
            class="btn btn--ghost btn--block"
            type="button"
            style={{ color: 'var(--error-text)' }}
            onClick={() => setConfirmDelete(true)}
          >
            Usuń profil
          </button>
        )}
      </form>

      {profile && (
        <Modal
          open={confirmDelete}
          onClose={() => setConfirmDelete(false)}
          title={`Usunąć profil ${profile.name}?`}
          variant="dialog"
        >
          <div class="stack">
            <p>
              Postęp tego profilu zniknie ze wszystkich urządzeń. Zanim usuniesz, możesz pobrać
              kopię (plik JSON) i kiedyś ją zaimportować.
            </p>
            <button class="btn btn--block" onClick={exportFirst}>
              Najpierw pobierz kopię
            </button>
            <button
              class="btn btn--block"
              style={{ borderColor: 'var(--error)', color: 'var(--error-text)' }}
              onClick={remove}
            >
              Usuń na zawsze
            </button>
            <button class="btn btn--ghost btn--block" onClick={() => setConfirmDelete(false)}>
              Anuluj
            </button>
          </div>
        </Modal>
      )}
    </main>
  );
}
