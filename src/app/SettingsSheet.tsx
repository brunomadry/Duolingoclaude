import { useRef, useState } from 'preact/hooks';
import { Avatar } from '../mascot/Mascot.tsx';
import type { ProfileRecord, ProfileSettings } from '../shared/api.ts';
import {
  appState,
  exportProfile,
  importProfileFile,
  leaveProfile,
  syncNow,
  updateProfile,
} from '../state/app.ts';
import { useStore } from '../state/store.ts';
import { BackupError } from '../data/backup.ts';
import { navigate } from './router.ts';
import { Modal } from '../ui/Modal.tsx';
import { Segmented } from '../ui/Segmented.tsx';
import { showToast } from '../ui/toast.tsx';
import {
  BookIcon,
  ChevronIcon,
  DownloadIcon,
  FlagIcon,
  PencilIcon,
  SwapIcon,
  UploadIcon,
} from '../ui/icons.tsx';
import { ReportDialog } from './ReportDialog.tsx';
import { useSpeechStatus } from '../ui/SpeakButton.tsx';
import { JAPANESE_VOICE_HELP } from '../lib/speech.ts';

interface SettingsSheetProps {
  open: boolean;
  onClose: () => void;
  profile: ProfileRecord;
}

function syncLabel(s: ReturnType<typeof appState.get>['sync'], online: boolean): string {
  if (!online || s.status === 'offline') {
    return s.pending
      ? `Offline. Czeka na wysłanie: ${s.pending}.`
      : 'Offline. Wszystko zapisane na telefonie.';
  }
  if (s.status === 'syncing') return 'Synchronizuję…';
  if (s.status === 'error') return 'Nie udało się zsynchronizować. Spróbuję ponownie.';
  if (s.pending) return `Czeka na wysłanie: ${s.pending}.`;
  if (s.lastSyncedAt) {
    const t = new Date(s.lastSyncedAt).toLocaleTimeString('pl-PL', {
      hour: '2-digit',
      minute: '2-digit',
    });
    return `Zsynchronizowano o ${t}.`;
  }
  return 'Jeszcze nie zsynchronizowano.';
}

export function SettingsSheet({ open, onClose, profile }: SettingsSheetProps) {
  const { sync, online } = useStore(appState);
  const [reporting, setReporting] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const s = profile.settings;
  const speech = useSpeechStatus();

  const set = (patch: Partial<ProfileSettings>) =>
    void updateProfile(profile.id, { settings: patch });

  const go = (path: string) => {
    onClose();
    navigate(path);
  };

  const onImport = async (e: Event) => {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
      const id = await importProfileFile(file);
      showToast(
        id === profile.id ? 'Kopia scalona z tym profilem.' : 'Zaimportowano jako nowy profil.',
      );
    } catch (err) {
      showToast(err instanceof BackupError ? err.message : 'Nie udało się wczytać pliku.');
    }
  };

  return (
    <>
      <Modal open={open && !reporting} onClose={onClose} title="Profil i ustawienia" hideTitle>
        <div
          class="row"
          style={{ marginTop: 'calc(var(--space-7) * -1)', paddingRight: 'var(--space-7)' }}
        >
          <Avatar id={profile.avatar} size={56} decorative />
          <div class="grow" style={{ flex: 1, minWidth: 0 }}>
            <p class="display" style={{ fontSize: 'var(--fs-lg)' }}>
              {profile.name}
            </p>
            <button
              class="btn btn--ghost"
              style={{ padding: 0, minHeight: 32 }}
              onClick={() => void syncNow()}
            >
              <span
                class="muted"
                style={{ fontSize: 'var(--fs-sm)', fontWeight: 400 }}
                aria-live="polite"
              >
                {syncLabel(sync, online)}
              </span>
            </button>
          </div>
        </div>

        <div class="list" style={{ marginTop: 'var(--space-4)' }}>
          <button
            class="list__item"
            onClick={() => {
              onClose();
              leaveProfile();
            }}
          >
            <SwapIcon />
            <span class="grow">Zmień profil</span>
            <ChevronIcon />
          </button>
          <button class="list__item" onClick={() => go('/profil')}>
            <PencilIcon size={24} />
            <span class="grow">Imię i awatar</span>
            <ChevronIcon />
          </button>
        </div>

        <h3 class="section-label">Ustawienia</h3>
        <div class="list">
          <div class="setting">
            <span class="setting__label">Tempo</span>
            <Segmented
              label="Tempo"
              value={s.pace}
              onChange={(pace) => set({ pace })}
              options={[
                { value: 'daily', label: 'Codziennie' },
                { value: 'relaxed', label: 'Co 2 dni' },
              ]}
            />
          </div>
          <div class="setting">
            <span class="setting__label">Motyw</span>
            <Segmented
              label="Motyw"
              value={s.theme}
              onChange={(theme) => set({ theme })}
              options={[
                { value: 'dark', label: 'Ciemny' },
                { value: 'light', label: 'Jasny' },
              ]}
            />
          </div>
          <div class="setting">
            <span class="setting__label">Romaji</span>
            <Segmented
              label="Romaji"
              value={s.romaji}
              onChange={(romaji) => set({ romaji })}
              options={[
                { value: 'auto', label: 'Auto' },
                { value: 'always', label: 'Zawsze' },
                { value: 'never', label: 'Nigdy' },
              ]}
            />
            <span class="setting__hint">
              Auto: widoczne do lekcji 16, potem ukryte, ale dostępne po dotknięciu.
            </span>
          </div>
          <label class="list__item" style={{ cursor: 'pointer' }}>
            <span class="grow setting__label">Dźwięk</span>
            <input
              type="checkbox"
              class="switch"
              role="switch"
              checked={s.sound}
              onChange={(e) => set({ sound: e.currentTarget.checked })}
            />
          </label>
          {(speech === 'no-voice' || speech === 'unsupported') && (
            <p class="setting" role="note">
              <span class="setting__hint">{JAPANESE_VOICE_HELP}</span>
            </p>
          )}
        </div>

        <h3 class="section-label">Dane i pomoc</h3>
        <div class="list">
          <button
            class="list__item"
            onClick={async () => {
              const r = await exportProfile(profile.id);
              if (r === 'downloaded') showToast('Pobrano kopię postępu.');
            }}
          >
            <DownloadIcon />
            <span class="grow">Eksportuj postęp</span>
          </button>
          <button class="list__item" onClick={() => fileInput.current?.click()}>
            <UploadIcon />
            <span class="grow">Importuj postęp</span>
          </button>
          <button class="list__item" onClick={() => go('/zrodla')}>
            <BookIcon />
            <span class="grow">Źródła i licencje</span>
            <ChevronIcon />
          </button>
          <button class="list__item" onClick={() => setReporting(true)}>
            <FlagIcon />
            <span class="grow">Zgłoś błąd</span>
          </button>
        </div>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          class="visually-hidden"
          tabIndex={-1}
          aria-hidden="true"
          onChange={onImport}
        />
      </Modal>
      <ReportDialog
        open={open && reporting}
        onClose={() => setReporting(false)}
        context="settings"
      />
    </>
  );
}
