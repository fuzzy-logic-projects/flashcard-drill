import React, { useState, useEffect, useRef } from 'react';
import katex from 'katex';
import { marked } from 'marked';
import { Eye, EyeOff, Upload, Settings as SettingsIcon, ChevronLeft, Trash2, Plus, Search, Layers, FileText, Cloud, Download, RefreshCw, LogOut, Check, AlertTriangle, HardDriveDownload, Pencil, Brain, BookOpen, Clipboard } from 'lucide-react';
// =====================================================================
// SECTION: COLOR PALETTE  (search: SECTION: COLOR PALETTE)
// Every color in the app comes from ONE of these two objects — COLORS_LIGHT
// for light mode, COLORS_DARK for dark mode. To change any color anywhere
// in the app (backgrounds, text, buttons, borders), edit the value here —
// you don't need to touch any of the screens below.
//   paper       = main page background
//   card        = card/box background (sits on top of paper)
//   ink         = main text color
//   inkFaint    = secondary/muted text color
//   rule        = border color
//   red/redBg   = error color / error background tint
//   green/greenBg = success color / success background tint
//   mustard/mustardBg = accent color (Review Due, warnings) / its background tint
//   mustardText = text color used on top of mustardBg
//   accent      = primary filled-button color (Practice All, Save, etc.)
//   neutralBg/disabledBg = neutral box background / disabled button background
//   flashGreenBg/flashRedBg = brief flash color when an MCQ answer is right/wrong
//   incorrect/incorrectBg = distinct purple-pink accent, used for the "Good"
//     difficulty tier tiles/pills (Session Summary & Practice by Difficulty) —
//     the name is a holdover from an earlier tier-color mapping
//   solution/solutionBg/solutionText = optional "#" solution/explanation field
//     (Practice MCQ post-answer reveal, Flip/Sheet/Edit Zone previews)
//   cardsAccent/cardsAccentBg = blue "Cards" identity color (Deck Choice tile,
//     Home screen per-deck card count+icon, Import type chooser)
//   notesAccent/notesAccentBg = violet "Notes" identity color (Deck Choice tile,
//     Home screen per-deck note count+icon, Import type chooser)
// =====================================================================
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
    flashGreenBg: '#DCEEE3',
    flashRedBg: '#F5DEDA',
    mustard: '#B9822A',
    mustardBg: '#F1E2C4',
    mustardText: '#6B4E17',
    neutralBg: '#E3E7EE',
    disabledBg: '#C9C2AC',
    accent: '#22314A',
    incorrect: '#7A3B69',
    incorrectBg: '#EDDCE7',
    solution: '#3D6B94',
    solutionBg: '#DCE6F0',
    solutionText: '#1F3A52',
    cardsAccent: '#2D6CA6',
    cardsAccentBg: '#DCE8F5',
    notesAccent: '#6E4FA3',
    notesAccentBg: '#E7E0F3',
};
// VS Code Dark+ theme, mapped from Microsoft's actual source
// (microsoft/vscode: extensions/theme-defaults/themes/dark_plus.json + dark_vs.json).
const COLORS_DARK = {
    paper: '#1E1E1E', // editor.background
    card: '#252526', // menu.background (VS Code's classic panel/sidebar gray)
    ink: '#D4D4D4', // editor.foreground
    inkFaint: '#9D9D9D', // between input.placeholderForeground (#A6A6A6) and sideBarTitle.foreground (#BBBBBB)
    rule: '#454545', // menu.separatorBackground / menu.border
    red: '#F14C4C', // VS Code's standard error/terminal red (close to the "invalid" scope's #F44747)
    redBg: '#4B1818',
    green: '#89D185', // VS Code's git-added/success green
    greenBg: '#1B3A2B',
    flashGreenBg: '#1E6B45',
    flashRedBg: '#7A2530',
    mustard: '#CCA700', // editorWarning.foreground — VS Code's standard warning amber
    mustardBg: '#3D3212',
    mustardText: '#E8C468',
    incorrect: '#C586C0', // VS Code's classic keyword/control purple-pink
    incorrectBg: '#3A2A38',
    neutralBg: '#2D2D2D',
    disabledBg: '#3E3E3E',
    accent: '#007ACC', // activityBarBadge.background — VS Code's signature blue
    solution: '#569CD6', // VS Code's keyword blue — distinct from mustard (hint) and accent
    solutionBg: '#1E2D3D',
    solutionText: '#8FC1E9',
    cardsAccent: '#4FC1FF', // VS Code's support.type light blue — distinct from solution's keyword blue
    cardsAccentBg: '#1B2B3A',
    notesAccent: '#B180D7', // violet, distinct from incorrect's purple-pink
    notesAccentBg: '#2B2140',
};
const DECKS_KEY = 'flashdrill:v2:decks';
const CARDS_KEY = 'flashdrill:v2:cards';
const NOTES_KEY = 'flashdrill:v2:notes';
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
@He chaired the Constitution Drafting Committee
#Ambedkar chaired the Drafting Committee of the Constituent Assembly and shaped the Constitution's structure on fundamental rights.`;
// ===== FUNCTIONS: CORE HELPERS (search: FUNCTIONS: CORE HELPERS) =====
// shuffle: randomizes the order of an array (used for MCQ options, card order).
function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}
// chunkArray: splits a list of cards into cycles of N (see "Cards per cycle" in Settings).
function chunkArray(arr, size) {
    const s = Math.max(1, size);
    const out = [];
    for (let i = 0; i < arr.length; i += s)
        out.push(arr.slice(i, i + s));
    return out;
}
// formatRaceTime: seconds -> "MM:SS" for the Flashcards Race countdown bar.
function formatRaceTime(totalSeconds) {
    const s = Math.max(0, Math.floor(totalSeconds));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}
// Orders a pool of card ids per the user's practice-order setting.
// 'random' (default) reshuffles; 'new'/'old' sort by createdAt; 'difficult' sorts by ease (lower = harder).
// orderPool: decides the order cards appear in (random / newest-first / oldest-first / hardest-first). Edit the practiceOrder cases below to change the sort logic.
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
            const levelA = byId[a] && byId[a].sr && typeof byId[a].sr.level === 'number' ? byId[a].sr.level : 1;
            const levelB = byId[b] && byId[b].sr && typeof byId[b].sr.level === 'number' ? byId[b].sr.level : 1;
            return levelA - levelB;
        });
    }
    return shuffle(arr);
}
// ===== FUNCTIONS: MATH BRACKET PROTECTION (search: FUNCTIONS: MATH BRACKET PROTECTION) =====
// Anything inside [...] is math (rendered via KaTeX — see MathText component).
// Before parsing $/@ lines, every [...] region — even ones spanning several
// lines — gets swapped for a single-line placeholder token, so a stray $ or @
// inside a math expression is never mistaken for a new question/option. The
// placeholders get swapped back once the surrounding text has been split into
// question/answer/option fields.
//
// findMathRegions is bracket-DEPTH-aware, not just "match up to the next ]" —
// this matters because some LaTeX commands take their own [...] argument
// (e.g. \sqrt[3]{x} for a cube root). A naive match would stop at that inner
// ] and cut the expression short. Shared by both the parser (below) and the
// MathText display component, so both agree on where a math region ends.
function findMathRegions(text) {
    const regions = [];
    let i = 0;
    while (i < text.length) {
        if (text[i] === '[') {
            let depth = 1;
            let j = i + 1;
            while (j < text.length && depth > 0) {
                if (text[j] === '[')
                    depth++;
                else if (text[j] === ']')
                    depth--;
                j++;
            }
            regions.push({ start: i, end: j });
            i = j;
        }
        else {
            i++;
        }
    }
    return regions;
}
function maskMathRegions(text) {
    const stored = [];
    const regions = findMathRegions(text);
    if (!regions.length)
        return { masked: text, stored };
    let masked = '';
    let last = 0;
    regions.forEach((r) => {
        masked += text.slice(last, r.start);
        const token = `\u0000MATH${stored.length}\u0000`;
        stored.push(text.slice(r.start, r.end));
        masked += token;
        last = r.end;
    });
    masked += text.slice(last);
    return { masked, stored };
}
function unmaskMathRegions(text, stored) {
    return text.replace(/\u0000MATH(\d+)\u0000/g, (_, idx) => stored[Number(idx)] || '');
}
// ===== FUNCTION: NOTE MARKDOWN + MATH RENDERING (search: FUNCTION: NOTE MARKDOWN RENDERING) =====
// renderNoteHtml: turns a note's raw Markdown body into displayable HTML.
// Math regions are masked out FIRST (same [...] convention and same
// findMathRegions scanner as flashcards use), so Markdown syntax like ** or _
// never accidentally interacts with LaTeX content. The Markdown is parsed by
// the real `marked` library, THEN each math placeholder is swapped for its
// KaTeX-rendered HTML. Used by the note-reading screen and Edit Zone's note
// list — see the NoteBody component below.
function renderNoteHtml(rawMarkdown) {
    const { masked, stored } = maskMathRegions(rawMarkdown || '');
    let html = '';
    try {
        html = marked.parse(masked);
    }
    catch (e) {
        html = masked;
    }
    stored.forEach((region, idx) => {
        const inner = region.slice(1, -1); // strip the outer [ and ]
        let katexHtml;
        try {
            katexHtml = katex.renderToString(inner, { throwOnError: false, displayMode: false, output: 'html' });
        }
        catch (e) {
            katexHtml = region;
        }
        html = html.replace(`\u0000MATH${idx}\u0000`, katexHtml);
    });
    return html;
}
// ===== FUNCTION: IMPORT TEXT PARSER (search: FUNCTION: IMPORT TEXT PARSER) =====
// parseCards: turns pasted "$question / @answer" text into card objects.
// The FIRST @line after a $line is always the correct answer; the rest are
// wrong options; an optional 5th @line is a hint. Independently, one or more
// consecutive lines starting with "#" (anywhere after the $line) are joined
// into an optional solution/explanation — a card can have neither, either,
// or both of hint and solution. To change the required number of @ lines
// (currently 4 or 5), edit the check below.
function parseCards(text) {
    const { masked, stored } = maskMathRegions(text);
    const lines = masked.split('\n');
    const cards = [];
    const errors = [];
    let current = null;
    function pushCurrent() {
        if (!current)
            return;
        const at = current.atLines;
        const solutionText = current.solutionLines.length ? current.solutionLines.join('\n') : null;
        if (at.length === 4 || at.length === 5) {
            cards.push({
                id: `c_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
                question: unmaskMathRegions(current.question, stored),
                correctAnswer: unmaskMathRegions(at[0], stored),
                distractors: [unmaskMathRegions(at[1], stored), unmaskMathRegions(at[2], stored), unmaskMathRegions(at[3], stored)],
                hint: at.length === 5 ? unmaskMathRegions(at[4], stored) : null,
                solution: solutionText ? unmaskMathRegions(solutionText, stored) : null,
                createdAt: Date.now() + cards.length,
            });
        }
        else if (current.question) {
            errors.push(`"${unmaskMathRegions(current.question, stored).slice(0, 44)}" has ${at.length} @ line(s), needs 4 or 5.`);
        }
    }
    lines.forEach((raw) => {
        const line = raw.trim();
        if (!line)
            return;
        if (line.startsWith('$')) {
            pushCurrent();
            current = { question: line.slice(1).trim(), atLines: [], solutionLines: [] };
        }
        else if (line.startsWith('@')) {
            if (current)
                current.atLines.push(line.slice(1).trim());
        }
        else if (line.startsWith('#')) {
            if (current)
                current.solutionLines.push(line.slice(1).trim());
        }
    });
    pushCurrent();
    return { cards, errors };
}
// Inverse of parseCards — turns a single card back into the editable $question/@answer
// text format, used by the Edit Zone's raw-text editor.
// cardToRawText: the reverse of parseCards — turns one card back into editable $/@/#
// text (used by Edit Zone's card editor). A multi-line solution is written back out
// as one "#" line per line of text.
function cardToRawText(c) {
    const lines = [`$${c.question}`, `@${c.correctAnswer}`, ...c.distractors.map((d) => `@${d}`)];
    if (c.hint)
        lines.push(`@${c.hint}`);
    if (c.solution)
        c.solution.split('\n').forEach((l) => lines.push(`#${l}`));
    return lines.join('\n');
}
// todayStr / addDaysStr: date helpers used by the spaced-repetition scheduler.
function todayStr() {
    return new Date().toISOString().slice(0, 10);
}
function addDaysStr(days) {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
}
// ===== FUNCTION: SPACED REPETITION — PER-CARD LEVELS (search: FUNCTION: SPACED REPETITION) =====
// Each card has its own "level" (1, 2, 3...), each level maps to a number of
// days until next due. To change the day intervals, edit LEVEL_DAYS below —
// add more numbers to extend it, or change the existing ones. Levels beyond
// the end of this list reuse the last (largest) number as a cap.
const LEVEL_DAYS = [1, 2, 4, 7, 15, 30, 60, 120, 180, 365];
function daysForLevel(level) {
    const idx = Math.max(1, level || 1) - 1;
    return idx < LEVEL_DAYS.length ? LEVEL_DAYS[idx] : LEVEL_DAYS[LEVEL_DAYS.length - 1];
}
// defaultSr: the starting schedule for a brand new card — level 1, due today.
function defaultSr() {
    return { level: 1, due: todayStr() };
}
// ===== FUNCTION: DIFFICULTY FORMULA (search: FUNCTION: DIFFICULTY FORMULA) =====
// countWords: simple whitespace word counter used by the reading-time formula below.
function countWords(text) {
    return (text || '').trim().split(/\s+/).filter(Boolean).length;
}
// Strong max time = 0.4s per word of (question + correct answer), and ALSO
// every distractor option's words IF the correct answer is longer than 3
// words, PLUS a flat 6 seconds. computeReadingTimeSeconds: word count x rate.
// Word count = question + correct answer, PLUS all the wrong options too
// if the correct answer is longer than 3 words. The 0.4s/word rate (up from
// an earlier, harsher 0.24s/word) reflects real reading + active-recall
// speed rather than pure fast-reading speed — flashcards need time to
// actually recall, not just skim. To change the rate, or the 3-word rule,
// edit the numbers below.
function computeReadingTimeSeconds(card) {
    const answerWords = countWords(card.correctAnswer);
    let totalWords = countWords(card.question) + answerWords;
    if (answerWords > 3) {
        totalWords += (card.distractors || []).reduce((sum, d) => sum + countWords(d), 0);
    }
    return 0.4 * totalWords;
}
// classifyDifficulty: turns an answer time into Strong / Good / Weak.
//   Strong = answered within (0.4s/word reading time) + 6s (+ deck's Strong offset)
//   Good   = answered within Strong's max time + 4s (+ deck's Good offset)
//   Weak   = anything slower than Good's max time
// deck is optional — pass the card's deck to apply its per-deck think-time
// offsets (Settings > Edit Zone > Decks > brain icon). Without a deck, offsets
// default to 0. To change the base +6s/+4s numbers themselves (not the
// per-deck offset), edit them below.
function classifyDifficulty(card, elapsedSeconds, deck) {
    const readingTime = computeReadingTimeSeconds(card);
    const strongOffset = (deck && deck.strongOffsetSec) || 0;
    const goodOffset = (deck && deck.goodOffsetSec) || 0;
    const strongMax = readingTime + 6 + strongOffset;
    const goodMax = strongMax + 4 + goodOffset;
    if (elapsedSeconds <= strongMax)
        return 'strong';
    if (elapsedSeconds <= goodMax)
        return 'good';
    return 'weak';
}
// scheduleNextLevel: moves a card's level based on this session's outcome —
// called only after a REAL practice session (Review Due only — Practice All
// MCQ and Practice by Difficulty are both read-only and never call this).
// outcome is one of:
//   'incorrect' -> back to level 1, no matter what level it was (a miss
//                  always fully resets, regardless of how fast the retry was)
//   'weak'      -> level down by 1 (floor at level 1)
//   'good'      -> level unchanged
//   'strong'    -> level up by 1
// To change what each outcome does to the level, edit the branches below.
// To change the day intervals themselves, edit LEVEL_DAYS above instead.
function scheduleNextLevel(sr, outcome) {
    let level = sr && typeof sr.level === 'number' ? sr.level : 1;
    if (outcome === 'incorrect')
        level = 1;
    else if (outcome === 'weak')
        level = Math.max(1, level - 1);
    else if (outcome === 'strong')
        level = level + 1;
    // 'good' leaves level unchanged
    return { level, due: addDaysStr(daysForLevel(level)) };
}
// ===== FUNCTION: NOTES SPACED REPETITION (search: FUNCTION: NOTES SPACED REPETITION) =====
// scheduleNoteLevel: same level -> day-interval mechanism as cards (reuses
// LEVEL_DAYS/daysForLevel above), but simpler — there's no "wrong answer" for
// reading a note, just a 3-way self-rating:
//   'hard'     -> level down by 1 (floor at level 1)
//   'moderate' -> level unchanged
//   'easy'     -> level up by 1
// No per-deck think-time offsets apply here — those are a card-only concept.
function scheduleNoteLevel(sr, rating) {
    let level = sr && typeof sr.level === 'number' ? sr.level : 1;
    if (rating === 'hard')
        level = Math.max(1, level - 1);
    else if (rating === 'easy')
        level = level + 1;
    return { level, due: addDaysStr(daysForLevel(level)) };
}
// ===== FUNCTIONS: BACKUP FILE FORMAT (search: FUNCTIONS: BACKUP FILE FORMAT) =====
// buildBackupPayload: the exact JSON shape written to both local backup
// files and the Google Drive backup file.
function buildBackupPayload(decks, cards, notes, settings) {
    return {
        app: 'flashdrill',
        version: BACKUP_VERSION,
        exportedAt: new Date().toISOString(),
        decks,
        cards,
        notes,
        settings,
    };
}
// Deck identity = category + name together (not name alone). Same category+name on
// both sides => same deck, cards merge (Drive wins on duplicate questions). Same name
// but different category => two separate decks, both preserved independently.
// deckKey / mergeBackups: used when signing in with existing local decks —
// decides which decks/cards count as "the same" (category + name) vs. which
// stay separate. See the Keep & Merge behavior in Backup & Restore.
function deckKey(d) {
    return `${(d.category || '').trim().toLowerCase()}|||${(d.name || '').trim().toLowerCase()}`;
}
function mergeBackups(localDecks, localCards, localNotes, driveDecks, driveCards, driveNotes) {
    const driveByKey = new Map(driveDecks.map((d) => [deckKey(d), d]));
    const resultDecks = [];
    const resultCards = [];
    const resultNotes = [];
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
            const driveDeckNotes = (driveNotes || []).filter((n) => n.deckId === dd.id);
            const driveTitleSet = new Set(driveDeckNotes.map((n) => (n.title || '').trim().toLowerCase()));
            driveDeckNotes.forEach((n) => resultNotes.push(n));
            (localNotes || [])
                .filter((n) => n.deckId === ld.id && !driveTitleSet.has((n.title || '').trim().toLowerCase()))
                .forEach((n) => resultNotes.push({ ...n, deckId: dd.id }));
        }
        else {
            // No match by category+name — local-only deck, kept as-is (even if the name
            // matches a Drive deck under a different category).
            resultDecks.push(ld);
            localCards.filter((c) => c.deckId === ld.id).forEach((c) => resultCards.push(c));
            (localNotes || []).filter((n) => n.deckId === ld.id).forEach((n) => resultNotes.push(n));
        }
    }
    for (const dd of driveDecks) {
        if (usedDriveDeckIds.has(dd.id))
            continue;
        resultDecks.push(dd);
        driveCards.filter((c) => c.deckId === dd.id).forEach((c) => resultCards.push(c));
        (driveNotes || []).filter((n) => n.deckId === dd.id).forEach((n) => resultNotes.push(n));
    }
    return { decks: resultDecks, cards: resultCards, notes: resultNotes };
}
// validateBackupShape: rejects a backup file/Drive payload that's missing decks/cards, so a corrupt file can't wipe your data.
// notes is optional in the shape check — older backups made before notes existed
// simply won't have any, and that's fine, not corruption.
function validateBackupShape(obj) {
    if (!obj || typeof obj !== 'object')
        return 'File is not valid JSON.';
    if (!Array.isArray(obj.decks) || !Array.isArray(obj.cards))
        return 'This file is missing decks or cards — it may not be a Flashcard Drill backup.';
    return null;
}
// formatTimestamp: turns a stored date into the "today, 3:45 PM" style text shown next to backup buttons.
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
// ===== FUNCTIONS: GOOGLE SIGN-IN / DRIVE (search: FUNCTIONS: GOOGLE SIGN-IN) =====
// loadGoogleIdentityScript: injects Google's sign-in library into the page.
// Not usable inside a Claude preview — only works once hosted on a real domain.
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
    const [view, setView] = useState('home'); // home | newDeck | importChoice | importCardsChoice | importNotesChoice | import | deck | settings | practice | practiceAllModes | raceSetup
    const [decks, setDecks] = useState([]);
    const [cards, setCards] = useState([]);
    const [notes, setNotes] = useState([]);
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
    const [importOrigin, setImportOrigin] = useState('deck'); // 'deck' (Import More / per-deck Paste) | 'home' (Home screen Import button, via type chooser) — controls where the Back button on import/noteImport lands
    const cardFileInputRef = useRef(null);
    // settings screen state
    const [cycleSizeDraft, setCycleSizeDraft] = useState('10');
    const [fontSizePx, setFontSizePx] = useState(18);
    const [darkMode, setDarkMode] = useState(false);
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
    const cardsRef = useRef(cards); // always-current mirror of `cards`, read inside effects that must NOT re-run just because card metadata (sr/difficulty) changed — see the options-regen effect below
    cardsRef.current = cards;
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
    const [thinkTimeDeckId, setThinkTimeDeckId] = useState(null);
    const [thinkTimeCategoryKey, setThinkTimeCategoryKey] = useState(null);
    // Notes feature state (Deck > Notes, for studying)
    const [noteSort, setNoteSort] = useState('modified'); // modified | new | old | due | undue
    const [selectedNoteId, setSelectedNoteId] = useState(null);
    const [noteImportTitle, setNoteImportTitle] = useState('');
    const [noteImportBody, setNoteImportBody] = useState('');
    const [noteImportContentType, setNoteImportContentType] = useState('markdown');
    const noteFileInputRef = useRef(null);
    // Notes feature state (Settings > Edit Zone > Notes, for editing/deleting)
    const [editZoneNoteQuery, setEditZoneNoteQuery] = useState('');
    const [editingNoteId, setEditingNoteId] = useState(null);
    const [editingNoteTitleDraft, setEditingNoteTitleDraft] = useState('');
    const [editingNoteBodyDraft, setEditingNoteBodyDraft] = useState('');
    const [confirmDeleteNoteId, setConfirmDeleteNoteId] = useState(null);
    const [thinkTimeStrongDraft, setThinkTimeStrongDraft] = useState('0');
    const [thinkTimeGoodDraft, setThinkTimeGoodDraft] = useState('0');
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
    const [showSolutionReveal, setShowSolutionReveal] = useState(false); // post-correct-answer solution step, only when the card has a #solution
    // flip-mode (traditional flashcard) state — independent of MCQ/SR entirely
    const [flipOrder, setFlipOrder] = useState([]);
    const [flipIndex, setFlipIndex] = useState(0);
    const [flipShowAnswer, setFlipShowAnswer] = useState(false);
    // whole-session (across rounds) tracking, used for spaced-repetition scheduling
    const [sessionPoolIds, setSessionPoolIds] = useState([]);
    const [sessionEverMissed, setSessionEverMissed] = useState(new Set());
    const [sessionLabel, setSessionLabel] = useState('');
    const [sessionAffectsProgress, setSessionAffectsProgress] = useState(true);
    // sessionResults: { [cardId]: { elapsedSeconds, outcome } } — one entry per card the
    // moment it's FIRST answered correctly this appearance, overwritten if it reappears
    // in a later review round. Built regardless of sessionAffectsProgress (every practice
    // mode gets an end-of-session summary), only sometimes persisted to card.difficulty —
    // see FUNCTION: ANSWERING AN MCQ. Reset per session in beginSession, read by the
    // 'allClear' phase's Session Summary screen.
    const [sessionResults, setSessionResults] = useState({});
    const [selectedDifficultyTier, setSelectedDifficultyTier] = useState(null); // 'strong' | 'good' | 'weak' | 'incorrect'
    const [sheetFilterIds, setSheetFilterIds] = useState(null); // null = whole deck; array = restrict to these ids
    const [returnView, setReturnView] = useState('home');
    const [sessionOrder, setSessionOrder] = useState('random'); // order used for the CURRENT session's rounds (Review Due uses the deck's saved order; Flashcards Race uses the ephemeral picker below)
    // ===== FLASHCARDS RACE STATE (search: FLASHCARDS RACE STATE) =====
    // Everything below is ephemeral — never persisted to window.storage or Drive.
    // raceOrderChoice: the practice-order dropdown on the Practice All / Practice by
    // Difficulty entry screens — resets to 'random' every time that section is opened.
    const [raceOrderChoice, setRaceOrderChoice] = useState('random');
    const [racePendingPoolIds, setRacePendingPoolIds] = useState([]); // pool queued up for the raceSetup (time entry) screen
    const [racePendingLabel, setRacePendingLabel] = useState('');
    const [racePendingReturnView, setRacePendingReturnView] = useState('deck'); // where raceSetup's back button + the eventual race session return to
    const [racePendingOrder, setRacePendingOrder] = useState('random');
    const [raceDurationDraft, setRaceDurationDraft] = useState('120');
    const [raceActive, setRaceActive] = useState(false); // true only while the CURRENT practice session is a Race
    const [raceSecondsLeft, setRaceSecondsLeft] = useState(0);
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
                const res = await window.storage.get(NOTES_KEY, false);
                if (res && res.value)
                    setNotes(JSON.parse(res.value));
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
    // ===== FUNCTIONS: SAVE TO STORAGE (search: FUNCTIONS: SAVE TO STORAGE) =====
    // persistDecks / persistCards / persistSettings / persistFontSize /
    // persistDarkMode / persistBackupMeta: every one of these does the same
    // two things — update on-screen state, then write to local storage so it
    // survives closing the tab. If you add a new setting, copy this pattern.
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
    async function persistNotes(next) {
        setNotes(next);
        try {
            await window.storage.set(NOTES_KEY, JSON.stringify(next), false);
        }
        catch (e) { }
    }
    async function persistSettings(nextCycleSize) {
        setCycleSize(nextCycleSize);
        try {
            await window.storage.set(SETTINGS_KEY, JSON.stringify({ cycleSize: nextCycleSize }), false);
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
    // ===== FUNCTIONS: LOCAL BACKUP FILE (search: FUNCTIONS: LOCAL BACKUP FILE) =====
    // downloadLocalBackup: saves a .json file to the device. Change the
    // filename format (currently flashdrill-backup-YYYY-MM-DD.json) below.
    function downloadLocalBackup() {
        const payload = buildBackupPayload(decks, cards, notes, { cycleSize });
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
    // handleRestoreFileSelected / applyPendingRestore: reads an uploaded backup file and, after your confirmation, replaces local decks/cards with it.
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
        persistNotes(Array.isArray(payload.notes) ? payload.notes : []);
        if (payload.settings) {
            persistSettings(payload.settings.cycleSize || cycleSize);
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
    // ===== FUNCTIONS: GOOGLE DRIVE CONNECTION (search: FUNCTIONS: GOOGLE DRIVE CONNECTION) =====
    // driveConfigured: true once a real GOOGLE_CLIENT_ID has been set at the
    // top of the file (see SECTION: GOOGLE CLIENT ID near the top constants).
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
    // requestDriveToken: asks Google for an access token. Pass {silent:true} for a no-popup background attempt, or nothing for the normal "Continue with Google" click.
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
    // handleGoogleSignIn: runs when the "Continue with Google" button (home
    // screen) is clicked. Shows an error instead of a popup if GOOGLE_CLIENT_ID
    // hasn't been set yet, or if this is running inside a Claude preview.
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
    // handleGoogleSignOut: signs out AND remembers you did it on purpose, so attemptSilentSignIn (below) won't silently sign you back in.
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
    // ===== FUNCTION: STAY SIGNED IN (search: FUNCTION: STAY SIGNED IN) =====
    // attemptSilentSignIn: runs once when the app opens. Tries to reuse your
    // last Google session with no popup. Fails silently (no error shown) if
    // there's nothing to reuse — that's expected, not a bug.
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
    // ===== FUNCTION: BACK UP TO DRIVE (search: FUNCTION: BACK UP TO DRIVE) =====
    // driveBackupNow: uploads the current decks/cards to Google Drive's hidden
    // app folder, overwriting the previous backup file (never creates a
    // duplicate). silent=true means no success/error message is shown —
    // used for automatic background backups.
    async function driveBackupNow(silent, overrideDecks, overrideCards, overrideNotes) {
        if (!silent)
            setDriveNotice(null);
        setDriveBusy(true);
        try {
            let token = driveAccessToken;
            if (!token)
                token = await requestDriveToken();
            const payload = buildBackupPayload(overrideDecks || decks, overrideCards || cards, overrideNotes || notes, { cycleSize });
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
    // ===== FUNCTION: AUTO-BACKUP TRIGGERS (search: FUNCTION: AUTO-BACKUP TRIGGERS) =====
    // triggerAutoBackup: called after any real data change (new deck, import,
    // rename, card edit, note import/edit/rating). Deliberately NOT called after
    // deletions — see deleteDeck/deleteCategory/deleteSingleCard/deleteNote below.
    function triggerAutoBackup(overrideDecks, overrideCards, overrideNotes) {
        if (googleSignedIn) {
            driveBackupNow(true, overrideDecks, overrideCards, overrideNotes);
        }
    }
    // Runs right after a successful sign-in. If there's no local data, restore Drive's
    // backup automatically. If local decks already exist, ask before touching anything.
    // ===== FUNCTION: RESTORE ON SIGN-IN (search: FUNCTION: RESTORE ON SIGN-IN) =====
    // syncAfterSignIn: runs right after a successful sign-in. Auto-restores
    // from Drive if there are no local decks yet; otherwise asks Keep & Merge
    // vs. Rewrite (see applySignInRewrite / applySignInMerge below).
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
                persistNotes(Array.isArray(parsed.notes) ? parsed.notes : []);
                if (parsed.settings)
                    persistSettings(parsed.settings.cycleSize || cycleSize);
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
        persistNotes(Array.isArray(drivePayload.notes) ? drivePayload.notes : []);
        if (drivePayload.settings)
            persistSettings(drivePayload.settings.cycleSize || cycleSize);
        setSignInSyncPrompt(null);
        setDriveNotice({ tone: 'success', text: 'Replaced local data with your Drive backup.' });
    }
    function applySignInMerge() {
        if (!signInSyncPrompt)
            return;
        const { drivePayload } = signInSyncPrompt;
        const driveDecks = Array.isArray(drivePayload.decks) ? drivePayload.decks : [];
        const driveCards = Array.isArray(drivePayload.cards) ? drivePayload.cards : [];
        const driveNotesIn = Array.isArray(drivePayload.notes) ? drivePayload.notes : [];
        const merged = mergeBackups(decks, cards, notes, driveDecks, driveCards, driveNotesIn);
        persistDecks(merged.decks);
        persistCards(merged.cards);
        persistNotes(merged.notes);
        setSignInSyncPrompt(null);
        setDriveNotice({ tone: 'success', text: 'Merged local decks with your Drive backup.' });
        driveBackupNow(true, merged.decks, merged.cards, merged.notes);
    }
    // driveRestoreNow: the manual "Restore" button in Backup & Restore — pulls the Drive backup down and asks for confirmation before replacing local data.
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
    // regenerate options whenever we land on a new question.
    // Deliberately reads cardsRef.current instead of depending on `cards` —
    // handleOptionClick now persists a miss to `cards` immediately (see
    // FUNCTION: ANSWERING AN MCQ), and that must NOT be treated as "landed on
    // a new question" (it would reshuffle options and reset firstAttempt/the
    // timer out from under an in-progress retry). Only an actual change to
    // which question is showing (cardPos/cycleOrder/phase/view) should do that.
    useEffect(() => {
        if (view !== 'practice' || phase !== 'question')
            return;
        if (!cycleOrder.length)
            return;
        const id = cycleOrder[cardPos];
        const card = cardsRef.current.find((c) => c.id === id);
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
        setShowSolutionReveal(false);
        setFlashWrongIdx(null);
        setFlashCorrectIdx(null);
        questionShownAtRef.current = Date.now();
    }, [view, phase, cycleIndex, cardPos, cycleOrder]);
    // Note: spaced-repetition scheduling is now applied immediately per-card, the
    // moment a card is answered correctly on its first attempt (see handleOptionClick).
    // That's the exact moment a card's fate for this session is sealed — a first-attempt
    // correct answer means it won't reappear in any later review round. Applying it here
    // in a batch at session-end would double-schedule every card, so this is intentionally
    // no longer a separate step.
    // ===== EFFECT: RACE COUNTDOWN TIMER (search: EFFECT: RACE COUNTDOWN TIMER) =====
    // Ticks raceSecondsLeft down once a second, real-time, for as long as a race is on
    // the practice screen — it does NOT pause for the flash/solution/anything else, by
    // design (that's the point of a race). Stops (effect cleanup) once the race ends
    // (phase becomes 'allClear'), the person leaves the practice screen, or raceActive
    // goes false. A second effect below watches for the countdown reaching zero and
    // ends the race at that instant — kept separate so the interval itself doesn't get
    // torn down and rebuilt every single second (which resetting it inside one effect
    // keyed on raceSecondsLeft would cause).
    useEffect(() => {
        if (!raceActive || view !== 'practice' || phase === 'allClear')
            return;
        const t = setInterval(() => {
            setRaceSecondsLeft((s) => Math.max(0, s - 1));
        }, 1000);
        return () => clearInterval(t);
    }, [raceActive, view, phase]);
    useEffect(() => {
        if (raceActive && view === 'practice' && phase !== 'allClear' && raceSecondsLeft === 0) {
            endRace();
        }
    }, [raceSecondsLeft, raceActive, view, phase]);
    // ===== FUNCTIONS: MCQ PRACTICE ENGINE (search: FUNCTIONS: MCQ PRACTICE ENGINE) =====
    // startRound: begins one pass through a batch of cards, split into cycles
    // (see "Cards per cycle" in Settings). order falls back to the current
    // session's order (sessionOrder) when not passed explicitly — used by
    // startReviewRound, which starts a later round of the SAME session.
    function startRound(poolIds, round, order) {
        const ordered = orderPool(poolIds, order || sessionOrder, cards);
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
    // beginSession: entry point for any NON-race practice session (Review Due,
    // Flashcards Race's own "Normal Practice" button). affectsProgress=false is what
    // makes Practice All / Practice by Difficulty's Normal Practice read-only (no SR
    // change, no difficulty change, no backup) — same as before. order is the
    // practice order to use for this session (deck's saved order for Review Due, the
    // ephemeral race-section dropdown for Normal Practice); defaults to 'random'.
    function beginSession(poolIds, returnTo, label, affectsProgress, order) {
        if (!poolIds.length)
            return;
        const useOrder = order || 'random';
        setRaceActive(false); // in case a previous session was a Race — this one isn't
        setSessionPoolIds(poolIds);
        setSessionEverMissed(new Set());
        setSessionResults({});
        setSessionLabel(label);
        setReturnView(returnTo);
        setSessionAffectsProgress(affectsProgress !== false);
        setSessionOrder(useOrder);
        practiceDirtyRef.current = false;
        startRound(poolIds, 1, useOrder);
    }
    function startFlip(poolIds, returnTo, order) {
        if (!poolIds.length)
            return;
        setFlipOrder(orderPool(poolIds, order || 'random', cards));
        setFlipIndex(0);
        setFlipShowAnswer(false);
        setReturnView(returnTo || 'deck');
        setView('flip');
    }
    // continueToNextCycle / startReviewRound: the "Continue" buttons between cycles/rounds. Also where a Drive backup checkpoint fires (see flushPracticeBackupIfNeeded below).
    // Neither is ever reached by a Flashcards Race session — see FUNCTIONS: FLASHCARDS
    // RACE ENGINE below for the one-pass equivalent (handleRaceAdvance).
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
        startRound(Array.from(missedSet), roundNumber + 1, sessionOrder);
    }
    // ===== FUNCTIONS: FLASHCARDS RACE ENGINE (search: FUNCTIONS: FLASHCARDS RACE ENGINE) =====
    // Everything in this block is ephemeral by design — a Race never reads or writes
    // window.storage/Drive (sessionAffectsProgress is always false, same mechanism that
    // already makes Practice All / Practice by Difficulty read-only — see
    // FUNCTION: ANSWERING AN MCQ). Nothing here touches decks/cards.
    // goToRaceSetup: stashes the pool/label/return-view/order chosen on the Practice
    // All or Practice by Difficulty screens, then opens the time-entry screen.
    function goToRaceSetup(poolIds, label, returnTo, order) {
        if (!poolIds.length)
            return;
        setRacePendingPoolIds(poolIds);
        setRacePendingLabel(label);
        setRacePendingReturnView(returnTo);
        setRacePendingOrder(order || 'random');
        setRaceDurationDraft('120');
        setView('raceSetup');
    }
    // confirmStartRace: the "Start Race" button on the time-entry screen.
    function confirmStartRace() {
        const secs = Math.max(5, parseInt(raceDurationDraft, 10) || 120);
        startRace(racePendingPoolIds, racePendingOrder, secs, racePendingLabel, racePendingReturnView);
    }
    // startRace: begins a Flashcards Race — every one of poolIds in ONE single pass, in
    // the exact order chosen (unlike startRound, no chunking by "Cards per cycle" and no
    // per-cycle reshuffle — a race runs straight through the ordered list once).
    // raceActive=true is what makes handleOptionClick skip retries/review rounds/
    // solution pauses and makes SessionSummaryScreen use the Winners/Losers renaming.
    function startRace(poolIds, order, durationSec, label, returnTo) {
        if (!poolIds.length)
            return;
        const ordered = orderPool(poolIds, order || 'random', cards);
        setSessionPoolIds(poolIds);
        setSessionEverMissed(new Set());
        setSessionResults({});
        setSessionLabel(label);
        setReturnView(returnTo || 'deck');
        setSessionAffectsProgress(false);
        setSessionOrder(order || 'random');
        setCycles([ordered]);
        setCycleIndex(0);
        setCycleOrder(ordered);
        setCardPos(0);
        setMissedSet(new Set());
        setRoundNumber(1);
        practiceDirtyRef.current = false;
        setRaceActive(true);
        setRaceSecondsLeft(durationSec);
        setPhase('question');
        setView('practice');
    }
    // endRace: fires when the countdown hits zero OR the "End Race" button is tapped.
    // Every pool card not yet in sessionResults at this instant (including whichever
    // card was on screen, unanswered) becomes "Never Fought" in the summary — see
    // SessionSummaryScreen's raceMode branch, which is what actually computes that.
    function endRace() {
        setPhase('allClear');
    }
    // handleRaceAdvance: Race's equivalent of handleAdvance — no cycle/round/review-round
    // branching (a race is always exactly one pass through one list), so this only ever
    // moves to the next card or, once the list is exhausted, straight to the summary.
    function handleRaceAdvance() {
        const nextPos = cardPos + 1;
        if (nextPos < cycleOrder.length) {
            setCardPos(nextPos);
        }
        else {
            setPhase('allClear');
        }
    }
    // Shared by the in-app exit button AND the browser/hardware back-button handler
    // below — whichever way practice is exited, a signed-in backup still fires if
    // anything was answered.
    // flushPracticeBackupIfNeeded: the shared "should we back up now?" check —
    // only backs up if signed in AND something was actually answered this
    // session. Used by cycle checkpoints, the exit button, and the hardware
    // back button, so all three behave the same way.
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
    // goHome: what the "Flashcard Drill" title does when clicked — flushes a backup first if you're mid-practice, then returns to the home screen.
    function goHome() {
        if (view === 'practice')
            flushPracticeBackupIfNeeded();
        setSelectedDeckId(null);
        setView('home');
    }
    // exitPractice: the in-app back arrow during practice.
    function exitPractice() {
        flushPracticeBackupIfNeeded();
        setView(returnView);
    }
    // handleAdvance: moves to the next question, or to the next cycle/round/allClear screen once a batch is finished.
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
    // continueAfterSolution: the "Continue"/"Next"/"Next Cycle"/"Review Flagged"/
    // "Finish Session" button shown in place of the options once a card with a
    // #solution has been answered correctly after being missed earlier this
    // session (see showSolutionReveal below).
    function continueAfterSolution() {
        setShowSolutionReveal(false);
        handleAdvance();
    }
    // nextButtonLabel: what continueAfterSolution's button should say, computed from
    // exactly the same four-way branch handleAdvance() uses, WITHOUT changing state —
    // "Next" (more cards left in this cycle), "Next Cycle" (this was the cycle's last
    // card but more cycles remain), "Review Flagged" (last card of the last cycle, but
    // cards are still flagged — a review round starts next; that round is part of THIS
    // session, not something after it, so it never gets called "Finish Session"), or
    // "Finish Session" (last card of the last cycle AND nothing is left flagged —
    // genuinely done).
    function nextButtonLabel() {
        if (cardPos + 1 < cycleOrder.length)
            return 'Next';
        if (cycleIndex + 1 < cycles.length)
            return 'Next Cycle';
        if (missedSet.size > 0)
            return 'Review Flagged';
        return 'Finish Session';
    }
    // ===== FUNCTION: ANSWERING AN MCQ (search: FUNCTION: ANSWERING AN MCQ) =====
    // handleOptionClick: runs on every tap of an A/B/C/D option.
    //   - Correct + first try  -> SR schedule updates immediately (graduates)
    //   - Correct (any try)    -> difficulty (Strong/Good/Weak/Incorrect) updates.
    //                             If the card was ever missed this session, it's
    //                             tagged 'incorrect' (not the timing tier) and
    //                             sent to level 1, no matter how fast the
    //                             eventual correct retry was.
    //   - Wrong first try      -> card gets requeued for a review round, AND is
    //                             immediately persisted locally at level 1 /
    //                             'incorrect' (not deferred until the eventual
    //                             correct retry). This is a LOCAL save only
    //                             (window.storage) — it does not upload to
    //                             Drive. Drive backup still only happens when
    //                             you exit practice (back button/title tap) or
    //                             press "Back Up Now", never mid-session — but
    //                             now that exit-time backup actually captures
    //                             the miss instead of silently dropping it.
    //   - None of the above happens if sessionAffectsProgress is false
    //     (Practice by Difficulty mode)
    //   - Correct AND the card has a #solution AND the card was missed earlier
    //     this session -> instead of auto-advancing, the options are replaced
    //     with the solution text + a "Next"/"Next Cycle"/"Review Flagged"/
    //     "Finish Session" button (showSolutionReveal / continueAfterSolution
    //     above). A clean first-try correct answer (never missed) always
    //     auto-advances straight to the next card/cycle/review round/summary,
    //     even if the card has a solution — the solution stays reachable from
    //     the Session Summary screen's per-card reveal button instead. Applies
    //     to every practice mode, not just Review Due — it's independent of
    //     sessionAffectsProgress.
    //   - raceActive (Flashcards Race) short-circuits BOTH branches into a single
    //     one-pass step: correct or wrong, the card is scored exactly once (via
    //     sessionResults, same shape everything else reads) and handleRaceAdvance()
    //     moves straight to the next card — no retries, no missedSet/review-round
    //     queueing, no solution pause (Solution/Explanation only ever shows in the
    //     post-race Session Summary), and no persistence (raceActive sessions are
    //     always sessionAffectsProgress=false, same read-only mechanism Practice All /
    //     Practice by Difficulty's Normal Practice already uses).
    // The 350ms/400ms setTimeouts are the green/red flash duration — change those
    // numbers to make the flash faster/slower.
    function handleOptionClick(idx) {
        if (phase !== 'question' || flashCorrectIdx !== null || (raceActive && flashWrongIdx !== null))
            return;
        const opt = currentOptions[idx];
        if (!opt)
            return;
        const id = cycleOrder[cardPos];
        const elapsedSeconds = questionShownAtRef.current ? (Date.now() - questionShownAtRef.current) / 1000 : 0;
        if (opt.correct) {
            const graduates = firstAttempt;
            const wasEverMissed = sessionEverMissed.has(id);
            if (sessionAffectsProgress)
                practiceDirtyRef.current = true;
            setFlashCorrectIdx(idx);
            setTimeout(() => {
                setFlashCorrectIdx(null);
                // Timing tier + outcome are computed for EVERY practice mode now (not just
                // sessionAffectsProgress ones) so read-only sessions (Practice All,
                // Practice by Difficulty, Flashcards Race) still get a Strong/Good/Weak/
                // Incorrect breakdown in the end-of-session summary. Only
                // sessionAffectsProgress persists it back to the card's stored
                // difficulty/sr — see the block below.
                const card = cards.find((c) => c.id === id);
                const newDifficulty = card ? classifyDifficulty(card, elapsedSeconds, decks.find((d) => d.id === card.deckId)) : null;
                if (raceActive) {
                    // One pass only — this correct answer IS the card's only attempt, so
                    // there's no "was it ever missed this session" to fold in.
                    setSessionResults((prev) => ({ ...prev, [id]: { elapsedSeconds, outcome: newDifficulty || 'good' } }));
                    handleRaceAdvance();
                    return;
                }
                // A miss anywhere this session always fully resets the level AND
                // tags the card 'incorrect' (not the timing tier), regardless of how
                // fast the eventual correct retry was. Only a clean, never-missed
                // correct answer uses the timing tier (weak/good/strong).
                const outcome = wasEverMissed ? 'incorrect' : newDifficulty;
                setSessionResults((prev) => ({ ...prev, [id]: { elapsedSeconds, outcome: outcome || 'good' } }));
                if (sessionAffectsProgress) {
                    // Progress-affecting session only — Review Due is the ONLY mode that
                    // sets sessionAffectsProgress=true. Practice All MCQ, Practice by
                    // Difficulty, and Flashcards Race are all read-only. SR scheduling
                    // happens on graduation (first-try correct, won't reappear this
                    // session), plus a difficulty update on every correct click, timed
                    // from when the question first appeared. Done here, after the flash,
                    // so the save doesn't re-render mid-animation and cut the green flash
                    // short.
                    const updated = cards.map((c) => {
                        if (c.id !== id)
                            return c;
                        const next = { ...c };
                        if (graduates) {
                            next.sr = scheduleNextLevel(c.sr, outcome);
                        }
                        if (outcome)
                            next.difficulty = outcome;
                        return next;
                    });
                    persistCards(updated);
                }
                // If this card has a #solution AND it was missed at some point this
                // session, pause here on a "Continue" screen instead of auto-advancing —
                // continueAfterSolution() calls handleAdvance() once the person has read
                // it and tapped through. A card answered correctly on its very first
                // attempt (never missed) always advances immediately, even if it has a
                // solution — nothing to review, so no reason to interrupt the flow; the
                // solution stays reachable afterward via the Session Summary screen's
                // per-card reveal button.
                if (currentCard && currentCard.solution && wasEverMissed) {
                    setShowSolutionReveal(true);
                }
                else {
                    handleAdvance();
                }
            }, 350);
        }
        else {
            if (raceActive) {
                // One pass only, no retries: a wrong pick in a Race is final for that
                // card — tagged 'incorrect' ("The Dead" in the summary) — and the race
                // moves straight to the next card. No missedSet/sessionEverMissed
                // bookkeeping (nothing to review later) and no persistence.
                setFlashWrongIdx(idx);
                setTimeout(() => {
                    setFlashWrongIdx(null);
                    setSessionResults((prev) => ({ ...prev, [id]: { elapsedSeconds, outcome: 'incorrect' } }));
                    handleRaceAdvance();
                }, 400);
                return;
            }
            if (sessionAffectsProgress)
                practiceDirtyRef.current = true;
            const isFirstMiss = firstAttempt;
            if (isFirstMiss) {
                setMissedSet((prev) => new Set(prev).add(id));
                setSessionEverMissed((prev) => new Set(prev).add(id));
                setFirstAttempt(false);
            }
            setFlashWrongIdx(idx);
            setTimeout(() => {
                setFlashWrongIdx(null);
                // Same "after the flash" timing as the correct-answer branch above,
                // and same reasoning: saving mid-animation would re-render and cut
                // the red flash short. Only fires once per card (isFirstMiss), same
                // as the missedSet/sessionEverMissed bookkeeping above.
                if (sessionAffectsProgress && isFirstMiss) {
                    const updated = cardsRef.current.map((c) => c.id === id
                        ? { ...c, sr: scheduleNextLevel(c.sr, 'incorrect'), difficulty: 'incorrect' }
                        : c);
                    persistCards(updated);
                }
            }, 400);
        }
    }
    // ===== FUNCTIONS: DECK / CARD CRUD (search: FUNCTIONS: DECK CARD CRUD) =====
    // createDeck: the "Create Deck" button on the New Deck screen.
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
        setView('deckChoice');
    }
    function handleImportParse() {
        setParsedPreview(parseCards(importText));
    }
    // commitImport: the "Import" button — parses pasted text into real cards and adds them to the selected deck.
    function commitImport() {
        if (!parsedPreview || parsedPreview.cards.length === 0 || !selectedDeckId)
            return;
        const withMeta = parsedPreview.cards.map((c) => ({ ...c, deckId: selectedDeckId, sr: defaultSr(), difficulty: 'good' }));
        const next = importMode === 'replace'
            ? [...cards.filter((c) => c.deckId !== selectedDeckId), ...withMeta]
            : [...cards, ...withMeta];
        persistCards(next);
        triggerAutoBackup(undefined, next);
        setImportText('');
        setParsedPreview(null);
        setView('deck');
    }
    // saveCycleSize: the one remaining control in Settings that affects how practice
    // sessions are batched. (Practice order used to live here too — it's now per-deck,
    // see updateDeckPracticeOrder, plus the ephemeral raceOrderChoice for Flashcards Race.)
    function saveCycleSize() {
        const n = Math.max(1, parseInt(cycleSizeDraft, 10) || 1);
        persistSettings(n);
        setCycleSizeDraft(String(n));
    }
    // resetEverything: Settings > Danger Zone > wipe all local data.
    // Deliberately does NOT touch Google Drive — your Drive backup survives
    // a reset so you can restore from it if this was a mistake.
    function resetEverything() {
        persistDecks([]);
        persistCards([]);
        persistNotes([]);
        setConfirmReset(false);
        setSelectedDeckId(null);
        setView('home');
    }
    // Deletions (category/deck/card) deliberately do NOT auto-backup — a destructive
    // action shouldn't silently propagate to Drive. A manual "Back Up Now" is needed
    // to actually save the change there.
    // ===== FUNCTIONS: EDIT ZONE (search: FUNCTIONS: EDIT ZONE) =====
    // deleteDeck / deleteCategory / deleteSingleCard: all deletions. On
    // purpose, none of these call triggerAutoBackup — deleting something is
    // the one action that should never silently reach Google Drive. A note
    // is shown asking for a manual "Back Up Now" instead.
    function deleteDeck(deckId) {
        const nextDecks = decks.filter((d) => d.id !== deckId);
        const nextCards = cards.filter((c) => c.deckId !== deckId);
        const nextNotes = notes.filter((n) => n.deckId !== deckId);
        persistDecks(nextDecks);
        persistCards(nextCards);
        persistNotes(nextNotes);
        setEditZoneNotice(googleSignedIn ? 'Deck deleted. Back up manually to save this on Drive.' : 'Deck deleted.');
    }
    function deleteCategory(categoryKey) {
        const isUncategorized = categoryKey === 'Uncategorized';
        const match = (d) => (isUncategorized ? !d.category || !d.category.trim() : d.category === categoryKey);
        const removedDeckIds = new Set(decks.filter(match).map((d) => d.id));
        const nextDecks = decks.filter((d) => !removedDeckIds.has(d.id));
        const nextCards = cards.filter((c) => !removedDeckIds.has(c.deckId));
        const nextNotes = notes.filter((n) => !removedDeckIds.has(n.deckId));
        persistDecks(nextDecks);
        persistCards(nextCards);
        persistNotes(nextNotes);
        setEditZoneNotice(googleSignedIn ? 'Category and its decks deleted. Back up manually to save this on Drive.' : 'Category and its decks deleted.');
    }
    // renameCategory / renameDeck: unlike deletions, renames DO trigger an auto-backup — they're not destructive.
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
    // updateDeckThinkTime: the brain icon in Edit Zone's deck list — sets extra
    // thinking seconds added to that deck's Strong/Good cutoffs (for decks that
    // legitimately need longer, like math). Because this changes what "Strong"
    // and "Good" even mean for the deck, every card's level and difficulty reset
    // to their defaults — old timings aren't comparable under the new cutoffs.
    // Like deletions, this deliberately skips auto-backup — a manual "Back Up
    // Now" is needed to save the change to Drive.
    function updateDeckThinkTime(deckId, strongOffsetSec, goodOffsetSec) {
        const clamp = (n) => Math.max(0, Math.min(1200, Number.isFinite(n) ? n : 0));
        const nextDecks = decks.map((d) => d.id === deckId ? { ...d, strongOffsetSec: clamp(strongOffsetSec), goodOffsetSec: clamp(goodOffsetSec) } : d);
        const nextCards = cards.map((c) => (c.deckId === deckId ? { ...c, sr: defaultSr(), difficulty: 'good' } : c));
        persistDecks(nextDecks);
        persistCards(nextCards);
        setEditZoneNotice(googleSignedIn ? 'Think time updated and deck progress reset. Back up manually to save this on Drive.' : 'Think time updated and deck progress reset.');
    }
    // updateDeckPracticeOrder: the Practice Order dropdown on the Deck screen, just
    // below "Spaced Repetition · MCQ". Unlike updateDeckThinkTime above, this DOES
    // trigger an immediate auto-backup — per spec it should save to Drive as soon as
    // it's set, not wait for a manual "Back Up Now". Doesn't touch cards/SR at all.
    function updateDeckPracticeOrder(deckId, order) {
        const nextDecks = decks.map((d) => (d.id === deckId ? { ...d, practiceOrder: order } : d));
        persistDecks(nextDecks);
        triggerAutoBackup(nextDecks, undefined);
    }
    // updateCategoryThinkTime: the brain icon in Edit Zone's category list —
    // same idea as updateDeckThinkTime, but applies the offset to EVERY deck in
    // the category at once, and resets EVERY card in all of those decks. Also
    // skips auto-backup, same reasoning as the single-deck version.
    function updateCategoryThinkTime(categoryKey, strongOffsetSec, goodOffsetSec) {
        const clamp = (n) => Math.max(0, Math.min(1200, Number.isFinite(n) ? n : 0));
        const isUncategorized = categoryKey === 'Uncategorized';
        const inCategory = (d) => (isUncategorized ? !d.category || !d.category.trim() : d.category === categoryKey);
        const affectedDeckIds = new Set(decks.filter(inCategory).map((d) => d.id));
        const nextDecks = decks.map((d) => affectedDeckIds.has(d.id) ? { ...d, strongOffsetSec: clamp(strongOffsetSec), goodOffsetSec: clamp(goodOffsetSec) } : d);
        const nextCards = cards.map((c) => (affectedDeckIds.has(c.deckId) ? { ...c, sr: defaultSr(), difficulty: 'good' } : c));
        persistDecks(nextDecks);
        persistCards(nextCards);
        setEditZoneNotice(googleSignedIn
            ? `Think time updated for ${affectedDeckIds.size} deck${affectedDeckIds.size !== 1 ? 's' : ''} and their progress reset. Back up manually to save this on Drive.`
            : `Think time updated for ${affectedDeckIds.size} deck${affectedDeckIds.size !== 1 ? 's' : ''} and their progress reset.`);
    }
    // beginEditCard / saveEditCard: the pencil icon in Edit Zone's card list.
    // Editing re-parses the card through parseCards (same rules as Import),
    // and always resets that card's difficulty back to Good (the new default) — the level stays untouched.
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
            ? { ...c, question: p.question, correctAnswer: p.correctAnswer, distractors: p.distractors, hint: p.hint, solution: p.solution, difficulty: 'good' }
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
    // ===== FUNCTIONS: NOTES CRUD (search: FUNCTIONS: NOTES CRUD) =====
    // importNote: Deck > Notes > Import. Each import creates exactly ONE note —
    // pasted/imported content is never auto-split, per how this feature was
    // scoped. Starts at level 1, due immediately, like a brand new card.
    // contentType: 'markdown' (default) renders through NoteBody's Markdown+math
    // pipeline; 'html' renders through a sandboxed iframe instead (see
    // SECTION: NOTE READ) — needed for real interactivity (buttons, JS), which
    // plain HTML injection can't run.
    // handleNoteFileSelected: "Import from Local Storage" on the Notes list —
    // reads a picked .md or .html file straight from the device, detects which
    // kind it is from the file extension, and pre-fills the title (from the
    // filename) and body on the Import screen so the user just confirms/saves.
    async function handleNoteFileSelected(e) {
        const file = e.target.files && e.target.files[0];
        e.target.value = '';
        if (!file)
            return;
        try {
            const text = await file.text();
            const isHtml = /\.html?$/i.test(file.name);
            const titleGuess = file.name.replace(/\.(html?|md|markdown)$/i, '');
            setNoteImportTitle(titleGuess);
            setNoteImportBody(text);
            setNoteImportContentType(isHtml ? 'html' : 'markdown');
            setView('noteImport');
        }
        catch (err) {
            setEditZoneNotice("Couldn't read that file.");
        }
    }
    // handleCardFileSelected: "Upload" on the Cards import type chooser (Home screen
    // Import → Cards → Upload) — reads a picked text file straight from the device and
    // pre-fills the $/@/# textarea on the Import screen. Nothing is parsed or saved yet;
    // same as pasting the text by hand, the user still has to tap Parse, then Add to
    // Deck / Replace Deck Cards before anything touches storage or Drive.
    async function handleCardFileSelected(e) {
        const file = e.target.files && e.target.files[0];
        e.target.value = '';
        if (!file)
            return;
        try {
            const text = await file.text();
            setSelectedDeckId((id) => id || (decks[0] && decks[0].id) || null);
            setImportText(text);
            setParsedPreview(null);
            setView('import');
        }
        catch (err) {
            setEditZoneNotice("Couldn't read that file.");
        }
    }
    function importNote(deckId, title, body, contentType) {
        const trimmedTitle = title.trim();
        if (!trimmedTitle || !body.trim())
            return;
        const now = Date.now();
        const note = {
            id: `note_${now}_${Math.random().toString(36).slice(2, 9)}`,
            deckId,
            title: trimmedTitle,
            body,
            contentType: contentType === 'html' ? 'html' : 'markdown',
            sr: defaultSr(),
            createdAt: now,
            modifiedAt: now,
        };
        const nextNotes = [...notes, note];
        persistNotes(nextNotes);
        triggerAutoBackup(undefined, undefined, nextNotes);
        setNoteImportTitle('');
        setNoteImportBody('');
        setNoteImportContentType('markdown');
    }
    // rateNote: Hard/Moderate/Easy on the note-reading screen — a single
    // discrete action (no session/cycle concept like MCQ practice), so it backs
    // up immediately, same as a card edit would.
    function rateNote(noteId, rating) {
        const nextNotes = notes.map((n) => (n.id === noteId ? { ...n, sr: scheduleNoteLevel(n.sr, rating) } : n));
        persistNotes(nextNotes);
        triggerAutoBackup(undefined, undefined, nextNotes);
    }
    function beginEditNote(note) {
        setEditingNoteId(note.id);
        setEditingNoteTitleDraft(note.title);
        setEditingNoteBodyDraft(note.body);
    }
    function cancelEditNote() {
        setEditingNoteId(null);
        setEditingNoteTitleDraft('');
        setEditingNoteBodyDraft('');
    }
    // saveEditNote: Settings > Edit Zone > Notes > pencil. Updates modifiedAt
    // (drives "Modified Recently First" sorting) but deliberately leaves the
    // level/due schedule untouched — same "edit doesn't reset progress"
    // philosophy already used for card edits.
    function saveEditNote() {
        const title = editingNoteTitleDraft.trim();
        if (!title || !editingNoteBodyDraft.trim())
            return;
        const nextNotes = notes.map((n) => n.id === editingNoteId ? { ...n, title, body: editingNoteBodyDraft, modifiedAt: Date.now() } : n);
        persistNotes(nextNotes);
        triggerAutoBackup(undefined, undefined, nextNotes);
        setEditingNoteId(null);
        setEditingNoteTitleDraft('');
        setEditingNoteBodyDraft('');
    }
    // deleteNote: like deleteSingleCard, deliberately skips auto-backup.
    function deleteNote(noteId) {
        const nextNotes = notes.filter((n) => n.id !== noteId);
        persistNotes(nextNotes);
        setEditZoneNotice(googleSignedIn ? 'Note deleted. Back up manually to save this on Drive.' : 'Note deleted.');
        setConfirmDeleteNoteId(null);
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
        // =====================================================================
        // SECTION: HOME SCREEN  (search: SECTION: HOME SCREEN)
        // Review All Due button, New Deck / Import, search bar, category-grouped
        // deck list, Continue with Google. Colors come from COLORS.* (search
        // SECTION: COLOR PALETTE). Spacing between blocks: change the "gap-3" /
        // "mb-*" classNames. Deck card padding: change "p-4" on each deck button.
        // =====================================================================
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
                }, disabled: totalDue === 0, style: { backgroundColor: totalDue > 0 ? COLORS.mustard : COLORS.disabledBg, ...fontStyle }, className: "w-full rounded-xl py-3 text-white font-bold tracking-wide focus:outline-none focus:ring-2 focus:ring-offset-2" },
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
                        setImportOrigin('home');
                        setView('importChoice');
                    }, disabled: decks.length === 0, style: { borderColor: COLORS.ink, color: decks.length ? COLORS.ink : COLORS.inkFaint, ...fontStyle }, className: "flex-1 rounded-xl border-2 py-2.5 font-bold flex items-center justify-center gap-1 text-sm disabled:opacity-50 focus:outline-none focus:ring-2" },
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
                    const deckNotes = notes.filter((n) => n.deckId === deck.id);
                    const dueCount = deckCards.filter((c) => c.sr && c.sr.due <= today).length;
                    const noteDueCount = deckNotes.filter((n) => n.sr && n.sr.due <= today).length;
                    const empty = deckCards.length === 0;
                    const pillLabel = empty ? 'empty' : dueCount > 0 ? `${dueCount} due` : 'up to date';
                    const pillColor = empty ? COLORS.inkFaint : dueCount > 0 ? COLORS.mustard : COLORS.green;
                    const pillBg = empty ? COLORS.rule : dueCount > 0 ? COLORS.mustardBg : COLORS.greenBg;
                    const cardsDueColor = deckCards.length === 0 ? COLORS.inkFaint : dueCount > 0 ? COLORS.mustard : COLORS.green;
                    const notesDueColor = deckNotes.length === 0 ? COLORS.inkFaint : noteDueCount > 0 ? COLORS.mustard : COLORS.green;
                    return (React.createElement("button", { key: deck.id, onClick: () => {
                            setSelectedDeckId(deck.id);
                            setView('deckChoice');
                        }, className: "w-full text-left rounded-xl border-2 px-4 py-3 flex items-center justify-between gap-2", style: { borderColor: COLORS.ink, backgroundColor: COLORS.card } },
                        React.createElement("div", null,
                            React.createElement("div", { style: { ...fontStyle, color: COLORS.ink }, className: "font-bold" }, deck.name),
                            React.createElement("div", { style: { ...monoStyle }, className: "text-xs flex items-center gap-3 mt-0.5" },
                                React.createElement("span", { className: "flex items-center gap-1", style: { color: COLORS.cardsAccent } },
                                    React.createElement(Layers, { size: 12 }),
                                    deckCards.length,
                                    React.createElement("span", { style: { color: cardsDueColor } }, dueCount, " due")),
                                React.createElement("span", { className: "flex items-center gap-1", style: { color: COLORS.notesAccent } },
                                    React.createElement(BookOpen, { size: 12 }),
                                    deckNotes.length,
                                    React.createElement("span", { style: { color: notesDueColor } }, noteDueCount, " due")))),
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
        // =====================================================================
        // SECTION: NEW DECK SCREEN  (search: SECTION: NEW DECK SCREEN)
        // Deck name + category input fields, Create button.
        // =====================================================================
    }
    else if (view === 'newDeck') {
        content = (React.createElement("div", { className: "flex flex-col gap-4" },
            React.createElement(BackHeader, { colors: COLORS, onBack: () => setView('home'), title: "New Deck" }),
            React.createElement("div", null,
                React.createElement("label", { style: { ...fontStyle, color: COLORS.ink }, className: "text-sm font-bold block mb-1" }, "Deck Name"),
                React.createElement("input", { type: "text", value: newDeckName, onChange: (e) => setNewDeckName(e.target.value), placeholder: "e.g. SSC Vocabulary \u2014 Set 3", style: { ...fontStyle, borderColor: COLORS.rule, backgroundColor: COLORS.card, color: COLORS.ink }, className: "w-full rounded-lg border-2 px-3 py-2 focus:outline-none focus:ring-2" })),
            React.createElement("div", null,
                React.createElement("label", { style: { ...fontStyle, color: COLORS.ink }, className: "text-sm font-bold block mb-1" }, "Category (optional)"),
                React.createElement("input", { type: "text", list: "category-list", value: newDeckCategory, onChange: (e) => setNewDeckCategory(e.target.value), placeholder: "e.g. Vocabulary, Current Affairs, Maths", style: { ...fontStyle, borderColor: COLORS.rule, backgroundColor: COLORS.card, color: COLORS.ink }, className: "w-full rounded-lg border-2 px-3 py-2 focus:outline-none focus:ring-2" }),
                React.createElement("datalist", { id: "category-list" }, categories.map((c) => React.createElement("option", { key: c, value: c }))),
                React.createElement("p", { style: { ...monoStyle, color: COLORS.inkFaint }, className: "text-xs mt-1" }, "Leave blank to file this under Uncategorized.")),
            React.createElement("button", { onClick: createDeck, disabled: !newDeckName.trim(), style: { backgroundColor: newDeckName.trim() ? COLORS.accent : COLORS.disabledBg, ...fontStyle }, className: "w-full rounded-xl py-3 text-white font-bold tracking-wide disabled:opacity-60" }, "Create Deck")));
        // =====================================================================
        // SECTION: IMPORT TYPE CHOOSER  (search: SECTION: IMPORT TYPE CHOOSER)
        // Shown after tapping "New Deck" → Create Deck (lands here via deckChoice,
        // see SECTION: DECK CHOICE) and after the Home screen's "Import" button
        // (via importOrigin='home'). Cards vs Notes, then (for whichever type)
        // a method chooser — Write/Upload for Cards, Paste/Upload for Notes.
        // Nothing is parsed or saved on these screens; storage/Drive are only
        // touched once the user reaches Parse → Add to Deck (Cards) or
        // Parse & Save (Notes) on the screens these lead to.
        // =====================================================================
    }
    else if (view === 'importChoice') {
        content = (React.createElement("div", { className: "flex flex-col gap-3" },
            React.createElement(BackHeader, { colors: COLORS, onBack: () => setView('home'), title: "Import" }),
            React.createElement("p", { style: { ...fontStyle, color: COLORS.inkFaint }, className: "text-sm px-1" }, "What are you importing?"),
            React.createElement("button", { onClick: () => setView('importCardsChoice'), className: "w-full rounded-2xl border-2 p-6 flex flex-col items-center gap-1", style: { borderColor: COLORS.cardsAccent, backgroundColor: COLORS.cardsAccentBg } },
                React.createElement(Layers, { size: 22, style: { color: COLORS.cardsAccent } }),
                React.createElement("span", { style: { ...fontStyle, color: COLORS.cardsAccent }, className: "text-lg font-bold" }, "Cards")),
            React.createElement("button", { onClick: () => setView('importNotesChoice'), className: "w-full rounded-2xl border-2 p-6 flex flex-col items-center gap-1", style: { borderColor: COLORS.notesAccent, backgroundColor: COLORS.notesAccentBg } },
                React.createElement(BookOpen, { size: 22, style: { color: COLORS.notesAccent } }),
                React.createElement("span", { style: { ...fontStyle, color: COLORS.notesAccent }, className: "text-lg font-bold" }, "Notes"))));
    }
    else if (view === 'importCardsChoice') {
        content = (React.createElement("div", { className: "flex flex-col gap-3" },
            React.createElement(BackHeader, { colors: COLORS, onBack: () => setView('importChoice'), title: "Import Cards" }),
            editZoneNotice && (React.createElement("div", { className: "rounded-lg border-2 px-3 py-2", style: { borderColor: COLORS.mustard, backgroundColor: COLORS.mustardBg } },
                React.createElement("span", { style: { ...monoStyle, color: COLORS.mustardText }, className: "text-xs" }, editZoneNotice))),
            React.createElement("p", { style: { ...fontStyle, color: COLORS.inkFaint }, className: "text-sm px-1" }, "How do you want to add them?"),
            React.createElement("button", { onClick: () => setView('import'), className: "w-full rounded-2xl border-2 p-6 flex flex-col items-center gap-1", style: { borderColor: COLORS.cardsAccent, backgroundColor: COLORS.cardsAccentBg } },
                React.createElement(Pencil, { size: 22, style: { color: COLORS.cardsAccent } }),
                React.createElement("span", { style: { ...fontStyle, color: COLORS.cardsAccent }, className: "text-lg font-bold" }, "Write")),
            React.createElement("input", { ref: cardFileInputRef, type: "file", accept: ".txt,.md,.markdown", onChange: handleCardFileSelected, className: "hidden" }),
            React.createElement("button", { onClick: () => cardFileInputRef.current && cardFileInputRef.current.click(), className: "w-full rounded-2xl border-2 p-6 flex flex-col items-center gap-1", style: { borderColor: COLORS.cardsAccent, backgroundColor: COLORS.cardsAccentBg } },
                React.createElement(Upload, { size: 22, style: { color: COLORS.cardsAccent } }),
                React.createElement("span", { style: { ...fontStyle, color: COLORS.cardsAccent }, className: "text-lg font-bold" }, "Upload"))));
    }
    else if (view === 'importNotesChoice') {
        content = (React.createElement("div", { className: "flex flex-col gap-3" },
            React.createElement(BackHeader, { colors: COLORS, onBack: () => setView('importChoice'), title: "Import Notes" }),
            editZoneNotice && (React.createElement("div", { className: "rounded-lg border-2 px-3 py-2", style: { borderColor: COLORS.mustard, backgroundColor: COLORS.mustardBg } },
                React.createElement("span", { style: { ...monoStyle, color: COLORS.mustardText }, className: "text-xs" }, editZoneNotice))),
            React.createElement("p", { style: { ...fontStyle, color: COLORS.inkFaint }, className: "text-sm px-1" }, "How do you want to add it?"),
            React.createElement("button", { onClick: () => { setNoteImportTitle(''); setNoteImportBody(''); setNoteImportContentType('markdown'); setView('noteImport'); }, className: "w-full rounded-2xl border-2 p-6 flex flex-col items-center gap-1", style: { borderColor: COLORS.notesAccent, backgroundColor: COLORS.notesAccentBg } },
                React.createElement(Clipboard, { size: 22, style: { color: COLORS.notesAccent } }),
                React.createElement("span", { style: { ...fontStyle, color: COLORS.notesAccent }, className: "text-lg font-bold" }, "Paste")),
            React.createElement("input", { ref: noteFileInputRef, type: "file", accept: ".md,.markdown,.html,.htm", onChange: handleNoteFileSelected, className: "hidden" }),
            React.createElement("button", { onClick: () => noteFileInputRef.current && noteFileInputRef.current.click(), className: "w-full rounded-2xl border-2 p-6 flex flex-col items-center gap-1", style: { borderColor: COLORS.notesAccent, backgroundColor: COLORS.notesAccentBg } },
                React.createElement(Upload, { size: 22, style: { color: COLORS.notesAccent } }),
                React.createElement("span", { style: { ...fontStyle, color: COLORS.notesAccent }, className: "text-lg font-bold" }, "Upload"))));
        // =====================================================================
        // SECTION: IMPORT SCREEN  (search: SECTION: IMPORT SCREEN)
        // Paste-text box, Add/Replace mode toggle, live parsed-card preview.
        // =====================================================================
    }
    else if (view === 'import') {
        if (decks.length === 0) {
            content = (React.createElement("div", { className: "flex flex-col gap-4" },
                React.createElement(BackHeader, { colors: COLORS, onBack: () => setView('home'), title: "Import Questions" }),
                React.createElement("p", { style: { ...fontStyle, color: COLORS.inkFaint }, className: "text-sm" }, "You need a deck before you can import cards."),
                React.createElement("button", { onClick: () => setView('newDeck'), style: { backgroundColor: COLORS.accent, ...fontStyle }, className: "w-full rounded-xl py-3 text-white font-bold" }, "Create Your First Deck")));
        }
        else {
            content = (React.createElement("div", { className: "flex flex-col gap-4" },
                React.createElement(BackHeader, { colors: COLORS, onBack: () => setView(importOrigin === 'home' ? 'importCardsChoice' : (selectedDeckId ? 'deck' : 'home')), title: "Import Questions" }),
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
                    " \u2014 first is the correct answer, the optional 5th is a hint. An optional line starting with ",
                    React.createElement("b", null, "#"),
                    " adds a solution/explanation, independent of the hint."),
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
        // =====================================================================
        // SECTION: DECK CHOICE  (search: SECTION: DECK CHOICE)
        // The Notes / Practice picker shown right after clicking a deck.
        // =====================================================================
    }
    else if (view === 'deckChoice' && selectedDeck) {
        const deckNoteCount = notes.filter((n) => n.deckId === selectedDeck.id).length;
        const deckCardCount = cards.filter((c) => c.deckId === selectedDeck.id).length;
        content = (React.createElement("div", { className: "flex flex-col gap-3" },
            React.createElement(BackHeader, { colors: COLORS, onBack: () => { setSelectedDeckId(null); setView('home'); }, title: selectedDeck.name }),
            React.createElement("button", { onClick: () => setView('deck'), className: "w-full rounded-2xl border-2 p-6 flex flex-col items-center gap-1", style: { borderColor: COLORS.cardsAccent, backgroundColor: COLORS.cardsAccentBg } },
                React.createElement(Layers, { size: 22, style: { color: COLORS.cardsAccent } }),
                React.createElement("span", { style: { ...fontStyle, color: COLORS.cardsAccent }, className: "text-lg font-bold" }, "Cards"),
                React.createElement("span", { style: { ...monoStyle, color: COLORS.cardsAccent }, className: "text-xs" },
                    deckCardCount,
                    " card",
                    deckCardCount !== 1 ? 's' : '')),
            React.createElement("button", { onClick: () => setView('notes'), className: "w-full rounded-2xl border-2 p-6 flex flex-col items-center gap-1", style: { borderColor: COLORS.notesAccent, backgroundColor: COLORS.notesAccentBg } },
                React.createElement(BookOpen, { size: 22, style: { color: COLORS.notesAccent } }),
                React.createElement("span", { style: { ...fontStyle, color: COLORS.notesAccent }, className: "text-lg font-bold" }, "Notes"),
                React.createElement("span", { style: { ...monoStyle, color: COLORS.notesAccent }, className: "text-xs" },
                    deckNoteCount,
                    " note",
                    deckNoteCount !== 1 ? 's' : ''))));
        // =====================================================================
        // SECTION: DECK VIEW  (search: SECTION: DECK VIEW)
        // Review Due / Flip Through / View as Sheet / Import More / Flashcards Race
        // buttons, in that order top to bottom. The Practice Order dropdown (just
        // below "Spaced Repetition · MCQ") sets selectedDeck.practiceOrder, which
        // Review Due, Flip Through, and View as Sheet all read (defaults to 'random'
        // when unset). Practice All · MCQ and Practice by Difficulty live in their
        // own "Flashcards Race · No Scheduling Impact" section below Import More —
        // each has its own ephemeral, never-saved order picker (raceOrderChoice) —
        // see SECTION: FLASHCARDS RACE ENTRY SCREENS.
        // Button fill color for the two main buttons: COLORS.mustard and
        // COLORS.accent. To reorder buttons, move their <button> blocks below.
        // =====================================================================
    }
    else if (view === 'deck' && selectedDeck) {
        const deckCards = cards.filter((c) => c.deckId === selectedDeck.id);
        const dueCards = deckCards.filter((c) => c.sr && c.sr.due <= today);
        const deckOrder = selectedDeck.practiceOrder || 'random';
        content = (React.createElement("div", { className: "flex flex-col gap-4" },
            React.createElement(BackHeader, { colors: COLORS, onBack: () => {
                    setView('deckChoice');
                    setEditZoneQuery('');
                    setEditingCardId(null);
                    setEditingCardDraft('');
                    setConfirmDeleteCardId(null);
                }, title: selectedDeck.name }),
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
            React.createElement(PracticeOrderSelect, { colors: COLORS, fontStyle: monoStyle, value: deckOrder, onChange: (order) => updateDeckPracticeOrder(selectedDeck.id, order) }),
            React.createElement("button", { onClick: () => beginSession(dueCards.map((c) => c.id), 'deck', `${selectedDeck.name} · Due`, true, deckOrder), disabled: dueCards.length === 0, style: { backgroundColor: dueCards.length ? COLORS.mustard : COLORS.disabledBg, ...fontStyle }, className: "w-full rounded-xl py-3 text-white font-bold tracking-wide disabled:opacity-60" },
                "Review Due (",
                dueCards.length,
                ")"),
            React.createElement("div", { style: { ...monoStyle, color: COLORS.inkFaint }, className: "text-xs tracking-widest uppercase mt-1" }, "Study Only \u00B7 No Scheduling Impact"),
            React.createElement("button", { onClick: () => startFlip(deckCards.map((c) => c.id), 'deck', deckOrder), disabled: deckCards.length === 0, style: { borderColor: COLORS.ink, color: COLORS.ink, ...fontStyle }, className: "w-full rounded-xl border-2 py-2.5 font-bold flex items-center justify-center gap-2 disabled:opacity-50" },
                React.createElement(Layers, { size: 16 }),
                " Flip Through"),
            React.createElement("button", { onClick: () => { setSheetFilterIds(null); setView('sheet'); }, disabled: deckCards.length === 0, style: { borderColor: COLORS.ink, color: COLORS.ink, ...fontStyle }, className: "w-full rounded-xl border-2 py-2.5 font-bold flex items-center justify-center gap-2 disabled:opacity-50" },
                React.createElement(FileText, { size: 16 }),
                " View as Sheet"),
            React.createElement("button", { onClick: () => { setImportOrigin('deck'); setView('import'); }, style: { borderColor: COLORS.ink, color: COLORS.ink, ...fontStyle }, className: "w-full rounded-xl border-2 py-2.5 font-bold flex items-center justify-center gap-2" },
                React.createElement(Upload, { size: 16 }),
                " Import More"),
            React.createElement("div", { style: { ...monoStyle, color: COLORS.inkFaint }, className: "text-xs tracking-widest uppercase mt-1" }, "Flashcards Race \u00B7 No Scheduling Impact"),
            React.createElement("button", { onClick: () => { setRaceOrderChoice('random'); setView('practiceAllModes'); }, disabled: deckCards.length === 0, style: { backgroundColor: deckCards.length ? COLORS.accent : COLORS.disabledBg, ...fontStyle }, className: "w-full rounded-xl py-3 text-white font-bold tracking-wide disabled:opacity-60" }, "Practice All \u00B7 MCQ"),
            React.createElement("button", { onClick: () => { setRaceOrderChoice('random'); setSelectedDifficultyTier(null); setView('difficultyTiers'); }, disabled: deckCards.length === 0, style: { borderColor: COLORS.mustard, color: COLORS.mustard, ...fontStyle }, className: "w-full rounded-xl border-2 py-2.5 font-bold tracking-wide disabled:opacity-50" }, "Practice by Difficulty"),
            React.createElement("p", { style: { ...monoStyle, color: COLORS.inkFaint }, className: "text-xs text-center px-2" }, "Go to Settings for Editing or Deleting Decks or Categories."),
            deckCards.length === 0 && (React.createElement("p", { style: { ...fontStyle, color: COLORS.inkFaint }, className: "text-sm px-1" }, "This deck is empty \u2014 import cards to start practicing."))));
        // =====================================================================
        // SECTION: NOTES LIST  (search: SECTION: NOTES LIST)
        // Deck > Notes. Sort dropdown (5 options), Import button, list of notes.
        // Notes are purely for reading/importing/rating here — editing and
        // deleting only happens in Settings > Edit Zone > Notes.
        // =====================================================================
    }
    else if (view === 'notes' && selectedDeck) {
        const deckNotes = notes.filter((n) => n.deckId === selectedDeck.id);
        const todayStr2 = todayStr();
        const sortedNotes = [...deckNotes].sort((a, b) => {
            const aDue = !!(a.sr && a.sr.due <= todayStr2);
            const bDue = !!(b.sr && b.sr.due <= todayStr2);
            if (noteSort === 'modified')
                return (b.modifiedAt || 0) - (a.modifiedAt || 0);
            if (noteSort === 'new')
                return (b.createdAt || 0) - (a.createdAt || 0);
            if (noteSort === 'old')
                return (a.createdAt || 0) - (b.createdAt || 0);
            if (noteSort === 'due') {
                if (aDue !== bDue)
                    return aDue ? -1 : 1;
                return (a.sr?.due || '').localeCompare(b.sr?.due || '');
            }
            if (noteSort === 'undue') {
                if (aDue !== bDue)
                    return aDue ? 1 : -1;
                return (a.sr?.due || '').localeCompare(b.sr?.due || '');
            }
            return 0;
        });
        content = (React.createElement("div", { className: "flex flex-col gap-3" },
            React.createElement(BackHeader, { colors: COLORS, onBack: () => setView('deckChoice'), title: `${selectedDeck.name} · Notes` }),
            editZoneNotice && (React.createElement("div", { className: "rounded-lg border-2 px-3 py-2", style: { borderColor: COLORS.mustard, backgroundColor: COLORS.mustardBg } },
                React.createElement("span", { style: { ...monoStyle, color: COLORS.mustardText }, className: "text-xs" }, editZoneNotice))),
            React.createElement("input", { ref: noteFileInputRef, type: "file", accept: ".md,.markdown,.html,.htm", onChange: handleNoteFileSelected, className: "hidden" }),
            React.createElement("select", { value: noteSort, onChange: (e) => setNoteSort(e.target.value), style: { ...monoStyle, borderColor: COLORS.rule, backgroundColor: COLORS.card, color: COLORS.ink }, className: "w-full rounded-lg border-2 px-2 py-2 text-xs focus:outline-none focus:ring-2" },
                React.createElement("option", { value: "modified" }, "Modified Recently First"),
                React.createElement("option", { value: "new" }, "New Notes First"),
                React.createElement("option", { value: "old" }, "Old Notes First"),
                React.createElement("option", { value: "due" }, "Due Notes First"),
                React.createElement("option", { value: "undue" }, "Undue Notes First")),
            React.createElement("div", { className: "flex gap-2" },
                React.createElement("button", { onClick: () => { setImportOrigin('deck'); setNoteImportTitle(''); setNoteImportBody(''); setNoteImportContentType('markdown'); setView('noteImport'); }, style: { borderColor: COLORS.accent, color: COLORS.accent, ...fontStyle }, className: "flex-1 rounded-lg border-2 px-3 py-2 text-xs font-bold flex items-center justify-center gap-1" },
                    React.createElement(Upload, { size: 14 }),
                    " Paste"),
                React.createElement("button", { onClick: () => { setImportOrigin('deck'); noteFileInputRef.current && noteFileInputRef.current.click(); }, style: { backgroundColor: COLORS.accent, ...fontStyle }, className: "flex-1 rounded-lg px-3 py-2 text-white text-xs font-bold flex items-center justify-center gap-1" },
                    React.createElement(FileText, { size: 14 }),
                    " From File")),
            React.createElement("div", { className: "flex flex-col gap-2" },
                sortedNotes.map((n) => {
                    const isDue = n.sr && n.sr.due <= todayStr2;
                    return (React.createElement("button", { key: n.id, onClick: () => { setSelectedNoteId(n.id); setView('noteRead'); }, className: "w-full text-left rounded-xl border-2 px-4 py-3 flex items-center justify-between gap-2", style: { borderColor: COLORS.rule, backgroundColor: COLORS.card } },
                        React.createElement("span", { style: { ...fontStyle, color: COLORS.ink }, className: "text-sm font-bold flex-1 truncate" }, n.title),
                        n.contentType === 'html' && (React.createElement("span", { style: { ...monoStyle, color: COLORS.ink, backgroundColor: COLORS.neutralBg }, className: "text-xs rounded-full px-2 py-0.5 shrink-0" }, "HTML")),
                        isDue && (React.createElement("span", { style: { ...monoStyle, color: COLORS.mustardText, backgroundColor: COLORS.mustardBg }, className: "text-xs rounded-full px-2 py-0.5 shrink-0" }, "Due"))));
                }),
                sortedNotes.length === 0 && (React.createElement("p", { style: { ...fontStyle, color: COLORS.inkFaint }, className: "text-sm px-1" }, "No notes yet \u2014 tap Import to add your first one.")))));
        // =====================================================================
        // SECTION: NOTE IMPORT  (search: SECTION: NOTE IMPORT)
        // Title + Markdown paste box. Each import creates exactly one note —
        // pasted text is never auto-split into multiple notes.
        // =====================================================================
    }
    else if (view === 'noteImport' && selectedDeck) {
        content = (React.createElement("div", { className: "flex flex-col gap-3" },
            React.createElement(BackHeader, { colors: COLORS, onBack: () => setView(importOrigin === 'home' ? 'importNotesChoice' : 'notes'), title: noteImportContentType === 'html' ? 'Import HTML Note' : 'Import Note' }),
            React.createElement("div", null,
                React.createElement("label", { style: { ...fontStyle, color: COLORS.ink }, className: "text-sm font-bold block mb-1" }, "Deck"),
                React.createElement("select", { value: selectedDeckId || '', onChange: (e) => setSelectedDeckId(e.target.value), style: { ...fontStyle, borderColor: COLORS.rule, backgroundColor: COLORS.card }, className: "w-full rounded-lg border-2 px-3 py-2 focus:outline-none focus:ring-2" }, decks.map((d) => (React.createElement("option", { key: d.id, value: d.id },
                    d.name,
                    d.category ? ` — ${d.category}` : ''))))),
            noteImportContentType === 'html' && (React.createElement("div", { className: "rounded-lg border-2 px-3 py-2", style: { borderColor: COLORS.accent, backgroundColor: COLORS.neutralBg } },
                React.createElement("span", { style: { ...monoStyle, color: COLORS.ink }, className: "text-xs" }, "This will render as an interactive page (scripts run), not as Markdown."))),
            React.createElement("input", { type: "text", value: noteImportTitle, onChange: (e) => setNoteImportTitle(e.target.value), placeholder: "Note title (e.g. Part 3: Fundamental Rights)", style: { ...fontStyle, borderColor: COLORS.rule, backgroundColor: COLORS.card, color: COLORS.ink }, className: "w-full rounded-lg border-2 px-3 py-2 text-sm focus:outline-none focus:ring-2" }),
            React.createElement("textarea", { value: noteImportBody, onChange: (e) => setNoteImportBody(e.target.value), rows: 14, placeholder: noteImportContentType === 'html'
                    ? 'HTML source…'
                    : 'Paste your Markdown notes here. Use [ ] for math, e.g. [x^2 + 1]', style: { ...monoStyle, borderColor: COLORS.rule, backgroundColor: COLORS.card, color: COLORS.ink }, className: "w-full rounded-lg border-2 p-3 text-xs leading-relaxed focus:outline-none focus:ring-2" }),
            React.createElement("button", { onClick: () => { importNote(selectedDeck.id, noteImportTitle, noteImportBody, noteImportContentType); setView('notes'); }, disabled: !noteImportTitle.trim() || !noteImportBody.trim(), style: { backgroundColor: noteImportTitle.trim() && noteImportBody.trim() ? COLORS.accent : COLORS.disabledBg, ...fontStyle }, className: "w-full rounded-xl py-3 text-white font-bold tracking-wide disabled:opacity-60" }, "Parse & Save")));
        // =====================================================================
        // SECTION: NOTE READ  (search: SECTION: NOTE READ)
        // Full rendered Markdown+math body, then a Hard/Moderate/Easy self-rating
        // that drives this note's own level — same mechanism as cards, simpler
        // (no per-deck think-time offsets, no "incorrect" reset case).
        // =====================================================================
    }
    else if (view === 'noteRead' && selectedDeck) {
        const readingNote = notes.find((n) => n.id === selectedNoteId);
        content = readingNote ? (React.createElement("div", { className: "flex flex-col gap-4" },
            React.createElement(BackHeader, { colors: COLORS, onBack: () => setView('notes'), title: selectedDeck.name }),
            React.createElement("div", { className: "rounded-2xl py-6 -mx-5", style: { backgroundColor: COLORS.card } },
                React.createElement("h2", { style: { ...fontStyle, color: COLORS.ink }, className: "text-lg font-bold mb-3 px-5" }, readingNote.title),
                readingNote.contentType === 'html' ? (React.createElement(HtmlNoteFrame, { html: readingNote.body })) : (React.createElement(NoteBody, { text: readingNote.body, className: "px-5" }))),
            React.createElement("p", { style: { ...monoStyle, color: COLORS.inkFaint }, className: "text-xs text-center" }, "How was this read?"),
            React.createElement("div", { className: "flex gap-2" },
                React.createElement("button", { onClick: () => { rateNote(readingNote.id, 'hard'); setView('notes'); }, style: { backgroundColor: COLORS.red, ...fontStyle }, className: "flex-1 rounded-xl py-3 text-white text-sm font-bold" }, "Hard"),
                React.createElement("button", { onClick: () => { rateNote(readingNote.id, 'moderate'); setView('notes'); }, style: { backgroundColor: COLORS.mustard, ...fontStyle }, className: "flex-1 rounded-xl py-3 text-white text-sm font-bold" }, "Moderate"),
                React.createElement("button", { onClick: () => { rateNote(readingNote.id, 'easy'); setView('notes'); }, style: { backgroundColor: COLORS.green, ...fontStyle }, className: "flex-1 rounded-xl py-3 text-white text-sm font-bold" }, "Easy")))) : null;
        // =====================================================================
        // SECTION: FLIP SCREEN  (search: SECTION: FLIP SCREEN)
        // Tap-to-reveal card. Never affects scheduling or difficulty.
        // =====================================================================
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
                    React.createElement(MathText, { text: flipCard.question, style: { ...fontStyle, color: COLORS.ink }, className: "text-base leading-relaxed font-medium mb-4 block" }),
                    flipShowAnswer ? (React.createElement(React.Fragment, null,
                        React.createElement("div", { style: { ...monoStyle, color: COLORS.green }, className: "text-xs uppercase tracking-widest mb-1" }, "Answer"),
                        React.createElement(MathText, { text: flipCard.correctAnswer, style: { ...fontStyle, color: COLORS.ink }, className: "text-base font-medium block" }),
                        flipCard.hint && (React.createElement("p", { style: { ...fontStyle, color: COLORS.mustardText }, className: "text-xs mt-3 italic" },
                            "Hint: ",
                            React.createElement(MathText, { text: flipCard.hint }))),
                        flipCard.solution && (React.createElement("p", { style: { ...fontStyle, color: COLORS.solutionText }, className: "text-xs mt-2 italic" },
                            "Solution: ",
                            React.createElement(MathText, { text: flipCard.solution }))))) : (React.createElement("p", { style: { ...monoStyle, color: COLORS.inkFaint }, className: "text-xs" }, "Tap to reveal answer"))),
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
            content = (React.createElement(StampScreen, { colors: COLORS, tone: "navy", title: "DECK COMPLETE", subtitle: `${flipOrder.length} card${flipOrder.length !== 1 ? 's' : ''} reviewed · flip-through, not scheduled`, buttonLabel: "Back to Deck", onContinue: () => setView(returnView) }));
        }
        // =====================================================================
        // SECTION: SHEET SCREEN  (search: SECTION: SHEET SCREEN)
        // All Q&A pairs listed at once, scrollable. Never affects scheduling.
        // =====================================================================
    }
    else if (view === 'sheet' && selectedDeck) {
        const baseIds = sheetFilterIds || cards.filter((c) => c.deckId === selectedDeck.id).map((c) => c.id);
        const sheetIds = orderPool(baseIds, selectedDeck.practiceOrder || 'random', cards);
        content = (React.createElement("div", { className: "flex flex-col gap-4" },
            React.createElement(BackHeader, { colors: COLORS, onBack: () => setView('deck'), title: `${selectedDeck.name} · Sheet` }),
            sheetIds.length === 0 ? (React.createElement("p", { style: { ...fontStyle, color: COLORS.inkFaint }, className: "text-sm" }, "This deck is empty.")) : (React.createElement("div", { className: "flex flex-col gap-3" }, sheetIds.map((id, i) => {
                const c = cards.find((cc) => cc.id === id);
                if (!c)
                    return null;
                return (React.createElement("div", { key: id, className: "rounded-xl border-2 px-4 py-3", style: { borderColor: COLORS.rule, backgroundColor: COLORS.card } },
                    React.createElement("div", { style: { ...fontStyle, color: COLORS.ink }, className: "text-sm font-medium" },
                        React.createElement("span", { style: { ...monoStyle, color: COLORS.ink }, className: "mr-1" },
                            i + 1,
                            "."),
                        React.createElement(MathText, { text: c.question })),
                    React.createElement(MathText, { text: c.correctAnswer, style: { ...fontStyle, color: COLORS.green }, className: "text-sm font-bold mt-1 block" }),
                    c.hint && (React.createElement("div", { style: { ...fontStyle, color: COLORS.mustard }, className: "text-xs mt-1 italic" },
                        "Hint: ",
                        React.createElement(MathText, { text: c.hint }))),
                    c.solution && (React.createElement("div", { style: { ...fontStyle, color: COLORS.solution }, className: "text-xs mt-1 italic" },
                        "Solution: ",
                        React.createElement(MathText, { text: c.solution })))));
            })))));
        // =====================================================================
        // SECTION: DIFFICULTY TIERS SCREEN  (search: SECTION: DIFFICULTY TIERS)
        // The Strong / Good / Weak / Incorrect picker — part of Flashcards Race now
        // (reached from the deck screen's "Practice by Difficulty" button). The
        // Practice Order dropdown here is the ephemeral raceOrderChoice — never saved,
        // reset to 'random' each time this screen is entered — carried forward to
        // whichever tier gets picked (see SECTION: DIFFICULTY MODES SCREEN below).
        // Tile colors (same mapping as Session Summary — kept in sync, both arrays
        // edited together): Strong=COLORS.green/greenBg, Good=COLORS.incorrect/
        // incorrectBg, Weak=COLORS.mustard/mustardBg, Incorrect=COLORS.red/redBg.
        // =====================================================================
    }
    else if (view === 'difficultyTiers' && selectedDeck) {
        const deckCards = cards.filter((c) => c.deckId === selectedDeck.id);
        const tierCards = { strong: [], good: [], weak: [], incorrect: [] };
        deckCards.forEach((c) => {
            const d = ['strong', 'weak', 'incorrect'].includes(c.difficulty) ? c.difficulty : 'good';
            tierCards[d].push(c);
        });
        const tiers = [
            { key: 'strong', label: 'Strong Cards', color: COLORS.green, bg: COLORS.greenBg },
            { key: 'good', label: 'Good Cards', color: COLORS.incorrect, bg: COLORS.incorrectBg },
            { key: 'weak', label: 'Weak Cards', color: COLORS.mustard, bg: COLORS.mustardBg },
            { key: 'incorrect', label: 'Incorrect Cards', color: COLORS.red, bg: COLORS.redBg },
        ];
        content = (React.createElement("div", { className: "flex flex-col gap-3" },
            React.createElement(BackHeader, { colors: COLORS, onBack: () => setView('deck'), title: `${selectedDeck.name} · By Difficulty` }),
            React.createElement("p", { style: { ...monoStyle, color: COLORS.inkFaint }, className: "text-xs -mt-1" }, "Doesn't affect scheduling or difficulty \u2014 pick a tier to study."),
            React.createElement(PracticeOrderSelect, { colors: COLORS, fontStyle: monoStyle, value: raceOrderChoice, onChange: setRaceOrderChoice }),
            tiers.map((t) => (React.createElement("button", { key: t.key, onClick: () => { setSelectedDifficultyTier(t.key); setView('difficultyModes'); }, disabled: tierCards[t.key].length === 0, className: "w-full rounded-xl border-2 p-4 flex items-center justify-between disabled:opacity-40", style: { borderColor: t.color, backgroundColor: t.bg } },
                React.createElement("span", { style: { ...fontStyle, color: t.color }, className: "font-bold" }, t.label),
                React.createElement("span", { style: { ...monoStyle, color: t.color }, className: "text-sm" }, tierCards[t.key].length))))));
        // =====================================================================
        // SECTION: DIFFICULTY MODES SCREEN  (search: SECTION: DIFFICULTY MODES)
        // Normal Practice / Race picker for a chosen difficulty tier. Both are
        // read-only — see beginSession's affectsProgress=false argument and
        // startRace's comment. Order was already chosen on the tier picker above
        // (raceOrderChoice) — no second dropdown here.
        // =====================================================================
    }
    else if (view === 'difficultyModes' && selectedDeck) {
        const deckCards = cards.filter((c) => c.deckId === selectedDeck.id);
        const tierLabel = { strong: 'Strong Cards', good: 'Good Cards', weak: 'Weak Cards', incorrect: 'Incorrect Cards' }[selectedDifficultyTier] || '';
        const tierIds = deckCards
            .filter((c) => (['strong', 'weak', 'incorrect'].includes(c.difficulty) ? c.difficulty : 'good') === selectedDifficultyTier)
            .map((c) => c.id);
        const sessionLabelText = `${selectedDeck.name} · ${tierLabel}`;
        content = (React.createElement("div", { className: "flex flex-col gap-3" },
            React.createElement(BackHeader, { colors: COLORS, onBack: () => setView('difficultyTiers'), title: tierLabel }),
            React.createElement("p", { style: { ...monoStyle, color: COLORS.inkFaint }, className: "text-xs -mt-1" },
                tierIds.length,
                " card",
                tierIds.length !== 1 ? 's' : '',
                " \u00B7 study only, no scheduling or backup impact"),
            React.createElement("button", { onClick: () => beginSession(tierIds, 'difficultyModes', sessionLabelText, false, raceOrderChoice), disabled: tierIds.length === 0, style: { backgroundColor: tierIds.length ? COLORS.accent : COLORS.disabledBg, ...fontStyle }, className: "w-full rounded-xl py-3 text-white font-bold tracking-wide disabled:opacity-60" }, "Normal Practice"),
            React.createElement("button", { onClick: () => goToRaceSetup(tierIds, sessionLabelText, 'difficultyModes', raceOrderChoice), disabled: tierIds.length === 0, style: { borderColor: COLORS.red, color: COLORS.red, ...fontStyle }, className: "w-full rounded-xl border-2 py-2.5 font-bold tracking-wide disabled:opacity-50" }, "Race")));
        // =====================================================================
        // SECTION: FLASHCARDS RACE ENTRY SCREENS  (search: SECTION: FLASHCARDS RACE ENTRY)
        // practiceAllModes: Normal Practice / Race picker for the WHOLE deck, reached
        // from the deck screen's "Practice All · MCQ" button. Has its own ephemeral
        // Practice Order dropdown (raceOrderChoice) right on this screen, since there's
        // no earlier tier-picker step here the way there is for Practice by Difficulty.
        // raceSetup: the time-entry screen — reached by tapping "Race" on either this
        // screen or the Difficulty Modes screen above. confirmStartRace() reads
        // racePendingPoolIds/Label/ReturnView/Order (stashed by goToRaceSetup) plus
        // raceDurationDraft to actually start the race — see startRace.
        // =====================================================================
    }
    else if (view === 'practiceAllModes' && selectedDeck) {
        const deckCards = cards.filter((c) => c.deckId === selectedDeck.id);
        const poolIds = deckCards.map((c) => c.id);
        content = (React.createElement("div", { className: "flex flex-col gap-3" },
            React.createElement(BackHeader, { colors: COLORS, onBack: () => setView('deck'), title: `${selectedDeck.name} · Practice All` }),
            React.createElement("p", { style: { ...monoStyle, color: COLORS.inkFaint }, className: "text-xs -mt-1" },
                poolIds.length,
                " card",
                poolIds.length !== 1 ? 's' : '',
                " \u00B7 study only, no scheduling or backup impact"),
            React.createElement(PracticeOrderSelect, { colors: COLORS, fontStyle: monoStyle, value: raceOrderChoice, onChange: setRaceOrderChoice }),
            React.createElement("button", { onClick: () => beginSession(poolIds, 'practiceAllModes', selectedDeck.name, false, raceOrderChoice), disabled: poolIds.length === 0, style: { backgroundColor: poolIds.length ? COLORS.accent : COLORS.disabledBg, ...fontStyle }, className: "w-full rounded-xl py-3 text-white font-bold tracking-wide disabled:opacity-60" }, "Normal Practice"),
            React.createElement("button", { onClick: () => goToRaceSetup(poolIds, selectedDeck.name, 'practiceAllModes', raceOrderChoice), disabled: poolIds.length === 0, style: { borderColor: COLORS.red, color: COLORS.red, ...fontStyle }, className: "w-full rounded-xl border-2 py-2.5 font-bold tracking-wide disabled:opacity-50" }, "Race")));
    }
    else if (view === 'raceSetup') {
        content = (React.createElement("div", { className: "flex flex-col gap-3" },
            React.createElement(BackHeader, { colors: COLORS, onBack: () => setView(racePendingReturnView), title: `${racePendingLabel} · Race Setup` }),
            React.createElement("p", { style: { ...monoStyle, color: COLORS.inkFaint }, className: "text-xs -mt-1" },
                racePendingPoolIds.length,
                " card",
                racePendingPoolIds.length !== 1 ? 's' : '',
                " \u00B7 one attempt per card, no retries \u2014 whatever's left when time runs out is Never Fought"),
            React.createElement("label", { style: { ...fontStyle, color: COLORS.ink }, className: "text-sm font-bold block -mb-1" }, "Race Duration (seconds)"),
            React.createElement("input", { type: "number", min: "5", value: raceDurationDraft, onChange: (e) => setRaceDurationDraft(e.target.value), style: { ...monoStyle, borderColor: COLORS.rule, backgroundColor: COLORS.card, color: COLORS.ink }, className: "w-full rounded-lg border-2 px-3 py-2 focus:outline-none focus:ring-2" }),
            React.createElement("button", { onClick: confirmStartRace, disabled: racePendingPoolIds.length === 0, style: { backgroundColor: racePendingPoolIds.length ? COLORS.red : COLORS.disabledBg, ...fontStyle }, className: "w-full rounded-xl py-3 text-white font-bold tracking-wide disabled:opacity-60 mt-1" }, "Start Race")));
        // =====================================================================
        // SECTION: SETTINGS SCREEN  (search: SECTION: SETTINGS SCREEN)
        // Cards-per-cycle, Font Size, Backup & Restore nav, Edit Zone nav, Dark
        // Mode toggle, Danger Zone — in that top-to-bottom order below. To
        // reorder sections, move their <div> blocks. (Practice Order used to
        // live here — it's now per-deck; see updateDeckPracticeOrder.)
        // =====================================================================
    }
    else if (view === 'settings') {
        content = (React.createElement("div", { className: "flex flex-col gap-4" },
            React.createElement(BackHeader, { colors: COLORS, onBack: () => { setView('home'); setConfirmReset(false); }, title: "Settings" }),
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
                    React.createElement("p", { style: { ...fontStyle, color: COLORS.ink }, className: "text-sm" }, "This deletes every deck and card permanently."),
                    React.createElement("div", { className: "flex gap-2" },
                        React.createElement("button", { onClick: resetEverything, style: { backgroundColor: COLORS.red, ...fontStyle }, className: "flex-1 rounded-lg text-white text-sm font-bold py-2" }, "Yes, Delete Everything"),
                        React.createElement("button", { onClick: () => setConfirmReset(false), style: { borderColor: COLORS.ink, color: COLORS.ink, ...fontStyle }, className: "flex-1 rounded-lg border-2 text-sm font-bold py-2" }, "Cancel")))))));
        // =====================================================================
        // SECTION: BACKUP & RESTORE SCREEN  (search: SECTION: BACKUP SCREEN)
        // Local backup/restore buttons, Google Drive status + backup/restore/
        // sign-out, sign-in-sync prompt (Keep & Merge vs Rewrite).
        // =====================================================================
    }
    else if (view === 'backup') {
        const noticeColor = driveNotice?.tone === 'error' ? COLORS.red : driveNotice?.tone === 'success' ? COLORS.green : COLORS.mustard;
        const noticeBg = driveNotice?.tone === 'error' ? COLORS.redBg : driveNotice?.tone === 'success' ? COLORS.greenBg : COLORS.mustardBg;
        content = (React.createElement("div", { className: "flex flex-col gap-4" },
            React.createElement(BackHeader, { colors: COLORS, onBack: () => { setView('settings'); setPendingRestore(null); setSignInSyncPrompt(null); }, title: "Backup & Restore" }),
            React.createElement("input", { ref: restoreFileInputRef, type: "file", accept: ".json,application/json", onChange: handleRestoreFileSelected, className: "hidden" }),
            driveNotice && (React.createElement("div", { className: "rounded-lg border-2 px-3 py-2 flex items-start gap-2", style: { borderColor: noticeColor, backgroundColor: noticeBg } },
                driveNotice.tone === 'error' ? (React.createElement(AlertTriangle, { size: 16, style: { color: noticeColor }, className: "shrink-0 mt-0.5" })) : (React.createElement(Check, { size: 16, style: { color: noticeColor }, className: "shrink-0 mt-0.5" })),
                React.createElement("span", { style: { ...fontStyle, color: noticeColor }, className: "text-xs leading-relaxed" }, driveNotice.text))),
            pendingRestore && (React.createElement("div", { className: "rounded-xl border-2 p-4", style: { borderColor: COLORS.mustard, backgroundColor: COLORS.mustardBg } },
                React.createElement("div", { style: { ...fontStyle, color: COLORS.mustardText }, className: "text-sm font-bold mb-1" },
                    "Restore from ",
                    pendingRestore.source === 'drive' ? 'Google Drive' : 'file',
                    "?"),
                React.createElement("p", { style: { ...monoStyle, color: COLORS.mustardText }, className: "text-xs mb-3 leading-relaxed" },
                    "This replaces every deck and card currently on this device with the backup",
                    pendingRestore.payload.exportedAt ? ` from ${formatTimestamp(pendingRestore.payload.exportedAt)}` : '',
                    ". It can't be undone."),
                React.createElement("div", { className: "flex gap-2" },
                    React.createElement("button", { onClick: applyPendingRestore, style: { backgroundColor: COLORS.mustard, ...fontStyle }, className: "flex-1 rounded-lg text-white text-sm font-bold py-2" }, "Restore"),
                    React.createElement("button", { onClick: () => setPendingRestore(null), style: { borderColor: COLORS.mustardText, color: COLORS.mustardText, ...fontStyle }, className: "flex-1 rounded-lg border-2 text-sm font-bold py-2" }, "Cancel")))),
            signInSyncPrompt && (React.createElement("div", { className: "rounded-xl border-2 p-4", style: { borderColor: COLORS.mustard, backgroundColor: COLORS.mustardBg } },
                React.createElement("div", { style: { ...fontStyle, color: COLORS.mustardText }, className: "text-sm font-bold mb-1" }, "You already have decks on this device"),
                React.createElement("p", { style: { ...monoStyle, color: COLORS.mustardText }, className: "text-xs mb-3 leading-relaxed" },
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
                    React.createElement("p", { style: { ...monoStyle, color: COLORS.mustardText }, className: "text-xs leading-relaxed" }, "Setup needed: this button won't authenticate until you (1) create an OAuth Client ID in Google Cloud Console, (2) paste it into GOOGLE_CLIENT_ID at the top of this file, and (3) host the app on a real domain registered as an authorized origin. It will not work inside this preview."))))));
        // =====================================================================
        // SECTION: EDIT ZONE — CATEGORIES  (search: SECTION: EDIT ZONE CATEGORIES)
        // Top level of Settings > Edit Zone. Search bar, category list, each
        // with rename (pencil) and delete (trash) — except "Uncategorized",
        // which can't be renamed/deleted since it isn't a real stored value.
        // =====================================================================
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
            React.createElement(BackHeader, { colors: COLORS, onBack: () => setView('settings'), title: "Edit Zone" }),
            editZoneNotice && (React.createElement("div", { className: "rounded-lg border-2 px-3 py-2", style: { borderColor: COLORS.mustard, backgroundColor: COLORS.mustardBg } },
                React.createElement("span", { style: { ...monoStyle, color: COLORS.mustardText }, className: "text-xs" }, editZoneNotice))),
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
                        React.createElement("button", { onClick: () => {
                                setThinkTimeCategoryKey(key);
                                setThinkTimeDeckId(null);
                                setThinkTimeStrongDraft('0');
                                setThinkTimeGoodDraft('0');
                                setEditZoneLevel('thinkTime');
                            }, style: { color: COLORS.mustard }, className: "p-1 shrink-0" },
                            React.createElement(Brain, { size: 16 })),
                        !isUncategorized && (React.createElement(React.Fragment, null,
                            React.createElement("button", { onClick: () => { setRenamingCategory(key); setRenameCategoryDraft(key); }, style: { color: COLORS.ink }, className: "p-1 shrink-0" },
                                React.createElement(Pencil, { size: 16 })),
                            React.createElement("button", { onClick: () => setConfirmDeleteCategory(key), style: { color: COLORS.red }, className: "p-1 shrink-0" },
                                React.createElement(Trash2, { size: 16 }))))))));
                }),
                categoryKeys.length === 0 && (React.createElement("p", { style: { ...monoStyle, color: COLORS.inkFaint }, className: "text-xs text-center py-4" }, "No categories match.")))));
        // =====================================================================
        // SECTION: EDIT ZONE — DECKS  (search: SECTION: EDIT ZONE DECKS)
        // Second level — decks inside one category.
        // =====================================================================
    }
    else if (view === 'editZone' && editZoneLevel === 'decks') {
        const isUncategorized = editZoneCategory === 'Uncategorized';
        const catDecks = decks.filter((d) => isUncategorized ? !d.category || !d.category.trim() : d.category === editZoneCategory);
        const q = editZoneQuery.trim().toLowerCase();
        const filteredDecks = catDecks.filter((d) => !q || d.name.toLowerCase().includes(q));
        content = (React.createElement("div", { className: "flex flex-col gap-3" },
            React.createElement(BackHeader, { colors: COLORS, onBack: () => { setEditZoneLevel('categories'); setEditZoneQuery(''); }, title: editZoneCategory }),
            editZoneNotice && (React.createElement("div", { className: "rounded-lg border-2 px-3 py-2", style: { borderColor: COLORS.mustard, backgroundColor: COLORS.mustardBg } },
                React.createElement("span", { style: { ...monoStyle, color: COLORS.mustardText }, className: "text-xs" }, editZoneNotice))),
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
                        React.createElement("button", { onClick: () => {
                                setThinkTimeDeckId(d.id);
                                setThinkTimeCategoryKey(null);
                                setThinkTimeStrongDraft(String(d.strongOffsetSec || 0));
                                setThinkTimeGoodDraft(String(d.goodOffsetSec || 0));
                                setEditZoneLevel('thinkTime');
                            }, style: { color: COLORS.mustard }, className: "p-1 shrink-0" },
                            React.createElement(Brain, { size: 16 })),
                        React.createElement("button", { onClick: () => { setEditZoneDeckId(d.id); setEditZoneNoteQuery(''); setEditZoneLevel('notes'); }, style: { color: COLORS.green }, className: "p-1 shrink-0" },
                            React.createElement(BookOpen, { size: 16 })),
                        React.createElement("button", { onClick: () => { setRenamingDeckId(d.id); setRenameDeckDraft(d.name); }, style: { color: COLORS.ink }, className: "p-1 shrink-0" },
                            React.createElement(Pencil, { size: 16 })),
                        React.createElement("button", { onClick: () => setConfirmDeleteDeckId(d.id), style: { color: COLORS.red }, className: "p-1 shrink-0" },
                            React.createElement(Trash2, { size: 16 }))))));
                }),
                filteredDecks.length === 0 && (React.createElement("p", { style: { ...monoStyle, color: COLORS.inkFaint }, className: "text-xs text-center py-4" }, "No decks match.")))));
        // =====================================================================
        // SECTION: EDIT ZONE — THINK TIME  (search: SECTION: EDIT ZONE THINK TIME)
        // The brain icon in the decks list. Sets extra seconds added to a deck's
        // Strong/Good cutoffs — useful for math or any deck that fairly needs more
        // thinking time than the plain default. Saving resets that deck's cards
        // (level + difficulty) since old timings aren't comparable under new cutoffs.
        // =====================================================================
    }
    else if (view === 'editZone' && editZoneLevel === 'thinkTime') {
        const isCategoryMode = !!thinkTimeCategoryKey;
        const ttDeck = isCategoryMode ? null : decks.find((d) => d.id === thinkTimeDeckId);
        const strongNum = Math.max(0, Math.min(1200, parseInt(thinkTimeStrongDraft, 10) || 0));
        const goodNum = Math.max(0, Math.min(1200, parseInt(thinkTimeGoodDraft, 10) || 0));
        const screenTitle = isCategoryMode ? `${thinkTimeCategoryKey} · Think Time` : ttDeck ? `${ttDeck.name} · Think Time` : 'Think Time';
        const scopeNote = isCategoryMode ? 'every deck in this category' : 'this deck only';
        const resetNote = isCategoryMode ? "resets every deck's progress in this category" : "resets this deck's progress";
        content = (React.createElement("div", { className: "flex flex-col gap-3" },
            React.createElement(BackHeader, { colors: COLORS, onBack: () => setEditZoneLevel(isCategoryMode ? 'categories' : 'decks'), title: screenTitle }),
            React.createElement("p", { style: { ...monoStyle, color: COLORS.inkFaint }, className: "text-xs -mt-1" },
                "Extra seconds added on top of the default Strong/Good cutoffs for ",
                scopeNote,
                " \u2014 good for math or anything that fairly takes longer to work out. Max 1200s each."),
            React.createElement("div", { className: "rounded-xl border-2 p-4 flex flex-col gap-4", style: { borderColor: COLORS.rule, backgroundColor: COLORS.card } },
                React.createElement("div", null,
                    React.createElement("label", { style: { ...fontStyle, color: COLORS.green }, className: "text-sm font-bold block mb-2" },
                        "Strong: Default + ",
                        React.createElement("input", { type: "number", min: 0, max: 1200, value: thinkTimeStrongDraft, onChange: (e) => setThinkTimeStrongDraft(e.target.value), style: { ...monoStyle, borderColor: COLORS.rule, backgroundColor: COLORS.paper, color: COLORS.ink }, className: "w-20 mx-1 rounded-lg border-2 px-2 py-1 text-center focus:outline-none focus:ring-2" }),
                        " seconds")),
                React.createElement("div", null,
                    React.createElement("label", { style: { ...fontStyle, color: COLORS.mustard }, className: "text-sm font-bold block mb-2" },
                        "Good: Default + ",
                        React.createElement("input", { type: "number", min: 0, max: 1200, value: thinkTimeGoodDraft, onChange: (e) => setThinkTimeGoodDraft(e.target.value), style: { ...monoStyle, borderColor: COLORS.rule, backgroundColor: COLORS.paper, color: COLORS.ink }, className: "w-20 mx-1 rounded-lg border-2 px-2 py-1 text-center focus:outline-none focus:ring-2" }),
                        " seconds")),
                React.createElement("button", { onClick: () => {
                        if (isCategoryMode) {
                            updateCategoryThinkTime(thinkTimeCategoryKey, strongNum, goodNum);
                            setEditZoneLevel('categories');
                        }
                        else {
                            updateDeckThinkTime(thinkTimeDeckId, strongNum, goodNum);
                            setEditZoneLevel('decks');
                        }
                    }, style: { backgroundColor: COLORS.accent, ...fontStyle }, className: "w-full rounded-xl py-3 text-white font-bold tracking-wide" },
                    "Save (",
                    resetNote,
                    ")"))));
        // =====================================================================
        // SECTION: EDIT ZONE — NOTES LIST  (search: SECTION: EDIT ZONE NOTES LIST)
        // The BookOpen icon in the decks list. Search + pencil (title/body edit,
        // opens SECTION: EDIT ZONE NOTE EDIT below) + trash (delete, no auto-backup,
        // same rule as every other deletion in Edit Zone).
        // =====================================================================
    }
    else if (view === 'editZone' && editZoneLevel === 'notes') {
        const zoneDeckForNotes = decks.find((d) => d.id === editZoneDeckId);
        const deckNotesHere = notes.filter((n) => n.deckId === editZoneDeckId);
        const nq = editZoneNoteQuery.trim().toLowerCase();
        const filteredNotes = deckNotesHere.filter((n) => !nq || n.title.toLowerCase().includes(nq));
        content = (React.createElement("div", { className: "flex flex-col gap-3" },
            React.createElement(BackHeader, { colors: COLORS, onBack: () => { setEditZoneLevel('decks'); setEditZoneNoteQuery(''); setEditingNoteId(null); setConfirmDeleteNoteId(null); }, title: zoneDeckForNotes ? `${zoneDeckForNotes.name} · Notes` : 'Notes' }),
            editZoneNotice && (React.createElement("div", { className: "rounded-lg border-2 px-3 py-2", style: { borderColor: COLORS.mustard, backgroundColor: COLORS.mustardBg } },
                React.createElement("span", { style: { ...monoStyle, color: COLORS.mustardText }, className: "text-xs" }, editZoneNotice))),
            React.createElement("div", { className: "relative" },
                React.createElement(Search, { size: 14, style: { color: COLORS.inkFaint }, className: "absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" }),
                React.createElement("input", { type: "text", value: editZoneNoteQuery, onChange: (e) => setEditZoneNoteQuery(e.target.value), placeholder: "Search notes\u2026", style: { ...monoStyle, borderColor: COLORS.rule, backgroundColor: COLORS.card, color: COLORS.ink }, className: "w-full rounded-lg border-2 pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-2" })),
            React.createElement("div", { className: "flex flex-col gap-2 max-h-[32rem] overflow-y-auto" },
                filteredNotes.map((n) => (React.createElement("div", { key: n.id, className: "rounded-lg border p-3", style: { borderColor: COLORS.rule, backgroundColor: COLORS.card } }, confirmDeleteNoteId === n.id ? (React.createElement("div", { className: "flex flex-col gap-2" },
                    React.createElement("p", { style: { ...fontStyle, color: COLORS.ink }, className: "text-xs" },
                        "Delete \"",
                        n.title,
                        "\" permanently?"),
                    React.createElement("div", { className: "flex gap-2" },
                        React.createElement("button", { onClick: () => deleteNote(n.id), style: { backgroundColor: COLORS.red, ...fontStyle }, className: "flex-1 rounded-lg text-white text-xs font-bold py-2" }, "Yes, Delete"),
                        React.createElement("button", { onClick: () => setConfirmDeleteNoteId(null), style: { borderColor: COLORS.ink, color: COLORS.ink, ...fontStyle }, className: "flex-1 rounded-lg border-2 text-xs font-bold py-2" }, "Cancel")))) : (React.createElement("div", { className: "flex items-center justify-between gap-2" },
                    React.createElement("span", { style: { ...fontStyle, color: COLORS.ink }, className: "text-sm font-bold flex-1 truncate" }, n.title),
                    n.contentType === 'html' && (React.createElement("span", { style: { ...monoStyle, color: COLORS.ink, backgroundColor: COLORS.neutralBg }, className: "text-xs rounded-full px-2 py-0.5 shrink-0" }, "HTML")),
                    React.createElement("button", { onClick: () => { beginEditNote(n); setEditZoneLevel('noteEdit'); }, style: { color: COLORS.ink }, className: "p-1 shrink-0" },
                        React.createElement(Pencil, { size: 14 })),
                    React.createElement("button", { onClick: () => setConfirmDeleteNoteId(n.id), style: { color: COLORS.red }, className: "p-1 shrink-0" },
                        React.createElement(Trash2, { size: 14 }))))))),
                filteredNotes.length === 0 && (React.createElement("p", { style: { ...monoStyle, color: COLORS.inkFaint }, className: "text-xs text-center py-4" }, "No notes match.")))));
        // =====================================================================
        // SECTION: EDIT ZONE — NOTE EDIT  (search: SECTION: EDIT ZONE NOTE EDIT)
        // Title + Markdown body editor. Updates modifiedAt but leaves the note's
        // level/due schedule untouched — same "edit doesn't reset progress"
        // philosophy as card edits.
        // =====================================================================
    }
    else if (view === 'editZone' && editZoneLevel === 'noteEdit') {
        content = (React.createElement("div", { className: "flex flex-col gap-3" },
            React.createElement(BackHeader, { colors: COLORS, onBack: () => { cancelEditNote(); setEditZoneLevel('notes'); }, title: "Edit Note" }),
            React.createElement("input", { type: "text", value: editingNoteTitleDraft, onChange: (e) => setEditingNoteTitleDraft(e.target.value), style: { ...fontStyle, borderColor: COLORS.rule, backgroundColor: COLORS.card, color: COLORS.ink }, className: "w-full rounded-lg border-2 px-3 py-2 text-sm focus:outline-none focus:ring-2" }),
            React.createElement("textarea", { value: editingNoteBodyDraft, onChange: (e) => setEditingNoteBodyDraft(e.target.value), rows: 14, style: { ...monoStyle, borderColor: COLORS.rule, backgroundColor: COLORS.card, color: COLORS.ink }, className: "w-full rounded-lg border-2 p-3 text-xs leading-relaxed focus:outline-none focus:ring-2" }),
            React.createElement("div", { className: "flex gap-2" },
                React.createElement("button", { onClick: () => { saveEditNote(); setEditZoneLevel('notes'); }, style: { backgroundColor: COLORS.accent, ...fontStyle }, className: "flex-1 rounded-xl py-3 text-white font-bold" }, "Save"),
                React.createElement("button", { onClick: () => { cancelEditNote(); setEditZoneLevel('notes'); }, style: { borderColor: COLORS.ink, color: COLORS.ink, ...fontStyle }, className: "flex-1 rounded-xl border-2 py-3 font-bold" }, "Cancel"))));
        // =====================================================================
        // SECTION: EDIT ZONE — CARDS  (search: SECTION: EDIT ZONE CARDS)
        // Third level — cards inside one deck. Pencil opens the raw $/@ text
        // editor (see FUNCTION: IMPORT TEXT PARSER for the syntax rules).
        // =====================================================================
    }
    else if (view === 'editZone' && editZoneLevel === 'cards') {
        const zoneDeck = decks.find((d) => d.id === editZoneDeckId);
        const deckCardsHere = cards.filter((c) => c.deckId === editZoneDeckId);
        const q = editZoneQuery.trim().toLowerCase();
        const filteredCards = deckCardsHere.filter((c) => !q || c.question.toLowerCase().includes(q));
        content = (React.createElement("div", { className: "flex flex-col gap-3" },
            React.createElement(BackHeader, { colors: COLORS, onBack: () => { setEditZoneLevel('decks'); setEditZoneQuery(''); setEditingCardId(null); setConfirmDeleteCardId(null); }, title: zoneDeck ? zoneDeck.name : 'Cards' }),
            editZoneNotice && (React.createElement("div", { className: "rounded-lg border-2 px-3 py-2", style: { borderColor: COLORS.mustard, backgroundColor: COLORS.mustardBg } },
                React.createElement("span", { style: { ...monoStyle, color: COLORS.mustardText }, className: "text-xs" }, editZoneNotice))),
            React.createElement("div", { className: "relative" },
                React.createElement(Search, { size: 14, style: { color: COLORS.inkFaint }, className: "absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" }),
                React.createElement("input", { type: "text", value: editZoneQuery, onChange: (e) => setEditZoneQuery(e.target.value), placeholder: "Search cards\u2026", style: { ...monoStyle, borderColor: COLORS.rule, backgroundColor: COLORS.card, color: COLORS.ink }, className: "w-full rounded-lg border-2 pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-2" })),
            React.createElement("div", { className: "flex flex-col gap-3 max-h-[32rem] overflow-y-auto" },
                filteredCards.map((c, i) => (React.createElement("div", { key: c.id, className: "rounded-xl border-2 px-4 py-3", style: { borderColor: COLORS.rule, backgroundColor: COLORS.card } }, editingCardId === c.id ? (React.createElement("div", { className: "flex flex-col gap-2" },
                    React.createElement("textarea", { value: editingCardDraft, onChange: (e) => setEditingCardDraft(e.target.value), rows: 6, style: { ...monoStyle, borderColor: COLORS.rule, backgroundColor: COLORS.card, color: COLORS.ink }, className: "w-full rounded-lg border-2 p-2 text-xs focus:outline-none focus:ring-2" }),
                    editingCardError && (React.createElement("p", { style: { ...monoStyle, color: COLORS.red }, className: "text-xs" }, editingCardError)),
                    React.createElement("div", { className: "flex gap-2" },
                        React.createElement("button", { onClick: saveEditCard, style: { backgroundColor: COLORS.accent, ...fontStyle }, className: "flex-1 rounded-lg text-white text-xs font-bold py-2" }, "Save"),
                        React.createElement("button", { onClick: cancelEditCard, style: { borderColor: COLORS.ink, color: COLORS.ink, ...fontStyle }, className: "flex-1 rounded-lg border-2 text-xs font-bold py-2" }, "Cancel")))) : confirmDeleteCardId === c.id ? (React.createElement("div", { className: "flex flex-col gap-2" },
                    React.createElement("p", { style: { ...fontStyle, color: COLORS.ink }, className: "text-xs" }, "Delete this card permanently?"),
                    React.createElement("div", { className: "flex gap-2" },
                        React.createElement("button", { onClick: () => deleteSingleCard(c.id), style: { backgroundColor: COLORS.red, ...fontStyle }, className: "flex-1 rounded-lg text-white text-xs font-bold py-2" }, "Yes, Delete"),
                        React.createElement("button", { onClick: () => setConfirmDeleteCardId(null), style: { borderColor: COLORS.ink, color: COLORS.ink, ...fontStyle }, className: "flex-1 rounded-lg border-2 text-xs font-bold py-2" }, "Cancel")))) : (React.createElement(React.Fragment, null,
                    React.createElement("div", { className: "flex items-start justify-between gap-2" },
                        React.createElement("div", { style: { ...fontStyle, color: COLORS.ink }, className: "text-sm font-medium flex-1" },
                            React.createElement("span", { style: { ...monoStyle, color: COLORS.ink }, className: "mr-1" },
                                i + 1,
                                "."),
                            React.createElement(MathText, { text: c.question })),
                        React.createElement("div", { className: "flex gap-1 shrink-0" },
                            React.createElement("button", { onClick: () => beginEditCard(c), style: { color: COLORS.ink }, className: "p-1" },
                                React.createElement(Pencil, { size: 14 })),
                            React.createElement("button", { onClick: () => setConfirmDeleteCardId(c.id), style: { color: COLORS.red }, className: "p-1" },
                                React.createElement(Trash2, { size: 14 })))),
                    React.createElement(MathText, { text: c.correctAnswer, style: { ...fontStyle, color: COLORS.green }, className: "text-sm font-bold mt-1 block" }),
                    c.hint && (React.createElement("div", { style: { ...fontStyle, color: COLORS.mustard }, className: "text-xs mt-1 italic" },
                        "Hint: ",
                        React.createElement(MathText, { text: c.hint }))),
                    c.solution && (React.createElement("div", { style: { ...fontStyle, color: COLORS.solution }, className: "text-xs mt-1 italic" },
                        "Solution: ",
                        React.createElement(MathText, { text: c.solution })))))))),
                filteredCards.length === 0 && (React.createElement("p", { style: { ...monoStyle, color: COLORS.inkFaint }, className: "text-xs text-center py-4" }, "No cards match.")))));
        // =====================================================================
        // SECTION: PRACTICE MCQ SCREEN  (search: SECTION: PRACTICE MCQ SCREEN)
        // The question card, A/B/C/D options, hint reveal, cycle/round/allClear
        // checkpoint screens. Correct/wrong flash colors: COLORS.flashGreenBg /
        // COLORS.flashRedBg. Option spacing: the "gap-3" className below.
        // If the card has a #solution, a correct answer swaps the options block for
        // the solution + a "Continue" button (showSolutionReveal) instead of
        // auto-advancing — see FUNCTION: ANSWERING AN MCQ. During a Flashcards Race
        // (raceActive) this never happens — see handleOptionClick's raceActive branch —
        // and a countdown + "End Race" bar (EFFECT: RACE COUNTDOWN TIMER) sits above
        // everything else. cycleComplete/roundComplete are never reached during a race
        // (see handleRaceAdvance) — a race always lands on allClear directly.
        // =====================================================================
    }
    else if (view === 'practice') {
        if (phase === 'question' && currentCard) {
            const progress = cycleOrder.length ? (cardPos / cycleOrder.length) * 100 : 0;
            const raceUrgent = raceActive && raceSecondsLeft <= 10;
            content = (React.createElement("div", { className: "flex flex-col gap-4" },
                raceActive && (React.createElement("div", { className: "flex justify-between items-center rounded-xl border-2 px-3 py-2", style: { borderColor: raceUrgent ? COLORS.red : COLORS.ink, backgroundColor: raceUrgent ? COLORS.redBg : COLORS.card } },
                    React.createElement("span", { style: { ...monoStyle, color: raceUrgent ? COLORS.red : COLORS.ink }, className: "text-base font-bold tracking-widest" }, formatRaceTime(raceSecondsLeft)),
                    React.createElement("button", { onClick: endRace, style: { borderColor: COLORS.red, color: COLORS.red, ...fontStyle }, className: "rounded-lg border-2 px-3 py-1 text-xs font-bold" }, "End Race"))),
                React.createElement("div", { className: "flex justify-between items-center" },
                    React.createElement("button", { onClick: exitPractice, style: { color: COLORS.inkFaint }, className: "p-1" },
                        React.createElement(ChevronLeft, { size: 20 })),
                    React.createElement("div", { className: "text-center" },
                        React.createElement("div", { style: { ...monoStyle, color: COLORS.inkFaint }, className: "text-xs tracking-widest" },
                            sessionLabel ? `${sessionLabel.toUpperCase()} · ` : '',
                            raceActive
                                ? 'RACE'
                                : `CYCLE ${String(cycleIndex + 1).padStart(2, '0')}/${String(cycles.length).padStart(2, '0')}`,
                            " \u00B7 Q ",
                            cardPos + 1,
                            "/",
                            cycleOrder.length)),
                    currentCard.hint ? (React.createElement("button", { onClick: () => setShowHint((h) => !h), style: { color: COLORS.mustard }, className: "p-1" }, showHint ? React.createElement(EyeOff, { size: 20 }) : React.createElement(Eye, { size: 20 }))) : React.createElement("div", { style: { width: 28 } })),
                React.createElement("div", { className: "w-full h-1 rounded-full", style: { backgroundColor: COLORS.rule } },
                    React.createElement("div", { className: "h-1 rounded-full transition-all duration-300", style: { width: `${progress}%`, backgroundColor: COLORS.accent } })),
                React.createElement("div", { className: "rounded-2xl border-2 px-5 py-6", style: { borderColor: COLORS.ink, backgroundColor: COLORS.card } },
                    React.createElement(MathText, { text: currentCard.question, style: { ...fontStyle, color: COLORS.ink }, className: "text-base leading-relaxed font-medium block" }),
                    showHint && currentCard.hint && (React.createElement("div", { className: "mt-3 rounded-lg border border-dashed px-3 py-2 text-xs", style: { ...fontStyle, borderColor: COLORS.mustard, backgroundColor: COLORS.mustardBg, color: COLORS.mustardText, transform: 'rotate(-0.5deg)' } },
                        React.createElement(MathText, { text: currentCard.hint })))),
                showSolutionReveal ? (React.createElement("div", { className: "flex flex-col gap-3" },
                    React.createElement("div", { className: "rounded-xl border-2 px-4 py-3", style: { borderColor: COLORS.solution, backgroundColor: COLORS.solutionBg } },
                        React.createElement("div", { style: { ...monoStyle, color: COLORS.solutionText }, className: "text-xs uppercase tracking-widest mb-1" }, "Solution"),
                        React.createElement(MathText, { text: currentCard.solution, style: { ...fontStyle, color: COLORS.solutionText }, className: "text-sm leading-relaxed block" })),
                    React.createElement("button", { onClick: continueAfterSolution, style: { backgroundColor: COLORS.accent, ...fontStyle }, className: "w-full rounded-xl py-3 text-white font-bold tracking-wide" }, nextButtonLabel()))) : (React.createElement("div", { className: "flex flex-col gap-3" }, currentOptions.map((opt, i) => {
                    const isWrong = flashWrongIdx === i;
                    const isRight = flashCorrectIdx === i;
                    return (React.createElement("button", { key: i, onClick: () => handleOptionClick(i), disabled: flashCorrectIdx !== null || (raceActive && flashWrongIdx !== null), className: `w-full text-left rounded-xl border-2 px-4 py-3 flex items-center gap-3 transition-colors duration-150 focus:outline-none focus:ring-2 ${isWrong ? 'animate-shake' : ''}`, style: {
                            borderColor: isWrong ? COLORS.red : isRight ? COLORS.green : COLORS.ink,
                            backgroundColor: isWrong ? COLORS.flashRedBg : isRight ? COLORS.flashGreenBg : COLORS.card,
                        } },
                        React.createElement("span", { style: {
                                ...monoStyle,
                                borderColor: isWrong ? COLORS.red : isRight ? COLORS.green : COLORS.ink,
                                color: isWrong ? COLORS.red : isRight ? COLORS.green : COLORS.ink,
                            }, className: "w-7 h-7 shrink-0 rounded-full border-2 flex items-center justify-center text-xs font-bold" }, String.fromCharCode(65 + i)),
                        React.createElement(MathText, { text: opt.text, style: { ...fontStyle, color: COLORS.ink }, className: "text-sm" })));
                })))));
        }
        else if (phase === 'cycleComplete') {
            content = (React.createElement(StampScreen, { colors: COLORS, tone: "navy", title: `CYCLE ${String(cycleIndex + 1).padStart(2, '0')} CLEARED`, subtitle: missedSet.size > 0 ? `${missedSet.size} flagged for review so far` : 'clean run so far', buttonLabel: `Continue to Cycle ${cycleIndex + 2}`, onContinue: continueToNextCycle }));
        }
        else if (phase === 'roundComplete') {
            content = (React.createElement(StampScreen, { colors: COLORS, tone: "mustard", title: `ROUND ${roundNumber} COMPLETE`, subtitle: `${missedSet.size} card${missedSet.size !== 1 ? 's' : ''} flagged for review`, buttonLabel: "Start Review Round", onContinue: startReviewRound }));
        }
        else if (phase === 'allClear') {
            content = (React.createElement(SessionSummaryScreen, { colors: COLORS, cards: cards, sessionPoolIds: sessionPoolIds, sessionResults: sessionResults, sessionAffectsProgress: sessionAffectsProgress, raceMode: raceActive, onDone: exitPractice }));
        }
    }
    return (React.createElement("div", { style: { backgroundColor: COLORS.rule }, className: "w-full min-h-screen flex justify-center md:items-start md:py-10" },
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
        .done-bar { transition: transform 0.3s ease, opacity 0.3s ease; }
        @media (prefers-reduced-motion: reduce) {
          .animate-shake, .stamp-el { animation: none !important; }
          .done-bar { transition: none !important; }
        }
        .note-markdown { font-family: 'Roboto Slab', serif; color: ${COLORS.ink}; line-height: 1.6; }
        .note-markdown h1, .note-markdown h2, .note-markdown h3 {
          font-weight: 700; margin-top: 1.1em; margin-bottom: 0.4em; color: ${COLORS.ink};
        }
        .note-markdown h1 { font-size: 1.3em; }
        .note-markdown h2 { font-size: 1.15em; }
        .note-markdown h3 { font-size: 1.05em; }
        .note-markdown p { margin: 0.6em 0; }
        .note-markdown ul, .note-markdown ol { margin: 0.6em 0; padding-left: 1.4em; }
        .note-markdown li { margin: 0.25em 0; }
        .note-markdown strong { font-weight: 700; }
        .note-markdown em { font-style: italic; }
        .note-markdown blockquote {
          border-left: 3px solid ${COLORS.mustard}; margin: 0.7em 0; padding: 0.3em 0.9em;
          color: ${COLORS.inkFaint}; font-style: italic;
        }
        .note-markdown code {
          font-family: 'Space Mono', monospace; font-size: 0.9em; background: ${COLORS.neutralBg};
          padding: 0.1em 0.35em; border-radius: 4px;
        }
        .note-markdown pre {
          font-family: 'Space Mono', monospace; font-size: 0.85em; background: ${COLORS.neutralBg};
          padding: 0.8em; border-radius: 8px; overflow-x: auto; margin: 0.7em 0;
        }
        .note-markdown pre code { background: none; padding: 0; }
        .note-markdown a { color: ${COLORS.accent}; text-decoration: underline; }
        .note-markdown hr { border: none; border-top: 1px solid ${COLORS.rule}; margin: 1em 0; }
        .note-markdown table {
          display: block !important;
          max-width: 100%;
          overflow-x: auto !important;
          -webkit-overflow-scrolling: touch;
          border-collapse: collapse;
          margin: 0.7em 0;
          font-size: 0.9em;
          table-layout: auto;
          cursor: grab;
          scrollbar-width: none;
          -ms-overflow-style: none;
        }
        .note-markdown table::-webkit-scrollbar { height: 6px; }
        .note-markdown table::-webkit-scrollbar-track { background: transparent; }
        .note-markdown table::-webkit-scrollbar-thumb { background: transparent; border-radius: 3px; }
        .note-markdown table.fd-scrolling { scrollbar-width: thin; scrollbar-color: ${COLORS.inkFaint} transparent; }
        .note-markdown table.fd-scrolling::-webkit-scrollbar-thumb { background: ${COLORS.inkFaint}; }
        .note-markdown table.fd-dragging { cursor: grabbing; user-select: none; -webkit-user-select: none; }
        .note-markdown th, .note-markdown td {
          border: 1px solid ${COLORS.rule}; padding: 0.35em 0.6em;
          max-width: 350px; white-space: normal;
          /* Deliberately NO word-break/overflow-wrap: those make the browser treat a
             column's minimum width as a single character, which defeats the auto
             table-layout algorithm's "let it overflow" behavior — every column gets
             crushed to fit the screen instead. Without them, a column's floor is its
             longest whole word, so the table correctly overflows and scrolls once
             columns' natural widths exceed the screen, rather than mid-word wrapping. */
        }
        .note-markdown .katex-inline, .note-markdown .katex { color: ${COLORS.ink}; }
      `),
        React.createElement("div", { style: { backgroundColor: COLORS.paper, borderColor: COLORS.rule }, className: "w-full max-w-sm md:max-w-lg min-h-screen md:min-h-0 md:rounded-2xl md:border-2 md:shadow-2xl" },
            React.createElement("div", { className: "w-full max-w-sm mx-auto px-5 py-6" },
                React.createElement("div", { className: "flex items-center justify-between mb-5" },
                    React.createElement("span", { onClick: goHome, style: { fontFamily: "'Roboto Slab', serif", color: COLORS.ink, cursor: 'pointer' }, className: "text-lg font-bold tracking-tight" }, "Flashcard Drill"),
                    React.createElement("span", { style: { fontFamily: "'Space Mono', monospace", color: COLORS.inkFaint }, className: "text-xs" }, roundNumber > 1 && view === 'practice' ? `rd.${roundNumber}` : '')),
                content || (React.createElement("div", { className: "flex flex-col gap-3" },
                    React.createElement("p", { style: { ...fontStyle, color: COLORS.inkFaint }, className: "text-sm" }, "That screen isn't available anymore."),
                    React.createElement("button", { onClick: () => setView('home'), style: { backgroundColor: COLORS.accent, ...fontStyle }, className: "w-full rounded-xl py-3 text-white font-bold" }, "Back to Home")))))));
}
// ===== COMPONENT: MATH RENDERING (search: COMPONENT MATH RENDERING) =====
// MathText: drop-in replacement for showing raw question/answer/option text.
// Scans for [...] regions and renders them as real LaTeX via KaTeX; everything
// outside brackets is shown as plain text, unchanged. Used everywhere card
// text is displayed — practice questions/options, Flip, Sheet, Edit Zone.
// If KaTeX can't parse an expression (a typo in the LaTeX), it shows the
// broken bit in red instead of crashing — see throwOnError: false below.
function MathText({ text, className, style }) {
    const parts = React.useMemo(() => {
        if (!text)
            return [];
        const regions = findMathRegions(text);
        const out = [];
        let lastIndex = 0;
        let key = 0;
        regions.forEach((r) => {
            if (r.start > lastIndex) {
                out.push({ type: 'text', key: key++, value: text.slice(lastIndex, r.start) });
            }
            const inner = text.slice(r.start + 1, r.end - 1);
            let html;
            try {
                html = katex.renderToString(inner, { throwOnError: false, displayMode: false, output: 'html' });
            }
            catch (e) {
                html = text.slice(r.start, r.end);
            }
            out.push({ type: 'math', key: key++, html });
            lastIndex = r.end;
        });
        if (lastIndex < text.length)
            out.push({ type: 'text', key: key++, value: text.slice(lastIndex) });
        return out;
    }, [text]);
    return (React.createElement("span", { className: className, style: style }, parts.map((p) => p.type === 'math' ? (React.createElement("span", { key: p.key, className: "katex-inline", dangerouslySetInnerHTML: { __html: p.html } })) : (React.createElement(React.Fragment, { key: p.key }, p.value)))));
}
// NoteBody: renders a note's full Markdown+math content (see renderNoteHtml
// above). className/style style the wrapping container; the actual look of
// headings/lists/bold/etc comes from the .note-markdown CSS block injected
// once at the app root (search: SECTION: APP FRAME).
// Tables get extra JS wiring here (not doable in pure CSS): the scrollbar is
// hidden by default and only fades in while actively scrolling (.fd-scrolling,
// toggled off 700ms after the last scroll event), and click-drag-anywhere
// panning on desktop (mobile already gets native touch panning for free from
// overflow-x:auto). Dragging is skipped entirely when a table doesn't overflow,
// so normal text selection still works on tables that already fit.
function NoteBody({ text, className, style }) {
    const html = React.useMemo(() => renderNoteHtml(text), [text]);
    const containerRef = useRef(null);
    useEffect(() => {
        const container = containerRef.current;
        if (!container)
            return;
        const tables = Array.from(container.querySelectorAll('table'));
        const cleanups = [];
        tables.forEach((table) => {
            let isDown = false;
            let startX = 0;
            let startScrollLeft = 0;
            let hideTimer = null;
            const showScrollbar = () => {
                table.classList.add('fd-scrolling');
                if (hideTimer)
                    clearTimeout(hideTimer);
                hideTimer = setTimeout(() => table.classList.remove('fd-scrolling'), 700);
            };
            const onScroll = () => showScrollbar();
            const onMouseMove = (e) => {
                if (!isDown)
                    return;
                table.scrollLeft = startScrollLeft - (e.pageX - startX);
                e.preventDefault();
            };
            const endDrag = () => {
                if (!isDown)
                    return;
                isDown = false;
                table.classList.remove('fd-dragging');
            };
            const onMouseDown = (e) => {
                if (table.scrollWidth <= table.clientWidth)
                    return; // nothing to scroll — leave normal text selection alone
                isDown = true;
                startX = e.pageX;
                startScrollLeft = table.scrollLeft;
                table.classList.add('fd-dragging');
                e.preventDefault();
            };
            table.addEventListener('scroll', onScroll, { passive: true });
            table.addEventListener('mousedown', onMouseDown);
            window.addEventListener('mousemove', onMouseMove);
            window.addEventListener('mouseup', endDrag);
            cleanups.push(() => {
                table.removeEventListener('scroll', onScroll);
                table.removeEventListener('mousedown', onMouseDown);
                window.removeEventListener('mousemove', onMouseMove);
                window.removeEventListener('mouseup', endDrag);
                if (hideTimer)
                    clearTimeout(hideTimer);
            });
        });
        return () => cleanups.forEach((fn) => fn());
    }, [html]);
    return React.createElement("div", { ref: containerRef, className: `note-markdown ${className || ''}`, style: style, dangerouslySetInnerHTML: { __html: html } });
}
// HtmlNoteFrame: renders an imported .html note with real interactivity, sized
// to its OWN content height instead of a fixed box — so the app's page scrolls
// together with the note instead of a nested inner scrollbar. Requires
// allow-same-origin (alongside allow-scripts) so this component can measure
// the iframe's inner document height; a ResizeObserver keeps that height in
// sync live, since interacting with the note (e.g. expanding something) can
// change its height after the initial load.
function HtmlNoteFrame({ html }) {
    const iframeRef = useRef(null);
    const [height, setHeight] = useState(300);
    useEffect(() => {
        const iframe = iframeRef.current;
        if (!iframe)
            return;
        let observer;
        const attach = () => {
            try {
                const doc = iframe.contentWindow.document;
                const measure = () => setHeight(Math.max(doc.documentElement.scrollHeight, doc.body.scrollHeight));
                measure();
                observer = new iframe.contentWindow.ResizeObserver(measure);
                observer.observe(doc.body);
            }
            catch (e) {
                // Cross-origin or blocked — fall back to the default height above.
            }
        };
        iframe.addEventListener('load', attach);
        return () => {
            iframe.removeEventListener('load', attach);
            if (observer)
                observer.disconnect();
        };
    }, [html]);
    return (React.createElement("iframe", { ref: iframeRef, title: "note", srcDoc: html, sandbox: "allow-scripts allow-forms allow-same-origin", scrolling: "no", style: { width: '100%', height: height + 'px', border: 'none', display: 'block', backgroundColor: '#fff' } }));
}
function BackHeader({ onBack, title, colors: COLORS }) {
    return (React.createElement("div", { className: "flex items-center gap-2 mb-1" },
        React.createElement("button", { onClick: onBack, style: { color: COLORS.inkFaint }, className: "p-1" },
            React.createElement(ChevronLeft, { size: 20 })),
        React.createElement("span", { style: { fontFamily: "'Roboto Slab', serif", color: COLORS.ink }, className: "font-bold" }, title)));
}
// PracticeOrderSelect: the "Practice Order" dropdown — styled like the Notes sort
// dropdown (Deck > Notes). Used in three places: the Deck screen (deck-level,
// auto-saved to Drive via updateDeckPracticeOrder), and the Practice by Difficulty /
// Practice All entry screens (ephemeral raceOrderChoice, never saved — see SECTION:
// FLASHCARDS RACE ENTRY SCREENS). 'random' is the default everywhere it's used.
function PracticeOrderSelect({ colors: COLORS, fontStyle, value, onChange }) {
    return (React.createElement("select", { value: value, onChange: (e) => onChange(e.target.value), style: { ...fontStyle, borderColor: COLORS.rule, backgroundColor: COLORS.card, color: COLORS.ink }, className: "w-full rounded-lg border-2 px-2 py-2 text-xs focus:outline-none focus:ring-2" },
        React.createElement("option", { value: "random" }, "Random Order"),
        React.createElement("option", { value: "new" }, "New Cards First"),
        React.createElement("option", { value: "old" }, "Old Cards First"),
        React.createElement("option", { value: "difficult" }, "Difficult Cards First")));
}
function StampScreen({ tone, title, subtitle, buttonLabel, onContinue, colors: COLORS }) {
    const toneColor = tone === 'green' ? COLORS.green : tone === 'mustard' ? COLORS.mustard : COLORS.accent;
    const toneBg = tone === 'green' ? COLORS.greenBg : tone === 'mustard' ? COLORS.mustardBg : COLORS.neutralBg;
    return (React.createElement("div", { className: "flex flex-col items-center justify-center gap-6 py-16" },
        React.createElement("div", { className: "stamp-el rounded-lg px-6 py-5 text-center", style: { border: `4px double ${toneColor}`, backgroundColor: toneBg, transform: 'rotate(-4deg)' } },
            React.createElement("div", { style: { fontFamily: "'Roboto Slab', serif", color: toneColor }, className: "text-xl font-bold tracking-wide" }, title),
            React.createElement("div", { style: { fontFamily: "'Space Mono', monospace", color: toneColor }, className: "text-xs mt-1" }, subtitle)),
        React.createElement("button", { onClick: onContinue, style: { backgroundColor: toneColor, fontFamily: "'Roboto Slab', serif" }, className: "w-full max-w-xs rounded-xl py-3 text-white font-bold tracking-wide focus:outline-none focus:ring-2 focus:ring-offset-2" }, buttonLabel)));
}
// ===== SECTION: SESSION SUMMARY SCREEN (search: SECTION: SESSION SUMMARY) =====
// Shown in place of the old bare "ALL CLEAR" stamp once phase reaches 'allClear' (the
// session is genuinely done — no cards left flagged for review). Reads sessionPoolIds
// (every card id shown this session) + sessionResults (built in handleOptionClick,
// FUNCTION: ANSWERING AN MCQ) to show, per card, the time from when its question
// appeared to its final correct answer, plus which of the four difficulty tiers
// (Strong/Good/Weak/Incorrect — same tiers as Practice by Difficulty) it landed in.
// A card missing from sessionResults falls back to "Good" with a blank time rather
// than crashing the summary — UNLESS raceMode is true, in which case a missing result
// means the card was never reached before the race ended (time-up or "End Race") and
// it falls back to the 'neverReached' tier ("Never Fought") instead — see startRace's
// comment and endRace above for how a race gets here with cards unanswered.
//
// sessionAffectsProgress (passed straight through from the session that just ended)
// gates the "next reviews rescheduled" claim in the ALL CLEAR banner — only Review Due
// sessions actually reschedule anything; Practice All · MCQ, Practice by Difficulty,
// and Flashcards Race are all read-only, so the banner just states the card count for
// those (raceMode implies sessionAffectsProgress=false, but doesn't change the banner
// further — see startRace).
//
// raceMode swaps the tiers array for the Winners/Potential Winners/Losers/The Dead/
// Never Fought renaming (Strong/Good/Weak/Incorrect/neverReached under the hood —
// same keys, same colors for the first four) but changes nothing else: same sticky
// tile row, same filtering, same per-card layout, same Done button behavior.
//
// Interactivity: tapping a tier tile filters the list below to just that tier (tap
// again to clear); the tier tile row is `position: sticky` (own opaque background,
// pinned to the top of the screen while the list scrolls beneath it) — the ALL CLEAR
// banner is NOT sticky and scrolls away normally so the card list gets full page
// space. Each card row shows the correct answer directly under the question (always
// visible, not a toggle) plus independent hint/solution reveal toggle buttons (if the
// card has those fields) — useful for a card that graduated on the first try and
// therefore never paused on the in-practice solution screen (see FUNCTION: ANSWERING
// AN MCQ) — and, for Flashcards Race, the ONLY place Solution/Explanation is ever
// shown, since a race never pauses for it mid-session. Tier colors (tiles + per-card
// pills): Strong=green, Good=COLORS.incorrect, Weak=mustard, Incorrect=red — this
// mapping is shared with Practice by Difficulty's tiers array (SECTION: DIFFICULTY
// TIERS); the two are kept in sync deliberately, so edit both together if this ever
// changes. neverReached (race-only) uses inkFaint/neutralBg — deliberately muted,
// distinct from the other four.
//
// The Done button lives in a `position: fixed` bar pinned to the bottom of the
// screen (`.done-bar`, width-matched to the card column) instead of the in-flow
// page — a `useEffect` scroll listener compares each scroll event's window.scrollY
// against the previous one: scrolling down hides the bar, scrolling up (or being
// within 16px of the top) shows it, both via a CSS transform/opacity transition
// (`.done-bar` in the root style block) rather than unmounting, so it's always
// smooth. An `h-24` spacer after the card list reserves room so the fixed bar never
// covers the last card.
function SessionSummaryScreen({ colors: COLORS, cards, sessionPoolIds, sessionResults, sessionAffectsProgress, raceMode, onDone }) {
    const [filterTier, setFilterTier] = useState(null);
    const [openHints, setOpenHints] = useState(() => new Set());
    const [openSolutions, setOpenSolutions] = useState(() => new Set());
    const [doneVisible, setDoneVisible] = useState(true);
    const lastScrollYRef = useRef(0);
    useEffect(() => {
        lastScrollYRef.current = window.scrollY || 0;
        const handleScroll = () => {
            const currentY = window.scrollY || 0;
            const delta = currentY - lastScrollYRef.current;
            const atBottom = currentY + window.innerHeight >= document.documentElement.scrollHeight - 16;
            if (currentY <= 16 || atBottom) {
                setDoneVisible(true); // always show near the very top or bottom
            }
            else if (delta > 4) {
                setDoneVisible(false); // scrolling down -> hide
            }
            else if (delta < -4) {
                setDoneVisible(true); // scrolling up -> show
            }
            lastScrollYRef.current = currentY;
        };
        handleScroll(); // catch the case where the page loads already at/near the bottom
        window.addEventListener('scroll', handleScroll, { passive: true });
        window.addEventListener('resize', handleScroll, { passive: true });
        return () => {
            window.removeEventListener('scroll', handleScroll);
            window.removeEventListener('resize', handleScroll);
        };
    }, []);
    const toggleHint = (id) => setOpenHints((prev) => {
        const next = new Set(prev);
        if (next.has(id))
            next.delete(id);
        else
            next.add(id);
        return next;
    });
    const toggleSolution = (id) => setOpenSolutions((prev) => {
        const next = new Set(prev);
        if (next.has(id))
            next.delete(id);
        else
            next.add(id);
        return next;
    });
    const tiers = raceMode ? [
        { key: 'strong', label: 'Winners', color: COLORS.green, bg: COLORS.greenBg },
        { key: 'good', label: 'Potential Winners', color: COLORS.incorrect, bg: COLORS.incorrectBg },
        { key: 'weak', label: 'Losers', color: COLORS.mustard, bg: COLORS.mustardBg },
        { key: 'incorrect', label: 'The Dead', color: COLORS.red, bg: COLORS.redBg },
        { key: 'neverReached', label: 'Never Fought', color: COLORS.inkFaint, bg: COLORS.neutralBg },
    ] : [
        { key: 'strong', label: 'Strong Cards', color: COLORS.green, bg: COLORS.greenBg },
        { key: 'good', label: 'Good Cards', color: COLORS.incorrect, bg: COLORS.incorrectBg },
        { key: 'weak', label: 'Weak Cards', color: COLORS.mustard, bg: COLORS.mustardBg },
        { key: 'incorrect', label: 'Incorrect Cards', color: COLORS.red, bg: COLORS.redBg },
    ];
    const items = sessionPoolIds.map((id, index) => {
        const card = cards.find((c) => c.id === id);
        const result = sessionResults[id];
        return {
            id,
            index,
            question: card ? card.question : '(card no longer exists)',
            answer: card ? card.correctAnswer : null,
            hint: card ? card.hint : null,
            solution: card ? card.solution : null,
            elapsedSeconds: result ? result.elapsedSeconds : null,
            outcome: result && result.outcome ? result.outcome : (raceMode ? 'neverReached' : 'good'),
        };
    });
    const counts = {};
    tiers.forEach((t) => { counts[t.key] = 0; });
    items.forEach((it) => { counts[it.outcome] = (counts[it.outcome] || 0) + 1; });
    const visibleItems = filterTier ? items.filter((it) => it.outcome === filterTier) : items;
    return (React.createElement("div", { className: "flex flex-col gap-4 -mb-4" },
        React.createElement("div", { className: "flex flex-col items-center gap-1 pt-2" },
            React.createElement("div", { className: "stamp-el rounded-lg px-6 py-4 text-center", style: { border: `4px double ${COLORS.green}`, backgroundColor: COLORS.greenBg, transform: 'rotate(-4deg)' } },
                React.createElement("div", { style: { fontFamily: "'Roboto Slab', serif", color: COLORS.green }, className: "text-xl font-bold tracking-wide" }, "ALL CLEAR"),
                React.createElement("div", { style: { fontFamily: "'Space Mono', monospace", color: COLORS.green }, className: "text-xs mt-1" }, `${items.length} card${items.length !== 1 ? 's' : ''}${sessionAffectsProgress ? ' \u00B7 next reviews rescheduled' : ''}`))),
        React.createElement("div", { className: "sticky top-0 z-10 grid grid-cols-2 gap-2 py-2", style: { backgroundColor: COLORS.paper } }, tiers.map((t) => {
            const active = filterTier === t.key;
            const dimmed = !!filterTier && !active;
            return (React.createElement("button", { key: t.key, onClick: () => setFilterTier((prev) => (prev === t.key ? null : t.key)), className: "rounded-xl border-2 px-3 py-2 flex items-center justify-between transition-opacity", style: { borderColor: t.color, backgroundColor: t.bg, opacity: dimmed ? 0.4 : 1, boxShadow: active ? `0 0 0 2px ${t.color}` : 'none' } },
                React.createElement("span", { style: { fontFamily: "'Roboto Slab', serif", color: t.color }, className: "text-xs font-bold" }, t.label),
                React.createElement("span", { style: { fontFamily: "'Space Mono', monospace", color: t.color }, className: "text-sm font-bold" }, counts[t.key])));
        })),
        React.createElement("div", { style: { fontFamily: "'Space Mono', monospace", color: COLORS.inkFaint }, className: "text-xs uppercase tracking-widest" }, filterTier ? `Time per card \u00B7 ${tiers.find((t) => t.key === filterTier).label}` : "Time per card"),
        React.createElement("div", { className: "flex flex-col gap-2" }, visibleItems.map((it) => {
            const tier = tiers.find((t) => t.key === it.outcome) || tiers[1];
            return (React.createElement("div", { key: it.id, className: "rounded-xl border-2 px-4 py-3", style: { borderColor: COLORS.rule, backgroundColor: COLORS.card } },
                React.createElement("div", { className: "flex items-start justify-between gap-2" },
                    React.createElement("div", { style: { fontFamily: "'Roboto Slab', serif", color: COLORS.ink }, className: "text-sm font-medium flex-1" },
                        React.createElement("span", { style: { fontFamily: "'Space Mono', monospace", color: COLORS.ink }, className: "mr-1" },
                            it.index + 1,
                            "."),
                        React.createElement(MathText, { text: it.question })),
                    React.createElement("span", { style: { fontFamily: "'Space Mono', monospace", color: COLORS.inkFaint }, className: "text-xs shrink-0" }, it.elapsedSeconds != null ? `${it.elapsedSeconds.toFixed(1)}s` : '\u2014')),
                it.answer ? (React.createElement("div", { style: { fontFamily: "'Space Mono', monospace", color: COLORS.green }, className: "text-xs mt-1 pl-4" },
                    React.createElement("span", { className: "font-bold" }, "A: "),
                    React.createElement(MathText, { text: it.answer }))) : null,
                React.createElement("div", { className: "flex items-center gap-1.5 flex-wrap mt-1.5" },
                    React.createElement("span", { style: { fontFamily: "'Roboto Slab', serif", color: tier.color, backgroundColor: tier.bg }, className: "inline-block text-[10px] font-bold px-2 py-0.5 rounded-full" }, tier.label),
                    it.hint ? (React.createElement("button", { key: "hintBtn", onClick: () => toggleHint(it.id), style: { borderColor: COLORS.mustard, color: COLORS.mustard }, className: "inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border" },
                        openHints.has(it.id) ? React.createElement(EyeOff, { size: 10 }) : React.createElement(Eye, { size: 10 }),
                        "Hint")) : null,
                    it.solution ? (React.createElement("button", { key: "solutionBtn", onClick: () => toggleSolution(it.id), style: { borderColor: COLORS.solution, color: COLORS.solution }, className: "inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border" },
                        openSolutions.has(it.id) ? React.createElement(EyeOff, { size: 10 }) : React.createElement(Eye, { size: 10 }),
                        "Solution")) : null),
                openHints.has(it.id) && it.hint ? (React.createElement("div", { className: "mt-2 rounded-lg border border-dashed px-3 py-2 text-xs", style: { borderColor: COLORS.mustard, backgroundColor: COLORS.mustardBg, color: COLORS.mustardText } },
                    React.createElement(MathText, { text: it.hint }))) : null,
                openSolutions.has(it.id) && it.solution ? (React.createElement("div", { className: "mt-2 rounded-lg border-2 px-3 py-2 text-xs", style: { borderColor: COLORS.solution, backgroundColor: COLORS.solutionBg, color: COLORS.solutionText } },
                    React.createElement(MathText, { text: it.solution }))) : null));
        })),
        React.createElement("div", { className: "h-24", "aria-hidden": "true" }),
        React.createElement("div", { className: "fixed inset-x-0 bottom-0 z-20 flex justify-center pointer-events-none" },
            React.createElement("div", { className: "done-bar w-full max-w-sm md:max-w-lg pointer-events-auto", style: {
                    backgroundColor: COLORS.paper,
                    borderTop: `2px solid ${COLORS.rule}`,
                    transform: doneVisible ? 'translateY(0)' : 'translateY(150%)',
                    opacity: doneVisible ? 1 : 0,
                } },
                React.createElement("div", { className: "w-full max-w-sm mx-auto px-5 pt-3", style: { paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' } },
                    React.createElement("button", { onClick: onDone, style: { backgroundColor: COLORS.green, fontFamily: "'Roboto Slab', serif" }, className: "w-full rounded-xl py-3 text-white font-bold tracking-wide" }, "Done"))))));
}
