import React, { useState, useEffect, useRef } from 'react';
import { Eye, EyeOff, Upload, Settings as SettingsIcon, ChevronLeft, Trash2, Plus, Search, Layers, FileText, Cloud, Download, RefreshCw, LogOut, Check, AlertTriangle, HardDriveDownload } from 'lucide-react';

const COLORS = {
  paper: '#F5F1E6',
  card: '#FFFDF7',
  ink: '#22314A',
  inkFaint: '#5B6B85',
  rule: '#DCD3B9',
  red: '#A5333B',
  redBg: '#F5DEDA',
  green: '#2E6B4F',
  greenBg: '#DCEEE3',
  mustard: '#B9822A',
  mustardBg: '#F1E2C4',
};

const DECKS_KEY = 'flashdrill:v2:decks';
const CARDS_KEY = 'flashdrill:v2:cards';
const SETTINGS_KEY = 'flashdrill:v2:settings';
const BACKUP_META_KEY = 'flashdrill:v2:backupMeta';

// ---- Google Drive backup config -------------------------------------------------
// Replace with your own OAuth Web Client ID from Google Cloud Console before this
// will work. It will NOT authenticate inside the Claude preview — it needs to be
// hosted on a real domain (e.g. GitHub Pages) that's registered as an authorized
// JavaScript origin for this client ID. See the setup notes in the Backup screen.
const GOOGLE_CLIENT_ID = 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
const DRIVE_BACKUP_FILENAME = 'flashdrill-backup.json';
const BACKUP_VERSION = 2;
const AUTO_BACKUP_OPTIONS = [
  { value: 0, label: 'Off' },
  { value: 1, label: 'Daily' },
  { value: 2, label: 'Every 2 days' },
  { value: 3, label: 'Every 3 days' },
  { value: 7, label: 'Weekly' },
];

const SAMPLE_TEXT = `$Who is known as the chief architect of the Indian Constitution?
@Dr. B. R. Ambedkar
@Mahatma Gandhi
@Jawaharlal Nehru
@Sardar Vallabhbhai Patel
@He chaired the Constitution Drafting Committee`;

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function chunkArray(arr, size) {
  const s = Math.max(1, size);
  const out = [];
  for (let i = 0; i < arr.length; i += s) out.push(arr.slice(i, i + s));
  return out;
}

// Orders a pool of card ids per the user's practice-order setting.
// 'random' (default) reshuffles; 'new'/'old' sort by createdAt; 'difficult' sorts by ease (lower = harder).
function orderPool(ids, order, allCards) {
  const byId = {};
  allCards.forEach((c) => { byId[c.id] = c; });
  const arr = [...ids];
  if (order === 'new') return arr.sort((a, b) => (byId[b] ? byId[b].createdAt || 0 : 0) - (byId[a] ? byId[a].createdAt || 0 : 0));
  if (order === 'old') return arr.sort((a, b) => (byId[a] ? byId[a].createdAt || 0 : 0) - (byId[b] ? byId[b].createdAt || 0 : 0));
  if (order === 'difficult') {
    return arr.sort((a, b) => {
      const easeA = byId[a] && byId[a].sr && typeof byId[a].sr.ease === 'number' ? byId[a].sr.ease : 2.5;
      const easeB = byId[b] && byId[b].sr && typeof byId[b].sr.ease === 'number' ? byId[b].sr.ease : 2.5;
      return easeA - easeB;
    });
  }
  return shuffle(arr);
}

function parseCards(text) {
  const lines = text.split('\n');
  const cards = [];
  const errors = [];
  let current = null;

  function pushCurrent() {
    if (!current) return;
    const at = current.atLines;
    if (at.length === 4 || at.length === 5) {
      cards.push({
        id: `c_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        question: current.question,
        correctAnswer: at[0],
        distractors: [at[1], at[2], at[3]],
        hint: at.length === 5 ? at[4] : null,
        createdAt: Date.now() + cards.length,
      });
    } else if (current.question) {
      errors.push(`"${current.question.slice(0, 44)}" has ${at.length} @ line(s), needs 4 or 5.`);
    }
  }

  lines.forEach((raw) => {
    const line = raw.trim();
    if (!line) return;
    if (line.startsWith('$')) {
      pushCurrent();
      current = { question: line.slice(1).trim(), atLines: [] };
    } else if (line.startsWith('@')) {
      if (current) current.atLines.push(line.slice(1).trim());
    }
  });
  pushCurrent();

  return { cards, errors };
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function addDaysStr(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function defaultSr() {
  return { interval: 0, ease: 2.5, reps: 0, due: todayStr() };
}

// Simplified SM-2: binary quality signal (correct-first-try vs missed-first-try)
function scheduleNext(sr, correct) {
  let interval = sr && typeof sr.interval === 'number' ? sr.interval : 0;
  let ease = sr && typeof sr.ease === 'number' ? sr.ease : 2.5;
  let reps = sr && typeof sr.reps === 'number' ? sr.reps : 0;
  const quality = correct ? 5 : 2;

  if (correct) {
    if (reps === 0) interval = 1;
    else if (reps === 1) interval = 6;
    else interval = Math.round(interval * ease);
    reps += 1;
  } else {
    reps = 0;
    interval = 1;
  }

  ease = Math.max(1.3, ease + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)));
  return { interval, ease, reps, due: addDaysStr(interval) };
}

function buildBackupPayload(decks, cards, settings) {
  return {
    app: 'flashdrill',
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    decks,
    cards,
    settings,
  };
}

function validateBackupShape(obj) {
  if (!obj || typeof obj !== 'object') return 'File is not valid JSON.';
  if (!Array.isArray(obj.decks) || !Array.isArray(obj.cards)) return 'This file is missing decks or cards — it may not be a Flashcard Drill backup.';
  return null;
}

function formatTimestamp(iso) {
  if (!iso) return 'never';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'never';
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const datePart = sameDay ? 'today' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const timePart = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${datePart}, ${timePart}`;
}

// Lazily injects the Google Identity Services script. Resolves once window.google
// is usable, rejects if it can't load (e.g. blocked in a sandboxed preview).
let gsiLoadPromise = null;
function loadGoogleIdentityScript() {
  if (window.google && window.google.accounts && window.google.accounts.oauth2) {
    return Promise.resolve();
  }
  if (gsiLoadPromise) return gsiLoadPromise;
  gsiLoadPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-gsi="true"]');
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('script-blocked')));
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.dataset.gsi = 'true';
    script.onload = () => {
      if (window.google && window.google.accounts && window.google.accounts.oauth2) resolve();
      else reject(new Error('script-loaded-but-unusable'));
    };
    script.onerror = () => reject(new Error('script-blocked'));
    document.head.appendChild(script);
    setTimeout(() => reject(new Error('timeout')), 6000);
  });
  return gsiLoadPromise;
}

export default function FlashcardDrillApp() {
  const [loaded, setLoaded] = useState(false);
  const [view, setView] = useState('home'); // home | newDeck | import | deck | settings | practice
  const [decks, setDecks] = useState([]);
  const [cards, setCards] = useState([]);
  const [cycleSize, setCycleSize] = useState(10);
  const [selectedDeckId, setSelectedDeckId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  // new deck screen state
  const [newDeckName, setNewDeckName] = useState('');
  const [newDeckCategory, setNewDeckCategory] = useState('');

  // import screen state
  const [importText, setImportText] = useState('');
  const [parsedPreview, setParsedPreview] = useState(null);
  const [importMode, setImportMode] = useState('add'); // add | replace

  // settings screen state
  const [cycleSizeDraft, setCycleSizeDraft] = useState('10');
  const [practiceOrder, setPracticeOrder] = useState('random'); // new | old | difficult | random
  const [confirmReset, setConfirmReset] = useState(false);

  // backup & restore state
  const [lastLocalBackupAt, setLastLocalBackupAt] = useState(null);
  const [lastDriveBackupAt, setLastDriveBackupAt] = useState(null);
  const [autoBackupFreqDays, setAutoBackupFreqDays] = useState(0);
  const [googleSignedIn, setGoogleSignedIn] = useState(false);
  const [googleEmail, setGoogleEmail] = useState(null);
  const [driveAccessToken, setDriveAccessToken] = useState(null);
  const [driveBusy, setDriveBusy] = useState(false);
  const [driveNotice, setDriveNotice] = useState(null); // { tone: 'error'|'success'|'info', text }
  const [pendingRestore, setPendingRestore] = useState(null); // { source: 'file'|'drive', payload }
  const tokenClientRef = useRef(null);
  const restoreFileInputRef = useRef(null);
  const autoBackupCheckedRef = useRef(false);

  // deck detail state
  const [confirmDeleteDeck, setConfirmDeleteDeck] = useState(false);

  // practice session state
  const [cycles, setCycles] = useState([]);
  const [cycleIndex, setCycleIndex] = useState(0);
  const [cycleOrder, setCycleOrder] = useState([]);
  const [cardPos, setCardPos] = useState(0);
  const [missedSet, setMissedSet] = useState(new Set());
  const [roundNumber, setRoundNumber] = useState(1);
  const [phase, setPhase] = useState('question'); // question | cycleComplete | roundComplete | allClear
  const [currentOptions, setCurrentOptions] = useState([]);
  const [firstAttempt, setFirstAttempt] = useState(true);
  const [flashWrongIdx, setFlashWrongIdx] = useState(null);
  const [flashCorrectIdx, setFlashCorrectIdx] = useState(null);
  const [showHint, setShowHint] = useState(false);

  // flip-mode (traditional flashcard) state — independent of MCQ/SR entirely
  const [flipOrder, setFlipOrder] = useState([]);
  const [flipIndex, setFlipIndex] = useState(0);
  const [flipShowAnswer, setFlipShowAnswer] = useState(false);

  // whole-session (across rounds) tracking, used for spaced-repetition scheduling
  const [sessionPoolIds, setSessionPoolIds] = useState([]);
  const [sessionEverMissed, setSessionEverMissed] = useState(new Set());
  const [sessionLabel, setSessionLabel] = useState('');
  const [returnView, setReturnView] = useState('home');
  const scheduleAppliedRef = useRef(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await window.storage.get(DECKS_KEY, false);
        if (res && res.value) setDecks(JSON.parse(res.value));
      } catch (e) {}
      try {
        const res = await window.storage.get(CARDS_KEY, false);
        if (res && res.value) setCards(JSON.parse(res.value));
      } catch (e) {}
      try {
        const res = await window.storage.get(SETTINGS_KEY, false);
        if (res && res.value) {
          const s = JSON.parse(res.value);
          if (s.cycleSize) {
            setCycleSize(s.cycleSize);
            setCycleSizeDraft(String(s.cycleSize));
          }
          if (s.practiceOrder) setPracticeOrder(s.practiceOrder);
        }
      } catch (e) {}
      try {
        const res = await window.storage.get(BACKUP_META_KEY, false);
        if (res && res.value) {
          const m = JSON.parse(res.value);
          if (m.lastLocalBackupAt) setLastLocalBackupAt(m.lastLocalBackupAt);
          if (m.lastDriveBackupAt) setLastDriveBackupAt(m.lastDriveBackupAt);
          if (typeof m.autoBackupFreqDays === 'number') setAutoBackupFreqDays(m.autoBackupFreqDays);
          if (m.googleEmail) setGoogleEmail(m.googleEmail);
        }
      } catch (e) {}
      setLoaded(true);
    })();
  }, []);

  async function persistDecks(next) {
    setDecks(next);
    try {
      await window.storage.set(DECKS_KEY, JSON.stringify(next), false);
    } catch (e) {}
  }

  async function persistCards(next) {
    setCards(next);
    try {
      await window.storage.set(CARDS_KEY, JSON.stringify(next), false);
    } catch (e) {}
  }

  async function persistSettings(nextCycleSize, nextOrder) {
    setCycleSize(nextCycleSize);
    setPracticeOrder(nextOrder);
    try {
      await window.storage.set(SETTINGS_KEY, JSON.stringify({ cycleSize: nextCycleSize, practiceOrder: nextOrder }), false);
    } catch (e) {}
  }

  async function persistBackupMeta(patch) {
    const next = {
      lastLocalBackupAt,
      lastDriveBackupAt,
      autoBackupFreqDays,
      googleEmail,
      ...patch,
    };
    if ('lastLocalBackupAt' in patch) setLastLocalBackupAt(patch.lastLocalBackupAt);
    if ('lastDriveBackupAt' in patch) setLastDriveBackupAt(patch.lastDriveBackupAt);
    if ('autoBackupFreqDays' in patch) setAutoBackupFreqDays(patch.autoBackupFreqDays);
    if ('googleEmail' in patch) setGoogleEmail(patch.googleEmail);
    try {
      await window.storage.set(BACKUP_META_KEY, JSON.stringify(next), false);
    } catch (e) {}
  }

  // ---------- Local backup (fully works right here in the preview) ----------

  function downloadLocalBackup() {
    const payload = buildBackupPayload(decks, cards, { cycleSize, practiceOrder });
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const stamp = todayStr();
    a.href = url;
    a.download = `flashdrill-backup-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    persistBackupMeta({ lastLocalBackupAt: new Date().toISOString() });
    setDriveNotice({ tone: 'success', text: 'Backup file downloaded.' });
  }

  function triggerRestoreFilePicker() {
    if (restoreFileInputRef.current) restoreFileInputRef.current.click();
  }

  function handleRestoreFileSelected(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        const err = validateBackupShape(parsed);
        if (err) {
          setDriveNotice({ tone: 'error', text: err });
          return;
        }
        setPendingRestore({ source: 'file', payload: parsed });
      } catch (err) {
        setDriveNotice({ tone: 'error', text: 'Could not read that file — make sure it\'s an unedited backup JSON.' });
      }
    };
    reader.onerror = () => setDriveNotice({ tone: 'error', text: 'Could not read that file.' });
    reader.readAsText(file);
  }

  function applyPendingRestore() {
    if (!pendingRestore) return;
    const { payload } = pendingRestore;
    persistDecks(Array.isArray(payload.decks) ? payload.decks : []);
    persistCards(Array.isArray(payload.cards) ? payload.cards : []);
    if (payload.settings) {
      persistSettings(payload.settings.cycleSize || cycleSize, payload.settings.practiceOrder || practiceOrder);
    }
    setPendingRestore(null);
    setDriveNotice({ tone: 'success', text: 'Restore complete.' });
    setSelectedDeckId(null);
  }

  // ---------- Google Sign-In + Drive backup ----------
  // NOTE: this requires GOOGLE_CLIENT_ID to be set to a real OAuth client, and the
  // app to be served from a domain registered as an authorized origin for that
  // client. Inside the Claude artifact preview, sign-in will fail gracefully and
  // show a message explaining why — that's expected here, not a bug.

  function driveConfigured() {
    return GOOGLE_CLIENT_ID && !GOOGLE_CLIENT_ID.startsWith('YOUR_');
  }

  async function ensureTokenClient() {
    await loadGoogleIdentityScript();
    if (!tokenClientRef.current) {
      tokenClientRef.current = window.google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: DRIVE_SCOPE,
        callback: () => {}, // overridden per-call below
      });
    }
    return tokenClientRef.current;
  }

  function requestDriveToken() {
    return new Promise(async (resolve, reject) => {
      if (!driveConfigured()) {
        reject(new Error('not-configured'));
        return;
      }
      try {
        const client = await ensureTokenClient();
        client.callback = (resp) => {
          if (resp && resp.access_token) resolve(resp.access_token);
          else reject(new Error('no-token'));
        };
        client.requestAccessToken({ prompt: googleSignedIn ? '' : 'consent' });
      } catch (e) {
        reject(e);
      }
    });
  }

  async function handleGoogleSignIn() {
    setDriveNotice(null);
    if (!driveConfigured()) {
      setDriveNotice({
        tone: 'error',
        text: 'Google Sign-in isn\u2019t set up yet. Add your OAuth Client ID at the top of this file and host the app on a real domain (see setup notes below) \u2014 it can\u2019t authenticate inside this preview.',
      });
      return;
    }
    setDriveBusy(true);
    try {
      const token = await requestDriveToken();
      setDriveAccessToken(token);
      setGoogleSignedIn(true);
      try {
        const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const info = await res.json();
          if (info.email) persistBackupMeta({ googleEmail: info.email });
        }
      } catch (e) {}
      setDriveNotice({ tone: 'success', text: 'Signed in.' });
    } catch (e) {
      setDriveNotice({
        tone: 'error',
        text: e && e.message === 'script-blocked'
          ? 'Google\u2019s sign-in script couldn\u2019t load here \u2014 this preview sandbox blocks it. This works once hosted on your own domain.'
          : 'Sign-in didn\u2019t complete. If this is hosted, check that your domain is an authorized origin in Google Cloud Console.',
      });
    } finally {
      setDriveBusy(false);
    }
  }

  function handleGoogleSignOut() {
    if (driveAccessToken && window.google && window.google.accounts && window.google.accounts.oauth2) {
      try { window.google.accounts.oauth2.revoke(driveAccessToken, () => {}); } catch (e) {}
    }
    setDriveAccessToken(null);
    setGoogleSignedIn(false);
    setDriveNotice(null);
  }

  async function driveFindBackupFileId(token) {
    const q = encodeURIComponent(`name='${DRIVE_BACKUP_FILENAME}'`);
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=${q}&fields=files(id,modifiedTime)`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) throw new Error('drive-list-failed');
    const data = await res.json();
    return data.files && data.files.length ? data.files[0].id : null;
  }

  async function driveBackupNow(silent) {
    if (!silent) setDriveNotice(null);
    setDriveBusy(true);
    try {
      let token = driveAccessToken;
      if (!token) token = await requestDriveToken();
      const payload = buildBackupPayload(decks, cards, { cycleSize, practiceOrder });
      const existingId = await driveFindBackupFileId(token);
      const metadata = { name: DRIVE_BACKUP_FILENAME, mimeType: 'application/json', parents: existingId ? undefined : ['appDataFolder'] };
      const boundary = 'flashdrill_boundary';
      const body =
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
        `--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(payload)}\r\n--${boundary}--`;
      const url = existingId
        ? `https://www.googleapis.com/upload/drive/v3/files/${existingId}?uploadType=multipart`
        : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
      const res = await fetch(url, {
        method: existingId ? 'PATCH' : 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
        body,
      });
      if (!res.ok) throw new Error('drive-upload-failed');
      setDriveAccessToken(token);
      setGoogleSignedIn(true);
      persistBackupMeta({ lastDriveBackupAt: new Date().toISOString() });
      if (!silent) setDriveNotice({ tone: 'success', text: 'Backed up to Google Drive.' });
    } catch (e) {
      if (!silent) {
        setDriveNotice({ tone: 'error', text: 'Drive backup failed. Sign in again and retry.' });
      }
    } finally {
      setDriveBusy(false);
    }
  }

  async function driveRestoreNow() {
    setDriveNotice(null);
    setDriveBusy(true);
    try {
      let token = driveAccessToken;
      if (!token) token = await requestDriveToken();
      const fileId = await driveFindBackupFileId(token);
      if (!fileId) {
        setDriveNotice({ tone: 'error', text: 'No backup found in Google Drive yet.' });
        return;
      }
      const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('drive-download-failed');
      const parsed = await res.json();
      const err = validateBackupShape(parsed);
      if (err) {
        setDriveNotice({ tone: 'error', text: err });
        return;
      }
      setDriveAccessToken(token);
      setGoogleSignedIn(true);
      setPendingRestore({ source: 'drive', payload: parsed });
    } catch (e) {
      setDriveNotice({ tone: 'error', text: 'Couldn\u2019t reach Google Drive. Check your connection and sign-in.' });
    } finally {
      setDriveBusy(false);
    }
  }

  function chooseAutoBackupFreq(days) {
    persistBackupMeta({ autoBackupFreqDays: days });
  }

  // Runs once per app load: if auto-backup is on, signed in, and enough time has
  // passed since the last Drive backup, back up silently in the background.
  useEffect(() => {
    if (!loaded || autoBackupCheckedRef.current) return;
    if (!googleSignedIn || autoBackupFreqDays <= 0) return;
    autoBackupCheckedRef.current = true;
    const dueMs = autoBackupFreqDays * 24 * 60 * 60 * 1000;
    const last = lastDriveBackupAt ? new Date(lastDriveBackupAt).getTime() : 0;
    if (Date.now() - last >= dueMs) {
      driveBackupNow(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, googleSignedIn, autoBackupFreqDays, lastDriveBackupAt]);

  // regenerate options whenever we land on a new question
  useEffect(() => {
    if (view !== 'practice' || phase !== 'question') return;
    if (!cycleOrder.length) return;
    const id = cycleOrder[cardPos];
    const card = cards.find((c) => c.id === id);
    if (!card) return;
    const opts = shuffle([
      { text: card.correctAnswer, correct: true },
      { text: card.distractors[0], correct: false },
      { text: card.distractors[1], correct: false },
      { text: card.distractors[2], correct: false },
    ]);
    setCurrentOptions(opts);
    setFirstAttempt(true);
    setShowHint(false);
    setFlashWrongIdx(null);
    setFlashCorrectIdx(null);
  }, [view, phase, cycleIndex, cardPos, cycleOrder, cards]);

  // apply spaced-repetition scheduling once a full session (all rounds) is mastered
  useEffect(() => {
    if (phase === 'allClear' && !scheduleAppliedRef.current) {
      scheduleAppliedRef.current = true;
      const updated = cards.map((c) => {
        if (!sessionPoolIds.includes(c.id)) return c;
        const correct = !sessionEverMissed.has(c.id);
        return { ...c, sr: scheduleNext(c.sr, correct) };
      });
      persistCards(updated);
    }
    if (phase !== 'allClear') {
      scheduleAppliedRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  function startRound(poolIds, round) {
    const ordered = orderPool(poolIds, practiceOrder, cards);
    const chunks = chunkArray(ordered, cycleSize);
    setCycles(chunks);
    setCycleIndex(0);
    setCycleOrder(shuffle(chunks[0] || []));
    setCardPos(0);
    setMissedSet(new Set());
    setRoundNumber(round);
    setPhase('question');
    setView('practice');
  }

  function beginSession(poolIds, returnTo, label) {
    if (!poolIds.length) return;
    setSessionPoolIds(poolIds);
    setSessionEverMissed(new Set());
    setSessionLabel(label);
    setReturnView(returnTo);
    startRound(poolIds, 1);
  }

  function startFlip(poolIds) {
    if (!poolIds.length) return;
    setFlipOrder(orderPool(poolIds, practiceOrder, cards));
    setFlipIndex(0);
    setFlipShowAnswer(false);
    setView('flip');
  }

  function continueToNextCycle() {
    const nextIdx = cycleIndex + 1;
    setCycleIndex(nextIdx);
    setCycleOrder(shuffle(cycles[nextIdx]));
    setCardPos(0);
    setPhase('question');
  }

  function startReviewRound() {
    startRound(Array.from(missedSet), roundNumber + 1);
  }

  function handleAdvance() {
    const nextPos = cardPos + 1;
    if (nextPos < cycleOrder.length) {
      setCardPos(nextPos);
      return;
    }
    if (cycleIndex + 1 < cycles.length) {
      setPhase('cycleComplete');
    } else if (missedSet.size > 0) {
      setPhase('roundComplete');
    } else {
      setPhase('allClear');
    }
  }

  function handleOptionClick(idx) {
    if (phase !== 'question' || flashCorrectIdx !== null) return;
    const opt = currentOptions[idx];
    if (!opt) return;
    if (opt.correct) {
      setFlashCorrectIdx(idx);
      setTimeout(() => {
        setFlashCorrectIdx(null);
        handleAdvance();
      }, 350);
    } else {
      if (firstAttempt) {
        const id = cycleOrder[cardPos];
        setMissedSet((prev) => new Set(prev).add(id));
        setSessionEverMissed((prev) => new Set(prev).add(id));
        setFirstAttempt(false);
      }
      setFlashWrongIdx(idx);
      setTimeout(() => setFlashWrongIdx(null), 400);
    }
  }

  function createDeck() {
    const name = newDeckName.trim();
    if (!name) return;
    const category = newDeckCategory.trim() || null;
    const deck = {
      id: `d_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      name,
      category,
      createdAt: Date.now(),
    };
    persistDecks([...decks, deck]);
    setSelectedDeckId(deck.id);
    setNewDeckName('');
    setNewDeckCategory('');
    setImportText('');
    setParsedPreview(null);
    setView('import');
  }

  function handleImportParse() {
    setParsedPreview(parseCards(importText));
  }

  function commitImport() {
    if (!parsedPreview || parsedPreview.cards.length === 0 || !selectedDeckId) return;
    const withMeta = parsedPreview.cards.map((c) => ({ ...c, deckId: selectedDeckId, sr: defaultSr() }));
    const next =
      importMode === 'replace'
        ? [...cards.filter((c) => c.deckId !== selectedDeckId), ...withMeta]
        : [...cards, ...withMeta];
    persistCards(next);
    setImportText('');
    setParsedPreview(null);
    setView('deck');
  }

  function saveCycleSize() {
    const n = Math.max(1, parseInt(cycleSizeDraft, 10) || 1);
    persistSettings(n, practiceOrder);
    setCycleSizeDraft(String(n));
  }

  function choosePracticeOrder(order) {
    persistSettings(cycleSize, order);
  }

  function resetEverything() {
    persistDecks([]);
    persistCards([]);
    setConfirmReset(false);
    setSelectedDeckId(null);
    setView('home');
  }

  function deleteDeck(deckId) {
    persistDecks(decks.filter((d) => d.id !== deckId));
    persistCards(cards.filter((c) => c.deckId !== deckId));
    setConfirmDeleteDeck(false);
    setSelectedDeckId(null);
    setView('home');
  }

  const today = todayStr();
  const categories = Array.from(new Set(decks.map((d) => d.category).filter(Boolean)));
  const totalDue = cards.filter((c) => c.sr && c.sr.due <= today).length;
  const selectedDeck = decks.find((d) => d.id === selectedDeckId) || null;
  const currentCard =
    view === 'practice' && cycleOrder.length ? cards.find((c) => c.id === cycleOrder[cardPos]) : null;

  const fontStyle = { fontFamily: "'Roboto Slab', serif" };
  const monoStyle = { fontFamily: "'Space Mono', monospace" };

  let content = null;

  if (!loaded) {
    content = (
      <div className="py-16 text-center" style={{ ...monoStyle, color: COLORS.inkFaint }}>
        loading decks...
      </div>
    );
  } else if (view === 'home') {
    const q = searchQuery.trim().toLowerCase();
    const searchedDecks = q
      ? decks.filter((d) => d.name.toLowerCase().includes(q) || (d.category || '').toLowerCase().includes(q))
      : decks;
    const grouped = {};
    searchedDecks.forEach((d) => {
      const key = d.category && d.category.trim() ? d.category.trim() : 'Uncategorized';
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(d);
    });
    const categoryKeys = Object.keys(grouped).sort((a, b) => {
      if (a === 'Uncategorized') return 1;
      if (b === 'Uncategorized') return -1;
      return a.localeCompare(b);
    });

    content = (
      <div className="flex flex-col gap-3">
        <button
          onClick={() => {
            const dueIds = cards.filter((c) => c.sr && c.sr.due <= today).map((c) => c.id);
            beginSession(dueIds, 'home', 'All Decks · Due');
          }}
          disabled={totalDue === 0}
          style={{ backgroundColor: totalDue > 0 ? COLORS.mustard : '#C9C2AC', ...fontStyle }}
          className="w-full rounded-xl py-3 text-white font-bold tracking-wide focus:outline-none focus:ring-2 focus:ring-offset-2"
        >
          Review All Due ({totalDue})
        </button>

        <div className="flex gap-2">
          <button
            onClick={() => setView('newDeck')}
            style={{ borderColor: COLORS.ink, color: COLORS.ink, ...fontStyle }}
            className="flex-1 rounded-xl border-2 py-2.5 font-bold flex items-center justify-center gap-1 text-sm focus:outline-none focus:ring-2"
          >
            <Plus size={16} /> New Deck
          </button>
          <button
            onClick={() => {
              if (!decks.length) return;
              setSelectedDeckId((id) => id || decks[0].id);
              setView('import');
            }}
            disabled={decks.length === 0}
            style={{ borderColor: COLORS.ink, color: decks.length ? COLORS.ink : '#B9B29A', ...fontStyle }}
            className="flex-1 rounded-xl border-2 py-2.5 font-bold flex items-center justify-center gap-1 text-sm disabled:opacity-50 focus:outline-none focus:ring-2"
          >
            <Upload size={16} /> Import
          </button>
        </div>

        {decks.length > 0 && (
          <div className="relative mt-1">
            <Search size={16} style={{ color: COLORS.inkFaint }} className="absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search decks or categories"
              style={{ ...fontStyle, borderColor: COLORS.rule, backgroundColor: COLORS.card }}
              className="w-full rounded-lg border-2 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2"
            />
          </div>
        )}

        {decks.length === 0 ? (
          <p style={fontStyle} className="text-sm text-slate-600 px-1 mt-2">
            No decks yet. Create one to start building your first set of questions.
          </p>
        ) : searchedDecks.length === 0 ? (
          <p style={fontStyle} className="text-sm text-slate-600 px-1 mt-2">
            No decks match "{searchQuery}".
          </p>
        ) : (
          <div className="flex flex-col gap-4 mt-2">
            {categoryKeys.map((cat) => (
              <div key={cat} className="flex flex-col gap-2">
                <div style={{ ...monoStyle, color: COLORS.inkFaint }} className="text-xs tracking-widest uppercase">
                  {cat}
                </div>
                {grouped[cat].map((deck) => {
                  const deckCards = cards.filter((c) => c.deckId === deck.id);
                  const dueCount = deckCards.filter((c) => c.sr && c.sr.due <= today).length;
                  const empty = deckCards.length === 0;
                  const pillLabel = empty ? 'empty' : dueCount > 0 ? `${dueCount} due` : 'up to date';
                  const pillColor = empty ? COLORS.inkFaint : dueCount > 0 ? COLORS.mustard : COLORS.green;
                  const pillBg = empty ? COLORS.rule : dueCount > 0 ? COLORS.mustardBg : COLORS.greenBg;
                  return (
                    <button
                      key={deck.id}
                      onClick={() => {
                        setSelectedDeckId(deck.id);
                        setView('deck');
                      }}
                      className="w-full text-left rounded-xl border-2 px-4 py-3 flex items-center justify-between gap-2"
                      style={{ borderColor: COLORS.ink, backgroundColor: COLORS.card }}
                    >
                      <div>
                        <div style={fontStyle} className="font-bold text-slate-800">{deck.name}</div>
                        <div style={{ ...monoStyle, color: COLORS.inkFaint }} className="text-xs">
                          {deckCards.length} card{deckCards.length !== 1 ? 's' : ''}
                        </div>
                      </div>
                      <span
                        style={{ ...monoStyle, color: pillColor, backgroundColor: pillBg }}
                        className="text-xs px-2 py-1 rounded-full shrink-0"
                      >
                        {pillLabel}
                      </span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        )}

        <button
          onClick={() => setView('settings')}
          style={{ color: COLORS.inkFaint, ...fontStyle }}
          className="w-full py-2 font-medium flex items-center justify-center gap-2 mt-2"
        >
          <SettingsIcon size={16} /> Settings
        </button>
      </div>
    );
  } else if (view === 'newDeck') {
    content = (
      <div className="flex flex-col gap-4">
        <BackHeader onBack={() => setView('home')} title="New Deck" />
        <div>
          <label style={fontStyle} className="text-sm font-bold block mb-1">Deck Name</label>
          <input
            type="text"
            value={newDeckName}
            onChange={(e) => setNewDeckName(e.target.value)}
            placeholder="e.g. SSC Vocabulary — Set 3"
            style={{ ...fontStyle, borderColor: COLORS.rule, backgroundColor: COLORS.card }}
            className="w-full rounded-lg border-2 px-3 py-2 focus:outline-none focus:ring-2"
          />
        </div>
        <div>
          <label style={fontStyle} className="text-sm font-bold block mb-1">Category (optional)</label>
          <input
            type="text"
            list="category-list"
            value={newDeckCategory}
            onChange={(e) => setNewDeckCategory(e.target.value)}
            placeholder="e.g. Vocabulary, Current Affairs, Maths"
            style={{ ...fontStyle, borderColor: COLORS.rule, backgroundColor: COLORS.card }}
            className="w-full rounded-lg border-2 px-3 py-2 focus:outline-none focus:ring-2"
          />
          <datalist id="category-list">
            {categories.map((c) => <option key={c} value={c} />)}
          </datalist>
          <p style={{ ...monoStyle, color: COLORS.inkFaint }} className="text-xs mt-1">
            Leave blank to file this under Uncategorized.
          </p>
        </div>
        <button
          onClick={createDeck}
          disabled={!newDeckName.trim()}
          style={{ backgroundColor: newDeckName.trim() ? COLORS.ink : '#C9C2AC', ...fontStyle }}
          className="w-full rounded-xl py-3 text-white font-bold tracking-wide disabled:opacity-60"
        >
          Create Deck
        </button>
      </div>
    );
  } else if (view === 'import') {
    if (decks.length === 0) {
      content = (
        <div className="flex flex-col gap-4">
          <BackHeader onBack={() => setView('home')} title="Import Questions" />
          <p style={fontStyle} className="text-sm text-slate-600">You need a deck before you can import cards.</p>
          <button
            onClick={() => setView('newDeck')}
            style={{ backgroundColor: COLORS.ink, ...fontStyle }}
            className="w-full rounded-xl py-3 text-white font-bold"
          >
            Create Your First Deck
          </button>
        </div>
      );
    } else {
      content = (
        <div className="flex flex-col gap-4">
          <BackHeader onBack={() => setView(selectedDeckId ? 'deck' : 'home')} title="Import Questions" />

          <div>
            <label style={fontStyle} className="text-sm font-bold block mb-1">Deck</label>
            <select
              value={selectedDeckId || ''}
              onChange={(e) => setSelectedDeckId(e.target.value)}
              style={{ ...fontStyle, borderColor: COLORS.rule, backgroundColor: COLORS.card }}
              className="w-full rounded-lg border-2 px-3 py-2 focus:outline-none focus:ring-2"
            >
              {decks.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}{d.category ? ` — ${d.category}` : ''}
                </option>
              ))}
            </select>
          </div>

          <p style={fontStyle} className="text-sm text-slate-600">
            One block per question. Start each with <b>$</b>, then exactly 4 or 5 lines starting with <b>@</b> —
            first is the correct answer, the optional 5th is a hint.
          </p>
          <textarea
            value={importText}
            onChange={(e) => { setImportText(e.target.value); setParsedPreview(null); }}
            placeholder={SAMPLE_TEXT}
            rows={9}
            style={{ ...monoStyle, borderColor: COLORS.rule, backgroundColor: COLORS.card }}
            className="w-full rounded-xl border-2 p-3 text-xs leading-relaxed focus:outline-none focus:ring-2"
          />
          <button
            onClick={handleImportParse}
            disabled={!importText.trim()}
            style={{ borderColor: COLORS.ink, color: COLORS.ink, ...fontStyle }}
            className="w-full rounded-xl border-2 py-2.5 font-bold disabled:opacity-40"
          >
            Parse
          </button>

          {parsedPreview && (
            <div
              className="rounded-xl border-2 p-3"
              style={{ borderColor: parsedPreview.errors.length ? COLORS.red : COLORS.green, backgroundColor: COLORS.card }}
            >
              <div style={monoStyle} className="text-xs mb-2">
                {parsedPreview.cards.length} card{parsedPreview.cards.length !== 1 ? 's' : ''} parsed
                {parsedPreview.errors.length > 0 ? `, ${parsedPreview.errors.length} skipped` : ''}
              </div>
              {parsedPreview.errors.length > 0 && (
                <ul style={{ ...monoStyle, color: COLORS.red }} className="text-xs list-disc pl-4 space-y-1 mb-2">
                  {parsedPreview.errors.map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              )}
              {parsedPreview.cards.length > 0 && (
                <div className="flex flex-col gap-2 mt-2">
                  <div className="flex gap-3 text-xs" style={fontStyle}>
                    <label className="flex items-center gap-1">
                      <input type="radio" checked={importMode === 'add'} onChange={() => setImportMode('add')} />
                      Add to deck
                    </label>
                    <label className="flex items-center gap-1">
                      <input type="radio" checked={importMode === 'replace'} onChange={() => setImportMode('replace')} />
                      Replace this deck's cards
                    </label>
                  </div>
                  <button
                    onClick={commitImport}
                    style={{ backgroundColor: COLORS.green, ...fontStyle }}
                    className="w-full rounded-xl py-2.5 text-white font-bold"
                  >
                    {importMode === 'replace' ? 'Replace Deck Cards' : 'Add to Deck'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      );
    }
  } else if (view === 'deck' && selectedDeck) {
    const deckCards = cards.filter((c) => c.deckId === selectedDeck.id);
    const dueCards = deckCards.filter((c) => c.sr && c.sr.due <= today);
    content = (
      <div className="flex flex-col gap-4">
        <BackHeader onBack={() => setView('home')} title={selectedDeck.name} />
        <div style={{ ...monoStyle, color: COLORS.inkFaint }} className="text-xs -mt-2">
          {selectedDeck.category || 'Uncategorized'} · {deckCards.length} card{deckCards.length !== 1 ? 's' : ''} · {dueCards.length} due
        </div>

        <div style={{ ...monoStyle, color: COLORS.inkFaint }} className="text-xs tracking-widest uppercase">
          Spaced Repetition · MCQ
        </div>
        <button
          onClick={() => beginSession(dueCards.map((c) => c.id), 'deck', `${selectedDeck.name} · Due`)}
          disabled={dueCards.length === 0}
          style={{ backgroundColor: dueCards.length ? COLORS.mustard : '#C9C2AC', ...fontStyle }}
          className="w-full rounded-xl py-3 text-white font-bold tracking-wide disabled:opacity-60"
        >
          Review Due ({dueCards.length})
        </button>
        <button
          onClick={() => beginSession(deckCards.map((c) => c.id), 'deck', selectedDeck.name)}
          disabled={deckCards.length === 0}
          style={{ backgroundColor: deckCards.length ? COLORS.ink : '#C9C2AC', ...fontStyle }}
          className="w-full rounded-xl py-3 text-white font-bold tracking-wide disabled:opacity-60"
        >
          Practice All · MCQ
        </button>

        <div style={{ ...monoStyle, color: COLORS.inkFaint }} className="text-xs tracking-widest uppercase mt-1">
          Study Only · No Scheduling Impact
        </div>
        <button
          onClick={() => startFlip(deckCards.map((c) => c.id))}
          disabled={deckCards.length === 0}
          style={{ borderColor: COLORS.ink, color: COLORS.ink, ...fontStyle }}
          className="w-full rounded-xl border-2 py-2.5 font-bold flex items-center justify-center gap-2 disabled:opacity-50"
        >
          <Layers size={16} /> Flip Through
        </button>
        <button
          onClick={() => setView('sheet')}
          disabled={deckCards.length === 0}
          style={{ borderColor: COLORS.ink, color: COLORS.ink, ...fontStyle }}
          className="w-full rounded-xl border-2 py-2.5 font-bold flex items-center justify-center gap-2 disabled:opacity-50"
        >
          <FileText size={16} /> View as Sheet
        </button>

        <button
          onClick={() => setView('import')}
          style={{ borderColor: COLORS.ink, color: COLORS.ink, ...fontStyle }}
          className="w-full rounded-xl border-2 py-2.5 font-bold flex items-center justify-center gap-2"
        >
          <Upload size={16} /> Import More
        </button>

        {deckCards.length === 0 && (
          <p style={fontStyle} className="text-sm text-slate-600 px-1">
            This deck is empty — import cards to start practicing.
          </p>
        )}

        <div className="rounded-xl border-2 p-4 mt-2" style={{ borderColor: COLORS.red, backgroundColor: COLORS.card }}>
          <div style={fontStyle} className="text-sm font-bold mb-2">Danger Zone</div>
          {!confirmDeleteDeck ? (
            <button
              onClick={() => setConfirmDeleteDeck(true)}
              style={{ color: COLORS.red, ...fontStyle }}
              className="flex items-center gap-2 text-sm font-bold"
            >
              <Trash2 size={16} /> Delete Deck
            </button>
          ) : (
            <div className="flex flex-col gap-2">
              <p style={fontStyle} className="text-sm text-slate-700">
                This deletes "{selectedDeck.name}" and its {deckCards.length} cards permanently.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => deleteDeck(selectedDeck.id)}
                  style={{ backgroundColor: COLORS.red, ...fontStyle }}
                  className="flex-1 rounded-lg text-white text-sm font-bold py-2"
                >
                  Yes, Delete It
                </button>
                <button
                  onClick={() => setConfirmDeleteDeck(false)}
                  style={{ borderColor: COLORS.ink, color: COLORS.ink, ...fontStyle }}
                  className="flex-1 rounded-lg border-2 text-sm font-bold py-2"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  } else if (view === 'flip') {
    const flipCard = flipOrder.length && flipIndex < flipOrder.length ? cards.find((c) => c.id === flipOrder[flipIndex]) : null;
    if (flipCard) {
      content = (
        <div className="flex flex-col gap-4">
          <div className="flex justify-between items-center">
            <button onClick={() => setView('deck')} style={{ color: COLORS.inkFaint }} className="p-1">
              <ChevronLeft size={20} />
            </button>
            <div style={{ ...monoStyle, color: COLORS.inkFaint }} className="text-xs tracking-widest">
              {selectedDeck ? `${selectedDeck.name.toUpperCase()} · ` : ''}FLIP {flipIndex + 1}/{flipOrder.length}
            </div>
            <div style={{ width: 28 }} />
          </div>
          <button
            onClick={() => !flipShowAnswer && setFlipShowAnswer(true)}
            className="w-full rounded-2xl border-2 px-5 py-8 text-left focus:outline-none focus:ring-2"
            style={{ borderColor: COLORS.ink, backgroundColor: COLORS.card }}
          >
            <div style={{ ...monoStyle, color: COLORS.inkFaint }} className="text-xs uppercase tracking-widest mb-2">Question</div>
            <p style={fontStyle} className="text-base leading-relaxed text-slate-800 font-medium mb-4">{flipCard.question}</p>
            {flipShowAnswer ? (
              <>
                <div style={{ ...monoStyle, color: COLORS.green }} className="text-xs uppercase tracking-widest mb-1">Answer</div>
                <p style={fontStyle} className="text-base text-slate-800 font-medium">{flipCard.correctAnswer}</p>
                {flipCard.hint && (
                  <p style={{ ...fontStyle, color: '#6B4E17' }} className="text-xs mt-3 italic">Hint: {flipCard.hint}</p>
                )}
              </>
            ) : (
              <p style={{ ...monoStyle, color: COLORS.inkFaint }} className="text-xs">Tap to reveal answer</p>
            )}
          </button>
          {flipShowAnswer && (
            <button
              onClick={() => {
                if (flipIndex + 1 < flipOrder.length) {
                  setFlipIndex(flipIndex + 1);
                  setFlipShowAnswer(false);
                } else {
                  setFlipIndex(flipOrder.length);
                }
              }}
              style={{ backgroundColor: COLORS.ink, ...fontStyle }}
              className="w-full rounded-xl py-3 text-white font-bold tracking-wide"
            >
              Next Card
            </button>
          )}
        </div>
      );
    } else {
      content = (
        <StampScreen
          tone="navy"
          title="DECK COMPLETE"
          subtitle={`${flipOrder.length} card${flipOrder.length !== 1 ? 's' : ''} reviewed · flip-through, not scheduled`}
          buttonLabel="Back to Deck"
          onContinue={() => setView('deck')}
        />
      );
    }
  } else if (view === 'sheet' && selectedDeck) {
    const sheetIds = orderPool(cards.filter((c) => c.deckId === selectedDeck.id).map((c) => c.id), practiceOrder, cards);
    content = (
      <div className="flex flex-col gap-4">
        <BackHeader onBack={() => setView('deck')} title={`${selectedDeck.name} · Sheet`} />
        {sheetIds.length === 0 ? (
          <p style={fontStyle} className="text-sm text-slate-600">This deck is empty.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {sheetIds.map((id, i) => {
              const c = cards.find((cc) => cc.id === id);
              if (!c) return null;
              return (
                <div key={id} className="rounded-xl border-2 px-4 py-3" style={{ borderColor: COLORS.rule, backgroundColor: COLORS.card }}>
                  <div style={fontStyle} className="text-sm font-medium text-slate-800">
                    <span style={monoStyle} className="mr-1">{i + 1}.</span>{c.question}
                  </div>
                  <div style={{ ...fontStyle, color: COLORS.green }} className="text-sm font-bold mt-1">{c.correctAnswer}</div>
                  {c.hint && <div style={{ ...fontStyle, color: COLORS.mustard }} className="text-xs mt-1 italic">Hint: {c.hint}</div>}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  } else if (view === 'settings') {
    content = (
      <div className="flex flex-col gap-4">
        <BackHeader onBack={() => { setView('home'); setConfirmReset(false); }} title="Settings" />

        <div className="rounded-xl border-2 p-4" style={{ borderColor: COLORS.rule, backgroundColor: COLORS.card }}>
          <label style={fontStyle} className="text-sm font-bold block mb-2">Cards per cycle</label>
          <div className="flex gap-2">
            <input
              type="number"
              min={1}
              value={cycleSizeDraft}
              onChange={(e) => setCycleSizeDraft(e.target.value)}
              style={{ ...monoStyle, borderColor: COLORS.rule }}
              className="w-24 rounded-lg border-2 px-3 py-2 text-center focus:outline-none focus:ring-2"
            />
            <button
              onClick={saveCycleSize}
              style={{ backgroundColor: COLORS.ink, ...fontStyle }}
              className="flex-1 rounded-lg text-white font-bold"
            >
              Save
            </button>
          </div>
          <p style={{ ...monoStyle, color: COLORS.inkFaint }} className="text-xs mt-2">
            Applies to every deck. Currently {cycleSize} card{cycleSize !== 1 ? 's' : ''} per cycle.
          </p>
        </div>

        <div className="rounded-xl border-2 p-4" style={{ borderColor: COLORS.rule, backgroundColor: COLORS.card }}>
          <label style={fontStyle} className="text-sm font-bold block mb-2">Practice Order</label>
          <div className="flex flex-col gap-3">
            {[
              { value: 'new', label: 'New cards first', desc: 'Most recently imported cards come up first' },
              { value: 'old', label: 'Old cards first', desc: 'Longest-standing cards come up first' },
              { value: 'difficult', label: 'Difficult cards first', desc: 'Lower ease score (from spaced repetition) comes first' },
              { value: 'random', label: 'Random order', desc: 'Freshly shuffled every session' },
            ].map((opt) => (
              <label key={opt.value} className="flex items-start gap-2">
                <input
                  type="radio"
                  className="mt-1"
                  checked={practiceOrder === opt.value}
                  onChange={() => choosePracticeOrder(opt.value)}
                />
                <span>
                  <span style={fontStyle} className="text-sm font-medium text-slate-800 block">{opt.label}</span>
                  <span style={{ ...monoStyle, color: COLORS.inkFaint }} className="text-xs">{opt.desc}</span>
                </span>
              </label>
            ))}
          </div>
          <p style={{ ...monoStyle, color: COLORS.inkFaint }} className="text-xs mt-3">
            Applies to MCQ cycling, Flip Through, and View as Sheet alike.
          </p>
        </div>

        <button
          onClick={() => { setDriveNotice(null); setView('backup'); }}
          className="w-full text-left rounded-xl border-2 p-4 flex items-center justify-between gap-2"
          style={{ borderColor: COLORS.ink, backgroundColor: COLORS.card }}
        >
          <div className="flex items-center gap-3">
            <Cloud size={20} style={{ color: COLORS.ink }} />
            <div>
              <div style={fontStyle} className="text-sm font-bold text-slate-800">Backup &amp; Restore</div>
              <div style={{ ...monoStyle, color: COLORS.inkFaint }} className="text-xs">
                Local file · Google Drive · Auto-backup
              </div>
            </div>
          </div>
        </button>

        <div className="rounded-xl border-2 p-4" style={{ borderColor: COLORS.red, backgroundColor: COLORS.card }}>
          <div style={fontStyle} className="text-sm font-bold mb-2">Danger Zone</div>
          {!confirmReset ? (
            <button
              onClick={() => setConfirmReset(true)}
              disabled={decks.length === 0}
              style={{ color: COLORS.red, ...fontStyle }}
              className="flex items-center gap-2 text-sm font-bold disabled:opacity-40"
            >
              <Trash2 size={16} /> Reset All Data ({decks.length} deck{decks.length !== 1 ? 's' : ''})
            </button>
          ) : (
            <div className="flex flex-col gap-2">
              <p style={fontStyle} className="text-sm text-slate-700">
                This deletes every deck and card permanently.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={resetEverything}
                  style={{ backgroundColor: COLORS.red, ...fontStyle }}
                  className="flex-1 rounded-lg text-white text-sm font-bold py-2"
                >
                  Yes, Delete Everything
                </button>
                <button
                  onClick={() => setConfirmReset(false)}
                  style={{ borderColor: COLORS.ink, color: COLORS.ink, ...fontStyle }}
                  className="flex-1 rounded-lg border-2 text-sm font-bold py-2"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  } else if (view === 'backup') {
    const noticeColor = driveNotice?.tone === 'error' ? COLORS.red : driveNotice?.tone === 'success' ? COLORS.green : COLORS.mustard;
    const noticeBg = driveNotice?.tone === 'error' ? COLORS.redBg : driveNotice?.tone === 'success' ? COLORS.greenBg : COLORS.mustardBg;
    content = (
      <div className="flex flex-col gap-4">
        <BackHeader onBack={() => { setView('settings'); setPendingRestore(null); }} title="Backup & Restore" />

        <input
          ref={restoreFileInputRef}
          type="file"
          accept=".json,application/json"
          onChange={handleRestoreFileSelected}
          className="hidden"
        />

        {driveNotice && (
          <div
            className="rounded-lg border-2 px-3 py-2 flex items-start gap-2"
            style={{ borderColor: noticeColor, backgroundColor: noticeBg }}
          >
            {driveNotice.tone === 'error' ? (
              <AlertTriangle size={16} style={{ color: noticeColor }} className="shrink-0 mt-0.5" />
            ) : (
              <Check size={16} style={{ color: noticeColor }} className="shrink-0 mt-0.5" />
            )}
            <span style={{ ...fontStyle, color: noticeColor }} className="text-xs leading-relaxed">
              {driveNotice.text}
            </span>
          </div>
        )}

        {pendingRestore && (
          <div className="rounded-xl border-2 p-4" style={{ borderColor: COLORS.mustard, backgroundColor: COLORS.mustardBg }}>
            <div style={{ ...fontStyle, color: '#6B4E17' }} className="text-sm font-bold mb-1">
              Restore from {pendingRestore.source === 'drive' ? 'Google Drive' : 'file'}?
            </div>
            <p style={{ ...monoStyle, color: '#6B4E17' }} className="text-xs mb-3 leading-relaxed">
              This replaces every deck and card currently on this device with the backup
              {pendingRestore.payload.exportedAt ? ` from ${formatTimestamp(pendingRestore.payload.exportedAt)}` : ''}. It can't be undone.
            </p>
            <div className="flex gap-2">
              <button
                onClick={applyPendingRestore}
                style={{ backgroundColor: COLORS.mustard, ...fontStyle }}
                className="flex-1 rounded-lg text-white text-sm font-bold py-2"
              >
                Restore
              </button>
              <button
                onClick={() => setPendingRestore(null)}
                style={{ borderColor: '#6B4E17', color: '#6B4E17', ...fontStyle }}
                className="flex-1 rounded-lg border-2 text-sm font-bold py-2"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="rounded-xl border-2 p-4" style={{ borderColor: COLORS.rule, backgroundColor: COLORS.card }}>
          <label style={fontStyle} className="text-sm font-bold block mb-1">Local Backup</label>
          <p style={{ ...monoStyle, color: COLORS.inkFaint }} className="text-xs mb-3">
            Saves a .json file with every deck, card, and spaced-repetition progress value. Works fully offline, right here.
          </p>
          <div className="flex gap-2">
            <button
              onClick={downloadLocalBackup}
              style={{ backgroundColor: COLORS.ink, ...fontStyle }}
              className="flex-1 rounded-lg text-white text-sm font-bold py-2.5 flex items-center justify-center gap-2"
            >
              <Download size={16} /> Download
            </button>
            <button
              onClick={triggerRestoreFilePicker}
              style={{ borderColor: COLORS.ink, color: COLORS.ink, ...fontStyle }}
              className="flex-1 rounded-lg border-2 text-sm font-bold py-2.5 flex items-center justify-center gap-2"
            >
              <HardDriveDownload size={16} /> Restore File
            </button>
          </div>
          <p style={{ ...monoStyle, color: COLORS.inkFaint }} className="text-xs mt-2">
            Last downloaded: {formatTimestamp(lastLocalBackupAt)}
          </p>
        </div>

        <div className="rounded-xl border-2 p-4" style={{ borderColor: COLORS.rule, backgroundColor: COLORS.card }}>
          <label style={fontStyle} className="text-sm font-bold block mb-1">Google Drive Backup</label>
          <p style={{ ...monoStyle, color: COLORS.inkFaint }} className="text-xs mb-3">
            Signs in with your Google account and stores one hidden backup file in your Drive's app folder — not visible in your regular Drive files.
          </p>

          {!googleSignedIn ? (
            <button
              onClick={handleGoogleSignIn}
              disabled={driveBusy}
              style={{ borderColor: COLORS.ink, color: COLORS.ink, ...fontStyle }}
              className="w-full rounded-lg border-2 text-sm font-bold py-2.5 flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Cloud size={16} /> {driveBusy ? 'Connecting…' : 'Continue with Google'}
            </button>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span style={{ ...monoStyle, color: COLORS.green }} className="text-xs flex items-center gap-1">
                  <Check size={14} /> {googleEmail || 'Signed in'}
                </span>
                <button onClick={handleGoogleSignOut} style={{ color: COLORS.inkFaint, ...fontStyle }} className="text-xs flex items-center gap-1">
                  <LogOut size={13} /> Sign out
                </button>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => driveBackupNow(false)}
                  disabled={driveBusy}
                  style={{ backgroundColor: COLORS.ink, ...fontStyle }}
                  className="flex-1 rounded-lg text-white text-sm font-bold py-2.5 flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <RefreshCw size={16} /> {driveBusy ? 'Working…' : 'Back Up Now'}
                </button>
                <button
                  onClick={driveRestoreNow}
                  disabled={driveBusy}
                  style={{ borderColor: COLORS.ink, color: COLORS.ink, ...fontStyle }}
                  className="flex-1 rounded-lg border-2 text-sm font-bold py-2.5 flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <HardDriveDownload size={16} /> Restore
                </button>
              </div>
              <p style={{ ...monoStyle, color: COLORS.inkFaint }} className="text-xs">
                Last Drive backup: {formatTimestamp(lastDriveBackupAt)}
              </p>
            </div>
          )}

          <div className="mt-4">
            <label style={fontStyle} className="text-xs font-bold block mb-2 text-slate-700">Auto-backup to Drive</label>
            <div className="flex flex-wrap gap-2">
              {AUTO_BACKUP_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => chooseAutoBackupFreq(opt.value)}
                  style={{
                    ...monoStyle,
                    borderColor: autoBackupFreqDays === opt.value ? COLORS.ink : COLORS.rule,
                    color: autoBackupFreqDays === opt.value ? '#fff' : COLORS.inkFaint,
                    backgroundColor: autoBackupFreqDays === opt.value ? COLORS.ink : 'transparent',
                  }}
                  className="rounded-full border-2 px-3 py-1 text-xs"
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <p style={{ ...monoStyle, color: COLORS.inkFaint }} className="text-xs mt-2">
              {autoBackupFreqDays === 0
                ? 'Auto-backup is off. Use "Back Up Now" whenever you like.'
                : `Checks on app open and backs up automatically if ${autoBackupFreqDays === 1 ? 'a day' : `${autoBackupFreqDays} days`} have passed since the last one. Needs to be signed in.`}
            </p>
          </div>

          {!driveConfigured() && (
            <div className="mt-4 rounded-lg border border-dashed px-3 py-2" style={{ borderColor: COLORS.mustard, backgroundColor: COLORS.mustardBg }}>
              <p style={{ ...monoStyle, color: '#6B4E17' }} className="text-xs leading-relaxed">
                Setup needed: this button won't authenticate until you (1) create an OAuth Client ID in Google Cloud Console, (2) paste it into GOOGLE_CLIENT_ID at the top of this file, and (3) host the app on a real domain registered as an authorized origin. It will not work inside this preview.
              </p>
            </div>
          )}
        </div>
      </div>
    );
  } else if (view === 'practice') {
    if (phase === 'question' && currentCard) {
      const progress = cycleOrder.length ? (cardPos / cycleOrder.length) * 100 : 0;
      content = (
        <div className="flex flex-col gap-4">
          <div className="flex justify-between items-center">
            <button onClick={() => setView(returnView)} style={{ color: COLORS.inkFaint }} className="p-1">
              <ChevronLeft size={20} />
            </button>
            <div className="text-center">
              <div style={{ ...monoStyle, color: COLORS.inkFaint }} className="text-xs tracking-widest">
                {sessionLabel ? `${sessionLabel.toUpperCase()} · ` : ''}CYCLE {String(cycleIndex + 1).padStart(2, '0')}/{String(cycles.length).padStart(2, '0')} · Q {cardPos + 1}/{cycleOrder.length}
              </div>
            </div>
            {currentCard.hint ? (
              <button onClick={() => setShowHint((h) => !h)} style={{ color: COLORS.mustard }} className="p-1">
                {showHint ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            ) : <div style={{ width: 28 }} />}
          </div>

          <div className="w-full h-1 rounded-full" style={{ backgroundColor: COLORS.rule }}>
            <div className="h-1 rounded-full transition-all duration-300" style={{ width: `${progress}%`, backgroundColor: COLORS.ink }} />
          </div>

          <div className="rounded-2xl border-2 px-5 py-6" style={{ borderColor: COLORS.ink, backgroundColor: COLORS.card }}>
            <p style={fontStyle} className="text-base leading-relaxed text-slate-800 font-medium">
              {currentCard.question}
            </p>
            {showHint && currentCard.hint && (
              <div
                className="mt-3 rounded-lg border border-dashed px-3 py-2 text-xs"
                style={{ ...fontStyle, borderColor: COLORS.mustard, backgroundColor: COLORS.mustardBg, color: '#6B4E17', transform: 'rotate(-0.5deg)' }}
              >
                {currentCard.hint}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-3">
            {currentOptions.map((opt, i) => {
              const isWrong = flashWrongIdx === i;
              const isRight = flashCorrectIdx === i;
              return (
                <button
                  key={i}
                  onClick={() => handleOptionClick(i)}
                  disabled={flashCorrectIdx !== null}
                  className={`w-full text-left rounded-xl border-2 px-4 py-3 flex items-center gap-3 transition-colors duration-150 focus:outline-none focus:ring-2 ${isWrong ? 'animate-shake' : ''}`}
                  style={{
                    borderColor: isWrong ? COLORS.red : isRight ? COLORS.green : COLORS.ink,
                    backgroundColor: isWrong ? COLORS.redBg : isRight ? COLORS.greenBg : COLORS.card,
                  }}
                >
                  <span
                    style={{ ...monoStyle, borderColor: isWrong ? COLORS.red : isRight ? COLORS.green : COLORS.ink }}
                    className="w-7 h-7 shrink-0 rounded-full border-2 flex items-center justify-center text-xs font-bold"
                  >
                    {String.fromCharCode(65 + i)}
                  </span>
                  <span style={fontStyle} className="text-sm text-slate-800">{opt.text}</span>
                </button>
              );
            })}
          </div>
        </div>
      );
    } else if (phase === 'cycleComplete') {
      content = (
        <StampScreen
          tone="navy"
          title={`CYCLE ${String(cycleIndex + 1).padStart(2, '0')} CLEARED`}
          subtitle={missedSet.size > 0 ? `${missedSet.size} flagged for review so far` : 'clean run so far'}
          buttonLabel={`Continue to Cycle ${cycleIndex + 2}`}
          onContinue={continueToNextCycle}
        />
      );
    } else if (phase === 'roundComplete') {
      content = (
        <StampScreen
          tone="mustard"
          title={`ROUND ${roundNumber} COMPLETE`}
          subtitle={`${missedSet.size} card${missedSet.size !== 1 ? 's' : ''} flagged for review`}
          buttonLabel="Start Review Round"
          onContinue={startReviewRound}
        />
      );
    } else if (phase === 'allClear') {
      content = (
        <StampScreen
          tone="green"
          title="ALL CLEAR"
          subtitle="every card answered correctly on first try — next reviews rescheduled"
          buttonLabel="Done"
          onContinue={() => setView(returnView)}
        />
      );
    }
  }

  return (
    <div style={{ backgroundColor: COLORS.paper, minHeight: '100vh' }} className="w-full flex justify-center">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Roboto+Slab:wght@400;500;700&family=Space+Mono:wght@400;700&display=swap');
        @keyframes shake {
          10%, 90% { transform: translateX(-2px); }
          20%, 80% { transform: translateX(3px); }
          30%, 50%, 70% { transform: translateX(-5px); }
          40%, 60% { transform: translateX(5px); }
        }
        .animate-shake { animation: shake 0.4s ease-in-out; }
        @keyframes stampIn {
          0% { opacity: 0; transform: scale(1.5) rotate(10deg); }
          100% { opacity: 1; transform: scale(1) rotate(-4deg); }
        }
        .stamp-el { animation: stampIn 0.45s cubic-bezier(0.34, 1.56, 0.64, 1); }
        @media (prefers-reduced-motion: reduce) {
          .animate-shake, .stamp-el { animation: none !important; }
        }
      `}</style>
      <div className="w-full max-w-sm px-5 py-6">
        <div className="flex items-center justify-between mb-5">
          <span style={{ fontFamily: "'Roboto Slab', serif", color: COLORS.ink }} className="text-lg font-bold tracking-tight">
            Flashcard Drill
          </span>
          <span style={{ fontFamily: "'Space Mono', monospace", color: COLORS.inkFaint }} className="text-xs">
            {roundNumber > 1 && view === 'practice' ? `rd.${roundNumber}` : ''}
          </span>
        </div>
        {content || (
          <div className="flex flex-col gap-3">
            <p style={fontStyle} className="text-sm text-slate-600">That screen isn't available anymore.</p>
            <button
              onClick={() => setView('home')}
              style={{ backgroundColor: COLORS.ink, ...fontStyle }}
              className="w-full rounded-xl py-3 text-white font-bold"
            >
              Back to Home
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function BackHeader({ onBack, title }) {
  return (
    <div className="flex items-center gap-2 mb-1">
      <button onClick={onBack} style={{ color: COLORS.inkFaint }} className="p-1">
        <ChevronLeft size={20} />
      </button>
      <span style={{ fontFamily: "'Roboto Slab', serif", color: COLORS.ink }} className="font-bold">
        {title}
      </span>
    </div>
  );
}

function StampScreen({ tone, title, subtitle, buttonLabel, onContinue }) {
  const toneColor = tone === 'green' ? COLORS.green : tone === 'mustard' ? COLORS.mustard : COLORS.ink;
  const toneBg = tone === 'green' ? COLORS.greenBg : tone === 'mustard' ? COLORS.mustardBg : '#E3E7EE';
  return (
    <div className="flex flex-col items-center justify-center gap-6 py-16">
      <div
        className="stamp-el rounded-lg px-6 py-5 text-center"
        style={{ border: `4px double ${toneColor}`, backgroundColor: toneBg, transform: 'rotate(-4deg)' }}
      >
        <div style={{ fontFamily: "'Roboto Slab', serif", color: toneColor }} className="text-xl font-bold tracking-wide">
          {title}
        </div>
        <div style={{ fontFamily: "'Space Mono', monospace", color: toneColor }} className="text-xs mt-1">
          {subtitle}
        </div>
      </div>
      <button
        onClick={onContinue}
        style={{ backgroundColor: toneColor, fontFamily: "'Roboto Slab', serif" }}
        className="w-full max-w-xs rounded-xl py-3 text-white font-bold tracking-wide focus:outline-none focus:ring-2 focus:ring-offset-2"
      >
        {buttonLabel}
      </button>
    </div>
  );
}
