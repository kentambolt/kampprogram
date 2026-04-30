const FIXED_CONFIG = {
    teamBalanceWeight: 12,
    partnerBalanceWeight: 3,
    teammateLastPenalty: 10,
    teammatePrevPenalty: 6,
    opponentLastPenalty: 5,
    opponentPrevPenalty: 2.5,
    benchLastPenalty: 500,
    benchPrevPenalty: 120,
};


// Format is an integer N meaning "NvN" (N players per team).
// COURT_FORMAT_AUTO means "any enabled format" (the algorithm chooses).
const COURT_FORMAT_AUTO = 'auto';
const MAX_TEAM_SIZE = 11;


const state = {
    roster: [],
    history: [],
    lastResult: null,
    teams: [], // populated when team mode is enabled
};

const STORAGE_KEY = 'kampprogram-state-v2';

const PRESET_LISTS_STORAGE_KEY = 'kampprogram-playerlists-v1';

let toastTimer = null;

const el = {
    mainPage: document.getElementById('mainPage'),
    fetchPlayersPanel: document.getElementById('fetchPlayersPanel'),
    activePlayersTitle: document.getElementById('activePlayersTitle'),
    allPlayersTitle: document.getElementById('allPlayersTitle'),
    playerRosterArea: document.getElementById('playerRosterArea'),
    playerStatsArea: document.getElementById('playerStatsArea'),
    playerManagerListArea: document.getElementById('playerManagerListArea'),
    playersPanel: document.getElementById('playersPanel'),
    arrivalPanel: document.getElementById('arrivalPanel'),
    newPlayerPanel: document.getElementById('newPlayerPanel'),
    resultPanel: document.getElementById('resultPanel'),
    editResultBtn: document.getElementById('editResultBtn'),
    newPlayerBtn: document.getElementById('newPlayerBtn'),
    closeNewPlayerBtn: document.getElementById('closeNewPlayerBtn'),
    newPlayerName: document.getElementById('newPlayerName'),
    newPlayerLevel: document.getElementById('newPlayerLevel'),
    addPlayerBtn: document.getElementById('addPlayerBtn'),
    courtCount: document.getElementById('courtCount'),
    generateOverlay: document.getElementById('generateOverlay'),
    shuffleBtn: document.getElementById('shuffleBtn'),
    resultToggleBtn: document.getElementById('resultToggleBtn'),
    weightTeamBalance: document.getElementById('weightTeamBalance'),
    weightPartnerBalance: document.getElementById('weightPartnerBalance'),
    penaltyRepeatTeammate: document.getElementById('penaltyRepeatTeammate'),
    settingsBtn: document.getElementById('settingsBtn'),
    settingsPanel: document.getElementById('settingsPanel'),
    generateBtn: document.getElementById('generateBtn'),
    resetHistoryBtn: document.getElementById('resetHistoryBtn'),
    resetAllBtn: document.getElementById('resetAllBtn'),
    undoBtn: document.getElementById('undoBtn'),
    resultArea: document.getElementById('resultArea'),
    historyArea: document.getElementById('historyArea'),
    menuToggleBtn: document.getElementById('menuToggleBtn'),
    menuDropdown: document.getElementById('menuDropdown'),
    menuBackdrop: document.getElementById('menuBackdrop'),
    matchPanel: document.getElementById('matchPanel'),
    playerStatsPanel: document.getElementById('playerStatsPanel'),
    historyPanel: document.getElementById('historyPanel'),
    toast: document.getElementById('toast'),
    importExportBtn: document.getElementById('importExportBtn'),
    importExportPanel: document.getElementById('importExportPanel'),
    closeImportExportBtn: document.getElementById('closeImportExportBtn'),
    presetPlayerList: document.getElementById('presetPlayerList'),
    loadPresetPlayersBtn: document.getElementById('loadPresetPlayersBtn'),
    playerImportText: document.getElementById('playerImportText'),
    importPlayersBtn: document.getElementById('importPlayersBtn'),
    copyPlayersBtn: document.getElementById('copyPlayersBtn'),
    sessionTransferText: document.getElementById('sessionTransferText'),
    exportSessionBtn: document.getElementById('exportSessionBtn'),
    importSessionBtn: document.getElementById('importSessionBtn'),
    closeSettingsBtn: document.getElementById('closeSettingsBtn'),
    prefillArea: document.getElementById('prefillArea'),
    clearPrefillBtn: document.getElementById('clearPrefillBtn'),
    prefillPanel: document.getElementById('prefillPanel'),
    prefillToggleBtn: document.getElementById('prefillToggleBtn'),
    playerListsPanel: document.getElementById('playerListsPanel'),
    newPresetListName: document.getElementById('newPresetListName'),
    savePresetPlayersBtn: document.getElementById('savePresetPlayersBtn'),
    deletePresetPlayerList: document.getElementById('deletePresetPlayerList'),
    deletePresetPlayersBtn: document.getElementById('deletePresetPlayersBtn'),
    useSkillLevels: document.getElementById('useSkillLevels'),
    hideSkillLevels: document.getElementById('hideSkillLevels'),
    hideSkillLevelsRow: document.getElementById('hideSkillLevelsRow'),
    levelSettingsGroup: document.getElementById('levelSettingsGroup'),
    maximizeCourts: document.getElementById('maximizeCourts'),
    defaultCourtCount: document.getElementById('defaultCourtCount'),
    teamMode: document.getElementById('teamMode'),
    teamModeRow: document.getElementById('teamModeRow'),
    teamsPanel: document.getElementById('teamsPanel'),
    teamsArea: document.getElementById('teamsArea'),
    teamsTitle: document.getElementById('teamsTitle'),
    generateTeamsBtn: document.getElementById('generateTeamsBtn'),
    clearTeamsBtn: document.getElementById('clearTeamsBtn'),
    formatSizesGroup: document.getElementById('formatSizesGroup'),
    penaltyRepeatTeammateRow: document.getElementById('penaltyRepeatTeammateRow'),
    maximizeCourtsRow: document.getElementById('maximizeCourtsRow'),
};

function getEnabledFormats() {
    // Team mode forces 1v1 — each "player" is a whole team super-player.
    if (isTeamMode()) return [1];

    const formats = [];
    for (let n = 1; n <= MAX_TEAM_SIZE; n++) {
        if (document.getElementById(`format-${n}v${n}`)?.checked) {
            formats.push(n);
        }
    }
    return formats.length > 0 ? formats : [1]; // always at least 1v1
}

function isTeamMode() {
    return Boolean(el.teamMode?.checked);
}

// Read the user's enabled team-size formats directly from the checkboxes.
// (getEnabledFormats() returns [1] in team mode for the matchmaker, so we can't
// reuse it here.)
function getRawEnabledFormats() {
    const formats = [];
    for (let n = 1; n <= MAX_TEAM_SIZE; n++) {
        if (document.getElementById(`format-${n}v${n}`)?.checked) formats.push(n);
    }
    return formats;
}

// Pick the team size automatically from active player count, the enabled
// "Tilladte holdstørrelser" checkboxes, and the maximizeCourts setting.
// Mirrors comparePlanScore from the regular matchmaker:
//   - prefer plans that put the most players on the court (least benched)
//   - then prefer more or fewer matched courts depending on maximizeCourts
//   - then prefer larger team size as a tiebreaker
// Returns null if no enabled format yields at least two teams from the pool.
function deriveTeamSize(activeCount) {
    const enabled = getRawEnabledFormats();
    if (enabled.length === 0) return null;
    const maximize = el.maximizeCourts?.checked ?? true;

    let bestN = null;
    let bestKey = null;

    for (const n of enabled) {
        const numTeams = Math.floor(activeCount / n);
        if (numTeams < 2) continue;
        const usedPlayers = n * numTeams;
        const numCourts = Math.floor(numTeams / 2);
        const courtsKey = maximize ? numCourts : -numCourts;
        // Sort key: more usedPlayers > favoured court count > more teams > larger n
        const candidateKey = [usedPlayers, courtsKey, numTeams, n];
        if (!bestKey || compareKeyArrays(candidateKey, bestKey) > 0) {
            bestKey = candidateKey;
            bestN = n;
        }
    }
    return bestN;
}

function compareKeyArrays(a, b) {
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) return a[i] - b[i];
    }
    return 0;
}

// Returns the matchmaking pool: active teams in team mode, active players otherwise.
function getMatchmakingPool() {
    if (isTeamMode()) {
        return state.teams.filter(t => t.active !== false);
    }
    return getActivePlayers();
}

// Update settings UI when team mode is toggled. Team mode hides settings that
// don't apply (partner-repeat penalty, max-courts toggle, prefills) and shows
// the teams panel. The format-size checkboxes stay enabled in team mode — they
// drive the auto-derived team size.
function updateTeamModeUi() {
    const tm = isTeamMode();

    // Show/hide the teams panel
    const hasActiveCount = getActivePlayers().length;
    if (el.teamsPanel) {
        el.teamsPanel.classList.toggle('hidden', !tm || hasActiveCount === 0);
    }

    // Hide prefill panel in team mode (lock-individual-slot doesn't apply)
    if (el.prefillPanel) {
        el.prefillPanel.classList.toggle('hidden', tm);
    }

    // Task B: hide settings that don't apply in team mode.
    // (Their underlying values are preserved so toggling team mode off restores them.)
    if (el.penaltyRepeatTeammateRow) {
        el.penaltyRepeatTeammateRow.classList.toggle('hidden', tm);
    }
    if (el.maximizeCourtsRow) {
        el.maximizeCourtsRow.classList.toggle('hidden', tm);
    }

    updatePanelVisibility();
}

// Snake-draft team generation: distribute active players (sorted by level desc)
// across N teams in serpentine order so total team levels stay close.
// Team size is derived automatically from the enabled "Tilladte holdstørrelser"
// formats and the maximizeCourts setting.
function generateTeams() {
    const activePlayers = getActivePlayers();
    const teamSize = deriveTeamSize(activePlayers.length);

    if (!teamSize) {
        const enabled = getRawEnabledFormats();
        if (enabled.length === 0) {
            showStatusMessage('Vælg mindst én holdstørrelse i indstillingerne.');
        } else {
            const minNeeded = Math.min(...enabled) * 2;
            showStatusMessage(`Mindst ${minNeeded} aktive spillere kræves for to hold.`);
        }
        return;
    }

    const numTeams = Math.floor(activePlayers.length / teamSize);
    // Tiny shuffle first so equal-level players end up on varying teams
    const sorted = shuffle(activePlayers).slice().sort((a, b) => b.level - a.level);

    const buckets = Array.from({length: numTeams}, () => []);
    let dir = 1;
    let idx = 0;
    for (const player of sorted) {
        buckets[idx].push({name: player.name, level: player.level});
        idx += dir;
        if (idx === numTeams) { dir = -1; idx = numTeams - 1; }
        else if (idx === -1) { dir = 1; idx = 0; }
    }

    state.teams = buckets.map((members, i) => ({
        id: `team-${Date.now()}-${i + 1}`,
        name: `Hold ${i + 1}`,
        members,
        level: members.reduce((s, m) => s + m.level, 0),
        active: true,
    }));

    // Generated teams invalidate the prior history (the units changed).
    state.history = [];
    state.lastResult = null;
    setEditResultMode(false);

    renderTeams();
    renderRoster();
    renderHistory();
    renderPlayerStats();
    updateTeamModeUi();
    updatePanelVisibility();
    saveState();

    showStatusMessage(`${numTeams} hold er genereret.`);
}

function clearTeams() {
    if (state.teams.length === 0) return;
    const confirmed = window.confirm('Vil du nulstille alle hold? Historikken bliver også nulstillet.');
    if (!confirmed) return;

    state.teams = [];
    state.history = [];
    state.lastResult = null;
    setEditResultMode(false);

    renderTeams();
    renderHistory();
    renderPlayerStats();
    updateTeamModeUi();
    updatePanelVisibility();
    saveState();
    showStatusMessage('Holdene er nulstillet.');
}

function renderTeams() {
    if (!el.teamsArea) return;

    if (!state.teams || state.teams.length === 0) {
        el.teamsArea.innerHTML = '<div class="subtle">Ingen hold endnu. Klik "Lav hold" for at lave balancerede hold ud fra dine aktive spillere.</div>';
        if (el.teamsTitle) el.teamsTitle.textContent = 'Hold';
        return;
    }

    if (el.teamsTitle) el.teamsTitle.textContent = `Hold (${state.teams.length})`;

    el.teamsArea.innerHTML = state.teams.map((team) => {
        const totalLevelHtml = shouldShowLevels()
            ? `<span class="team-card-total">Total: ${team.level}</span>`
            : '';
        return `
            <div class="team-card">
                <div class="team-card-header">
                    <strong>${escapeHtml(team.name)}</strong>
                    ${totalLevelHtml}
                </div>
                <div class="team-card-members">
                    ${team.members.map(m => `
                        <div class="team-card-member">
                            <span>${escapeHtml(m.name)}</span>
                            ${shouldShowLevels() ? `<span class="level">${m.level}</span>` : ''}
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }).join('');
}

function getMaxEnabledFormat() {
    const formats = getEnabledFormats();
    return Math.max(...formats);
}

function formatLabel(n) {
    return `${n}v${n}`;
}

// Migrate old format string values ('single'/'double'/'both') to the new system.
function normalizePrefillFormat(format, enabledFormats) {
    if (format === 'both' || format === undefined || format === null) return COURT_FORMAT_AUTO;
    if (format === 'single') return '1';
    if (format === 'double') return '2';
    if (format === COURT_FORMAT_AUTO) return COURT_FORMAT_AUTO;
    const n = Number(format);
    if (!isNaN(n) && n >= 1 && n <= MAX_TEAM_SIZE) return String(n);
    return COURT_FORMAT_AUTO;
}

function createDefaultPrefills(courtCount) {
    return Array.from({length: courtCount}, () => ({
        format: COURT_FORMAT_AUTO,
        slots: {}
    }));
}

function normalizePlayer(player) {
    if (player && Array.isArray(player.members)) {
        // Team super-player: don't clamp level (sum can exceed 9), keep members.
        return {
            name: normalizeName(player.name),
            level: Number(player.level) || 0,
            active: player.active === undefined ? true : Boolean(player.active),
            members: player.members.map(m => ({
                name: normalizeName(m.name),
                level: Math.min(9, Math.max(1, Number(m.level) || 1)),
            })),
            id: player.id || `team-${Math.random().toString(36).slice(2, 8)}`,
        };
    }
    return {
        name: normalizeName(player.name),
        level: Math.min(9, Math.max(1, Number(player.level) || 1)),
        active: Boolean(player.active),
    };
}

function normalizeTeam(team) {
    if (!team || !Array.isArray(team.members)) return null;
    const members = team.members.map(m => ({
        name: normalizeName(m.name),
        level: Math.min(9, Math.max(1, Number(m.level) || 1)),
    }));
    return {
        id: team.id || `team-${Math.random().toString(36).slice(2, 8)}`,
        name: normalizeName(team.name) || 'Hold',
        members,
        level: members.reduce((s, m) => s + m.level, 0),
        active: team.active === undefined ? true : Boolean(team.active),
    };
}

function getLevelOptions(selectedLevel = 1) {
    return Array.from({length: 9}, (_, i) => i + 1)
        .map(level => `<option value="${level}" ${Number(selectedLevel) === level ? 'selected' : ''}>${level}</option>`)
        .join('');
}

function getPlayerSelectOptions(includeEmpty = true) {
    const options = [];
    if (includeEmpty) {
        options.push('<option value="">– Tom –</option>');
    }

    const activePlayers = getActivePlayers()
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name, 'da'));

    activePlayers.forEach(player => {
        const levelSuffix = shouldShowLevels() ? ` (${player.level})` : '';
        options.push(`<option value="${escapeHtml(player.name)}">${escapeHtml(player.name)}${levelSuffix}</option>`);
    });

    return options.join('');
}

function saveState() {
    const data = {
        roster: state.roster.map(normalizePlayer),
        history: state.history,
        lastResult: state.lastResult,
        teams: state.teams || [],
        ui: {
            courtCount: el.courtCount.value,
            weightTeamBalance: el.weightTeamBalance.checked,
            weightPartnerBalance: el.weightPartnerBalance.checked,
            penaltyRepeatTeammate: el.penaltyRepeatTeammate.checked,
            useSkillLevels: el.useSkillLevels?.checked ?? true,
            hideSkillLevels: el.hideSkillLevels?.checked ?? false,
            // saveState reads enabled formats raw from the checkboxes — not from
            // getEnabledFormats() which returns [1] in team mode, so we'd lose
            // the user's earlier selection.
            enabledFormats: (() => {
                const formats = [];
                for (let n = 1; n <= MAX_TEAM_SIZE; n++) {
                    if (document.getElementById(`format-${n}v${n}`)?.checked) formats.push(n);
                }
                return formats.length > 0 ? formats : [1, 2];
            })(),
            maximizeCourts: el.maximizeCourts?.checked ?? true,
            defaultCourtCount: el.defaultCourtCount?.value ?? '2',
            teamMode: el.teamMode?.checked ?? false,
            prefills: getPrefillStateFromUi(),
            collapsedPanels: {
                arrivalPanel: el.arrivalPanel?.classList.contains('collapsed') ?? true,
                fetchPlayersPanel: el.fetchPlayersPanel?.classList.contains('collapsed') ?? true,
                prefillPanel: el.prefillPanel?.classList.contains('collapsed') ?? true,
                resultPanel: el.resultPanel?.classList.contains('collapsed') ?? true,
                playerStatsPanel: el.playerStatsPanel?.classList.contains('collapsed') ?? true,
                historyPanel: el.historyPanel?.classList.contains('collapsed') ?? true,
                playerListsPanel: el.playerListsPanel?.classList.contains('collapsed') ?? true,
            }
        }
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function restoreState() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return false;

        const data = JSON.parse(raw);

        state.roster = Array.isArray(data.roster) ? data.roster.map(normalizePlayer) : [];
        state.history = Array.isArray(data.history) ? data.history.map(normalizeRoundFromStorage) : [];
        // Always make lastResult point at the same object as the final history
        // entry so edits to the current round are reflected in history (and used
        // when scoring the next round).
        state.lastResult = state.history[state.history.length - 1] || null;
        state.teams = Array.isArray(data.teams) ? data.teams.map(normalizeTeam) : [];

        if (data.ui) {
            const defaultCourts = data.ui.defaultCourtCount ?? '2';
            if (el.defaultCourtCount) el.defaultCourtCount.value = defaultCourts;
            el.courtCount.value = defaultCourts;
            el.weightTeamBalance.checked = Boolean(data.ui.weightTeamBalance);
            el.weightPartnerBalance.checked = Boolean(data.ui.weightPartnerBalance);
            el.penaltyRepeatTeammate.checked = Boolean(data.ui.penaltyRepeatTeammate);
            el.useSkillLevels.checked = data.ui.useSkillLevels ?? true;
            el.hideSkillLevels.checked = Boolean(data.ui.hideSkillLevels);
            updateSkillLevelSettingsUI();

            // Restore enabled formats (default: 1v1 and 2v2)
            const savedFormats = Array.isArray(data.ui.enabledFormats) ? data.ui.enabledFormats : [1, 2];
            for (let n = 1; n <= MAX_TEAM_SIZE; n++) {
                const cb = document.getElementById(`format-${n}v${n}`);
                if (cb) cb.checked = savedFormats.includes(n);
            }
            if (el.maximizeCourts) el.maximizeCourts.checked = data.ui.maximizeCourts ?? true;
            if (el.teamMode) el.teamMode.checked = Boolean(data.ui.teamMode);
        }
        // Panels default to collapsed when no saved value exists.
        const collapsedPanels = data.ui?.collapsedPanels || {};
        const setCollapsed = (panel, key) => {
            if (!panel) return;
            const collapsed = collapsedPanels[key] ?? true;
            panel.classList.toggle('collapsed', collapsed);
        };
        setCollapsed(el.playerListsPanel, 'playerListsPanel');
        setCollapsed(el.arrivalPanel, 'arrivalPanel');
        setCollapsed(el.fetchPlayersPanel, 'fetchPlayersPanel');
        setCollapsed(el.prefillPanel, 'prefillPanel');
        setCollapsed(el.resultPanel, 'resultPanel');
        setCollapsed(el.playerStatsPanel, 'playerStatsPanel');
        setCollapsed(el.historyPanel, 'historyPanel');

        renderPrefillArea(data.ui?.prefills || createDefaultPrefills(getCourtCount()));
        return state.roster.length > 0;
    } catch (error) {
        console.error('Kunne ikke gendanne state:', error);
        return false;
    }
}

function toggleCollapsiblePanel(panel) {
    if (!panel) return;
    panel.classList.toggle('collapsed');
    saveState();
}

function normalizeRoundFromStorage(round) {
    if (!round || !Array.isArray(round.courts)) {
        return {courts: [], benched: []};
    }

    return {
        ...round,
        courts: round.courts.map(court => ({
            ...court,
            format: normalizeCourtFormat(court.format) || inferCourtFormat(court),
            teamA: {
                ...court.teamA,
                players: Array.isArray(court.teamA?.players) ? court.teamA.players.map(normalizePlayerForRound) : [],
                totalLevel: Number(court.teamA?.totalLevel) || 0
            },
            teamB: {
                ...court.teamB,
                players: Array.isArray(court.teamB?.players) ? court.teamB.players.map(normalizePlayerForRound) : [],
                totalLevel: Number(court.teamB?.totalLevel) || 0
            },
            lockedSlots: court.lockedSlots || null
        })),
        benched: Array.isArray(round.benched) ? round.benched.map(normalizePlayerForRound) : []
    };
}

function normalizePlayerForRound(player) {
    if (player && Array.isArray(player.members)) {
        return {
            name: normalizeName(player.name),
            level: Number(player.level) || 0,
            active: true,
            members: player.members.map(m => ({
                name: normalizeName(m.name),
                level: Math.min(9, Math.max(1, Number(m.level) || 1)),
            })),
            id: player.id || `team-${Math.random().toString(36).slice(2, 8)}`,
        };
    }
    return {
        name: normalizeName(player.name),
        level: Math.min(9, Math.max(1, Number(player.level) || 1)),
        active: true,
    };
}

function clonePlayers(players) {
    return players.map(player => normalizePlayer(player));
}

function normalizeName(name) {
    return String(name || '').trim();
}

function getActivePlayers() {
    return state.roster.filter(player => player.active === true);
}

function getPlayers() {
    return state.roster;
}


function updateActivePlayersTitle() {
    const activePlayersCount = getActivePlayers().length;
    const totalPlayersCount = getPlayers().length;
    el.activePlayersTitle.textContent = `Aktive spillere (${activePlayersCount})`;
    el.allPlayersTitle.textContent = `Alle spillere (${totalPlayersCount})`;
}

function updateShuffleBtn() {
    if (el.shuffleBtn) el.shuffleBtn.disabled = state.history.length === 0;
}

function updatePanelVisibility() {
    const activePlayersCount = getActivePlayers().length;
    const hasHistory = state.history.length > 0;
    const tm = isTeamMode();
    const hasEnoughTeams = state.teams.length >= 2;

    // In team mode, the match panel needs at least 2 teams; otherwise 2 players.
    const canMatch = tm ? hasEnoughTeams : activePlayersCount >= 2;
    el.matchPanel.classList.toggle('hidden', !canMatch);

    el.playerStatsPanel.classList.toggle('hidden', !hasHistory);
    el.historyPanel.classList.toggle('hidden', !hasHistory);
    el.playerRosterArea.classList.toggle('hidden', activePlayersCount === 0);
    // resultPanel is now a collapsible sub-section inside matchPanel; show/hide it
    el.resultPanel.classList.toggle('hidden', !hasHistory);

    // Teams panel: only visible in team mode and with at least one active player
    if (el.teamsPanel) {
        el.teamsPanel.classList.toggle('hidden', !tm || activePlayersCount === 0);
    }
    // Hide prefill panel in team mode
    if (el.prefillPanel) {
        el.prefillPanel.classList.toggle('hidden', tm);
    }

    updateShuffleBtn();
}

// Collapse every major panel, then expand the result section so the
// freshly generated round is immediately visible.
function collapseAllAndShowResult() {
    const toCollapse = [
        el.arrivalPanel,
        el.fetchPlayersPanel,
        el.prefillPanel,
        el.playerStatsPanel,
        el.historyPanel,
        el.playerListsPanel,
    ];
    toCollapse.forEach(p => p?.classList.add('collapsed'));

    // Expand the result sub-panel
    el.resultPanel?.classList.remove('collapsed');
}

function showStatusMessage(message, duration = 2800) {
    if (toastTimer) {
        clearTimeout(toastTimer);
    }

    el.toast.textContent = message;
    el.toast.classList.add('show');

    toastTimer = setTimeout(() => {
        el.toast.classList.remove('show');
    }, duration);
}


function popNextEligiblePlayer(availablePlayers) {
    if (availablePlayers.length === 0) return null;
    return availablePlayers.pop();
}

function loadDefaults() {

    const restored = restoreState();
    if (!restored) {
        renderPrefillArea(createDefaultPrefills(getCourtCount()));
    }

    updateSkillLevelSettingsUI();
    updateTeamModeUi();
    renderStoredPlayerLists();
    renderRoster();
    renderPlayerManagerList();
    renderTeams();
    renderPlayerStats();
    renderHistory();
    updatePanelVisibility();

    if (state.lastResult && el.resultArea) {
        renderRound(state.lastResult);
    }
}

function getStoredPlayerLists() {
    try {
        const raw = localStorage.getItem(PRESET_LISTS_STORAGE_KEY);
        if (!raw) return {};

        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            return {};
        }

        const sanitized = {};

        Object.entries(parsed).forEach(([listName, players]) => {
            if (!listName || !Array.isArray(players)) return;

            try {
                const normalizedPlayers = players.map(normalizePlayer).map(player => ({
                    ...player,
                    active: false
                }));

                if (normalizedPlayers.length > 0) {
                    sanitized[listName] = normalizedPlayers;
                }
            } catch (error) {
                // spring ugyldige lister over
            }
        });

        return sanitized;
    } catch (error) {
        console.error('Kunne ikke læse gemte spillerlister:', error);
        return {};
    }
}

function saveStoredPlayerLists(lists) {
    localStorage.setItem(PRESET_LISTS_STORAGE_KEY, JSON.stringify(lists));
}

function renderStoredPlayerLists() {
    const lists = getStoredPlayerLists();
    const names = Object.keys(lists).sort((a, b) => a.localeCompare(b, 'da'));

    const options = [
        '<option value="">Vælg liste</option>',
        ...names.map(name => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`)
    ].join('');

    if (el.presetPlayerList) {
        el.presetPlayerList.innerHTML = options;
    }

    if (el.deletePresetPlayerList) {
        el.deletePresetPlayerList.innerHTML = options;
    }
}

function saveCurrentPlayersAsStoredList() {
    const listName = normalizeName(el.newPresetListName?.value);

    if (!listName) {
        showStatusMessage('Skriv et navn til spillerlisten.');
        return;
    }

    if (state.roster.length === 0) {
        showStatusMessage('Der er ingen spillere at gemme.');
        return;
    }

    const lists = getStoredPlayerLists();
    const existingName = Object.keys(lists).find(name => name.toLowerCase() === listName.toLowerCase());

    if (existingName) {
        const confirmed = window.confirm(`Spillerlisten "${existingName}" findes allerede. Vil du overskrive den?`);
        if (!confirmed) return;
    }

    lists[existingName || listName] = clonePlayers(state.roster).map(player => ({
        ...player,
        active: false
    }));

    saveStoredPlayerLists(lists);
    renderStoredPlayerLists();

    if (el.newPresetListName) {
        el.newPresetListName.value = '';
    }

    showStatusMessage(`Spillerlisten "${existingName || listName}" er gemt.`);
}

function loadPlayersFromStoredList(listName) {
    if (!listName) {
        showStatusMessage('Vælg først en spillerliste.');
        return;
    }

    const lists = getStoredPlayerLists();
    const players = lists[listName];

    if (!players || !Array.isArray(players) || players.length === 0) {
        showStatusMessage('Kunne ikke finde den valgte spillerliste.');
        renderStoredPlayerLists();
        return;
    }

    replaceRoster(players);
}

function deleteStoredPlayerList() {
    const listName = normalizeName(el.deletePresetPlayerList?.value);

    if (!listName) {
        showStatusMessage('Vælg først en spillerliste, der skal slettes.');
        return;
    }

    const confirmed = window.confirm(`Er du sikker på, at du vil slette spillerlisten "${listName}"?`);
    if (!confirmed) return;

    const lists = getStoredPlayerLists();
    delete lists[listName];
    saveStoredPlayerLists(lists);
    renderStoredPlayerLists();

    showStatusMessage(`Spillerlisten "${listName}" er slettet.`);
}

function getConfig() {
    const usingLevels = isUsingSkillLevels();
    return {
        teamBalanceWeight: (usingLevels && el.weightTeamBalance.checked) ? FIXED_CONFIG.teamBalanceWeight : 0,
        partnerBalanceWeight: (usingLevels && el.weightPartnerBalance.checked) ? FIXED_CONFIG.partnerBalanceWeight : 0,
        teammateLastPenalty: el.penaltyRepeatTeammate.checked ? FIXED_CONFIG.teammateLastPenalty : 0,
        teammatePrevPenalty: el.penaltyRepeatTeammate.checked ? FIXED_CONFIG.teammatePrevPenalty : 0,
        // New opponents and bench rotation are always prioritised — they're
        // baseline behaviour, not opt-in toggles.
        opponentLastPenalty: FIXED_CONFIG.opponentLastPenalty,
        opponentPrevPenalty: FIXED_CONFIG.opponentPrevPenalty,
        benchLastPenalty: FIXED_CONFIG.benchLastPenalty,
        benchPrevPenalty: FIXED_CONFIG.benchPrevPenalty,
    };
}

function isUsingSkillLevels() {
    return el.useSkillLevels?.checked ?? true;
}

function shouldShowLevels() {
    return isUsingSkillLevels() && !(el.hideSkillLevels?.checked ?? false);
}

function updateSkillLevelSettingsUI() {
    const using = isUsingSkillLevels();
    // Show or hide the "hide levels" sub-option
    el.hideSkillLevelsRow?.classList.toggle('settings-sub-row--hidden', !using);
    // Fully hide the level-balance settings when skill levels are off — they
    // only make sense alongside levels, so hiding (rather than dimming) keeps
    // the panel uncluttered.
    if (el.levelSettingsGroup) {
        el.levelSettingsGroup.classList.toggle('hidden', !using);
        el.levelSettingsGroup.querySelectorAll('input').forEach(input => {
            input.disabled = !using;
        });
    }
}

function getCourtCount() {
    return Math.max(1, Number(el.courtCount.value) || 1);
}

function shuffle(arr) {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
}

function pairKey(a, b) {
    return [a, b].sort().join('::');
}

function buildRelationMaps(round) {
    const teammatePairs = new Set();
    const opponentPairs = new Set();

    for (const court of round.courts) {
        const teamAPlayers = court.teamA.players || [];
        const teamBPlayers = court.teamB.players || [];

        // All within-team pairs (works for any team size)
        for (const team of [teamAPlayers, teamBPlayers]) {
            for (let i = 0; i < team.length; i++) {
                for (let j = i + 1; j < team.length; j++) {
                    teammatePairs.add(pairKey(team[i].name, team[j].name));
                }
            }
        }

        for (const a of teamAPlayers) {
            for (const b of teamBPlayers) {
                opponentPairs.add(pairKey(a.name, b.name));
            }
        }
    }

    return {
        teammatePairs,
        opponentPairs,
        benched: new Set(round.benched.map(player => player.name))
    };
}

// Returns the court format as an integer team size, or null if invalid.
function normalizeCourtFormat(format) {
    if (typeof format === 'number' && format >= 1) return format;
    return null;
}

// Returns the actual team size (integer) by counting players.
function inferCourtFormat(court) {
    const teamASize = court.teamA?.players?.length || 0;
    const teamBSize = court.teamB?.players?.length || 0;
    return Math.max(teamASize, teamBSize, 1);
}

function sumTeamLevel(players) {
    return players.reduce((sum, player) => sum + Number(player.level || 0), 0);
}

// teamSize is an integer; slotMap has keys A1..AN and B1..BN.
function createCourtFromSlots(teamSize, slotMap, lockedSlotsForCourt = null) {
    const teamAPlayers = [];
    const teamBPlayers = [];
    for (let i = 1; i <= teamSize; i++) {
        if (slotMap[`A${i}`]) teamAPlayers.push(slotMap[`A${i}`]);
        if (slotMap[`B${i}`]) teamBPlayers.push(slotMap[`B${i}`]);
    }

    return {
        format: teamSize,
        teamA: {
            players: teamAPlayers,
            totalLevel: sumTeamLevel(teamAPlayers)
        },
        teamB: {
            players: teamBPlayers,
            totalLevel: sumTeamLevel(teamBPlayers)
        },
        lockedSlots: lockedSlotsForCourt
    };
}

function renderPrefillArea(prefills) {
    const courtCount = getCourtCount();
    const enabledFormats = getEnabledFormats();
    const maxEnabled = getMaxEnabledFormat();

    // Normalise incoming prefills (handles old 'single'/'double'/'both' values)
    const safePrefills = (Array.isArray(prefills) ? prefills.slice(0, courtCount) : []).map(p => ({
        format: normalizePrefillFormat(p?.format, enabledFormats),
        slots: p?.slots || {}
    }));
    while (safePrefills.length < courtCount) {
        safePrefills.push({ format: COURT_FORMAT_AUTO, slots: {} });
    }

    const playerOptions = getPlayerSelectOptions(true);

    el.prefillArea.innerHTML = safePrefills.map((prefill, index) => {
        // How many slot rows to render: auto → max enabled, specific → that number
        const displaySize = prefill.format === COURT_FORMAT_AUTO ? maxEnabled : Number(prefill.format);

        // Build player slot selects for each side
        let aSlotsHtml = '';
        let bSlotsHtml = '';
        for (let i = 1; i <= displaySize; i++) {
            aSlotsHtml += `<select data-role="slot" data-slot="A${i}" data-court-index="${index}">${playerOptions}</select>`;
            bSlotsHtml += `<select data-role="slot" data-slot="B${i}" data-court-index="${index}">${playerOptions}</select>`;
        }

        // Format dropdown: "Automatisk" + each enabled size
        const formatOptions = [
            `<option value="${COURT_FORMAT_AUTO}" ${prefill.format === COURT_FORMAT_AUTO ? 'selected' : ''}>Automatisk</option>`,
            ...enabledFormats.map(n =>
                `<option value="${n}" ${String(n) === String(prefill.format) ? 'selected' : ''}>${formatLabel(n)}</option>`)
        ].join('');

        return `
            <div class="prefill-card" data-court-index="${index}">
                <div class="prefill-card-header">
                    <strong>Bane ${index + 1}</strong>
                    <div class="prefill-format">
                        <select id="prefill-format-${index}" class="prefill-format-select" data-role="format" data-court-index="${index}">
                            ${formatOptions}
                        </select>
                    </div>
                </div>
                <div class="prefill-grid">
                    <div class="prefill-side">${aSlotsHtml}</div>
                    <div class="prefill-vs">VS</div>
                    <div class="prefill-side">${bSlotsHtml}</div>
                </div>
            </div>
        `;
    }).join('');

    // Restore slot selections (only for rendered slots)
    safePrefills.forEach((prefill, index) => {
        const slots = prefill.slots || {};
        const displaySize = prefill.format === COURT_FORMAT_AUTO ? maxEnabled : Number(prefill.format);
        for (let i = 1; i <= displaySize; i++) {
            for (const side of ['A', 'B']) {
                const key = `${side}${i}`;
                const select = el.prefillArea.querySelector(`select[data-role="slot"][data-court-index="${index}"][data-slot="${key}"]`);
                if (select && slots[key]) select.value = slots[key];
            }
        }
    });
}

function getPrefillStateFromUi() {
    const courtCount = getCourtCount();
    const prefills = [];

    for (let courtIndex = 0; courtIndex < courtCount; courtIndex++) {
        const formatSelect = el.prefillArea.querySelector(`select[data-role="format"][data-court-index="${courtIndex}"]`);
        if (!formatSelect) continue;

        const slots = {};
        // Read all slot selects that are currently rendered for this court
        el.prefillArea.querySelectorAll(`select[data-role="slot"][data-court-index="${courtIndex}"]`).forEach(select => {
            const slotKey = select.dataset.slot;
            const val = normalizeName(select.value);
            if (val) slots[slotKey] = val;
        });

        prefills.push({ format: formatSelect.value, slots });
    }

    return prefills;
}


// Returns which team sizes (integers) are actually playable on this court,
// given its locked slots and the globally enabled formats.
function getPossibleFormatsForPrefill(prefill, enabledFormats) {
    const slots = prefill.slots || {};

    // Find the highest locked slot index on either side (determines minimum team size)
    let minRequired = 0;
    for (let i = 1; i <= MAX_TEAM_SIZE; i++) {
        if (slots[`A${i}`] || slots[`B${i}`]) minRequired = i;
    }

    // Court's configured max: 'auto' means no cap
    const maxAllowed = prefill.format === COURT_FORMAT_AUTO
        ? MAX_TEAM_SIZE
        : Number(prefill.format);

    const result = [];
    for (const n of enabledFormats) {
        if (n < minRequired) continue; // locked player in a higher slot → can't shrink
        if (n > maxAllowed) continue;  // exceeds this court's configured maximum
        result.push(n);
    }

    // Court can be left empty only if no slots are locked
    if (minRequired === 0) result.push('unused');

    return result;
}

// How many players must be drawn from the pool to fill a court at teamSize N.
function getNeededPlayersForFormat(prefill, teamSize) {
    const slots = prefill.slots || {};
    let needed = teamSize * 2;
    for (let i = 1; i <= teamSize; i++) {
        if (slots[`A${i}`]) needed--;
        if (slots[`B${i}`]) needed--;
    }
    return Math.max(0, needed);
}

// Compares two plan score keys [usedFromPool, usedCourts, totalTeamSize].
// Returns positive if candidate is better than best.
function comparePlanScore(candidateKey, bestKey) {
    if (!bestKey) return 1;

    // Always prefer more players on court
    if (candidateKey[0] !== bestKey[0]) return candidateKey[0] - bestKey[0];

    // Court count preference: maximise or minimise based on setting
    if (candidateKey[1] !== bestKey[1]) {
        const maximize = el.maximizeCourts?.checked ?? true;
        return maximize ? (candidateKey[1] - bestKey[1]) : (bestKey[1] - candidateKey[1]);
    }

    // Tiebreaker: prefer larger total team size (better use of court capacity)
    return candidateKey[2] - bestKey[2];
}

function chooseCourtFormats(prefills, availableCount) {
    const enabledFormats = getEnabledFormats();
    let bestPlan = null;
    let bestKey = null;

    function backtrack(index, remainingPlayers, currentPlan, stats) {
        if (index >= prefills.length) {
            const candidateKey = [stats.usedFromPool, stats.usedCourts, stats.totalTeamSize];
            if (comparePlanScore(candidateKey, bestKey) > 0) {
                bestKey = candidateKey;
                bestPlan = [...currentPlan];
            }
            return;
        }

        const prefill = prefills[index];
        const possibleFormats = getPossibleFormatsForPrefill(prefill, enabledFormats);

        for (const teamSize of possibleFormats) {
            if (teamSize === 'unused') continue;
            const needed = getNeededPlayersForFormat(prefill, teamSize);
            if (needed > remainingPlayers) continue;

            currentPlan.push(teamSize);
            backtrack(index + 1, remainingPlayers - needed, currentPlan, {
                usedFromPool: stats.usedFromPool + needed,
                usedCourts: stats.usedCourts + 1,
                totalTeamSize: stats.totalTeamSize + teamSize
            });
            currentPlan.pop();
        }

        if (possibleFormats.includes('unused')) {
            currentPlan.push('unused');
            backtrack(index + 1, remainingPlayers, currentPlan, {...stats});
            currentPlan.pop();
        }
    }

    backtrack(0, availableCount, [], { usedFromPool: 0, usedCourts: 0, totalTeamSize: 0 });
    return bestPlan;
}

// Fills a court's slots for a given teamSize, drawing unlocked players from the pool.
function fillCourtSlots(prefill, teamSize, availablePlayers) {
    const slotMap = {};

    // Copy pre-locked player objects into the slot map
    for (let i = 1; i <= teamSize; i++) {
        slotMap[`A${i}`] = prefill.slots?.[`A${i}`] || null;
        slotMap[`B${i}`] = prefill.slots?.[`B${i}`] || null;
    }

    // Draw from pool to fill remaining slots (A first, then B, slot by slot)
    for (let i = 1; i <= teamSize; i++) {
        if (!slotMap[`A${i}`]) {
            const player = popNextEligiblePlayer(availablePlayers);
            if (!player) throw new Error('Ikke nok spillere til at udfylde den valgte præudfyldning.');
            slotMap[`A${i}`] = player;
        }
        if (!slotMap[`B${i}`]) {
            const player = popNextEligiblePlayer(availablePlayers);
            if (!player) throw new Error('Ikke nok spillere til at udfylde den valgte præudfyldning.');
            slotMap[`B${i}`] = player;
        }
    }

    // Collect locked slots (by name, for the court record)
    const lockedSlots = {};
    for (let i = 1; i <= teamSize; i++) {
        if (prefill.slots?.[`A${i}`]) lockedSlots[`A${i}`] = prefill.slots[`A${i}`];
        if (prefill.slots?.[`B${i}`]) lockedSlots[`B${i}`] = prefill.slots[`B${i}`];
    }

    return createCourtFromSlots(teamSize, slotMap, lockedSlots);
}

function createRandomRound(players, courtCount, prefills) {
    const prefillsForCourts = prefills.slice(0, courtCount);
    while (prefillsForCourts.length < courtCount) {
        prefillsForCourts.push({ format: COURT_FORMAT_AUTO, slots: {} });
    }

    const lockedNames = new Set();
    prefillsForCourts.forEach(prefill => {
        Object.values(prefill.slots).forEach(name => {
            if (name) lockedNames.add(name);
        });
    });

    const lockedPlayers = [];
    const unlockedPlayers = [];

    players.forEach(player => {
        if (lockedNames.has(player.name)) {
            lockedPlayers.push(player);
        } else {
            unlockedPlayers.push(player);
        }
    });

    const playerMap = new Map(players.map(player => [player.name, player]));
    const availablePool = shuffle(unlockedPlayers);
    const chosenPlan = chooseCourtFormats(prefillsForCourts, availablePool.length);

    if (!chosenPlan) {
        throw new Error('Kunne ikke finde en gyldig holdsammensætning ud fra de valgte låsninger og tilladte formater.');
    }

    const courts = [];

    for (let i = 0; i < chosenPlan.length; i++) {
        const teamSize = chosenPlan[i];
        if (teamSize === 'unused') continue;

        const prefill = prefillsForCourts[i];
        const filledCourt = fillCourtSlots(
            {
                ...prefill,
                // Convert player-name strings in slots → player objects
                slots: Object.fromEntries(
                    Object.entries(prefill.slots).map(([slotKey, playerName]) => [
                        slotKey,
                        playerName ? playerMap.get(playerName) || null : null
                    ])
                )
            },
            teamSize,
            availablePool
        );

        courts.push(filledCourt);
    }

    const usedPlayerNames = new Set();
    courts.forEach(court => {
        [...court.teamA.players, ...court.teamB.players].forEach(player => {
            usedPlayerNames.add(player.name);
        });
    });

    const benched = players.filter(player => !usedPlayerNames.has(player.name));

    return {courts, benched};
}

function scoreBenchRotation(round, history, config) {
    let scoreDelta = 0;
    const lastRound = history[history.length - 1] || null;
    const prevRound = history[history.length - 2] || null;
    const lastBenched = new Set(lastRound ? lastRound.benched.map(player => player.name) : []);
    const prevBenched = new Set(prevRound ? prevRound.benched.map(player => player.name) : []);

    for (const player of round.benched) {
        if (lastBenched.has(player.name)) {
            scoreDelta -= config.benchLastPenalty;
        }

        if (prevBenched.has(player.name)) {
            scoreDelta -= config.benchPrevPenalty;
        }
    }

    return scoreDelta;
}


function scoreRound(round, history, config) {
    let score = 0;

    const lastRound = history[history.length - 1] || null;
    const prevRound = history[history.length - 2] || null;
    const lastMaps = lastRound ? buildRelationMaps(lastRound) : null;
    const prevMaps = prevRound ? buildRelationMaps(prevRound) : null;

    for (const court of round.courts) {
        const teamAPlayers = court.teamA.players;
        const teamBPlayers = court.teamB.players;

        // Team-level balance (total level difference between sides)
        const sumA = court.teamA.totalLevel;
        const sumB = court.teamB.totalLevel;
        score -= Math.abs(sumA - sumB) * config.teamBalanceWeight;

        // Partner-level balance (level spread within each team, generalised for N players)
        if (teamAPlayers.length > 1) {
            const spreadA = Math.max(...teamAPlayers.map(p => p.level)) - Math.min(...teamAPlayers.map(p => p.level));
            const spreadB = Math.max(...teamBPlayers.map(p => p.level)) - Math.min(...teamBPlayers.map(p => p.level));
            score -= (spreadA + spreadB) * config.partnerBalanceWeight;
        }

        // Teammate-pair penalties (all within-team combinations)
        for (const team of [teamAPlayers, teamBPlayers]) {
            for (let i = 0; i < team.length; i++) {
                for (let j = i + 1; j < team.length; j++) {
                    const key = pairKey(team[i].name, team[j].name);
                    if (lastMaps?.teammatePairs.has(key)) score -= config.teammateLastPenalty;
                    if (prevMaps?.teammatePairs.has(key)) score -= config.teammatePrevPenalty;
                }
            }
        }

        // Opponent-pair penalties (all cross-team combinations)
        for (const a of teamAPlayers) {
            for (const b of teamBPlayers) {
                const key = pairKey(a.name, b.name);
                if (lastMaps?.opponentPairs.has(key)) score -= config.opponentLastPenalty;
                if (prevMaps?.opponentPairs.has(key)) score -= config.opponentPrevPenalty;
            }
        }
    }

    score += scoreBenchRotation(round, history, config);
    return score;
}

// Runs as many iterations as possible within `durationMs` milliseconds,
// yielding to the browser periodically so the UI (spinner) stays responsive.
function findBestRoundAsync(players, courtCount, history, config, prefills, durationMs = 1000) {
    return new Promise(resolve => {
        let best = null;
        let iteration = 0;
        const deadline = performance.now() + durationMs;
        const CHUNK_SIZE = 50; // iterations per chunk before yielding

        function runChunk() {
            const chunkEnd = performance.now() + 8; // yield after ~8 ms per chunk
            while (performance.now() < chunkEnd && performance.now() < deadline) {
                try {
                    const round = createRandomRound(players, courtCount, prefills);
                    const score = scoreRound(round, history, config);
                    const candidate = {...round, score, iteration: ++iteration};
                    if (!best || candidate.score > best.score) {
                        best = candidate;
                    }
                } catch (_) {
                    // skip invalid iterations
                }
            }

            if (performance.now() < deadline) {
                setTimeout(runChunk, 0); // yield to browser, then continue
            } else {
                resolve(best);
            }
        }

        setTimeout(runChunk, 0);
    });
}

// Returns true if the round entry (player or team super-player) contains
// the given player name. Handles both normal players and team super-players.
function entryContainsPlayer(entry, playerName) {
    if (!entry) return false;
    if (entry.members) return entry.members.some(m => m.name === playerName);
    return entry.name === playerName;
}

function getPlayerStats() {
    return state.roster.filter(player => player.active).map(player => {
        let played = 0;
        let benched = 0;
        let benchedLast = false;
        let benchedPrev = false;

        state.history.forEach((round, index) => {
            const onBench = round.benched.some(p => entryContainsPlayer(p, player.name));
            const courtPlayed = round.courts.find(court =>
                [...court.teamA.players, ...court.teamB.players].some(p => entryContainsPlayer(p, player.name))
            );

            if (onBench) benched += 1;
            if (courtPlayed) played += 1;

            if (index === state.history.length - 1) benchedLast = onBench;
            if (index === state.history.length - 2) benchedPrev = onBench;
        });

        return {
            ...player,
            played,
            benched,
            benchedLast,
            benchedPrev
        };
    });
}

function renderRoster() {
    const activePlayers = getActivePlayers();
    updateActivePlayersTitle();
    updatePanelVisibility();

    if (activePlayers.length === 0) {
        el.playerRosterArea.innerHTML = '<span class="muted">Ingen aktive spillere</span>';
        return;
    }

    el.playerRosterArea.innerHTML = activePlayers
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name, 'da'))
        .map(player => {
            const index = state.roster.findIndex(p => p.name === player.name);

            return `
            <button class="player-chip" type="button" onclick="removePlayer(${index})" title="Klik for at sætte spilleren som inaktiv">
                ${escapeHtml(player.name)}
                ${shouldShowLevels() ? `<span class="lowered">${player.level}</span>` : ''}
            </button>
        `;
        }).join('');

    renderPrefillArea(getPrefillStateFromUi());
}

function renderPlayerManagerList() {
    const players = state.roster
        .slice()
        .sort((a, b) => {
            return a.name.localeCompare(b.name, 'da');
        });

    if (players.length === 0) {
        el.playerManagerListArea.innerHTML = '<div class="subtle">Ingen spillere endnu.</div>';
        return;
    }

    const hiding = isUsingSkillLevels() && !shouldShowLevels();

    el.playerManagerListArea.innerHTML = players.map(player => {
        const index = state.roster.findIndex(p => p.name === player.name);

        let levelControls;
        if (!isUsingSkillLevels()) {
            // Skill levels feature is off entirely — no level UI at all
            levelControls = '';
        } else if (hiding) {
            // Levels are hidden — show a reveal toggle button; level select starts hidden
            levelControls = `
                <div class="player-row-inline-controls">
                    <button class="level-reveal-btn" onclick="togglePlayerLevelReveal(this, ${index})" title="Vis/skjul niveau">👁 Niveau</button>
                    <div class="level-reveal-area">
                        <select class="level-select" data-player-level-index="${index}">
                            ${getLevelOptions(player.level)}
                        </select>
                    </div>
                </div>`;
        } else {
            // Levels visible — show select directly
            levelControls = `
                <div class="player-row-inline-controls">
                    <select class="level-select" data-player-level-index="${index}">
                        ${getLevelOptions(player.level)}
                    </select>
                </div>`;
        }

        return `
            <div class="player-row ${player.active ? 'is-active' : 'is-inactive'}">
                <div class="player-row-main compact-player-row">
                    <button class="player-row-name" onclick="${player.active ? `removePlayer(${index})` : `markArrived(${index})`}">
                        <strong>${escapeHtml(player.name)}</strong>
                    </button>
                    ${levelControls}
                </div>
            </div>
        `;
    }).join('');
}

function togglePlayerLevelReveal(btn, index) {
    const area = btn.closest('.player-row-inline-controls').querySelector('.level-reveal-area');
    const isVisible = area.classList.toggle('level-reveal-area--open');
    btn.textContent = isVisible ? '▲ Skjul' : '👁 Niveau';
    btn.title = isVisible ? 'Skjul niveau' : 'Vis niveau';
}

function renderPlayerStats() {
    const stats = getPlayerStats();

    if (state.history.length === 0) {
        el.playerStatsArea.innerHTML = '<div class="subtle">Ingen data endnu.</div>';
        updatePanelVisibility();
        return;
    }

    el.playerStatsArea.innerHTML = `
        <table class="mini-table">
            <thead>
                <tr>
                    <th>Spiller</th>
                    <th class="center">Spillet</th>
                    <th class="center">Siddet over</th>
                    <th class="center">Seneste bænk</th>
                </tr>
            </thead>
            <tbody>
                ${stats.map(player => `
                    <tr>
                        <td>
                            ${escapeHtml(player.name)}
                        </td>
                        <td class="center">${player.played}</td>
                        <td class="center">${player.benched}</td>
                        <td class="center">
                            ${player.benchedLast ? 'Sidst' : (player.benchedPrev ? 'Forrige' : '')}
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;

    updatePanelVisibility();
}

// Edit mode for the current/last round — allows the coach to swap players
// after generation (e.g., someone left, two players didn't want to play together).
let editingResult = false;

function isResultEditable() {
    return Boolean(state.lastResult && state.lastResult.courts.length > 0);
}

function setEditResultMode(enabled) {
    editingResult = Boolean(enabled) && isResultEditable();
    if (el.editResultBtn) {
        el.editResultBtn.textContent = editingResult ? '✓ Færdig' : '✎ Rediger';
        el.editResultBtn.classList.toggle('is-active', editingResult);
    }
    if (state.lastResult) renderRound(state.lastResult);
}

function toggleEditResultMode() {
    if (!isResultEditable()) return;
    setEditResultMode(!editingResult);
}

// Builds <select> options listing every entrant currently in the round —
// players (or teams) on courts and on the bench. Used to swap one entrant
// with another by re-selecting from the dropdown.
function buildResultSlotSelectHtml(round, currentName, courtIndex, side, slotIndex) {
    const entries = [];
    round.courts.forEach((court) => {
        court.teamA.players.forEach((p) => entries.push(p));
        court.teamB.players.forEach((p) => entries.push(p));
    });
    round.benched.forEach((p) => entries.push(p));

    // De-duplicate by name (defensive)
    const seen = new Set();
    const optionsHtml = entries.filter(p => {
        if (seen.has(p.name)) return false;
        seen.add(p.name);
        return true;
    }).map(p => {
        const isTeam = Boolean(p.members);
        const label = isTeam
            ? p.name
            : `${p.name}${shouldShowLevels() ? ` (${p.level})` : ''}`;
        return `<option value="${escapeHtml(p.name)}" ${p.name === currentName ? 'selected' : ''}>${escapeHtml(label)}</option>`;
    }).join('');

    return `<select class="result-slot-select" data-result-court="${courtIndex}" data-result-side="${side}" data-result-index="${slotIndex}">${optionsHtml}</select>`;
}

function findResultSlotByName(round, playerName) {
    for (let c = 0; c < round.courts.length; c++) {
        const court = round.courts[c];
        for (let i = 0; i < court.teamA.players.length; i++) {
            if (court.teamA.players[i].name === playerName) {
                return {kind: 'court', courtIndex: c, side: 'A', slotIndex: i};
            }
        }
        for (let i = 0; i < court.teamB.players.length; i++) {
            if (court.teamB.players[i].name === playerName) {
                return {kind: 'court', courtIndex: c, side: 'B', slotIndex: i};
            }
        }
    }
    for (let i = 0; i < round.benched.length; i++) {
        if (round.benched[i].name === playerName) {
            return {kind: 'bench', slotIndex: i};
        }
    }
    return null;
}

function getResultSlotEntry(round, loc) {
    if (loc.kind === 'court') {
        const team = loc.side === 'A' ? 'teamA' : 'teamB';
        return round.courts[loc.courtIndex][team].players[loc.slotIndex];
    }
    return round.benched[loc.slotIndex];
}

function setResultSlotEntry(round, loc, entry) {
    if (loc.kind === 'court') {
        const team = loc.side === 'A' ? 'teamA' : 'teamB';
        round.courts[loc.courtIndex][team].players[loc.slotIndex] = entry;
    } else {
        round.benched[loc.slotIndex] = entry;
    }
}

function recomputeCourtTotals(round, courtIndex) {
    if (courtIndex < 0 || courtIndex >= round.courts.length) return;
    const court = round.courts[courtIndex];
    court.teamA.totalLevel = sumTeamLevel(court.teamA.players);
    court.teamB.totalLevel = sumTeamLevel(court.teamB.players);
}

function locationsEqual(a, b) {
    if (!a || !b) return false;
    if (a.kind !== b.kind) return false;
    if (a.kind === 'court') {
        return a.courtIndex === b.courtIndex && a.side === b.side && a.slotIndex === b.slotIndex;
    }
    return a.slotIndex === b.slotIndex;
}

// Swap two slots' contents in the current round. The slot the new player came
// from receives the player who used to occupy the target slot.
function swapInResult(targetLoc, newPlayerName) {
    if (!state.lastResult) return;
    const round = state.lastResult;
    const sourceLoc = findResultSlotByName(round, newPlayerName);
    if (!sourceLoc || locationsEqual(sourceLoc, targetLoc)) return;

    const targetEntry = getResultSlotEntry(round, targetLoc);
    const sourceEntry = getResultSlotEntry(round, sourceLoc);

    setResultSlotEntry(round, targetLoc, sourceEntry);
    setResultSlotEntry(round, sourceLoc, targetEntry);

    if (targetLoc.kind === 'court') recomputeCourtTotals(round, targetLoc.courtIndex);
    if (sourceLoc.kind === 'court') recomputeCourtTotals(round, sourceLoc.courtIndex);

    // Keep history's last entry in sync — future rounds use history when scoring.
    if (state.history.length > 0) {
        state.history[state.history.length - 1] = round;
    }

    saveState();
    renderRound(round);
    renderHistory();
    renderPlayerStats();
}

// Returns the largest member count of any team super-player in the round
// (covers courts + bench). Used to reserve space in edit mode so swapping
// teams of different sizes doesn't make the layout jump.
function getMaxTeamMemberCountInRound(round) {
    let max = 0;
    for (const court of round.courts) {
        for (const entry of [...court.teamA.players, ...court.teamB.players]) {
            if (entry && entry.members) {
                if (entry.members.length > max) max = entry.members.length;
            }
        }
    }
    for (const entry of round.benched) {
        if (entry && entry.members && entry.members.length > max) {
            max = entry.members.length;
        }
    }
    return max;
}

// Render a single slot: a player line, or a team block (when the entry has `members`).
// `maxTeamMembers` reserves space when in edit mode (prevents UI jumping between
// teams of different sizes). 0 means "no padding".
function renderResultSlot(round, entry, courtIndex, side, slotIndex, editing, maxTeamMembers = 0) {
    const isTeam = Boolean(entry && entry.members);

    if (isTeam) {
        const memberLines = entry.members.map(m => `
            <div class="team-member-line">
                <span>${escapeHtml(m.name)}</span>
                ${shouldShowLevels() ? `<span class="level">${m.level}</span>` : ''}
            </div>
        `).join('');

        // Pad with invisible placeholder rows up to maxTeamMembers (only in edit
        // mode, where swapping teams of different sizes would otherwise jump).
        let placeholderLines = '';
        if (editing && maxTeamMembers > entry.members.length) {
            const missing = maxTeamMembers - entry.members.length;
            for (let i = 0; i < missing; i++) {
                placeholderLines += '<div class="team-member-line team-member-line--placeholder" aria-hidden="true">&nbsp;</div>';
            }
        }

        const header = editing
            ? buildResultSlotSelectHtml(round, entry.name, courtIndex, side, slotIndex)
            : `<div class="result-team-name"><strong>${escapeHtml(entry.name)}</strong></div>`;

        return `
            <div class="result-team-block">
                ${header}
                <div class="result-team-members">${memberLines}${placeholderLines}</div>
            </div>
        `;
    }

    if (editing) {
        return `<div class="player-line">
            ${buildResultSlotSelectHtml(round, entry.name, courtIndex, side, slotIndex)}
        </div>`;
    }
    return `<div class="player-line">
        <span>${escapeHtml(entry.name)}</span>
        ${shouldShowLevels() ? `<span class="level">${entry.level}</span>` : ''}
    </div>`;
}

function renderRound(result) {
    let html = '';

    if (result.courts.length === 0) {
        showStatusMessage('Der var ikke nok aktive spillere til at fylde en bane.');
        return;
    }

    const editing = editingResult;
    // Reserve vertical space for team blocks based on the round's largest team,
    // so swapping teams of different sizes in edit mode doesn't jump the layout.
    const maxTeamMembers = getMaxTeamMemberCountInRound(result);

    if (el.editResultBtn) {
        el.editResultBtn.style.display = isResultEditable() ? '' : 'none';
    }

    result.courts.forEach((court, index) => {
        const teamSize = normalizeCourtFormat(court.format) || inferCourtFormat(court);
        const fmtLabel = formatLabel(teamSize);
        // In team mode each court has 1 team-entry per side, so the NvN tag would
        // be misleading; show "Hold-kamp" instead.
        const isTeamMatchup = court.teamA.players.some(p => p && p.members);
        const tagHtml = isTeamMatchup
            ? ''
            : `<span class="tag">${fmtLabel}</span>`;

        const sideHtml = (sidePlayers, side) => sidePlayers
            .map((entry, i) => renderResultSlot(result, entry, index, side, i, editing, maxTeamMembers))
            .join('');

        html += `
            <div class="result-card">
                <div class="court-title">
                    <span>Bane ${index + 1}</span>
                    <div class="court-tags">${tagHtml}</div>
                </div>
                <div class="vs-grid">
                    <div class="team">${sideHtml(court.teamA.players, 'A')}</div>
                    <div class="flex-center"><strong>VS</strong></div>
                    <div class="team">${sideHtml(court.teamB.players, 'B')}</div>
                </div>
            </div>
        `;
    });

    if (result.benched.length > 0) {
        if (editing) {
            const items = result.benched
                .map((entry, i) => renderResultSlot(result, entry, -1, 'bench', i, editing, maxTeamMembers))
                .join('');
            html += `<div class="benched-edit-area"><strong>Sidder over:</strong><div class="benched-edit-list">${items}</div></div>`;
        } else {
            const benchedHtml = result.benched.map(p => {
                if (p && p.members) {
                    const members = p.members.map(m => escapeHtml(m.name)).join(', ');
                    return `<strong>${escapeHtml(p.name)}</strong> (${members})`;
                }
                return escapeHtml(p.name);
            }).join(', ');
            html += `<div class="benched-line">Sidder over: ${benchedHtml}</div>`;
        }
    }

    el.resultArea.innerHTML = html;
}

function describeCourtForHistory(court, courtIndex) {
    const aNames = court.teamA.players.map(p => escapeHtml(p.name)).join(' og ');
    const bNames = court.teamB.players.map(p => escapeHtml(p.name)).join(' og ');
    return `${aNames} mod ${bNames}`;
}

function renderHistory() {
    updatePanelVisibility();

    if (state.history.length === 0) {
        el.historyArea.innerHTML = '<div class="subtle">Ingen kampe endnu.</div>';
        return;
    }

    const recent = state.history.slice(-6).reverse();
    el.historyArea.innerHTML = recent.map((round, idx) => {
        const roundNo = state.history.length - idx;
        return `
            <div class="result-card">
                <div class="court-title">
                    <span>Kamp ${roundNo}</span>
                </div>
                <ul class="history-list">
                    ${round.courts.map((court, i) => `<li>${describeCourtForHistory(court, i)}</li>`).join('')}
                    ${round.benched.length ? `<li>Sidder over: ${round.benched.map(p => `${escapeHtml(p.name)}`).join(', ')}</li>` : ''}
                </ul>
            </div>
        `;
    }).join('');
}

async function copyCurrentPlayersToClipboard() {
    try {
        const text = playersToText(state.roster);
        await navigator.clipboard.writeText(text);
        showStatusMessage('Spillerlisten er kopieret til udklipsholder.');
    } catch (error) {
        showStatusMessage('Kunne ikke kopiere til udklipsholder.');
    }
}

// Build a session-transfer payload (compact v:2 format).
//
// The payload represents the volatile state (current players, history, teams,
// UI settings, prefills) without persisted things like saved player lists.
// It uses three tricks to stay small:
//   1. A shared name dictionary `n` — every player or team name appears once
//      and is referenced everywhere else by integer index.
//   2. Positional arrays instead of named-key objects — a player is a
//      [nameIdx, level, active] triple, not {name, level, active}.
//   3. 0/1 instead of true/false; enabled formats packed as a bitmask.
function buildSessionPayload() {
    const names = [];
    const nameIndex = new Map();
    const intern = (rawName) => {
        const name = String(rawName || '');
        if (!nameIndex.has(name)) {
            nameIndex.set(name, names.length);
            names.push(name);
        }
        return nameIndex.get(name);
    };

    // Intern roster names first so they get the lowest indices.
    state.roster.forEach(p => intern(p.name));

    const r = state.roster.map(p => [intern(p.name), p.level, p.active ? 1 : 0]);

    const t = (state.teams || []).map(team => [
        intern(team.name),
        (team.members || []).map(m => intern(m.name)),
        team.active === false ? 0 : 1,
    ]);

    const h = state.history.map(round => [
        (round.courts || []).map(court => [
            (court.teamA?.players || []).map(p => intern(p.name)),
            (court.teamB?.players || []).map(p => intern(p.name)),
        ]),
        (round.benched || []).map(p => intern(p.name)),
    ]);

    let formatsMask = 0;
    for (let i = 1; i <= MAX_TEAM_SIZE; i++) {
        if (document.getElementById(`format-${i}v${i}`)?.checked) {
            formatsMask |= (1 << (i - 1));
        }
    }

    // UI: positional, fixed order. Decoder relies on this order.
    const u = [
        Number(el.courtCount.value) || 2,
        el.weightTeamBalance?.checked ? 1 : 0,
        el.weightPartnerBalance?.checked ? 1 : 0,
        el.penaltyRepeatTeammate?.checked ? 1 : 0,
        (el.useSkillLevels?.checked ?? true) ? 1 : 0,
        el.hideSkillLevels?.checked ? 1 : 0,
        formatsMask,
        (el.maximizeCourts?.checked ?? true) ? 1 : 0,
        Number(el.defaultCourtCount?.value) || 2,
        el.teamMode?.checked ? 1 : 0,
    ];

    const p = getPrefillStateFromUi().map(prefill => {
        const fmt = prefill.format === COURT_FORMAT_AUTO ? 0 : (Number(prefill.format) || 0);
        const slots = Object.entries(prefill.slots || {})
            .filter(([, name]) => Boolean(name))
            .map(([slotKey, name]) => [slotKey, intern(name)]);
        return [fmt, slots];
    });

    return {v: 2, n: names, r, t, h, u, p};
}

// Expand a compact (v:2) payload back into the verbose shape that
// applySessionPayload expects.
function expandSessionPayload(data) {
    if (!data || typeof data !== 'object' || data.v !== 2) {
        throw new Error('Session-koden har et ugyldigt format.');
    }

    const names = Array.isArray(data.n) ? data.n : [];
    const lookupName = (idx) => (Number.isInteger(idx) && idx >= 0 && idx < names.length) ? names[idx] : '';

    const roster = (data.r || []).map(triple => {
        const [nIdx, level, active] = Array.isArray(triple) ? triple : [];
        return {
            name: lookupName(nIdx),
            level: Number(level) || 1,
            active: Boolean(active),
        };
    });
    const rosterByName = new Map(roster.map(p => [p.name, p]));

    const teams = (data.t || []).map((triple, i) => {
        const [nIdx, memberIdxs, active] = Array.isArray(triple) ? triple : [];
        const members = (memberIdxs || []).map(idx => {
            const name = lookupName(idx);
            const fromRoster = rosterByName.get(name);
            return {name, level: fromRoster ? fromRoster.level : 1};
        });
        return {
            id: `team-imported-${i + 1}`,
            name: lookupName(nIdx) || `Hold ${i + 1}`,
            members,
            level: members.reduce((s, m) => s + (m.level || 0), 0),
            active: Boolean(active),
        };
    });
    const teamsByName = new Map(teams.map(team => [team.name, team]));

    // Reconstruct a player-or-team entity from a name index, looking up
    // teams first so super-players come back with their members array.
    const buildEntity = (nameIdx) => {
        const name = lookupName(nameIdx);
        const team = teamsByName.get(name);
        if (team) {
            return {
                name: team.name,
                level: team.level,
                active: true,
                members: team.members.map(m => ({...m})),
                id: team.id,
            };
        }
        const player = rosterByName.get(name);
        if (player) return {name: player.name, level: player.level, active: true};
        return {name, level: 1, active: true};
    };

    const history = (data.h || []).map(roundRaw => {
        const [courtsRaw, benchedRaw] = Array.isArray(roundRaw) ? roundRaw : [[], []];
        const courts = (courtsRaw || []).map(courtRaw => {
            const [aIdxs, bIdxs] = Array.isArray(courtRaw) ? courtRaw : [[], []];
            const teamA = (aIdxs || []).map(buildEntity);
            const teamB = (bIdxs || []).map(buildEntity);
            const teamSize = Math.max(teamA.length, teamB.length, 1);
            return {
                format: teamSize,
                teamA: {players: teamA, totalLevel: teamA.reduce((s, p) => s + (p.level || 0), 0)},
                teamB: {players: teamB, totalLevel: teamB.reduce((s, p) => s + (p.level || 0), 0)},
                lockedSlots: null,
            };
        });
        const benched = (benchedRaw || []).map(buildEntity);
        return {courts, benched};
    });

    const u = Array.isArray(data.u) ? data.u : [];
    const enabledFormats = [];
    const formatsMask = Number(u[6]) || 0;
    for (let i = 1; i <= MAX_TEAM_SIZE; i++) {
        if (formatsMask & (1 << (i - 1))) enabledFormats.push(i);
    }

    const prefills = (data.p || []).map(prefRaw => {
        const [fmt, slotPairs] = Array.isArray(prefRaw) ? prefRaw : [0, []];
        const slots = {};
        (slotPairs || []).forEach(pair => {
            const [k, nIdx] = Array.isArray(pair) ? pair : [];
            const name = lookupName(nIdx);
            if (k && name) slots[k] = name;
        });
        return {
            format: !fmt ? COURT_FORMAT_AUTO : String(fmt),
            slots,
        };
    });

    return {
        version: 2,
        roster,
        teams,
        history,
        lastResult: history[history.length - 1] || null,
        ui: {
            courtCount: String(u[0] ?? 2),
            weightTeamBalance: Boolean(u[1]),
            weightPartnerBalance: Boolean(u[2]),
            penaltyRepeatTeammate: Boolean(u[3]),
            useSkillLevels: Boolean(u[4]),
            hideSkillLevels: Boolean(u[5]),
            enabledFormats,
            maximizeCourts: Boolean(u[7]),
            defaultCourtCount: String(u[8] ?? 2),
            teamMode: Boolean(u[9]),
            prefills,
        },
    };
}

// Encode an arbitrary JS value as a UTF-8 safe base64 string.
function encodeSessionToBase64(payload) {
    const json = JSON.stringify(payload);
    // Encode as UTF-8 first to support Danish characters (æ, ø, å, etc.)
    const bytes = new TextEncoder().encode(json);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

function decodeSessionFromBase64(text) {
    const cleaned = String(text || '').trim().replace(/\s+/g, '');
    if (!cleaned) throw new Error('Session-koden er tom.');
    let binary;
    try {
        binary = atob(cleaned);
    } catch (e) {
        throw new Error('Session-koden er ugyldig.');
    }
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    const json = new TextDecoder().decode(bytes);
    let parsed;
    try {
        parsed = JSON.parse(json);
    } catch (e) {
        throw new Error('Kunne ikke læse session-koden.');
    }
    if (!parsed || typeof parsed !== 'object') {
        throw new Error('Session-koden har et ugyldigt format.');
    }
    return parsed;
}

async function exportSessionToClipboard() {
    try {
        const payload = buildSessionPayload();
        const encoded = encodeSessionToBase64(payload);
        if (el.sessionTransferText) {
            el.sessionTransferText.value = encoded;
            el.sessionTransferText.select?.();
        }
        try {
            await navigator.clipboard.writeText(encoded);
            showStatusMessage('Session er kopieret til udklipsholderen.');
        } catch (clipErr) {
            showStatusMessage('Session er klar — kopier teksten manuelt.');
        }
    } catch (error) {
        showStatusMessage(error.message || 'Kunne ikke eksportere session.');
    }
}

function importSessionFromTextarea() {
    try {
        const text = el.sessionTransferText?.value || '';
        // Expand the v:2 compact payload back into the verbose shape that
        // applySessionPayload expects.
        const data = expandSessionPayload(decodeSessionFromBase64(text));

        if (state.roster.length || state.history.length) {
            const confirmed = window.confirm(
                'Vil du erstatte den aktuelle session? Spillere, historik og indstillinger bliver overskrevet (gemte spillerlister bevares).'
            );
            if (!confirmed) return;
        }

        applySessionPayload(data);

        if (el.sessionTransferText) el.sessionTransferText.value = '';

        showStatusMessage('Session er importeret.');
        closeStandAlone();
    } catch (error) {
        showStatusMessage(error.message || 'Kunne ikke importere session.');
    }
}

// Apply a parsed session payload to the live app state.
// Mirrors restoreState but works from an in-memory object.
function applySessionPayload(data) {
    state.roster = Array.isArray(data.roster) ? data.roster.map(normalizePlayer) : [];
    state.history = Array.isArray(data.history) ? data.history.map(normalizeRoundFromStorage) : [];
    state.lastResult = state.history[state.history.length - 1] || null;
    state.teams = Array.isArray(data.teams) ? data.teams.map(normalizeTeam) : [];

    if (data.ui) {
        const defaultCourts = data.ui.defaultCourtCount ?? '2';
        if (el.defaultCourtCount) el.defaultCourtCount.value = defaultCourts;
        el.courtCount.value = data.ui.courtCount ?? defaultCourts;
        el.weightTeamBalance.checked = Boolean(data.ui.weightTeamBalance);
        el.weightPartnerBalance.checked = Boolean(data.ui.weightPartnerBalance);
        el.penaltyRepeatTeammate.checked = Boolean(data.ui.penaltyRepeatTeammate);
        el.useSkillLevels.checked = data.ui.useSkillLevels ?? true;
        el.hideSkillLevels.checked = Boolean(data.ui.hideSkillLevels);

        const savedFormats = Array.isArray(data.ui.enabledFormats) ? data.ui.enabledFormats : [1, 2];
        for (let n = 1; n <= MAX_TEAM_SIZE; n++) {
            const cb = document.getElementById(`format-${n}v${n}`);
            if (cb) cb.checked = savedFormats.includes(n);
        }
        if (el.maximizeCourts) el.maximizeCourts.checked = data.ui.maximizeCourts ?? true;
        if (el.teamMode) el.teamMode.checked = Boolean(data.ui.teamMode);

        renderPrefillArea(data.ui.prefills || createDefaultPrefills(getCourtCount()));
    }

    updateSkillLevelSettingsUI();
    updateTeamModeUi();
    renderRoster();
    renderPlayerManagerList();
    renderTeams();
    renderPlayerStats();
    renderHistory();
    updatePanelVisibility();
    if (state.lastResult) renderRound(state.lastResult);
    saveState();
}

function importPlayersFromTextarea() {
    try {
        const text = el.playerImportText.value;
        const players = parsePlayersFromText(text);
        replaceRoster(players);
        closeStandAlone();
    } catch (error) {
        showStatusMessage(error.message || 'Kunne ikke importere spillerlisten.');
    }
}

function escapeHtml(value) {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

function replaceRoster(newPlayers) {
    if (state.roster.length) {
        const confirmed = window.confirm(
            'Vil du erstatte den nuværende spillerliste? Dette nulstiller også historik og aktive spillere.'
        );
        if (!confirmed) return;
    }

    state.roster = clonePlayers(newPlayers).map(player => ({
        ...player,
        active: false,
    }));
    state.history = [];
    state.lastResult = null;

    renderRoster();
    renderPlayerManagerList();
    renderPlayerStats();
    renderHistory();
    updatePanelVisibility();
    saveState();

    showStatusMessage('Spillerlisten er opdateret.');
}

function addPlayer() {
    const name = normalizeName(el.newPlayerName.value);
    const level = Number(el.newPlayerLevel.value);

    if (!name) {
        showStatusMessage('Skriv et navn før du tilføjer spilleren.');
        return;
    }

    if (!Number.isInteger(level) || level < 1 || level > 9) {
        showStatusMessage('Niveau skal være et heltal fra 1 til 9.');
        return;
    }

    if (state.roster.some(player => player.name.toLowerCase() === name.toLowerCase())) {
        showStatusMessage(`Spilleren ${name} findes allerede.`);
        return;
    }

    state.roster.push({name, level, active: true});

    el.newPlayerName.value = '';
    el.newPlayerLevel.value = '2';

    renderRoster();
    renderPlayerManagerList();
    renderPlayerStats();

    el.newPlayerPanel.classList.remove('open');
    showStatusMessage(`Spilleren ${name} er oprettet.`);

    saveState();
}

function parsePlayersFromText(text) {
    const lines = String(text || '')
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean);

    const players = [];
    const seenNames = new Set();

    for (const line of lines) {
        const parts = line.split(',').map(part => part.trim());

        if (parts.length !== 2) {
            throw new Error(`Ugyldigt format: "${line}". Brug formatet navn,niveau`);
        }

        const [name, levelText] = parts;
        const level = Number(levelText);

        if (!name) {
            throw new Error(`Mangler navn i linjen: "${line}"`);
        }

        if (!Number.isInteger(level) || level < 1 || level > 9) {
            throw new Error(`Ugyldigt niveau for "${name}". Niveau skal være et heltal fra 1 til 9.`);
        }

        const lowerName = name.toLowerCase();
        if (seenNames.has(lowerName)) {
            throw new Error(`Spilleren "${name}" står mere end én gang.`);
        }

        seenNames.add(lowerName);
        players.push({
            name,
            level,
            active: false
        });
    }

    if (players.length === 0) {
        throw new Error('Spillerlisten er tom.');
    }

    return players;
}

function playersToText(players) {
    return players
        .map(player => `${player.name},${player.level}`)
        .join('\n');
}

function markArrived(index) {
    const player = state.roster[index];
    if (!player) return;

    player.active = true;
    renderRoster();
    renderPlayerManagerList();
    renderPlayerStats();
    updateTeamModeUi();
    updatePanelVisibility();

    saveState();
}

function removePlayer(index) {
    const player = state.roster[index];
    if (!player) return;

    player.active = false;
    renderRoster();
    renderPlayerManagerList();
    renderPlayerStats();
    updateTeamModeUi();
    updatePanelVisibility();

    saveState();
}

function updatePlayerLevel(index, level) {
    const player = state.roster[index];
    if (!player) return;

    const parsed = Number(level);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 9) return;

    player.level = parsed;
    renderRoster();
    renderPlayerManagerList();
    renderPlayerStats();
    saveState();
}

window.markArrived = markArrived;
window.removePlayer = removePlayer;

async function generateRound() {
    const tm = isTeamMode();
    if (tm && (!state.teams || state.teams.length < 2)) {
        showStatusMessage('Generér mindst 2 hold før du laver kampe.');
        return;
    }

    const players = tm ? getMatchmakingPool() : getActivePlayers();
    const courtCount = getCourtCount();
    const config = getConfig();
    // Prefills don't apply in team mode (locking individual slots makes no sense
    // when each slot is a whole team).
    const prefills = tm
        ? createDefaultPrefills(courtCount)
        : getPrefillStateFromUi();

    // Show full-screen overlay, disable buttons
    el.generateBtn.disabled = true;
    el.shuffleBtn.disabled = true;
    el.generateOverlay?.classList.add('generate-overlay--visible');

    try {
        const best = await findBestRoundAsync(players, courtCount, state.history, config, prefills, 1000);

        if (!best || best.courts.length === 0) {
            throw new Error('Kunne ikke finde en gyldig opstilling.');
        }

        state.lastResult = best;
        state.history.push(best);

        // Reset prefill configuration for the next round (no one wants to reuse the same setup).
        renderPrefillArea(createDefaultPrefills(getCourtCount()));
        // Exit edit mode automatically when a fresh round arrives.
        setEditResultMode(false);

        renderRound(best);
        renderHistory();
        renderPlayerStats();
        updatePanelVisibility();
        collapseAllAndShowResult();
    } catch (err) {
        showStatusMessage(err.message);
    } finally {
        el.generateBtn.disabled = false;
        el.generateOverlay?.classList.remove('generate-overlay--visible');
        updateShuffleBtn();
    }

    saveState();
}

function retryRound() {
    if (state.history.length === 0) return;
    // Silently undo the last round then generate a fresh one
    state.history.pop();
    state.lastResult = state.history[state.history.length - 1] || null;
    generateRound();
}
window.retryRound = retryRound;

function clearPrefills() {
    renderPrefillArea(createDefaultPrefills(getCourtCount()));
    saveState();
    showStatusMessage('Låsninger til næste runde er nulstillet.');
}

function resetHistory() {
    const confirmed = window.confirm('Er du sikker på, at du vil nulstille hele historikken?');
    if (!confirmed) return;

    state.history = [];
    state.lastResult = null;
    renderHistory();
    renderPlayerStats();
    updatePanelVisibility();
    showStatusMessage('Historikken er nulstillet.');
    closeMenu();

    saveState();
}

function resetAll() {
    const confirmed = window.confirm('Dette ville nulstille alt pånær dine gemte spillerlister. Er du sikker?');
    if (!confirmed) return;

    state.history = [];
    state.roster = [];
    state.lastResult = null;
    state.teams = [];
    setEditResultMode(false);
    renderHistory();
    renderPlayerStats();
    renderRoster();
    renderPlayerManagerList();
    renderTeams();
    renderPrefillArea(createDefaultPrefills(getCourtCount()));
    updateTeamModeUi();
    updatePanelVisibility();
    showStatusMessage('Alt er nulstillet.');
    closeMenu();

    saveState();
}

function undoLastRound() {
    if (state.history.length === 0) return;

    const confirmed = window.confirm('Er du sikker på, at du vil fjerne seneste kamp fra historikken?');
    if (!confirmed) return;

    state.history.pop();
    state.lastResult = state.history[state.history.length - 1] || null;
    setEditResultMode(false);

    renderHistory();
    renderPlayerStats();
    updatePanelVisibility();

    if (state.lastResult) {
        renderRound(state.lastResult);
    } else {
        el.resultArea.innerHTML = 'Ingen kamp genereret endnu.';
    }

    showStatusMessage('Seneste kamp er fjernet fra historikken.');
    saveState();
}

function toggleMenu() {
    const isOpen = el.menuDropdown.classList.toggle('open');
    el.menuBackdrop?.classList.toggle('open', isOpen);
}

function closeMenu() {
    el.menuDropdown.classList.remove('open');
    el.menuBackdrop?.classList.remove('open');
}

function showStandAlone(panel) {
    for (let element of document.getElementsByClassName("standalone")) {
        element.style.display = 'none';
    }
    el.mainPage.style.display = "none";
    panel.style.display = "block";
    closeMenu();
}


function closeStandAlone() {
    for (let element of document.getElementsByClassName("standalone")) {
        element.style.display = 'none';
    }
    el.mainPage.style.display = "block";
}


el.addPlayerBtn.addEventListener('click', addPlayer);

el.menuToggleBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    toggleMenu();
});

el.menuBackdrop?.addEventListener('click', closeMenu);

el.generateBtn.addEventListener('click', generateRound);
el.shuffleBtn?.addEventListener('click', retryRound);
el.resetHistoryBtn.addEventListener('click', resetHistory);
el.resetAllBtn.addEventListener('click', resetAll);
el.undoBtn.addEventListener('click', undoLastRound);
el.clearPrefillBtn.addEventListener('click', clearPrefills);

el.loadPresetPlayersBtn.addEventListener('click', () => {
    loadPlayersFromStoredList(el.presetPlayerList.value);
});

el.savePresetPlayersBtn?.addEventListener('click', saveCurrentPlayersAsStoredList);
el.deletePresetPlayersBtn?.addEventListener('click', deleteStoredPlayerList);

el.importPlayersBtn.addEventListener('click', importPlayersFromTextarea);
el.copyPlayersBtn.addEventListener('click', copyCurrentPlayersToClipboard);
el.exportSessionBtn?.addEventListener('click', exportSessionToClipboard);
el.importSessionBtn?.addEventListener('click', importSessionFromTextarea);


el.newPlayerBtn.addEventListener('click', () => {
    showStandAlone(el.newPlayerPanel);
});

el.closeNewPlayerBtn.addEventListener('click', () => {
    closeStandAlone();
});

el.settingsBtn.addEventListener('click', () => {
    showStandAlone(el.settingsPanel);
});

el.closeSettingsBtn.addEventListener('click', () => {
    closeStandAlone();
});

el.importExportBtn.addEventListener('click', () => {
    el.playerImportText.value = playersToText(state.roster);
    showStandAlone(el.importExportPanel);
});

el.closeImportExportBtn.addEventListener('click', () => {
    closeStandAlone();
});

[
    el.courtCount,
    el.weightTeamBalance,
    el.weightPartnerBalance,
    el.penaltyRepeatTeammate,
    el.useSkillLevels,
    el.hideSkillLevels,
    el.maximizeCourts,
].forEach(input => {
    input.addEventListener('change', () => {
        renderPrefillArea(getPrefillStateFromUi());
        saveState();
    });
});

// Format size checkboxes (1v1 through 11v11)
for (let n = 1; n <= MAX_TEAM_SIZE; n++) {
    document.getElementById(`format-${n}v${n}`)?.addEventListener('change', () => {
        renderPrefillArea(getPrefillStateFromUi());
        saveState();
    });
}

el.defaultCourtCount?.addEventListener('change', () => {
    const val = Math.max(1, parseInt(el.defaultCourtCount.value, 10) || 1);
    el.defaultCourtCount.value = val;
    el.courtCount.value = val;
    renderPrefillArea(getPrefillStateFromUi());
    saveState();
});

el.useSkillLevels.addEventListener('change', () => {
    updateSkillLevelSettingsUI();
    renderRoster();
    renderPlayerManagerList();
    renderTeams();
    if (state.lastResult) renderRound(state.lastResult);
});

el.teamMode?.addEventListener('change', () => {
    // When toggling team mode off, keep generated teams in state but stop using them.
    updateTeamModeUi();
    renderPrefillArea(getPrefillStateFromUi());
    if (state.lastResult) renderRound(state.lastResult);
    saveState();
});

el.generateTeamsBtn?.addEventListener('click', generateTeams);
el.clearTeamsBtn?.addEventListener('click', clearTeams);

el.hideSkillLevels.addEventListener('change', () => {
    renderRoster();
    renderPlayerManagerList();
    renderTeams();
    if (state.lastResult) renderRound(state.lastResult);
});

el.prefillArea.addEventListener('change', (event) => {

    const target = event.target;
    if (!(target instanceof HTMLSelectElement)) return;

    const role = target.dataset.role;
    const courtIndex = Number(target.dataset.courtIndex);

    if (role === 'format') {
        // Re-render with new slot count for this court's format
        renderPrefillArea(getPrefillStateFromUi());
        saveState();
        return;
    }

    if (role === 'slot') {
        const prefills = getPrefillStateFromUi();
        const selectedName = normalizeName(target.value);
        const currentSlotKey = target.dataset.slot;

        if (selectedName) {
            // If this player already occupies another slot, silently move them here
            // (clear every other slot that held this player name)
            let moved = false;
            prefills.forEach((prefill, idx) => {
                Object.keys(prefill.slots).forEach(slotKey => {
                    if (prefill.slots[slotKey] === selectedName) {
                        if (idx !== courtIndex || slotKey !== currentSlotKey) {
                            delete prefill.slots[slotKey];
                            moved = true;
                        }
                    }
                });
            });

            if (moved) {
                renderPrefillArea(prefills);
            }
        }

        saveState();
    }
});

el.playerManagerListArea.addEventListener('change', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement)) return;

    const levelIndex = Number(target.dataset.playerLevelIndex);
    if (Number.isInteger(levelIndex)) {
        updatePlayerLevel(levelIndex, target.value);
    }
});

el.prefillToggleBtn?.addEventListener('click', () => {
    toggleCollapsiblePanel(el.prefillPanel);
});

el.resultToggleBtn?.addEventListener('click', () => {
    toggleCollapsiblePanel(el.resultPanel);
});

el.editResultBtn?.addEventListener('click', (event) => {
    event.stopPropagation();
    toggleEditResultMode();
});

el.resultArea?.addEventListener('change', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement)) return;
    if (!target.classList.contains('result-slot-select')) return;

    const courtIndex = Number(target.dataset.resultCourt);
    const side = target.dataset.resultSide;
    const slotIndex = Number(target.dataset.resultIndex);
    const newName = target.value;

    let targetLoc;
    if (side === 'bench') {
        targetLoc = {kind: 'bench', slotIndex};
    } else {
        targetLoc = {kind: 'court', courtIndex, side, slotIndex};
    }

    swapInResult(targetLoc, newName);
});

document.addEventListener('click', (event) => {
    let button = null;
    if (event.target.classList.contains("collapsible-toggle")) {
        button = event.target;
    } else if (event.target.parentElement && event.target.parentElement.classList.contains("collapsible-toggle")) {
        button = event.target.parentElement;
    }
    if (!button) {
        return;
    }
    const targetId = button.dataset.target;
    if (!targetId) {
        return;
    }
    const panel = document.getElementById(targetId);
    toggleCollapsiblePanel(panel);
});

document.addEventListener('click', (event) => {
    const clickedInsideMenu = event.target.closest('.header-menu');
    if (!clickedInsideMenu) {
        closeMenu();
    }
});

loadDefaults();
