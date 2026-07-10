import React, { useState, useEffect, useRef } from 'react';
import { Eye, EyeOff, Upload, Settings as SettingsIcon, ChevronLeft, Trash2, Plus, Search, Layers, FileText, Cloud, Download, RefreshCw, LogOut, Check, AlertTriangle, HardDriveDownload, Pencil } from 'lucide-react';
const COLORS_LIGHT = {
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
    accent: '#22314A',
    navy: '#22314A',
    navyBg: '#E3E7EE',
};
// Dark palette modeled on VS Code's "Dark+" theme: near-black editor/panel
// backgrounds, off-white foreground text, and the same accent blue VS Code
// uses for its primary buttons. Every color below was chosen so it reads
// clearly both as body text on the dark backgrounds AND as a button fill
// under white label text — that dual role is why these aren't simple
// brightened versions of the light palette.
const COLORS_DARK = {
    paper: '#1E1E1E',
    card: '#252526',
    ink: '#D4D4D4',
    inkFaint: '#9A9FA8',
    rule: '#3C3C3C',
    red: '#F14C4C',
    redBg: '#4B1E1E',
    green: '#3DA35D',
    greenBg: '#1B3A2B',
    mustard: '#B8860B',
    mustardBg: '#3A2E17',
    accent: '#0E639C',
    navy: '#3B8EEA',
    navyBg: '#1B3350',
};
const DECKS_KEY = 'flashdrill:v2:decks';
const CARDS_KEY = 'flashdrill:v2:cards';
const SETTINGS_KEY = 'flashdrill:v2:settings';
const FONT_SIZE_KEY = 'flashdrill:v2:fontSize';
const DARK_MODE_KEY = 'flashdrill:v2:darkMode';
const BACKUP_META_KEY = 'flashdrill:v2:backupMeta';
// ---- Google Drive backup config -------------------------------------------------
// Replace with your own OAuth Web Client ID from Google Cloud Console before this
// will work. It will NOT authenticate inside the Claude preview — it needs to be
// hosted on a real domain (e.g. GitHub Pages) that's registered as an authorized
// JavaScript origin for this client ID. See the setup notes in the Backup screen.
const GOOGLE_CLIENT_ID = '790736366293-a7dlgr671caebbam0gu5kkkot8tbmcn0.apps.googleusercontent.com';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
const DRIVE_BACKUP_FILENAME = 'flashdrill-backup.json';
const BACKUP_VERSION = 2;
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
    for (let i = 0; i < arr.length; i += s)
        out.push(arr.slice(i, i + s));
    return out;
}
// Orders a pool of card ids per the user's practice-order setting.
// 'random' (default) reshuffles; 'new'/'old' sort by createdAt; 'difficult' sorts by ease (lower = harder).
function orderPool(ids, order, allCards) {
    const byId = {};
    allCards.forEach((c) => { byId[c.id] = c; });
    const arr = [...ids];
    if (order === 'new')
        return arr.sort((a, b) => (byId[b] ? byId[b].createdAt || 0 : 0) - (byId[a] ? byId[a].createdAt || 0 : 0));
    if (order === 'old')
        return arr.sort((a, b) => (byId[a] ? byId[a].createdAt || 0 : 0) - (byId[b] ? byId[b].createdAt || 0 : 0));
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
        if (!current)
            return;
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
        }
        else if (current.question) {
            errors.push(`"${current.question.slice(0, 44)}" has ${at.length} @ line(s), needs 4 or 5.`);
        }
    }
    lines.forEach((raw) => {
        const line = raw.trim();
        if (!line)
            return;
        if (line.startsWith('$')) {
            pushCurrent();
            current = { question: line.slice(1).trim(), atLines: [] };
        }
        else if (line.startsWith('@')) {
            if (current)
                current.atLines.push(line.slice(1).trim());
        }
    });
    pushCurrent();
    return { cards, errors };
}
// Inverse of parseCards — turns a single card back into the editable $question/@answer
// text format, used by the Edit Zone's raw-text editor.
function cardToRawText(c) {
    const lines = [`$${c.question}`, `@${c.correctAnswer}`, ...c.distractors.map((d) => `@${d}`)];
    if (c.hint)
        lines.push(`@${c.hint}`);
    return lines.join('\n');
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
function countWords(text) {
    return (text || '').trim().split(/\s+/).filter(Boolean).length;
}
// Reading time = 0.24s per word of (question + correct answer), and ALSO every
// distractor option's words IF the correct answer is longer than 3 words.
function computeReadingTimeSeconds(card) {
    const answerWords = countWords(card.correctAnswer);
    let totalWords = countWords(card.question) + answerWords;
    if (answerWords > 3) {
        totalWords += (card.distractors || []).reduce((sum, d) => sum + countWords(d), 0);
    }
    return 0.24 * totalWords;
}
// Strong: answered within reading time + 3s. Good: fills the gap up through +5s.
// Poor: anything slower. Elapsed = time from question shown to the correct click.
function classifyDifficulty(card, elapsedSeconds) {
    const readingTime = computeReadingTimeSeconds(card);
    if (elapsedSeconds <= readingTime + 3)
        return 'strong';
    if (elapsedSeconds <= readingTime + 5)
        return 'good';
    return 'poor';
}
// Simplified SM-2: binary quality signal (correct-first-try vs missed-first-try)
function scheduleNext(sr, correct) {
    let interval = sr && typeof sr.interval === 'number' ? sr.interval : 0;
    let ease = sr && typeof sr.ease === 'number' ? sr.ease : 2.5;
    let reps = sr && typeof sr.reps === 'number' ? sr.reps : 0;
    const quality = correct ? 5 : 2;
    if (correct) {
        if (reps === 0)
            interval = 1;
        else if (reps === 1)
            interval = 6;
        else
            interval = Math.round(interval * ease);
        reps += 1;
    }
    else {
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
// Deck identity = category + name together (not name alone). Same category+name on
// both sides => same deck, cards merge (Drive wins on duplicate questions). Same name
// but different category => two separate decks, both preserved independently.
function deckKey(d) {
    return `${(d.category || '').trim().toLowerCase()}|||${(d.name || '').trim().toLowerCase()}`;
}
function mergeBackups(localDecks, localCards, driveDecks, driveCards) {
    const driveByKey = new Map(driveDecks.map((d) => [deckKey(d), d]));
    const resultDecks = [];
    const resultCards = [];
    const usedDriveDeckIds = new Set();
    for (const ld of localDecks) {
        const dd = driveByKey.get(deckKey(ld));
        if (dd) {
            // Same category + name — same deck. Drive's deck record is kept as canonical;
            // cards merge with Drive winning on duplicate questions.
            usedDriveDeckIds.add(dd.id);
            resultDecks.push(dd);
            const driveDeckCards = driveCards.filter((c) => c.deckId === dd.id);
            const driveQSet = new Set(driveDeckCards.map((c) => (c.question || '').trim().toLowerCase()));
            driveDeckCards.forEach((c) => resultCards.push(c));
            localCards
                .filter((c) => c.deckId === ld.id && !driveQSet.has((c.question || '').trim().toLowerCase()))
                .forEach((c) => resultCards.push({ ...c, deckId: dd.id }));
        }
        else {
            // No match by category+name — local-only deck, kept as-is (even if the name
            // matches a Drive deck under a different category).
            resultDecks.push(ld);
            localCards.filter((c) => c.deckId === ld.id).forEach((c) => resultCards.push(c));
        }
    }
    for (const dd of driveDecks) {
        if (usedDriveDeckIds.has(dd.id))
            continue;
        resultDecks.push(dd);
        driveCards.filter((c) => c.deckId === dd.id).forEach((c) => resultCards.push(c));
    }
    return { decks: resultDecks, cards: resultCards };
}
function validateBackupShape(obj) {
    if (!obj || typeof obj !== 'object')
        return 'File is not valid JSON.';
    if (!Array.isArray(obj.decks) || !Array.isArray(obj.cards))
        return 'This file is missing decks or cards — it may not be a Flashcard Drill backup.';
    return null;
}
function formatTimestamp(iso) {
    if (!iso)
        return 'never';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime()))
        return 'never';
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
    if (gsiLoadPromise)
        return gsiLoadPromise;
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
            if (window.google && window.google.accounts && window.google.accounts.oauth2)
                resolve();
            else
                reject(new Error('script-loaded-but-unusable'));
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
    const [fontSizePx, setFontSizePx] = useState(18);
    const [darkMode, setDarkMode] = useState(false);
    const [practiceOrder, setPracticeOrder] = useState('random'); // new | old | difficult | random
    const [confirmReset, setConfirmReset] = useState(false);
    // backup & restore state
    const [lastLocalBackupAt, setLastLocalBackupAt] = useState(null);
    const [lastDriveBackupAt, setLastDriveBackupAt] = useState(null);
    const [googleSignedIn, setGoogleSignedIn] = useState(false);
    const [googleEmail, setGoogleEmail] = useState(null);
    const [driveSignedOutByUser, setDriveSignedOutByUser] = useState(false);
    const [driveAccessToken, setDriveAccessToken] = useState(null);
    const [driveBusy, setDriveBusy] = useState(false);
    const [driveNotice, setDriveNotice] = useState(null); // { tone: 'error'|'success'|'info', text }
    const [pendingRestore, setPendingRestore] = useState(null); // { source: 'file'|'drive', payload }
    const [signInSyncPrompt, setSignInSyncPrompt] = useState(null); // { drivePayload } — shown only when local decks already exist at sign-in
    const tokenClientRef = useRef(null);
    const restoreFileInputRef = useRef(null);
    const silentSignInAttemptedRef = useRef(false);
    const skipNextHistoryPushRef = useRef(false); // true while applying a popstate — avoids re-pushing the entry we just popped
    const practiceDirtyRef = useRef(false); // true once any card is answered this practice session
    const questionShownAtRef = useRef(null); // timestamp the current question appeared, for difficulty timing
    // Edit Zone (Settings → Categories → Decks → Cards) state
    const [editZoneLevel, setEditZoneLevel] = useState('categories'); // 'categories' | 'decks' | 'cards'
    const [editZoneCategory, setEditZoneCategory] = useState(null);
    const [editZoneDeckId, setEditZoneDeckId] = useState(null);
    const [editZoneQuery, setEditZoneQuery] = useState('');
    const [editZoneNotice, setEditZoneNotice] = useState('');
    const [renamingCategory, setRenamingCategory] = useState(null);
    const [renameCategoryDraft, setRenameCategoryDraft] = useState('');
    const [renamingDeckId, setRenamingDeckId] = useState(null);
    const [renameDeckDraft, setRenameDeckDraft] = useState('');
    const [confirmDeleteCategory, setConfirmDeleteCategory] = useState(null);
    const [confirmDeleteDeckId, setConfirmDeleteDeckId] = useState(null);
    const [editingCardId, setEditingCardId] = useState(null);
    const [editingCardDraft, setEditingCardDraft] = useState('');
    const [editingCardError, setEditingCardError] = useState('');
    const [confirmDeleteCardId, setConfirmDeleteCardId] = useState(null);
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
    const [sessionAffectsProgress, setSessionAffectsProgress] = useState(true);
    const [selectedDifficultyTier, setSelectedDifficultyTier] = useState(null); // 'strong' | 'good' | 'poor'
    const [sheetFilterIds, setSheetFilterIds] = useState(null); // null = whole deck; array = restrict to these ids
    const [returnView, setReturnView] = useState('home');
    useEffect(() => {
        (async () => {
            try {
                const res = await window.storage.get(DECKS_KEY, false);
                if (res && res.value)
                    setDecks(JSON.parse(res.value));
            }
            catch (e) { }
            try {
                const res = await window.storage.get(CARDS_KEY, false);
                if (res && res.value)
                    setCards(JSON.parse(res.value));
            }
            catch (e) { }
            try {
                const res = await window.storage.get(SETTINGS_KEY, false);
                if (res && res.value) {
                    const s = JSON.parse(res.value);
                    if (s.cycleSize) {
                        setCycleSize(s.cycleSize);
                        setCycleSizeDraft(String(s.cycleSize));
                    }
                    if (s.practiceOrder)
                        setPracticeOrder(s.practiceOrder);
                }
            }
            catch (e) { }
            try {
                const res = await window.storage.get(FONT_SIZE_KEY, false);
                if (res && res.value) {
                    const px = parseInt(res.value, 10);
                    if (px && px >= 12 && px <= 28)
                        setFontSizePx(px);
                }
            }
            catch (e) { }
            try {
                const res = await window.storage.get(DARK_MODE_KEY, false);
                if (res && res.value)
                    setDarkMode(res.value === 'true');
            }
            catch (e) { }
            try {
                const res = await window.storage.get(BACKUP_META_KEY, false);
                if (res && res.value) {
                    const m = JSON.parse(res.value);
                    if (m.lastLocalBackupAt)
                        setLastLocalBackupAt(m.lastLocalBackupAt);
                    if (m.lastDriveBackupAt)
                        setLastDriveBackupAt(m.lastDriveBackupAt);
                    if (m.googleEmail)
                        setGoogleEmail(m.googleEmail);
                    if (typeof m.driveSignedOutByUser === 'boolean')
                        setDriveSignedOutByUser(m.driveSignedOutByUser);
                }
            }
            catch (e) { }
            setLoaded(true);
        })();
    }, []);
    async function persistDecks(next) {
        setDecks(next);
        try {
            await window.storage.set(DECKS_KEY, JSON.stringify(next), false);
        }
        catch (e) { }
    }
    async function persistCards(next) {
        setCards(next);
        try {
            await window.storage.set(CARDS_KEY, JSON.stringify(next), false);
        }
        catch (e) { }
    }
    async function persistSettings(nextCycleSize, nextOrder) {
        setCycleSize(nextCycleSize);
        setPracticeOrder(nextOrder);
        try {
            await window.storage.set(SETTINGS_KEY, JSON.stringify({ cycleSize: nextCycleSize, practiceOrder: nextOrder }), false);
        }
        catch (e) { }
    }
    async function persistFontSize(px) {
        const clamped = Math.max(12, Math.min(28, px));
        setFontSizePx(clamped);
        try {
            await window.storage.set(FONT_SIZE_KEY, String(clamped), false);
        }
        catch (e) { }
    }
    async function persistDarkMode(next) {
        setDarkMode(next);
        try {
            await window.storage.set(DARK_MODE_KEY, String(next), false);
        }
        catch (e) { }
    }
    async function persistBackupMeta(patch) {
        const next = {
            lastLocalBackupAt,
            lastDriveBackupAt,
            googleEmail,
            driveSignedOutByUser,
            ...patch,
        };
        if ('lastLocalBackupAt' in patch)
            setLastLocalBackupAt(patch.lastLocalBackupAt);
        if ('lastDriveBackupAt' in patch)
            setLastDriveBackupAt(patch.lastDriveBackupAt);
        if ('googleEmail' in patch)
            setGoogleEmail(patch.googleEmail);
        if ('driveSignedOutByUser' in patch)
            setDriveSignedOutByUser(patch.driveSignedOutByUser);
        try {
            await window.storage.set(BACKUP_META_KEY, JSON.stringify(next), false);
        }
        catch (e) { }
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
        if (restoreFileInputRef.current)
            restoreFileInputRef.current.click();
    }
    function handleRestoreFileSelected(e) {
        const file = e.target.files && e.target.files[0];
        e.target.value = '';
        if (!file)
            return;
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
            }
            catch (err) {
                setDriveNotice({ tone: 'error', text: 'Could not read that file — make sure it\'s an unedited backup JSON.' });
            }
        };
        reader.onerror = () => setDriveNotice({ tone: 'error', text: 'Could not read that file.' });
        reader.readAsText(file);
    }
    function applyPendingRestore() {
        if (!pendingRestore)
            return;
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
                callback: () => { }, // overridden per-call below
            });
        }
        return tokenClientRef.current;
    }
    function requestDriveToken(options) {
        const opts = options || {};
        return new Promise(async (resolve, reject) => {
            if (!driveConfigured()) {
                reject(new Error('not-configured'));
                return;
            }
            try {
                const client = await ensureTokenClient();
                client.callback = (resp) => {
                    if (resp && resp.access_token)
                        resolve(resp.access_token);
                    else
                        reject(new Error((resp && resp.error) || 'no-token'));
                };
                const overrideConfig = { prompt: opts.silent ? 'none' : googleSignedIn ? '' : 'consent' };
                if (opts.hint)
                    overrideConfig.login_hint = opts.hint;
                client.requestAccessToken(overrideConfig);
            }
            catch (e) {
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
            persistBackupMeta({ driveSignedOutByUser: false });
            try {
                const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (res.ok) {
                    const info = await res.json();
                    if (info.email)
                        persistBackupMeta({ googleEmail: info.email });
                }
            }
            catch (e) { }
            await syncAfterSignIn(token);
            setDriveNotice((prev) => prev || { tone: 'success', text: 'Signed in.' });
        }
        catch (e) {
            setDriveNotice({
                tone: 'error',
                text: e && e.message === 'script-blocked'
                    ? 'Google\u2019s sign-in script couldn\u2019t load here \u2014 this preview sandbox blocks it. This works once hosted on your own domain.'
                    : 'Sign-in didn\u2019t complete. If this is hosted, check that your domain is an authorized origin in Google Cloud Console.',
            });
        }
        finally {
            setDriveBusy(false);
        }
    }
    function handleGoogleSignOut() {
        if (driveAccessToken && window.google && window.google.accounts && window.google.accounts.oauth2) {
            try {
                window.google.accounts.oauth2.revoke(driveAccessToken, () => { });
            }
            catch (e) { }
        }
        setDriveAccessToken(null);
        setGoogleSignedIn(false);
        setDriveNotice(null);
        persistBackupMeta({ driveSignedOutByUser: true });
    }
    // Quietly re-authenticates using the last-used account, with no popup, so the
    // person doesn't have to click "Continue with Google" every time they open the
    // app. Deliberately does NOT run the sign-in sync/merge prompt — that's a
    // one-time setup decision, not something that should resurface on every load.
    // Respects an explicit sign-out and fails silently (no error notice) if the
    // browser has no active Google session to reuse.
    async function attemptSilentSignIn() {
        if (!driveConfigured() || !googleEmail || driveSignedOutByUser)
            return;
        try {
            const token = await requestDriveToken({ silent: true, hint: googleEmail });
            setDriveAccessToken(token);
            setGoogleSignedIn(true);
        }
        catch (e) {
            // Expected whenever there's no active Google session in this browser —
            // just leave the "Continue with Google" button showing.
        }
    }
    async function driveFindBackupFileId(token) {
        const q = encodeURIComponent(`name='${DRIVE_BACKUP_FILENAME}'`);
        const res = await fetch(`https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=${q}&fields=files(id,modifiedTime)`, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok)
            throw new Error('drive-list-failed');
        const data = await res.json();
        return data.files && data.files.length ? data.files[0].id : null;
    }
    async function driveBackupNow(silent, overrideDecks, overrideCards) {
        if (!silent)
            setDriveNotice(null);
        setDriveBusy(true);
        try {
            let token = driveAccessToken;
            if (!token)
                token = await requestDriveToken();
            const payload = buildBackupPayload(overrideDecks || decks, overrideCards || cards, { cycleSize, practiceOrder });
            const existingId = await driveFindBackupFileId(token);
            const metadata = { name: DRIVE_BACKUP_FILENAME, mimeType: 'application/json', parents: existingId ? undefined : ['appDataFolder'] };
            const boundary = 'flashdrill_boundary';
            const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
                `--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(payload)}\r\n--${boundary}--`;
            const url = existingId
                ? `https://www.googleapis.com/upload/drive/v3/files/${existingId}?uploadType=multipart`
                : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
            const res = await fetch(url, {
                method: existingId ? 'PATCH' : 'POST',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
                body,
            });
            if (!res.ok)
                throw new Error('drive-upload-failed');
            setDriveAccessToken(token);
            setGoogleSignedIn(true);
            persistBackupMeta({ lastDriveBackupAt: new Date().toISOString() });
            if (!silent)
                setDriveNotice({ tone: 'success', text: 'Backed up to Google Drive.' });
        }
        catch (e) {
            if (!silent) {
                setDriveNotice({ tone: 'error', text: 'Drive backup failed. Sign in again and retry.' });
            }
        }
        finally {
            setDriveBusy(false);
        }
    }
    // General-purpose event-based backup trigger — call after any discrete data
    // change (new deck, import, delete, edit) or practice checkpoint. Silently does
    // nothing if not signed in. Accepts overrides so the just-computed fresh data
    // can be sent immediately, without waiting on state to propagate first.
    function triggerAutoBackup(overrideDecks, overrideCards) {
        if (googleSignedIn) {
            driveBackupNow(true, overrideDecks, overrideCards);
        }
    }
    // Runs right after a successful sign-in. If there's no local data, restore Drive's
    // backup automatically. If local decks already exist, ask before touching anything.
    async function syncAfterSignIn(token) {
        try {
            const fileId = await driveFindBackupFileId(token);
            if (!fileId)
                return; // nothing backed up yet — nothing to sync
            const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok)
                return;
            const parsed = await res.json();
            if (validateBackupShape(parsed))
                return;
            if (decks.length === 0) {
                persistDecks(Array.isArray(parsed.decks) ? parsed.decks : []);
                persistCards(Array.isArray(parsed.cards) ? parsed.cards : []);
                if (parsed.settings)
                    persistSettings(parsed.settings.cycleSize || cycleSize, parsed.settings.practiceOrder || practiceOrder);
                setDriveNotice({ tone: 'success', text: 'Restored your decks from Google Drive.' });
                setTimeout(() => {
                    setDriveNotice((prev) => (prev && prev.text === 'Restored your decks from Google Drive.' ? null : prev));
                }, 5000);
            }
            else {
                setSignInSyncPrompt({ drivePayload: parsed });
                setView('backup');
            }
        }
        catch (e) {
            // Sign-in itself still succeeded even if this sync step failed silently.
        }
    }
    function applySignInRewrite() {
        if (!signInSyncPrompt)
            return;
        const { drivePayload } = signInSyncPrompt;
        persistDecks(Array.isArray(drivePayload.decks) ? drivePayload.decks : []);
        persistCards(Array.isArray(drivePayload.cards) ? drivePayload.cards : []);
        if (drivePayload.settings)
            persistSettings(drivePayload.settings.cycleSize || cycleSize, drivePayload.settings.practiceOrder || practiceOrder);
        setSignInSyncPrompt(null);
        setDriveNotice({ tone: 'success', text: 'Replaced local data with your Drive backup.' });
    }
    function applySignInMerge() {
        if (!signInSyncPrompt)
            return;
        const { drivePayload } = signInSyncPrompt;
        const driveDecks = Array.isArray(drivePayload.decks) ? drivePayload.decks : [];
        const driveCards = Array.isArray(drivePayload.cards) ? drivePayload.cards : [];
        const merged = mergeBackups(decks, cards, driveDecks, driveCards);
        persistDecks(merged.decks);
        persistCards(merged.cards);
        setSignInSyncPrompt(null);
        setDriveNotice({ tone: 'success', text: 'Merged local decks with your Drive backup.' });
        driveBackupNow(true, merged.decks, merged.cards);
    }
    async function driveRestoreNow() {
        setDriveNotice(null);
        setDriveBusy(true);
        try {
            let token = driveAccessToken;
            if (!token)
                token = await requestDriveToken();
            const fileId = await driveFindBackupFileId(token);
            if (!fileId) {
                setDriveNotice({ tone: 'error', text: 'No backup found in Google Drive yet.' });
                return;
            }
            const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok)
                throw new Error('drive-download-failed');
            const parsed = await res.json();
            const err = validateBackupShape(parsed);
            if (err) {
                setDriveNotice({ tone: 'error', text: err });
                return;
            }
            setDriveAccessToken(token);
            setGoogleSignedIn(true);
            setPendingRestore({ source: 'drive', payload: parsed });
        }
        catch (e) {
            setDriveNotice({ tone: 'error', text: 'Couldn\u2019t reach Google Drive. Check your connection and sign-in.' });
        }
        finally {
            setDriveBusy(false);
        }
    }
    // Makes the phone/browser back button navigate between screens inside the app
    // instead of closing the tab. Every screen change pushes a history entry; the
    // back button pops it and we move the app's own `view` state to match, rather
    // than letting the browser leave the page. Seeded once on mount so the very
    // first screen still lets a "back" press genuinely exit, as expected.
    //
    // Bug fix: this listener must be re-registered whenever cards/decks change, not
    // just when the screen changes — otherwise a card answered mid-practice (which
    // doesn't change `view`) leaves the handler holding a stale, pre-answer copy of
    // the data, and a back-button-triggered backup silently re-uploads the old
    // version instead of the just-saved one.
    useEffect(() => {
        if (!window.history.state || typeof window.history.state.view === 'undefined') {
            window.history.replaceState({ view }, '');
        }
        const onPopState = (e) => {
            skipNextHistoryPushRef.current = true;
            if (view === 'practice')
                flushPracticeBackupIfNeeded();
            setView((e.state && e.state.view) || 'home');
        };
        window.addEventListener('popstate', onPopState);
        return () => window.removeEventListener('popstate', onPopState);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [view, googleSignedIn, cards, decks, driveAccessToken]);
    useEffect(() => {
        if (skipNextHistoryPushRef.current) {
            skipNextHistoryPushRef.current = false;
            return;
        }
        window.history.pushState({ view }, '');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [view]);
    // Runs once per app load: quietly try to restore the Google session using the
    // last account, no popup shown. Falls back to the normal sign-in button if it
    // can't (no active browser session, or the user explicitly signed out before).
    useEffect(() => {
        if (!loaded || silentSignInAttemptedRef.current)
            return;
        silentSignInAttemptedRef.current = true;
        attemptSilentSignIn();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [loaded]);
    // Tailwind's text-xs/sm/base/etc classes are all rem-based, relative to the root
    // <html> font-size — so changing that one value scales every piece of text in
    // the app proportionally, without needing to touch each component individually.
    useEffect(() => {
        document.documentElement.style.fontSize = fontSizePx + 'px';
    }, [fontSizePx]);
    useEffect(() => {
        document.body.style.backgroundColor = darkMode ? COLORS_DARK.paper : COLORS_LIGHT.paper;
    }, [darkMode]);
    // regenerate options whenever we land on a new question
    useEffect(() => {
        if (view !== 'practice' || phase !== 'question')
            return;
        if (!cycleOrder.length)
            return;
        const id = cycleOrder[cardPos];
        const card = cards.find((c) => c.id === id);
        if (!card)
            return;
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
        questionShownAtRef.current = Date.now();
    }, [view, phase, cycleIndex, cardPos, cycleOrder, cards]);
    // Note: spaced-repetition scheduling is now applied immediately per-card, the
    // moment a card is answered correctly on its first attempt (see handleOptionClick).
    // That's the exact moment a card's fate for this session is sealed — a first-attempt
    // correct answer means it won't reappear in any later review round. Applying it here
    // in a batch at session-end would double-schedule every card, so this is intentionally
    // no longer a separate step.
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
    function beginSession(poolIds, returnTo, label, affectsProgress) {
        if (!poolIds.length)
            return;
        setSessionPoolIds(poolIds);
        setSessionEverMissed(new Set());
        setSessionLabel(label);
        setReturnView(returnTo);
        setSessionAffectsProgress(affectsProgress !== false);
        practiceDirtyRef.current = false;
        startRound(poolIds, 1);
    }
    function startFlip(poolIds, returnTo) {
        if (!poolIds.length)
            return;
        setFlipOrder(orderPool(poolIds, practiceOrder, cards));
        setFlipIndex(0);
        setFlipShowAnswer(false);
        setReturnView(returnTo || 'deck');
        setView('flip');
    }
    function continueToNextCycle() {
        flushPracticeBackupIfNeeded();
        const nextIdx = cycleIndex + 1;
        setCycleIndex(nextIdx);
        setCycleOrder(shuffle(cycles[nextIdx]));
        setCardPos(0);
        setPhase('question');
    }
    function startReviewRound() {
        flushPracticeBackupIfNeeded();
        startRound(Array.from(missedSet), roundNumber + 1);
    }
    // Shared by the in-app exit button AND the browser/hardware back-button handler
    // below — whichever way practice is exited, a signed-in backup still fires if
    // anything was answered.
    function flushPracticeBackupIfNeeded() {
        if (practiceDirtyRef.current && googleSignedIn) {
            driveBackupNow(true);
        }
        practiceDirtyRef.current = false;
    }
    // Single exit point for practice — used by both the early-exit chevron (mid-round)
    // and the "continue" button after a completed session. Per-card progress is already
    // saved as it happens (see handleOptionClick), so this only needs to trigger a
    // Drive backup, and only if signed in and something was actually answered.
    // Clicking the "Flashcard Drill" title always goes home, same as any normal web
    // app's logo. If practice is in progress, flush the same backup check first.
    function goHome() {
        if (view === 'practice')
            flushPracticeBackupIfNeeded();
        setSelectedDeckId(null);
        setView('home');
    }
    function exitPractice() {
        flushPracticeBackupIfNeeded();
        setView(returnView);
    }
    function handleAdvance() {
        const nextPos = cardPos + 1;
        if (nextPos < cycleOrder.length) {
            setCardPos(nextPos);
            return;
        }
        if (cycleIndex + 1 < cycles.length) {
            setPhase('cycleComplete');
        }
        else if (missedSet.size > 0) {
            setPhase('roundComplete');
        }
        else {
            setPhase('allClear');
        }
    }
    function handleOptionClick(idx) {
        if (phase !== 'question' || flashCorrectIdx !== null)
            return;
        const opt = currentOptions[idx];
        if (!opt)
            return;
        if (opt.correct) {
            const id = cycleOrder[cardPos];
            const graduates = firstAttempt;
            const wasEverMissed = sessionEverMissed.has(id);
            const elapsedSeconds = questionShownAtRef.current ? (Date.now() - questionShownAtRef.current) / 1000 : 0;
            if (sessionAffectsProgress)
                practiceDirtyRef.current = true;
            setFlashCorrectIdx(idx);
            setTimeout(() => {
                setFlashCorrectIdx(null);
                if (sessionAffectsProgress) {
                    // Progress-affecting session only (Review Due / Practice All · MCQ):
                    // SR scheduling on graduation (first-try correct, won't reappear this
                    // session), plus a difficulty update on every correct click, timed from
                    // when the question first appeared. Done here, after the flash, so the
                    // save doesn't re-render mid-animation and cut the green flash short.
                    const card = cards.find((c) => c.id === id);
                    const newDifficulty = card ? classifyDifficulty(card, elapsedSeconds) : null;
                    const updated = cards.map((c) => {
                        if (c.id !== id)
                            return c;
                        const next = { ...c };
                        if (graduates)
                            next.sr = scheduleNext(c.sr, !wasEverMissed);
                        if (newDifficulty)
                            next.difficulty = newDifficulty;
                        return next;
                    });
                    persistCards(updated);
                }
                handleAdvance();
            }, 350);
        }
        else {
            if (sessionAffectsProgress)
                practiceDirtyRef.current = true;
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
        if (!name)
            return;
        const category = newDeckCategory.trim() || null;
        const deck = {
            id: `d_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
            name,
            category,
            createdAt: Date.now(),
        };
        const nextDecks = [...decks, deck];
        persistDecks(nextDecks);
        triggerAutoBackup(nextDecks, undefined);
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
        if (!parsedPreview || parsedPreview.cards.length === 0 || !selectedDeckId)
            return;
        const withMeta = parsedPreview.cards.map((c) => ({ ...c, deckId: selectedDeckId, sr: defaultSr(), difficulty: 'poor' }));
        const next = importMode === 'replace'
            ? [...cards.filter((c) => c.deckId !== selectedDeckId), ...withMeta]
            : [...cards, ...withMeta];
        persistCards(next);
        triggerAutoBackup(undefined, next);
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
    // Deletions (category/deck/card) deliberately do NOT auto-backup — a destructive
    // action shouldn't silently propagate to Drive. A manual "Back Up Now" is needed
    // to actually save the change there.
    function deleteDeck(deckId) {
        const nextDecks = decks.filter((d) => d.id !== deckId);
        const nextCards = cards.filter((c) => c.deckId !== deckId);
        persistDecks(nextDecks);
        persistCards(nextCards);
        setEditZoneNotice(googleSignedIn ? 'Deck deleted. Back up manually to save this on Drive.' : 'Deck deleted.');
    }
    function deleteCategory(categoryKey) {
        const isUncategorized = categoryKey === 'Uncategorized';
        const match = (d) => (isUncategorized ? !d.category || !d.category.trim() : d.category === categoryKey);
        const removedDeckIds = new Set(decks.filter(match).map((d) => d.id));
        const nextDecks = decks.filter((d) => !removedDeckIds.has(d.id));
        const nextCards = cards.filter((c) => !removedDeckIds.has(c.deckId));
        persistDecks(nextDecks);
        persistCards(nextCards);
        setEditZoneNotice(googleSignedIn ? 'Category and its decks deleted. Back up manually to save this on Drive.' : 'Category and its decks deleted.');
    }
    function renameCategory(categoryKey, newName) {
        const name = newName.trim();
        if (!name)
            return;
        const isUncategorized = categoryKey === 'Uncategorized';
        const match = (d) => (isUncategorized ? !d.category || !d.category.trim() : d.category === categoryKey);
        const nextDecks = decks.map((d) => (match(d) ? { ...d, category: name } : d));
        persistDecks(nextDecks);
        triggerAutoBackup(nextDecks, undefined);
    }
    function renameDeck(deckId, newName) {
        const name = newName.trim();
        if (!name)
            return;
        const nextDecks = decks.map((d) => (d.id === deckId ? { ...d, name } : d));
        persistDecks(nextDecks);
        triggerAutoBackup(nextDecks, undefined);
    }
    function beginEditCard(card) {
        setEditingCardId(card.id);
        setEditingCardDraft(cardToRawText(card));
        setEditingCardError('');
    }
    function cancelEditCard() {
        setEditingCardId(null);
        setEditingCardDraft('');
        setEditingCardError('');
    }
    function saveEditCard() {
        const { cards: parsed, errors } = parseCards(editingCardDraft);
        if (errors.length) {
            setEditingCardError(errors[0]);
            return;
        }
        if (parsed.length !== 1) {
            setEditingCardError('Edit one card at a time — needs exactly one $question with 4 or 5 @ lines.');
            return;
        }
        const p = parsed[0];
        const nextCards = cards.map((c) => c.id === editingCardId
            ? { ...c, question: p.question, correctAnswer: p.correctAnswer, distractors: p.distractors, hint: p.hint, difficulty: 'poor' }
            : c);
        persistCards(nextCards);
        triggerAutoBackup(undefined, nextCards);
        setEditingCardId(null);
        setEditingCardDraft('');
        setEditingCardError('');
    }
    function deleteSingleCard(cardId) {
        const nextCards = cards.filter((c) => c.id !== cardId);
        persistCards(nextCards);
        setEditZoneNotice(googleSignedIn ? 'Card deleted. Back up manually to save this on Drive.' : 'Card deleted.');
        setConfirmDeleteCardId(null);
    }
    const today = todayStr();
    const categories = Array.from(new Set(decks.map((d) => d.category).filter(Boolean)));
    const totalDue = cards.filter((c) => c.sr && c.sr.due <= today).length;
    const selectedDeck = decks.find((d) => d.id === selectedDeckId) || null;
    const currentCard = view === 'practice' && cycleOrder.length ? cards.find((c) => c.id === cycleOrder[cardPos]) : null;
    const COLORS = darkMode ? COLORS_DARK : COLORS_LIGHT;
    const fontStyle = { fontFamily: "'Roboto Slab', serif" };
    const monoStyle = { fontFamily: "'Space Mono', monospace" };
    let content = null;
    if (!loaded) {
        content = (React.createElement("div", { className: "py-16 text-center", style: { ...monoStyle, color: COLORS.inkFaint } }, "loading decks..."));
    }
    else if (view === 'home') {
        const q = searchQuery.trim().toLowerCase();
        const searchedDecks = q
            ? decks.filter((d) => d.name.toLowerCase().includes(q) || (d.category || '').toLowerCase().includes(q))
            : decks;
        const grouped = {};
        searchedDecks.forEach((d) => {
            const key = d.category && d.category.trim() ? d.category.trim() : 'Uncategorized';
            if (!grouped[key])
                grouped[key] = [];
            grouped[key].push(d);
        });
        const categoryKeys = Object.keys(grouped).sort((a, b) => {
            if (a === 'Uncategorized')
                return 1;
            if (b === 'Uncategorized')
                return -1;
            return a.localeCompare(b);
        });
        const homeNoticeColor = driveNotice?.tone === 'error' ? COLORS.red : driveNotice?.tone === 'success' ? COLORS.green : COLORS.mustard;
        const homeNoticeBg = driveNotice?.tone === 'error' ? COLORS.redBg : driveNotice?.tone === 'success' ? COLORS.greenBg : COLORS.mustardBg;
        content = (React.createElement("div", { className: "flex flex-col gap-3" },
            driveNotice && (React.createElement("div", { className: "rounded-lg border-2 px-3 py-2 flex items-start gap-2", style: { borderColor: homeNoticeColor, backgroundColor: homeNoticeBg } },
                driveNotice.tone === 'error' ? (React.createElement(AlertTriangle, { size: 16, style: { color: homeNoticeColor }, className: "shrink-0 mt-0.5" })) : (React.createElement(Check, { size: 16, style: { color: homeNoticeColor }, className: "shrink-0 mt-0.5" })),
                React.createElement("span", { style: { ...fontStyle, color: homeNoticeColor }, className: "text-xs leading-relaxed" }, driveNotice.text))),
            React.createElement("button", { onClick: () => {
                    const dueIds = cards.filter((c) => c.sr && c.sr.due <= today).map((c) => c.id);
                    beginSession(dueIds, 'home', 'All Decks · Due');
                }, disabled: totalDue === 0, style: { backgroundColor: totalDue > 0 ? COLORS.mustard : '#C9C2AC', ...fontStyle }, className: "w-full rounded-xl py-3 text-white font-bold tracking-wide focus:outline-none focus:ring-2 focus:ring-offset-2" },
                "Review All Due (",
                totalDue,
                ")"),
            React.createElement("div", { className: "flex gap-2" },
                React.createElement("button", { onClick: () => setView('newDeck'), style: { borderColor: COLORS.ink, color: COLORS.ink, ...fontStyle }, className: "flex-1 rounded-xl border-2 py-2.5 font-bold flex items-center justify-center gap-1 text-sm focus:outline-none focus:ring-2" },
                    React.createElement(Plus, { size: 16 }),
                    " New Deck"),
                React.createElement("button", { onClick: () => {
                        if (!decks.length)
                            return;
                        setSelectedDeckId((id) => id || decks[0].id);
                        setView('import');
                    }, disabled: decks.length === 0, style: { borderColor: COLORS.ink, color: decks.length ? COLORS.ink : '#B9B29A', ...fontStyle }, className: "flex-1 rounded-xl border-2 py-2.5 font-bold flex items-center justify-center gap-1 text-sm disabled:opacity-50 focus:outline-none focus:ring-2" },
                    React.createElement(Upload, { size: 16 }),
                    " Import")),
            decks.length > 0 && (React.createElement("div", { className: "relative mt-1" },
                React.createElement(Search, { size: 16, style: { color: COLORS.inkFaint }, className: "absolute left-3 top-1/2 -translate-y-1/2" }),
                React.createElement("input", { type: "text", value: searchQuery, onChange: (e) => setSearchQuery(e.target.value), placeholder: "Search decks or categories", style: { ...fontStyle, borderColor: COLORS.rule, backgroundColor: COLORS.card, color: COLORS.ink }, className: "w-full rounded-lg border-2 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2" }))),
            decks.length === 0 ? (React.createElement("p", { style: { ...fontStyle, color: COLORS.inkFaint }, className: "text-sm px-1 mt-2" }, "No decks yet. Create one to start building your first set of questions.")) : searchedDecks.length === 0 ? (React.createElement("p", { style: { ...fontStyle, color: COLORS.inkFaint }, className: "text-sm px-1 mt-2" },
                "No decks match \"",
                searchQuery,
                "\".")) : (React.createElement("div", { className: "flex flex-col gap-4 mt-2" }, categoryKeys.map((cat) => (React.createElement("div", { key: cat, className: "flex flex-col gap-2" },
                React.createElement("div", { style: { ...monoStyle, color: COLORS.inkFaint }, className: "text-xs tracking-widest uppercase" }, cat),
                grouped[cat].map((deck) => {
                    const deckCards = cards.filter((c) => c.deckId === deck.id);
                    const dueCount = deckCards.filter((c) => c.sr && c.sr.due <= today).length;
                    const empty = deckCards.length === 0;
                    const pillLabel = empty ? 'empty' : dueCount > 0 ? `${dueCount} due` : 'up to date';
                    const pillColor = empty ? COLORS.inkFaint : dueCount > 0 ? COLORS.mustard : COLORS.green;
                    const pillBg = empty ? COLORS.rule : dueCount > 0 ? COLORS.mustardBg : COLORS.greenBg;
                    return (React.createElement("button", { key: deck.id, onClick: () => {
                            setSelectedDeckId(deck.id);
                            setView('deck');
                        }, className: "w-full text-left rounded-xl border-2 px-4 py-3 flex items-center justify-between gap-2", style: { borderColor: COLORS.ink, backgroundColor: COLORS.card } },
                        React.createElement("div", null,
                            React.createElement("div", { style: { ...fontStyle, color: COLORS.ink }, className: "font-bold" }, deck.name),
                            React.createElement("div", { style: { ...monoStyle, color: COLORS.inkFaint }, className: "text-xs" },
                                deckCards.length,
                                " card",
                                deckCards.length !== 1 ? 's' : '')),
                        React.createElement("span", { style: { ...monoStyle, color: pillColor, backgroundColor: pillBg }, className: "text-xs px-2 py-1 rounded-full shrink-0" }, pillLabel)));
                })))))),
            !googleSignedIn ? (React.createElement("button", { onClick: handleGoogleSignIn, disabled: driveBusy, style: { borderColor: COLORS.ink, color: COLORS.ink, ...fontStyle }, className: "w-full rounded-xl border-2 text-sm font-bold py-2.5 mt-2 flex items-center justify-center gap-2 disabled:opacity-50" },
                React.createElement(Cloud, { size: 16 }),
                " ",
                driveBusy ? 'Connecting…' : 'Continue with Google')) : (React.createElement("div", { className: "w-full rounded-xl border-2 text-xs py-2 mt-2 flex items-center justify-center gap-1", style: { borderColor: COLORS.rule, color: COLORS.green, ...monoStyle } },
                React.createElement(Check, { size: 13 }),
                " ",
                googleEmail || 'Signed in',
                " \u00B7 Drive backup on")),
            React.createElement("button", { onClick: () => setView('settings'), style: { color: COLORS.inkFaint, ...fontStyle }, className: "w-full py-2 font-medium flex items-center justify-center gap-2 mt-2" },
                React.createElement(SettingsIcon, { size: 16 }),
                " Settings")));
    }
    else if (view === 'newDeck') {
        content = (React.createElement("div", { className: "flex flex-col gap-4" },
            React.createElement(BackHeader, { onBack: () => setView('home'), title: "New Deck" , COLORS }),
            React.createElement("div", null,
                React.createElement("label", { style: { ...fontStyle, color: COLORS.ink }, className: "text-sm font-bold block mb-1" }, "Deck Name"),
                React.createElement("input", { type: "text", value: newDeckName, onChange: (e) => setNewDeckName(e.target.value), placeholder: "e.g. SSC Vocabulary \u2014 Set 3", style: { ...fontStyle, borderColor: COLORS.rule, backgroundColor: COLORS.card, color: COLORS.ink }, className: "w-full rounded-lg border-2 px-3 py-2 focus:outline-none focus:ring-2" })),
            React.createElement("div", null,
                React.createElement("label", { style: { ...fontStyle, color: COLORS.ink }, className: "text-sm font-bold block mb-1" }, "Category (optional)"),
                React.createElement("input", { type: "text", list: "category-list", value: newDeckCategory, onChange: (e) => setNewDeckCategory(e.target.value), placeholder: "e.g. Vocabulary, Current Affairs, Maths", style: { ...fontStyle, borderColor: COLORS.rule, backgroundColor: COLORS.card, color: COLORS.ink }, className: "w-full rounded-lg border-2 px-3 py-2 focus:outline-none focus:ring-2" }),
                React.createElement("datalist", { id: "category-list" }, categories.map((c) => React.createElement("option", { key: c, value: c }))),
                React.createElement("p", { style: { ...monoStyle, color: COLORS.inkFaint }, className: "text-xs mt-1" }, "Leave blank to file this under Uncategorized.")),
            React.createElement("button", { onClick: createDeck, disabled: !newDeckName.trim(), style: { backgroundColor: newDeckName.trim() ? COLORS.ink : '#C9C2AC', ...fontStyle }, className: "w-full rounded-xl py-3 text-white font-bold tracking-wide disabled:opacity-60" }, "Create Deck")));
    }
    else if (view === 'import') {
        if (decks.length === 0) {
            content = (React.createElement("div", { className: "flex flex-col gap-4" },
                React.createElement(BackHeader, { onBack: () => setView('home'), title: "Import Questions" , COLORS }),
                React.createElement("p", { style: { ...fontStyle, color: COLORS.inkFaint }, className: "text-sm" }, "You need a deck before you can import cards."),
                React.createElement("button", { onClick: () => setView('newDeck'), style: { backgroundColor: COLORS.accent, ...fontStyle }, className: "w-full rounded-xl py-3 text-white font-bold" }, "Create Your First Deck")));
        }
        else {
            content = (React.createElement("div", { className: "flex flex-col gap-4" },
                React.createElement(BackHeader, { onBack: () => setView(selectedDeckId ? 'deck' : 'home'), title: "Import Questions" , COLORS }),
                React.createElement("div", null,
                    React.createElement("label", { style: { ...fontStyle, color: COLORS.ink }, className: "text-sm font-bold block mb-1" }, "Deck"),
                    React.createElement("select", { value: selectedDeckId || '', onChange: (e) => setSelectedDeckId(e.target.value), style: { ...fontStyle, borderColor: COLORS.rule, backgroundColor: COLORS.card }, className: "w-full rounded-lg border-2 px-3 py-2 focus:outline-none focus:ring-2" }, decks.map((d) => (React.createElement("option", { key: d.id, value: d.id },
                        d.name,
                        d.category ? ` — ${d.category}` : ''))))),
                React.createElement("p", { style: { ...fontStyle, color: COLORS.inkFaint }, className: "text-sm" },
                    "One block per question. Start each with ",
                    React.createElement("b", null, "$"),
                    ", then exactly 4 or 5 lines starting with ",
                    React.createElement("b", null, "@"),
                    " \u2014 first is the correct answer, the optional 5th is a hint."),
                React.createElement("textarea", { value: importText, onChange: (e) => { setImportText(e.target.value); setParsedPreview(null); }, placeholder: SAMPLE_TEXT, rows: 9, style: { ...monoStyle, borderColor: COLORS.rule, backgroundColor: COLORS.card, color: COLORS.ink }, className: "w-full rounded-xl border-2 p-3 text-xs leading-relaxed focus:outline-none focus:ring-2" }),
                React.createElement("button", { onClick: handleImportParse, disabled: !importText.trim(), style: { borderColor: COLORS.ink, color: COLORS.ink, ...fontStyle }, className: "w-full rounded-xl border-2 py-2.5 font-bold disabled:opacity-40" }, "Parse"),
                parsedPreview && (React.createElement("div", { className: "rounded-xl border-2 p-3", style: { borderColor: parsedPreview.errors.length ? COLORS.red : COLORS.green, backgroundColor: COLORS.card } },
                    React.createElement("div", { style: { ...monoStyle, color: COLORS.ink }, className: "text-xs mb-2" },
                        parsedPreview.cards.length,
                        " card",
                        parsedPreview.cards.length !== 1 ? 's' : '',
                        " parsed",
                        parsedPreview.errors.length > 0 ? `, ${parsedPreview.errors.length} skipped` : ''),
                    parsedPreview.errors.length > 0 && (React.createElement("ul", { style: { ...monoStyle, color: COLORS.red }, className: "text-xs list-disc pl-4 space-y-1 mb-2" }, parsedPreview.errors.map((e, i) => React.createElement("li", { key: i }, e)))),
                    parsedPreview.cards.length > 0 && (React.createElement("div", { className: "flex flex-col gap-2 mt-2" },
                        React.createElement("div", { className: "flex gap-3 text-xs", style: { ...fontStyle, color: COLORS.ink } },
                            React.createElement("label", { className: "flex items-center gap-1" },
                                React.createElement("input", { type: "radio", checked: importMode === 'add', onChange: () => setImportMode('add') }),
                                "Add to deck"),
                            React.createElement("label", { className: "flex items-center gap-1" },
                                React.createElement("input", { type: "radio", checked: importMode === 'replace', onChange: () => setImportMode('replace') }),
                                "Replace this deck's cards")),
                        React.createElement("button", { onClick: commitImport, style: { backgroundColor: COLORS.green, ...fontStyle }, className: "w-full rounded-xl py-2.5 text-white font-bold" }, importMode === 'replace' ? 'Replace Deck Cards' : 'Add to Deck')))))));
        }
    }
    else if (view === 'deck' && selectedDeck) {
        const deckCards = cards.filter((c) => c.deckId === selectedDeck.id);
        const dueCards = deckCards.filter((c) => c.sr && c.sr.due <= today);
        content = (React.createElement("div", { className: "flex flex-col gap-4" },
            React.createElement(BackHeader, { onBack: () => {
                    setView('home');
                    setEditZoneQuery('');
                    setEditingCardId(null);
                    setEditingCardDraft('');
                    setConfirmDeleteCardId(null);
                }, title: selectedDeck.name , COLORS }),
            React.createElement("div", { style: { ...monoStyle, color: COLORS.inkFaint }, className: "text-xs -mt-2" },
                selectedDeck.category || 'Uncategorized',
                " \u00B7 ",
                deckCards.length,
                " card",
                deckCards.length !== 1 ? 's' : '',
                " \u00B7 ",
                dueCards.length,
                " due"),
            React.createElement("div", { style: { ...monoStyle, color: COLORS.inkFaint }, className: "text-xs tracking-widest uppercase" }, "Spaced Repetition \u00B7 MCQ"),
            React.createElement("button", { onClick: () => beginSession(dueCards.map((c) => c.id), 'deck', `${selectedDeck.name} · Due`), disabled: dueCards.length === 0, style: { backgroundColor: dueCards.length ? COLORS.mustard : '#C9C2AC', ...fontStyle }, className: "w-full rounded-xl py-3 text-white font-bold tracking-wide disabled:opacity-60" },
                "Review Due (",
                dueCards.length,
                ")"),
            React.createElement("button", { onClick: () => beginSession(deckCards.map((c) => c.id), 'deck', selectedDeck.name), disabled: deckCards.length === 0, style: { backgroundColor: deckCards.length ? COLORS.ink : '#C9C2AC', ...fontStyle }, className: "w-full rounded-xl py-3 text-white font-bold tracking-wide disabled:opacity-60" }, "Practice All \u00B7 MCQ"),
            React.createElement("button", { onClick: () => { setSelectedDifficultyTier(null); setView('difficultyTiers'); }, disabled: deckCards.length === 0, style: { borderColor: COLORS.mustard, color: COLORS.mustard, ...fontStyle }, className: "w-full rounded-xl border-2 py-2.5 font-bold tracking-wide disabled:opacity-50" }, "Practice by Difficulty"),
            React.createElement("div", { style: { ...monoStyle, color: COLORS.inkFaint }, className: "text-xs tracking-widest uppercase mt-1" }, "Study Only \u00B7 No Scheduling Impact"),
            React.createElement("button", { onClick: () => startFlip(deckCards.map((c) => c.id)), disabled: deckCards.length === 0, style: { borderColor: COLORS.ink, color: COLORS.ink, ...fontStyle }, className: "w-full rounded-xl border-2 py-2.5 font-bold flex items-center justify-center gap-2 disabled:opacity-50" },
                React.createElement(Layers, { size: 16 }),
                " Flip Through"),
            React.createElement("button", { onClick: () => { setSheetFilterIds(null); setView('sheet'); }, disabled: deckCards.length === 0, style: { borderColor: COLORS.ink, color: COLORS.ink, ...fontStyle }, className: "w-full rounded-xl border-2 py-2.5 font-bold flex items-center justify-center gap-2 disabled:opacity-50" },
                React.createElement(FileText, { size: 16 }),
                " View as Sheet"),
            React.createElement("button", { onClick: () => setView('import'), style: { borderColor: COLORS.ink, color: COLORS.ink, ...fontStyle }, className: "w-full rounded-xl border-2 py-2.5 font-bold flex items-center justify-center gap-2" },
                React.createElement(Upload, { size: 16 }),
                " Import More"),
            React.createElement("p", { style: { ...monoStyle, color: COLORS.inkFaint }, className: "text-xs text-center px-2" }, "Go to Settings for Editing or Deleting Decks or Categories."),
            deckCards.length === 0 && (React.createElement("p", { style: { ...fontStyle, color: COLORS.inkFaint }, className: "text-sm px-1" }, "This deck is empty \u2014 import cards to start practicing."))));
    }
    else if (view === 'flip') {
        const flipCard = flipOrder.length && flipIndex < flipOrder.length ? cards.find((c) => c.id === flipOrder[flipIndex]) : null;
        if (flipCard) {
            content = (React.createElement("div", { className: "flex flex-col gap-4" },
                React.createElement("div", { className: "flex justify-between items-center" },
                    React.createElement("button", { onClick: () => setView(returnView), style: { color: COLORS.inkFaint }, className: "p-1" },
                        React.createElement(ChevronLeft, { size: 20 })),
                    React.createElement("div", { style: { ...monoStyle, color: COLORS.inkFaint }, className: "text-xs tracking-widest" },
                        selectedDeck ? `${selectedDeck.name.toUpperCase()} · ` : '',
                        "FLIP ",
                        flipIndex + 1,
                        "/",
                        flipOrder.length),
                    React.createElement("div", { style: { width: 28 } })),
                React.createElement("button", { onClick: () => !flipShowAnswer && setFlipShowAnswer(true), className: "w-full rounded-2xl border-2 px-5 py-8 text-left focus:outline-none focus:ring-2", style: { borderColor: COLORS.ink, backgroundColor: COLORS.card } },
                    React.createElement("div", { style: { ...monoStyle, color: COLORS.inkFaint }, className: "text-xs uppercase tracking-widest mb-2" }, "Question"),
                    React.createElement("p", { style: { ...fontStyle, color: COLORS.ink }, className: "text-base leading-relaxed font-medium mb-4" }, flipCard.question),
                    flipShowAnswer ? (React.createElement(React.Fragment, null,
                        React.createElement("div", { style: { ...monoStyle, color: COLORS.green }, className: "text-xs uppercase tracking-widest mb-1" }, "Answer"),
                        React.createElement("p", { style: { ...fontStyle, color: COLORS.ink }, className: "text-base font-medium" }, flipCard.correctAnswer),
                        flipCard.hint && (React.createElement("p", { style: { ...fontStyle, color: '#6B4E17' }, className: "text-xs mt-3 italic" },
                            "Hint: ",
                            flipCard.hint)))) : (React.createElement("p", { style: { ...monoStyle, color: COLORS.inkFaint }, className: "text-xs" }, "Tap to reveal answer"))),
                flipShowAnswer && (React.createElement("button", { onClick: () => {
                        if (flipIndex + 1 < flipOrder.length) {
                            setFlipIndex(flipIndex + 1);
                            setFlipShowAnswer(false);
                        }
                        else {
                            setFlipIndex(flipOrder.length);
                        }
                    }, style: { backgroundColor: COLORS.accent, ...fontStyle }, className: "w-full rounded-xl py-3 text-white font-bold tracking-wide" }, "Next Card"))));
        }
        else {
            content = (React.createElement(StampScreen, { tone: "navy", title: "DECK COMPLETE", subtitle: `${flipOrder.length} card${flipOrder.length !== 1 ? 's' : ''} reviewed · flip-through, not scheduled`, buttonLabel: "Back to Deck", onContinue: () => setView(returnView) , COLORS }));
        }
    }
    else if (view === 'sheet' && selectedDeck) {
        const baseIds = sheetFilterIds || cards.filter((c) => c.deckId === selectedDeck.id).map((c) => c.id);
        const sheetIds = orderPool(baseIds, practiceOrder, cards);
        content = (React.createElement("div", { className: "flex flex-col gap-4" },
            React.createElement(BackHeader, { onBack: () => { setSheetFilterIds(null); setView(sheetFilterIds ? 'difficultyModes' : 'deck'); }, title: `${selectedDeck.name} · Sheet` , COLORS }),
            sheetIds.length === 0 ? (React.createElement("p", { style: { ...fontStyle, color: COLORS.inkFaint }, className: "text-sm" }, "This deck is empty.")) : (React.createElement("div", { className: "flex flex-col gap-3" }, sheetIds.map((id, i) => {
                const c = cards.find((cc) => cc.id === id);
                if (!c)
                    return null;
                return (React.createElement("div", { key: id, className: "rounded-xl border-2 px-4 py-3", style: { borderColor: COLORS.rule, backgroundColor: COLORS.card } },
                    React.createElement("div", { style: { ...fontStyle, color: COLORS.ink }, className: "text-sm font-medium" },
                        React.createElement("span", { style: monoStyle, className: "mr-1" },
                            i + 1,
                            "."),
                        c.question),
                    React.createElement("div", { style: { ...fontStyle, color: COLORS.green }, className: "text-sm font-bold mt-1" }, c.correctAnswer),
                    c.hint && React.createElement("div", { style: { ...fontStyle, color: COLORS.mustard }, className: "text-xs mt-1 italic" },
                        "Hint: ",
                        c.hint)));
            })))));
    }
    else if (view === 'difficultyTiers' && selectedDeck) {
        const deckCards = cards.filter((c) => c.deckId === selectedDeck.id);
        const tierCards = { strong: [], good: [], poor: [] };
        deckCards.forEach((c) => {
            const d = c.difficulty === 'strong' || c.difficulty === 'good' ? c.difficulty : 'poor';
            tierCards[d].push(c);
        });
        const tiers = [
            { key: 'strong', label: 'Strong Cards', color: COLORS.green, bg: COLORS.greenBg },
            { key: 'good', label: 'Good Cards', color: COLORS.mustard, bg: COLORS.mustardBg },
            { key: 'poor', label: 'Poor Cards', color: COLORS.red, bg: COLORS.redBg },
        ];
        content = (React.createElement("div", { className: "flex flex-col gap-3" },
            React.createElement(BackHeader, { onBack: () => setView('deck'), title: `${selectedDeck.name} · By Difficulty` , COLORS }),
            React.createElement("p", { style: { ...monoStyle, color: COLORS.inkFaint }, className: "text-xs -mt-1" }, "Doesn't affect scheduling or difficulty \u2014 pick a tier to study."),
            tiers.map((t) => (React.createElement("button", { key: t.key, onClick: () => { setSelectedDifficultyTier(t.key); setView('difficultyModes'); }, disabled: tierCards[t.key].length === 0, className: "w-full rounded-xl border-2 p-4 flex items-center justify-between disabled:opacity-40", style: { borderColor: t.color, backgroundColor: t.bg } },
                React.createElement("span", { style: { ...fontStyle, color: t.color }, className: "font-bold" }, t.label),
                React.createElement("span", { style: { ...monoStyle, color: t.color }, className: "text-sm" }, tierCards[t.key].length))))));
    }
    else if (view === 'difficultyModes' && selectedDeck) {
        const deckCards = cards.filter((c) => c.deckId === selectedDeck.id);
        const tierLabel = { strong: 'Strong Cards', good: 'Good Cards', poor: 'Poor Cards' }[selectedDifficultyTier] || '';
        const tierIds = deckCards
            .filter((c) => (c.difficulty === 'strong' || c.difficulty === 'good' ? c.difficulty : 'poor') === selectedDifficultyTier)
            .map((c) => c.id);
        content = (React.createElement("div", { className: "flex flex-col gap-3" },
            React.createElement(BackHeader, { onBack: () => setView('difficultyTiers'), title: tierLabel , COLORS }),
            React.createElement("p", { style: { ...monoStyle, color: COLORS.inkFaint }, className: "text-xs -mt-1" },
                tierIds.length,
                " card",
                tierIds.length !== 1 ? 's' : '',
                " \u00B7 study only, no scheduling or backup impact"),
            React.createElement("button", { onClick: () => beginSession(tierIds, 'difficultyModes', `${selectedDeck.name} · ${tierLabel}`, false), disabled: tierIds.length === 0, style: { backgroundColor: tierIds.length ? COLORS.ink : '#C9C2AC', ...fontStyle }, className: "w-full rounded-xl py-3 text-white font-bold tracking-wide disabled:opacity-60" }, "Practice Through MCQs"),
            React.createElement("button", { onClick: () => { setSheetFilterIds(tierIds); setView('sheet'); }, disabled: tierIds.length === 0, style: { borderColor: COLORS.ink, color: COLORS.ink, ...fontStyle }, className: "w-full rounded-xl border-2 py-2.5 font-bold flex items-center justify-center gap-2 disabled:opacity-50" },
                React.createElement(FileText, { size: 16 }),
                " Practice Through Reading Sheet"),
            React.createElement("button", { onClick: () => startFlip(tierIds, 'difficultyModes'), disabled: tierIds.length === 0, style: { borderColor: COLORS.ink, color: COLORS.ink, ...fontStyle }, className: "w-full rounded-xl border-2 py-2.5 font-bold flex items-center justify-center gap-2 disabled:opacity-50" },
                React.createElement(Layers, { size: 16 }),
                " Practice Through Flip")));
    }
    else if (view === 'settings') {
        content = (React.createElement("div", { className: "flex flex-col gap-4" },
            React.createElement(BackHeader, { onBack: () => { setView('home'); setConfirmReset(false); }, title: "Settings" , COLORS }),
            React.createElement("div", { className: "rounded-xl border-2 p-4", style: { borderColor: COLORS.rule, backgroundColor: COLORS.card } },
                React.createElement("label", { style: { ...fontStyle, color: COLORS.ink }, className: "text-sm font-bold block mb-2" }, "Cards per cycle"),
                React.createElement("div", { className: "flex gap-2" },
                    React.createElement("input", { type: "number", min: 1, value: cycleSizeDraft, onChange: (e) => setCycleSizeDraft(e.target.value), style: { ...monoStyle, borderColor: COLORS.rule, backgroundColor: COLORS.card, color: COLORS.ink }, className: "w-24 rounded-lg border-2 px-3 py-2 text-center focus:outline-none focus:ring-2" }),
                    React.createElement("button", { onClick: saveCycleSize, style: { backgroundColor: COLORS.accent, ...fontStyle }, className: "flex-1 rounded-lg text-white font-bold" }, "Save")),
                React.createElement("p", { style: { ...monoStyle, color: COLORS.inkFaint }, className: "text-xs mt-2" },
                    "Applies to every deck. Currently ",
                    cycleSize,
                    " card",
                    cycleSize !== 1 ? 's' : '',
                    " per cycle.")),
            React.createElement("div", { className: "rounded-xl border-2 p-4", style: { borderColor: COLORS.rule, backgroundColor: COLORS.card } },
                React.createElement("label", { style: { ...fontStyle, color: COLORS.ink }, className: "text-sm font-bold block mb-2" }, "Font Size"),
                React.createElement("div", { className: "flex items-center gap-2" },
                    React.createElement("button", { onClick: () => persistFontSize(fontSizePx - 1), style: { borderColor: COLORS.ink, color: COLORS.ink, ...fontStyle }, className: "w-10 h-10 rounded-lg border-2 font-bold text-lg" }, "\u2212"),
                    React.createElement("input", { type: "number", min: 12, max: 28, value: fontSizePx, onChange: (e) => {
                            const v = parseInt(e.target.value, 10);
                            if (!Number.isNaN(v))
                                persistFontSize(v);
                        }, style: { ...monoStyle, borderColor: COLORS.rule, backgroundColor: COLORS.card, color: COLORS.ink }, className: "w-20 rounded-lg border-2 px-3 py-2 text-center focus:outline-none focus:ring-2" }),
                    React.createElement("button", { onClick: () => persistFontSize(fontSizePx + 1), style: { borderColor: COLORS.ink, color: COLORS.ink, ...fontStyle }, className: "w-10 h-10 rounded-lg border-2 font-bold text-lg" }, "+"),
                    React.createElement("span", { style: { ...monoStyle, color: COLORS.inkFaint }, className: "text-xs" }, "px (12\u201328)"))),
            React.createElement("div", { className: "rounded-xl border-2 p-4", style: { borderColor: COLORS.rule, backgroundColor: COLORS.card } },
                React.createElement("label", { style: { ...fontStyle, color: COLORS.ink }, className: "text-sm font-bold block mb-2" }, "Practice Order"),
                React.createElement("div", { className: "flex flex-col gap-3" }, [
                    { value: 'new', label: 'New cards first', desc: 'Most recently imported cards come up first' },
                    { value: 'old', label: 'Old cards first', desc: 'Longest-standing cards come up first' },
                    { value: 'difficult', label: 'Difficult cards first', desc: 'Lower ease score (from spaced repetition) comes first' },
                    { value: 'random', label: 'Random order', desc: 'Freshly shuffled every session' },
                ].map((opt) => (React.createElement("label", { key: opt.value, className: "flex items-start gap-2" },
                    React.createElement("input", { type: "radio", className: "mt-1", checked: practiceOrder === opt.value, onChange: () => choosePracticeOrder(opt.value) }),
                    React.createElement("span", null,
                        React.createElement("span", { style: { ...fontStyle, color: COLORS.ink }, className: "text-sm font-medium block" }, opt.label),
                        React.createElement("span", { style: { ...monoStyle, color: COLORS.inkFaint }, className: "text-xs" }, opt.desc)))))),
                React.createElement("p", { style: { ...monoStyle, color: COLORS.inkFaint }, className: "text-xs mt-3" }, "Applies to MCQ cycling, Flip Through, and View as Sheet alike.")),
            React.createElement("button", { onClick: () => { setDriveNotice(null); setView('backup'); }, className: "w-full text-left rounded-xl border-2 p-4 flex items-center justify-between gap-2", style: { borderColor: COLORS.ink, backgroundColor: COLORS.card } },
                React.createElement("div", { className: "flex items-center gap-3" },
                    React.createElement(Cloud, { size: 20, style: { color: COLORS.ink } }),
                    React.createElement("div", null,
                        React.createElement("div", { style: { ...fontStyle, color: COLORS.ink }, className: "text-sm font-bold" }, "Backup & Restore"),
                        React.createElement("div", { style: { ...monoStyle, color: COLORS.inkFaint }, className: "text-xs" }, "Local file \u00B7 Google Drive \u00B7 Auto-backup")))),
            React.createElement("button", { onClick: () => {
                    setEditZoneLevel('categories');
                    setEditZoneCategory(null);
                    setEditZoneDeckId(null);
                    setEditZoneQuery('');
                    setEditZoneNotice('');
                    setView('editZone');
                }, className: "w-full text-left rounded-xl border-2 p-4 flex items-center justify-between gap-2", style: { borderColor: COLORS.ink, backgroundColor: COLORS.card } },
                React.createElement("div", { className: "flex items-center gap-3" },
                    React.createElement(Pencil, { size: 20, style: { color: COLORS.ink } }),
                    React.createElement("div", null,
                        React.createElement("div", { style: { ...fontStyle, color: COLORS.ink }, className: "text-sm font-bold" }, "Edit Zone"),
                        React.createElement("div", { style: { ...monoStyle, color: COLORS.inkFaint }, className: "text-xs" }, "Rename or delete categories, decks, and cards")))),
            React.createElement("div", { className: "rounded-xl border-2 p-4 flex items-center justify-between", style: { borderColor: COLORS.rule, backgroundColor: COLORS.card } },
                React.createElement("span", { style: { ...fontStyle, color: COLORS.ink }, className: "text-sm font-bold" }, "Dark Mode"),
                React.createElement("button", { onClick: () => persistDarkMode(!darkMode), style: { backgroundColor: darkMode ? COLORS.ink : COLORS.rule }, className: "w-12 h-7 rounded-full relative transition-colors" },
                    React.createElement("span", { className: "absolute top-0.5 w-6 h-6 rounded-full bg-white transition-all", style: { left: darkMode ? '22px' : '2px' } }))),
            React.createElement("div", { className: "rounded-xl border-2 p-4", style: { borderColor: COLORS.red, backgroundColor: COLORS.card } },
                React.createElement("div", { style: { ...fontStyle, color: COLORS.ink }, className: "text-sm font-bold mb-2" }, "Danger Zone"),
                !confirmReset ? (React.createElement("button", { onClick: () => setConfirmReset(true), disabled: decks.length === 0, style: { color: COLORS.red, ...fontStyle }, className: "flex items-center gap-2 text-sm font-bold disabled:opacity-40" },
                    React.createElement(Trash2, { size: 16 }),
                    " Reset All Data (",
                    decks.length,
                    " deck",
                    decks.length !== 1 ? 's' : '',
                    ")")) : (React.createElement("div", { className: "flex flex-col gap-2" },
                    React.createElement("p", { style: { ...fontStyle, color: COLORS.inkFaint }, className: "text-sm" }, "This deletes every deck and card permanently."),
                    React.createElement("div", { className: "flex gap-2" },
                        React.createElement("button", { onClick: resetEverything, style: { backgroundColor: COLORS.red, ...fontStyle }, className: "flex-1 rounded-lg text-white text-sm font-bold py-2" }, "Yes, Delete Everything"),
                        React.createElement("button", { onClick: () => setConfirmReset(false), style: { borderColor: COLORS.ink, color: COLORS.ink, ...fontStyle }, className: "flex-1 rounded-lg border-2 text-sm font-bold py-2" }, "Cancel")))))));
    }
    else if (view === 'backup') {
        const noticeColor = driveNotice?.tone === 'error' ? COLORS.red : driveNotice?.tone === 'success' ? COLORS.green : COLORS.mustard;
        const noticeBg = driveNotice?.tone === 'error' ? COLORS.redBg : driveNotice?.tone === 'success' ? COLORS.greenBg : COLORS.mustardBg;
        content = (React.createElement("div", { className: "flex flex-col gap-4" },
            React.createElement(BackHeader, { onBack: () => { setView('settings'); setPendingRestore(null); setSignInSyncPrompt(null); }, title: "Backup & Restore" , COLORS }),
            React.createElement("input", { ref: restoreFileInputRef, type: "file", accept: ".json,application/json", onChange: handleRestoreFileSelected, className: "hidden" }),
            driveNotice && (React.createElement("div", { className: "rounded-lg border-2 px-3 py-2 flex items-start gap-2", style: { borderColor: noticeColor, backgroundColor: noticeBg } },
                driveNotice.tone === 'error' ? (React.createElement(AlertTriangle, { size: 16, style: { color: noticeColor }, className: "shrink-0 mt-0.5" })) : (React.createElement(Check, { size: 16, style: { color: noticeColor }, className: "shrink-0 mt-0.5" })),
                React.createElement("span", { style: { ...fontStyle, color: noticeColor }, className: "text-xs leading-relaxed" }, driveNotice.text))),
            pendingRestore && (React.createElement("div", { className: "rounded-xl border-2 p-4", style: { borderColor: COLORS.mustard, backgroundColor: COLORS.mustardBg } },
                React.createElement("div", { style: { ...fontStyle, color: '#6B4E17' }, className: "text-sm font-bold mb-1" },
                    "Restore from ",
                    pendingRestore.source === 'drive' ? 'Google Drive' : 'file',
                    "?"),
                React.createElement("p", { style: { ...monoStyle, color: '#6B4E17' }, className: "text-xs mb-3 leading-relaxed" },
                    "This replaces every deck and card currently on this device with the backup",
                    pendingRestore.payload.exportedAt ? ` from ${formatTimestamp(pendingRestore.payload.exportedAt)}` : '',
                    ". It can't be undone."),
                React.createElement("div", { className: "flex gap-2" },
                    React.createElement("button", { onClick: applyPendingRestore, style: { backgroundColor: COLORS.mustard, ...fontStyle }, className: "flex-1 rounded-lg text-white text-sm font-bold py-2" }, "Restore"),
                    React.createElement("button", { onClick: () => setPendingRestore(null), style: { borderColor: '#6B4E17', color: '#6B4E17', ...fontStyle }, className: "flex-1 rounded-lg border-2 text-sm font-bold py-2" }, "Cancel")))),
            signInSyncPrompt && (React.createElement("div", { className: "rounded-xl border-2 p-4", style: { borderColor: COLORS.mustard, backgroundColor: COLORS.mustardBg } },
                React.createElement("div", { style: { ...fontStyle, color: '#6B4E17' }, className: "text-sm font-bold mb-1" }, "You already have decks on this device"),
                React.createElement("p", { style: { ...monoStyle, color: '#6B4E17' }, className: "text-xs mb-3 leading-relaxed" },
                    "Your Drive also has a backup",
                    signInSyncPrompt.drivePayload.exportedAt ? ` from ${formatTimestamp(signInSyncPrompt.drivePayload.exportedAt)}` : '',
                    ". Rewrite replaces everything on this device with Drive's version. Keep & Merge combines both \u2014 matching decks (same category and name) merge their cards, everything else is kept side by side."),
                React.createElement("div", { className: "flex gap-2" },
                    React.createElement("button", { onClick: applySignInMerge, style: { backgroundColor: COLORS.accent, ...fontStyle }, className: "flex-1 rounded-lg text-white text-sm font-bold py-2" }, "Keep & Merge"),
                    React.createElement("button", { onClick: applySignInRewrite, style: { borderColor: COLORS.red, color: COLORS.red, ...fontStyle }, className: "flex-1 rounded-lg border-2 text-sm font-bold py-2" }, "Rewrite")))),
            React.createElement("div", { className: "rounded-xl border-2 p-4", style: { borderColor: COLORS.rule, backgroundColor: COLORS.card } },
                React.createElement("label", { style: { ...fontStyle, color: COLORS.ink }, className: "text-sm font-bold block mb-1" }, "Local Backup"),
                React.createElement("p", { style: { ...monoStyle, color: COLORS.inkFaint }, className: "text-xs mb-3" }, "Saves a .json file with every deck, card, and spaced-repetition progress value. Works fully offline, right here."),
                React.createElement("div", { className: "flex gap-2" },
                    React.createElement("button", { onClick: downloadLocalBackup, style: { backgroundColor: COLORS.accent, ...fontStyle }, className: "flex-1 rounded-lg text-white text-sm font-bold py-2.5 flex items-center justify-center gap-2" },
                        React.createElement(Download, { size: 16 }),
                        " Download"),
                    React.createElement("button", { onClick: triggerRestoreFilePicker, style: { borderColor: COLORS.ink, color: COLORS.ink, ...fontStyle }, className: "flex-1 rounded-lg border-2 text-sm font-bold py-2.5 flex items-center justify-center gap-2" },
                        React.createElement(HardDriveDownload, { size: 16 }),
                        " Restore File")),
                React.createElement("p", { style: { ...monoStyle, color: COLORS.inkFaint }, className: "text-xs mt-2" },
                    "Last downloaded: ",
                    formatTimestamp(lastLocalBackupAt))),
            React.createElement("div", { className: "rounded-xl border-2 p-4", style: { borderColor: COLORS.rule, backgroundColor: COLORS.card } },
                React.createElement("label", { style: { ...fontStyle, color: COLORS.ink }, className: "text-sm font-bold block mb-1" }, "Google Drive Backup"),
                React.createElement("p", { style: { ...monoStyle, color: COLORS.inkFaint }, className: "text-xs mb-3" }, "Signs in with your Google account and stores one hidden backup file in your Drive's app folder \u2014 not visible in your regular Drive files."),
                !googleSignedIn ? (React.createElement("p", { style: { ...monoStyle, color: COLORS.inkFaint }, className: "text-xs" }, "Not signed in \u2014 use the \"Continue with Google\" button on the home screen to connect.")) : (React.createElement("div", { className: "flex flex-col gap-2" },
                    React.createElement("div", { className: "flex items-center justify-between" },
                        React.createElement("span", { style: { ...monoStyle, color: COLORS.green }, className: "text-xs flex items-center gap-1" },
                            React.createElement(Check, { size: 14 }),
                            " ",
                            googleEmail || 'Signed in'),
                        React.createElement("button", { onClick: handleGoogleSignOut, style: { color: COLORS.inkFaint, ...fontStyle }, className: "text-xs flex items-center gap-1" },
                            React.createElement(LogOut, { size: 13 }),
                            " Sign out")),
                    React.createElement("div", { className: "flex gap-2" },
                        React.createElement("button", { onClick: () => driveBackupNow(false), disabled: driveBusy, style: { backgroundColor: COLORS.accent, ...fontStyle }, className: "flex-1 rounded-lg text-white text-sm font-bold py-2.5 flex items-center justify-center gap-2 disabled:opacity-50" },
                            React.createElement(RefreshCw, { size: 16 }),
                            " ",
                            driveBusy ? 'Working…' : 'Back Up Now'),
                        React.createElement("button", { onClick: driveRestoreNow, disabled: driveBusy, style: { borderColor: COLORS.ink, color: COLORS.ink, ...fontStyle }, className: "flex-1 rounded-lg border-2 text-sm font-bold py-2.5 flex items-center justify-center gap-2 disabled:opacity-50" },
                            React.createElement(HardDriveDownload, { size: 16 }),
                            " Restore")),
                    React.createElement("p", { style: { ...monoStyle, color: COLORS.inkFaint }, className: "text-xs" },
                        "Last Drive backup: ",
                        formatTimestamp(lastDriveBackupAt)))),
                React.createElement("p", { style: { ...monoStyle, color: COLORS.inkFaint }, className: "text-xs mt-4" }, "Backs up automatically whenever something changes \u2014 new decks, imports, edits, deletions, and practice checkpoints \u2014 no schedule to configure."),
                !driveConfigured() && (React.createElement("div", { className: "mt-4 rounded-lg border border-dashed px-3 py-2", style: { borderColor: COLORS.mustard, backgroundColor: COLORS.mustardBg } },
                    React.createElement("p", { style: { ...monoStyle, color: '#6B4E17' }, className: "text-xs leading-relaxed" }, "Setup needed: this button won't authenticate until you (1) create an OAuth Client ID in Google Cloud Console, (2) paste it into GOOGLE_CLIENT_ID at the top of this file, and (3) host the app on a real domain registered as an authorized origin. It will not work inside this preview."))))));
    }
    else if (view === 'editZone' && editZoneLevel === 'categories') {
        const grouped = {};
        decks.forEach((d) => {
            const key = d.category && d.category.trim() ? d.category.trim() : 'Uncategorized';
            if (!grouped[key])
                grouped[key] = [];
            grouped[key].push(d);
        });
        const q = editZoneQuery.trim().toLowerCase();
        const categoryKeys = Object.keys(grouped)
            .filter((k) => !q || k.toLowerCase().includes(q))
            .sort((a, b) => {
            if (a === 'Uncategorized')
                return 1;
            if (b === 'Uncategorized')
                return -1;
            return a.localeCompare(b);
        });
        content = (React.createElement("div", { className: "flex flex-col gap-3" },
            React.createElement(BackHeader, { onBack: () => setView('settings'), title: "Edit Zone" , COLORS }),
            editZoneNotice && (React.createElement("div", { className: "rounded-lg border-2 px-3 py-2", style: { borderColor: COLORS.mustard, backgroundColor: COLORS.mustardBg } },
                React.createElement("span", { style: { ...monoStyle, color: '#6B4E17' }, className: "text-xs" }, editZoneNotice))),
            React.createElement("div", { className: "relative" },
                React.createElement(Search, { size: 14, style: { color: COLORS.inkFaint }, className: "absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" }),
                React.createElement("input", { type: "text", value: editZoneQuery, onChange: (e) => setEditZoneQuery(e.target.value), placeholder: "Search categories\u2026", style: { ...monoStyle, borderColor: COLORS.rule, backgroundColor: COLORS.card, color: COLORS.ink }, className: "w-full rounded-lg border-2 pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-2" })),
            React.createElement("div", { className: "flex flex-col gap-2" },
                categoryKeys.map((key) => {
                    const isUncategorized = key === 'Uncategorized';
                    return (React.createElement("div", { key: key, className: "rounded-lg border p-3", style: { borderColor: COLORS.rule, backgroundColor: COLORS.card } }, renamingCategory === key ? (React.createElement("div", { className: "flex flex-col gap-2" },
                        React.createElement("input", { type: "text", value: renameCategoryDraft, onChange: (e) => setRenameCategoryDraft(e.target.value), style: { ...fontStyle, borderColor: COLORS.rule, backgroundColor: COLORS.card, color: COLORS.ink }, className: "w-full rounded-lg border-2 px-3 py-2 text-sm focus:outline-none focus:ring-2" }),
                        React.createElement("div", { className: "flex gap-2" },
                            React.createElement("button", { onClick: () => { renameCategory(key, renameCategoryDraft); setRenamingCategory(null); }, style: { backgroundColor: COLORS.accent, ...fontStyle }, className: "flex-1 rounded-lg text-white text-xs font-bold py-2" }, "Save"),
                            React.createElement("button", { onClick: () => setRenamingCategory(null), style: { borderColor: COLORS.ink, color: COLORS.ink, ...fontStyle }, className: "flex-1 rounded-lg border-2 text-xs font-bold py-2" }, "Cancel")))) : confirmDeleteCategory === key ? (React.createElement("div", { className: "flex flex-col gap-2" },
                        React.createElement("p", { style: { ...fontStyle, color: COLORS.ink }, className: "text-xs" },
                            "Delete \"",
                            key,
                            "\" and all ",
                            grouped[key].length,
                            " deck",
                            grouped[key].length !== 1 ? 's' : '',
                            " in it? This can't be undone."),
                        React.createElement("div", { className: "flex gap-2" },
                            React.createElement("button", { onClick: () => { deleteCategory(key); setConfirmDeleteCategory(null); }, style: { backgroundColor: COLORS.red, ...fontStyle }, className: "flex-1 rounded-lg text-white text-xs font-bold py-2" }, "Yes, Delete"),
                            React.createElement("button", { onClick: () => setConfirmDeleteCategory(null), style: { borderColor: COLORS.ink, color: COLORS.ink, ...fontStyle }, className: "flex-1 rounded-lg border-2 text-xs font-bold py-2" }, "Cancel")))) : (React.createElement("div", { className: "flex items-center justify-between gap-2" },
                        React.createElement("button", { onClick: () => { setEditZoneCategory(key); setEditZoneQuery(''); setEditZoneLevel('decks'); }, className: "flex-1 text-left" },
                            React.createElement("span", { style: { ...fontStyle, color: COLORS.ink }, className: "text-sm font-bold" }, key),
                            React.createElement("span", { style: { ...monoStyle, color: COLORS.inkFaint }, className: "text-xs block" },
                                grouped[key].length,
                                " deck",
                                grouped[key].length !== 1 ? 's' : '')),
                        !isUncategorized && (React.createElement(React.Fragment, null,
                            React.createElement("button", { onClick: () => { setRenamingCategory(key); setRenameCategoryDraft(key); }, style: { color: COLORS.ink }, className: "p-1 shrink-0" },
                                React.createElement(Pencil, { size: 16 })),
                            React.createElement("button", { onClick: () => setConfirmDeleteCategory(key), style: { color: COLORS.red }, className: "p-1 shrink-0" },
                                React.createElement(Trash2, { size: 16 }))))))));
                }),
                categoryKeys.length === 0 && (React.createElement("p", { style: { ...monoStyle, color: COLORS.inkFaint }, className: "text-xs text-center py-4" }, "No categories match.")))));
    }
    else if (view === 'editZone' && editZoneLevel === 'decks') {
        const isUncategorized = editZoneCategory === 'Uncategorized';
        const catDecks = decks.filter((d) => isUncategorized ? !d.category || !d.category.trim() : d.category === editZoneCategory);
        const q = editZoneQuery.trim().toLowerCase();
        const filteredDecks = catDecks.filter((d) => !q || d.name.toLowerCase().includes(q));
        content = (React.createElement("div", { className: "flex flex-col gap-3" },
            React.createElement(BackHeader, { onBack: () => { setEditZoneLevel('categories'); setEditZoneQuery(''); }, title: editZoneCategory , COLORS }),
            editZoneNotice && (React.createElement("div", { className: "rounded-lg border-2 px-3 py-2", style: { borderColor: COLORS.mustard, backgroundColor: COLORS.mustardBg } },
                React.createElement("span", { style: { ...monoStyle, color: '#6B4E17' }, className: "text-xs" }, editZoneNotice))),
            React.createElement("div", { className: "relative" },
                React.createElement(Search, { size: 14, style: { color: COLORS.inkFaint }, className: "absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" }),
                React.createElement("input", { type: "text", value: editZoneQuery, onChange: (e) => setEditZoneQuery(e.target.value), placeholder: "Search decks\u2026", style: { ...monoStyle, borderColor: COLORS.rule, backgroundColor: COLORS.card, color: COLORS.ink }, className: "w-full rounded-lg border-2 pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-2" })),
            React.createElement("div", { className: "flex flex-col gap-2" },
                filteredDecks.map((d) => {
                    const count = cards.filter((c) => c.deckId === d.id).length;
                    return (React.createElement("div", { key: d.id, className: "rounded-lg border p-3", style: { borderColor: COLORS.rule, backgroundColor: COLORS.card } }, renamingDeckId === d.id ? (React.createElement("div", { className: "flex flex-col gap-2" },
                        React.createElement("input", { type: "text", value: renameDeckDraft, onChange: (e) => setRenameDeckDraft(e.target.value), style: { ...fontStyle, borderColor: COLORS.rule, backgroundColor: COLORS.card, color: COLORS.ink }, className: "w-full rounded-lg border-2 px-3 py-2 text-sm focus:outline-none focus:ring-2" }),
                        React.createElement("div", { className: "flex gap-2" },
                            React.createElement("button", { onClick: () => { renameDeck(d.id, renameDeckDraft); setRenamingDeckId(null); }, style: { backgroundColor: COLORS.accent, ...fontStyle }, className: "flex-1 rounded-lg text-white text-xs font-bold py-2" }, "Save"),
                            React.createElement("button", { onClick: () => setRenamingDeckId(null), style: { borderColor: COLORS.ink, color: COLORS.ink, ...fontStyle }, className: "flex-1 rounded-lg border-2 text-xs font-bold py-2" }, "Cancel")))) : confirmDeleteDeckId === d.id ? (React.createElement("div", { className: "flex flex-col gap-2" },
                        React.createElement("p", { style: { ...fontStyle, color: COLORS.ink }, className: "text-xs" },
                            "Delete \"",
                            d.name,
                            "\" and its ",
                            count,
                            " card",
                            count !== 1 ? 's' : '',
                            "? This can't be undone."),
                        React.createElement("div", { className: "flex gap-2" },
                            React.createElement("button", { onClick: () => { deleteDeck(d.id); setConfirmDeleteDeckId(null); }, style: { backgroundColor: COLORS.red, ...fontStyle }, className: "flex-1 rounded-lg text-white text-xs font-bold py-2" }, "Yes, Delete"),
                            React.createElement("button", { onClick: () => setConfirmDeleteDeckId(null), style: { borderColor: COLORS.ink, color: COLORS.ink, ...fontStyle }, className: "flex-1 rounded-lg border-2 text-xs font-bold py-2" }, "Cancel")))) : (React.createElement("div", { className: "flex items-center justify-between gap-2" },
                        React.createElement("button", { onClick: () => { setEditZoneDeckId(d.id); setEditZoneQuery(''); setEditZoneLevel('cards'); }, className: "flex-1 text-left" },
                            React.createElement("span", { style: { ...fontStyle, color: COLORS.ink }, className: "text-sm font-bold" }, d.name),
                            React.createElement("span", { style: { ...monoStyle, color: COLORS.inkFaint }, className: "text-xs block" },
                                count,
                                " card",
                                count !== 1 ? 's' : '')),
                        React.createElement("button", { onClick: () => { setRenamingDeckId(d.id); setRenameDeckDraft(d.name); }, style: { color: COLORS.ink }, className: "p-1 shrink-0" },
                            React.createElement(Pencil, { size: 16 })),
                        React.createElement("button", { onClick: () => setConfirmDeleteDeckId(d.id), style: { color: COLORS.red }, className: "p-1 shrink-0" },
                            React.createElement(Trash2, { size: 16 }))))));
                }),
                filteredDecks.length === 0 && (React.createElement("p", { style: { ...monoStyle, color: COLORS.inkFaint }, className: "text-xs text-center py-4" }, "No decks match.")))));
    }
    else if (view === 'editZone' && editZoneLevel === 'cards') {
        const zoneDeck = decks.find((d) => d.id === editZoneDeckId);
        const deckCardsHere = cards.filter((c) => c.deckId === editZoneDeckId);
        const q = editZoneQuery.trim().toLowerCase();
        const filteredCards = deckCardsHere.filter((c) => !q || c.question.toLowerCase().includes(q));
        content = (React.createElement("div", { className: "flex flex-col gap-3" },
            React.createElement(BackHeader, { onBack: () => { setEditZoneLevel('decks'); setEditZoneQuery(''); setEditingCardId(null); setConfirmDeleteCardId(null); }, title: zoneDeck ? zoneDeck.name : 'Cards' , COLORS }),
            editZoneNotice && (React.createElement("div", { className: "rounded-lg border-2 px-3 py-2", style: { borderColor: COLORS.mustard, backgroundColor: COLORS.mustardBg } },
                React.createElement("span", { style: { ...monoStyle, color: '#6B4E17' }, className: "text-xs" }, editZoneNotice))),
            React.createElement("div", { className: "relative" },
                React.createElement(Search, { size: 14, style: { color: COLORS.inkFaint }, className: "absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" }),
                React.createElement("input", { type: "text", value: editZoneQuery, onChange: (e) => setEditZoneQuery(e.target.value), placeholder: "Search cards\u2026", style: { ...monoStyle, borderColor: COLORS.rule, backgroundColor: COLORS.card, color: COLORS.ink }, className: "w-full rounded-lg border-2 pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-2" })),
            React.createElement("div", { className: "flex flex-col gap-2 max-h-[28rem] overflow-y-auto" },
                filteredCards.map((c) => (React.createElement("div", { key: c.id, className: "rounded-lg border p-2", style: { borderColor: COLORS.rule, backgroundColor: COLORS.card } }, editingCardId === c.id ? (React.createElement("div", { className: "flex flex-col gap-2" },
                    React.createElement("textarea", { value: editingCardDraft, onChange: (e) => setEditingCardDraft(e.target.value), rows: 6, style: { ...monoStyle, borderColor: COLORS.rule, backgroundColor: COLORS.card, color: COLORS.ink }, className: "w-full rounded-lg border-2 p-2 text-xs focus:outline-none focus:ring-2" }),
                    editingCardError && (React.createElement("p", { style: { ...monoStyle, color: COLORS.red }, className: "text-xs" }, editingCardError)),
                    React.createElement("div", { className: "flex gap-2" },
                        React.createElement("button", { onClick: saveEditCard, style: { backgroundColor: COLORS.accent, ...fontStyle }, className: "flex-1 rounded-lg text-white text-xs font-bold py-2" }, "Save"),
                        React.createElement("button", { onClick: cancelEditCard, style: { borderColor: COLORS.ink, color: COLORS.ink, ...fontStyle }, className: "flex-1 rounded-lg border-2 text-xs font-bold py-2" }, "Cancel")))) : confirmDeleteCardId === c.id ? (React.createElement("div", { className: "flex flex-col gap-2" },
                    React.createElement("p", { style: { ...fontStyle, color: COLORS.ink }, className: "text-xs" }, "Delete this card permanently?"),
                    React.createElement("div", { className: "flex gap-2" },
                        React.createElement("button", { onClick: () => deleteSingleCard(c.id), style: { backgroundColor: COLORS.red, ...fontStyle }, className: "flex-1 rounded-lg text-white text-xs font-bold py-2" }, "Yes, Delete"),
                        React.createElement("button", { onClick: () => setConfirmDeleteCardId(null), style: { borderColor: COLORS.ink, color: COLORS.ink, ...fontStyle }, className: "flex-1 rounded-lg border-2 text-xs font-bold py-2" }, "Cancel")))) : (React.createElement("div", { className: "flex items-center justify-between gap-2" },
                    React.createElement("span", { style: { ...fontStyle, color: COLORS.ink }, className: "text-xs flex-1 truncate" }, c.question),
                    React.createElement("button", { onClick: () => beginEditCard(c), style: { color: COLORS.ink }, className: "p-1 shrink-0" },
                        React.createElement(Pencil, { size: 14 })),
                    React.createElement("button", { onClick: () => setConfirmDeleteCardId(c.id), style: { color: COLORS.red }, className: "p-1 shrink-0" },
                        React.createElement(Trash2, { size: 14 }))))))),
                filteredCards.length === 0 && (React.createElement("p", { style: { ...monoStyle, color: COLORS.inkFaint }, className: "text-xs text-center py-4" }, "No cards match.")))));
    }
    else if (view === 'practice') {
        if (phase === 'question' && currentCard) {
            const progress = cycleOrder.length ? (cardPos / cycleOrder.length) * 100 : 0;
            content = (React.createElement("div", { className: "flex flex-col gap-4" },
                React.createElement("div", { className: "flex justify-between items-center" },
                    React.createElement("button", { onClick: exitPractice, style: { color: COLORS.inkFaint }, className: "p-1" },
                        React.createElement(ChevronLeft, { size: 20 })),
                    React.createElement("div", { className: "text-center" },
                        React.createElement("div", { style: { ...monoStyle, color: COLORS.inkFaint }, className: "text-xs tracking-widest" },
                            sessionLabel ? `${sessionLabel.toUpperCase()} · ` : '',
                            "CYCLE ",
                            String(cycleIndex + 1).padStart(2, '0'),
                            "/",
                            String(cycles.length).padStart(2, '0'),
                            " \u00B7 Q ",
                            cardPos + 1,
                            "/",
                            cycleOrder.length)),
                    currentCard.hint ? (React.createElement("button", { onClick: () => setShowHint((h) => !h), style: { color: COLORS.mustard }, className: "p-1" }, showHint ? React.createElement(EyeOff, { size: 20 }) : React.createElement(Eye, { size: 20 }))) : React.createElement("div", { style: { width: 28 } })),
                React.createElement("div", { className: "w-full h-1 rounded-full", style: { backgroundColor: COLORS.rule } },
                    React.createElement("div", { className: "h-1 rounded-full transition-all duration-300", style: { width: `${progress}%`, backgroundColor: COLORS.accent } })),
                React.createElement("div", { className: "rounded-2xl border-2 px-5 py-6", style: { borderColor: COLORS.ink, backgroundColor: COLORS.card } },
                    React.createElement("p", { style: { ...fontStyle, color: COLORS.ink }, className: "text-base leading-relaxed font-medium" }, currentCard.question),
                    showHint && currentCard.hint && (React.createElement("div", { className: "mt-3 rounded-lg border border-dashed px-3 py-2 text-xs", style: { ...fontStyle, borderColor: COLORS.mustard, backgroundColor: COLORS.mustardBg, color: '#6B4E17', transform: 'rotate(-0.5deg)' } }, currentCard.hint))),
                React.createElement("div", { className: "flex flex-col gap-3" }, currentOptions.map((opt, i) => {
                    const isWrong = flashWrongIdx === i;
                    const isRight = flashCorrectIdx === i;
                    return (React.createElement("button", { key: i, onClick: () => handleOptionClick(i), disabled: flashCorrectIdx !== null, className: `w-full text-left rounded-xl border-2 px-4 py-3 flex items-center gap-3 transition-colors duration-150 focus:outline-none focus:ring-2 ${isWrong ? 'animate-shake' : ''}`, style: {
                            borderColor: isWrong ? COLORS.red : isRight ? COLORS.green : COLORS.ink,
                            backgroundColor: isWrong ? COLORS.redBg : isRight ? COLORS.greenBg : COLORS.card,
                        } },
                        React.createElement("span", { style: { ...monoStyle, borderColor: isWrong ? COLORS.red : isRight ? COLORS.green : COLORS.ink }, className: "w-7 h-7 shrink-0 rounded-full border-2 flex items-center justify-center text-xs font-bold" }, String.fromCharCode(65 + i)),
                        React.createElement("span", { style: { ...fontStyle, color: COLORS.ink }, className: "text-sm" }, opt.text)));
                }))));
        }
        else if (phase === 'cycleComplete') {
            content = (React.createElement(StampScreen, { tone: "navy", title: `CYCLE ${String(cycleIndex + 1).padStart(2, '0')} CLEARED`, subtitle: missedSet.size > 0 ? `${missedSet.size} flagged for review so far` : 'clean run so far', buttonLabel: `Continue to Cycle ${cycleIndex + 2}`, onContinue: continueToNextCycle , COLORS }));
        }
        else if (phase === 'roundComplete') {
            content = (React.createElement(StampScreen, { tone: "mustard", title: `ROUND ${roundNumber} COMPLETE`, subtitle: `${missedSet.size} card${missedSet.size !== 1 ? 's' : ''} flagged for review`, buttonLabel: "Start Review Round", onContinue: startReviewRound , COLORS }));
        }
        else if (phase === 'allClear') {
            content = (React.createElement(StampScreen, { tone: "green", title: "ALL CLEAR", subtitle: "every card answered correctly on first try \u2014 next reviews rescheduled", buttonLabel: "Done", onContinue: exitPractice , COLORS }));
        }
    }
    return (React.createElement("div", { style: { backgroundColor: COLORS.paper, minHeight: '100vh' }, className: "w-full flex justify-center" },
        React.createElement("style", null, `
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
      `),
        React.createElement("div", { className: "w-full max-w-sm px-5 py-6" },
            React.createElement("div", { className: "flex items-center justify-between mb-5" },
                React.createElement("span", { onClick: goHome, style: { fontFamily: "'Roboto Slab', serif", color: COLORS.ink, cursor: 'pointer' }, className: "text-lg font-bold tracking-tight" }, "Flashcard Drill"),
                React.createElement("span", { style: { fontFamily: "'Space Mono', monospace", color: COLORS.inkFaint }, className: "text-xs" }, roundNumber > 1 && view === 'practice' ? `rd.${roundNumber}` : '')),
            content || (React.createElement("div", { className: "flex flex-col gap-3" },
                React.createElement("p", { style: { ...fontStyle, color: COLORS.inkFaint }, className: "text-sm" }, "That screen isn't available anymore."),
                React.createElement("button", { onClick: () => setView('home'), style: { backgroundColor: COLORS.accent, ...fontStyle }, className: "w-full rounded-xl py-3 text-white font-bold" }, "Back to Home"))))));
}
function BackHeader({ onBack, title, COLORS }) {
    return (React.createElement("div", { className: "flex items-center gap-2 mb-1" },
        React.createElement("button", { onClick: onBack, style: { color: COLORS.inkFaint }, className: "p-1" },
            React.createElement(ChevronLeft, { size: 20 })),
        React.createElement("span", { style: { fontFamily: "'Roboto Slab', serif", color: COLORS.ink }, className: "font-bold" }, title)));
}
function StampScreen({ tone, title, subtitle, buttonLabel, onContinue, COLORS }) {
    const toneColor = tone === 'green' ? COLORS.green : tone === 'mustard' ? COLORS.mustard : COLORS.navy;
    const toneBg = tone === 'green' ? COLORS.greenBg : tone === 'mustard' ? COLORS.mustardBg : COLORS.navyBg;
    return (React.createElement("div", { className: "flex flex-col items-center justify-center gap-6 py-16" },
        React.createElement("div", { className: "stamp-el rounded-lg px-6 py-5 text-center", style: { border: `4px double ${toneColor}`, backgroundColor: toneBg, transform: 'rotate(-4deg)' } },
            React.createElement("div", { style: { fontFamily: "'Roboto Slab', serif", color: toneColor }, className: "text-xl font-bold tracking-wide" }, title),
            React.createElement("div", { style: { fontFamily: "'Space Mono', monospace", color: toneColor }, className: "text-xs mt-1" }, subtitle)),
        React.createElement("button", { onClick: onContinue, style: { backgroundColor: COLORS.accent, fontFamily: "'Roboto Slab', serif" }, className: "w-full max-w-xs rounded-xl py-3 text-white font-bold tracking-wide focus:outline-none focus:ring-2 focus:ring-offset-2" }, buttonLabel)));
}
