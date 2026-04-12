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


const COURT_FORMATS = {
    BOTH: 'both',
    DOUBLE: 'double',
    SINGLE: 'single'
};

const PLAYER_PREFERENCES = {
    NONE: 'none',
    NO_SINGLE: 'no_single',
    NO_DOUBLE: 'no_double'
};

const PLAYER_PREFERENCE_OPTIONS = [
    {value: PLAYER_PREFERENCES.NONE, label: 'Flex', shortLabel: ''},
    {value: PLAYER_PREFERENCES.NO_DOUBLE, label: 'Single', shortLabel: 'S'},
    {value: PLAYER_PREFERENCES.NO_SINGLE, label: 'Double', shortLabel: 'D'},
];

const state = {
    roster: [],
    history: [],
    lastResult: null
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
    newPlayerBtn: document.getElementById('newPlayerBtn'),
    closeNewPlayerBtn: document.getElementById('closeNewPlayerBtn'),
    newPlayerName: document.getElementById('newPlayerName'),
    newPlayerLevel: document.getElementById('newPlayerLevel'),
    newPlayerPreference: document.getElementById('newPlayerPreference'),
    addPlayerBtn: document.getElementById('addPlayerBtn'),
    courtCount: document.getElementById('courtCount'),
    iterations: document.getElementById('iterations'),
    weightTeamBalance: document.getElementById('weightTeamBalance'),
    weightPartnerBalance: document.getElementById('weightPartnerBalance'),
    penaltyRepeatTeammate: document.getElementById('penaltyRepeatTeammate'),
    penaltyRepeatOpponent: document.getElementById('penaltyRepeatOpponent'),
    penaltyBench: document.getElementById('penaltyBench'),
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
};

function createDefaultPrefills(courtCount) {
    return Array.from({length: courtCount}, () => ({
        format: COURT_FORMATS.BOTH,
        slots: {
            A1: '',
            A2: '',
            B1: '',
            B2: ''
        }
    }));
}

function normalizePlayer(player) {
    return {
        name: normalizeName(player.name),
        level: Math.min(9, Math.max(1, Number(player.level) || 1)),
        active: Boolean(player.active),
        matchPreference: normalizePlayerPreference(player.matchPreference)
    };
}

function normalizePlayerPreference(value) {
    const normalized = String(value || '').trim().toLowerCase();

    if (Object.values(PLAYER_PREFERENCES).includes(normalized)) {
        return normalized;
    }

    const aliasMap = {
        single: PLAYER_PREFERENCES.NO_DOUBLE,
        double: PLAYER_PREFERENCES.NO_SINGLE,
        flex: PLAYER_PREFERENCES.NONE
    };

    return aliasMap[normalized] || PLAYER_PREFERENCES.NONE;
}

function getLevelOptions(selectedLevel = 1) {
    return Array.from({length: 9}, (_, i) => i + 1)
        .map(level => `<option value="${level}" ${Number(selectedLevel) === level ? 'selected' : ''}>${level}</option>`)
        .join('');
}

function getPreferenceLabel(value) {
    const option = PLAYER_PREFERENCE_OPTIONS.find(item => item.value === value);
    return option ? option.label : '';
}

function getPreferenceShortLabel(value) {
    const option = PLAYER_PREFERENCE_OPTIONS.find(item => item.value === value);
    return option ? option.shortLabel : '';
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
        options.push(`<option value="${escapeHtml(player.name)}">${escapeHtml(player.name)} (${player.level})</option>`);
    });

    return options.join('');
}

function populatePreferenceSelect(selectEl, selectedValue = PLAYER_PREFERENCES.NONE) {
    if (!selectEl) return;
    selectEl.innerHTML = PLAYER_PREFERENCE_OPTIONS.map(option => `
        <option value="${option.value}" ${option.value === selectedValue ? 'selected' : ''}>
            ${option.label}
        </option>
    `).join('');
}

function saveState() {
    const data = {
        roster: state.roster.map(normalizePlayer),
        history: state.history,
        lastResult: state.lastResult,
        ui: {
            courtCount: el.courtCount.value,
            iterations: el.iterations.value,
            weightTeamBalance: el.weightTeamBalance.checked,
            weightPartnerBalance: el.weightPartnerBalance.checked,
            penaltyRepeatTeammate: el.penaltyRepeatTeammate.checked,
            penaltyRepeatOpponent: el.penaltyRepeatOpponent.checked,
            penaltyBench: el.penaltyBench.checked,
            prefills: getPrefillStateFromUi(),
            collapsedPanels: {
                arrivalPanel: el.arrivalPanel?.classList.contains('collapsed') ?? true,
                fetchPlayersPanel: el.fetchPlayersPanel?.classList.contains('collapsed') ?? true,
                prefillPanel: el.prefillPanel?.classList.contains('collapsed') ?? true,
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
        state.lastResult = data.lastResult ? normalizeRoundFromStorage(data.lastResult) : null;

        if (data.ui) {
            el.courtCount.value = data.ui.courtCount ?? '2';
            el.iterations.value = data.ui.iterations ?? '1000';
            el.weightTeamBalance.checked = Boolean(data.ui.weightTeamBalance);
            el.weightPartnerBalance.checked = Boolean(data.ui.weightPartnerBalance);
            el.penaltyRepeatTeammate.checked = Boolean(data.ui.penaltyRepeatTeammate);
            el.penaltyRepeatOpponent.checked = Boolean(data.ui.penaltyRepeatOpponent);
            el.penaltyBench.checked = Boolean(data.ui.penaltyBench);
        }
        const collapsedPanels = data.ui.collapsedPanels || {};


        if (collapsedPanels.playerListsPanel !== false) {
            el.playerListsPanel?.classList.add('collapsed');
        } else {
            el.playerListsPanel?.classList.remove('collapsed');
        }
        if (collapsedPanels.arrivalPanel !== false) {
            el.arrivalPanel?.classList.add('collapsed');
        } else {
            el.arrivalPanel?.classList.remove('collapsed');
        }
        if (collapsedPanels.fetchPlayersPanel !== false) {
            el.fetchPlayersPanel?.classList.add('collapsed');
        } else {
            el.fetchPlayersPanel?.classList.remove('collapsed');
        }
        if (collapsedPanels.prefillPanel !== false) {
            el.prefillPanel?.classList.add('collapsed');
        } else {
            el.prefillPanel?.classList.remove('collapsed');
        }
        if (collapsedPanels.playerStatsPanel !== false) {
            el.playerStatsPanel?.classList.add('collapsed');
        } else {
            el.playerStatsPanel?.classList.remove('collapsed');
        }
        if (collapsedPanels.historyPanel !== false) {
            el.historyPanel?.classList.add('collapsed');
        } else {
            el.historyPanel?.classList.remove('collapsed');
        }

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
            format: court.format || inferCourtFormat(court),
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
    return {
        name: normalizeName(player.name),
        level: Math.min(9, Math.max(1, Number(player.level) || 1)),
        active: true,
        matchPreference: normalizePlayerPreference(player.matchPreference)
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

function updatePanelVisibility() {
    const activePlayersCount = getActivePlayers().length;
    const hasHistory = state.history.length > 0;

    el.matchPanel.classList.toggle('hidden', activePlayersCount < 2);
    el.playerStatsPanel.classList.toggle('hidden', !hasHistory);
    el.historyPanel.classList.toggle('hidden', !hasHistory);
    el.playerRosterArea.classList.toggle('hidden', activePlayersCount === 0);
    el.resultPanel.classList.toggle('hidden', !hasHistory);
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

function playerCanPlayFormat(player, format) {
    const preference = normalizePlayerPreference(player.matchPreference);

    if (format === COURT_FORMATS.SINGLE && preference === PLAYER_PREFERENCES.NO_SINGLE) {
        return false;
    }

    if (format === COURT_FORMATS.DOUBLE && preference === PLAYER_PREFERENCES.NO_DOUBLE) {
        return false;
    }

    return true;
}

function popNextEligiblePlayer(availablePlayers, format) {
    for (let i = availablePlayers.length - 1; i >= 0; i--) {
        const player = availablePlayers[i];
        if (playerCanPlayFormat(player, format)) {
            availablePlayers.splice(i, 1);
            return player;
        }
    }
    return null;
}

function loadDefaults() {
    populatePreferenceSelect(el.newPlayerPreference, PLAYER_PREFERENCES.NONE);

    const restored = restoreState();
    if (!restored) {
        renderPrefillArea(createDefaultPrefills(getCourtCount()));
    }

    renderStoredPlayerLists();
    renderRoster();
    renderPlayerManagerList();
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
    return {
        teamBalanceWeight: el.weightTeamBalance.checked ? FIXED_CONFIG.teamBalanceWeight : 0,
        partnerBalanceWeight: el.weightPartnerBalance.checked ? FIXED_CONFIG.partnerBalanceWeight : 0,
        teammateLastPenalty: el.penaltyRepeatTeammate.checked ? FIXED_CONFIG.teammateLastPenalty : 0,
        teammatePrevPenalty: el.penaltyRepeatTeammate.checked ? FIXED_CONFIG.teammatePrevPenalty : 0,
        opponentLastPenalty: el.penaltyRepeatOpponent.checked ? FIXED_CONFIG.opponentLastPenalty : 0,
        opponentPrevPenalty: el.penaltyRepeatOpponent.checked ? FIXED_CONFIG.opponentPrevPenalty : 0,
        benchLastPenalty: el.penaltyBench.checked ? FIXED_CONFIG.benchLastPenalty : 0,
        benchPrevPenalty: el.penaltyBench.checked ? FIXED_CONFIG.benchPrevPenalty : 0,
    };
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

        if (teamAPlayers.length === 2) {
            teammatePairs.add(pairKey(teamAPlayers[0].name, teamAPlayers[1].name));
        }

        if (teamBPlayers.length === 2) {
            teammatePairs.add(pairKey(teamBPlayers[0].name, teamBPlayers[1].name));
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

function inferCourtFormat(court) {
    const teamASize = court.teamA?.players?.length || 0;
    const teamBSize = court.teamB?.players?.length || 0;

    if (teamASize === 1 && teamBSize === 1) return COURT_FORMATS.SINGLE;
    return COURT_FORMATS.DOUBLE;
}

function sumTeamLevel(players) {
    return players.reduce((sum, player) => sum + Number(player.level || 0), 0);
}

function createCourtFromSlots(format, slotMap, lockedSlotsForCourt = null) {
    const teamAPlayers = [slotMap.A1, slotMap.A2].filter(Boolean);
    const teamBPlayers = [slotMap.B1, slotMap.B2].filter(Boolean);

    return {
        format,
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
    const safePrefills = Array.isArray(prefills) ? prefills.slice(0, courtCount) : [];
    while (safePrefills.length < courtCount) {
        safePrefills.push({
            format: COURT_FORMATS.BOTH,
            slots: {A1: '', A2: '', B1: '', B2: ''}
        });
    }

    const playerOptions = getPlayerSelectOptions(true);


    el.prefillArea.innerHTML = safePrefills.map((prefill, index) => {
        const a2 = prefill.format !== COURT_FORMATS.SINGLE ? `
                    <select data-role="slot" data-slot="A2" data-court-index="${index}">${playerOptions}</select>
    ` : '';

        const b2 = prefill.format !== COURT_FORMATS.SINGLE ? `
                    <select data-role="slot" data-slot="B2" data-court-index="${index}">${playerOptions}</select>
    ` : '';
        return `
            <div class="prefill-card" data-court-index="${index}">
                <div class="prefill-card-header">
                    <strong>Bane ${index + 1}</strong>
                    <div class="prefill-format">
                        <select id="prefill-format-${index}" class="prefill-format-select" data-role="format" data-court-index="${index}">
                            <option value="${COURT_FORMATS.BOTH}" ${prefill.format === COURT_FORMATS.BOTH ? 'selected' : ''}>Begge</option>
                            <option value="${COURT_FORMATS.DOUBLE}" ${prefill.format === COURT_FORMATS.DOUBLE ? 'selected' : ''}>Double</option>
                            <option value="${COURT_FORMATS.SINGLE}" ${prefill.format === COURT_FORMATS.SINGLE ? 'selected' : ''}>Single</option>
                        </select>
                    </div>
                </div>

                <div class="prefill-grid">
                    <div class="prefill-side">
                        <select data-role="slot" data-slot="A1" data-court-index="${index}">${playerOptions}</select>
                        ${a2}
                    </div>

                    <div class="prefill-vs">VS</div>

                    <div class="prefill-side">
                        <select data-role="slot" data-slot="B1" data-court-index="${index}">${playerOptions}</select>
                        ${b2}
                    </div>
                </div>
            </div>
        `;
    }).join('');

    safePrefills.forEach((prefill, index) => {
        const slots = prefill?.slots || {};
        ['A1', 'A2', 'B1', 'B2'].forEach(slotKey => {
            const select = el.prefillArea.querySelector(`select[data-role="slot"][data-court-index="${index}"][data-slot="${slotKey}"]`);
            if (select) {
                select.value = slots[slotKey] || '';
            }
        });
    });

    updatePrefillSlotState();
}

function getPrefillStateFromUi() {
    const courtCount = getCourtCount();
    const prefills = [];

    for (let courtIndex = 0; courtIndex < courtCount; courtIndex++) {
        const formatSelect = el.prefillArea.querySelector(`select[data-role="format"][data-court-index="${courtIndex}"]`);
        if (!formatSelect) {
            continue;
        }
        const slots = {};

        ['A1', 'A2', 'B1', 'B2'].forEach(slotKey => {
            const select = el.prefillArea.querySelector(`select[data-role="slot"][data-court-index="${courtIndex}"][data-slot="${slotKey}"]`);
            slots[slotKey] = select ? normalizeName(select.value) : '';
        });

        prefills.push({
            format: formatSelect.value,
            slots
        });
    }

    return prefills;
}

function updatePrefillSlotState() {
    const prefills = getPrefillStateFromUi();

    prefills.forEach((prefill, courtIndex) => {
        const isSingle = prefill.format === COURT_FORMATS.SINGLE;
        ['A2', 'B2'].forEach(slotKey => {
            const label = el.prefillArea.querySelector(`label[data-court-index="${courtIndex}"][data-slot-label="${slotKey}"]`);
            const select = el.prefillArea.querySelector(`select[data-role="slot"][data-court-index="${courtIndex}"][data-slot="${slotKey}"]`);
            if (select && isSingle) {
                select.value = '';
            }
            if (label) {
                label.style.display = isSingle ? 'none' : 'block';
            }
        });
    });
}

function getPossibleFormatsForPrefill(prefill) {
    const slots = prefill.slots || {A1: '', A2: '', B1: '', B2: ''};
    const filledCount = Object.values(slots).filter(Boolean).length;
    const sideACount = [slots.A1, slots.A2].filter(Boolean).length;
    const sideBCount = [slots.B1, slots.B2].filter(Boolean).length;
    const hasBackSlots = Boolean(slots.A2 || slots.B2);

    const result = [];

    if (prefill.format !== COURT_FORMATS.SINGLE && canSupportDouble(slots, sideACount, sideBCount)) {
        result.push(COURT_FORMATS.DOUBLE);
    }

    if (prefill.format !== COURT_FORMATS.DOUBLE && canSupportSingle(slots, sideACount, sideBCount)) {
        result.push(COURT_FORMATS.SINGLE);
    }

    if (filledCount === 0) {
        result.push('unused');
    }

    if (hasBackSlots) {
        return result.filter(f => f !== COURT_FORMATS.SINGLE || !hasBackSlots);
    }

    return result;
}

function canSupportDouble(slots, sideACount, sideBCount) {
    if (sideACount > 2 || sideBCount > 2) return false;
    if (Object.values(slots).filter(Boolean).length > 4) return false;
    return true;
}

function canSupportSingle(slots, sideACount, sideBCount) {
    if (slots.A2 || slots.B2) return false;
    if (sideACount > 1 || sideBCount > 1) return false;
    if (Object.values(slots).filter(Boolean).length > 2) return false;
    return true;
}

function getNeededPlayersForFormat(prefill, format) {
    const filledCount = Object.values(prefill.slots || {}).filter(Boolean).length;
    if (format === COURT_FORMATS.DOUBLE) {
        return 4 - filledCount;
    }
    if (format === COURT_FORMATS.SINGLE) {
        return 2 - filledCount;
    }
    return 0;
}

function comparePlanScore(candidateKey, bestKey) {
    if (!bestKey) return 1;

    for (let i = 0; i < candidateKey.length; i++) {
        if (candidateKey[i] > bestKey[i]) return 1;
        if (candidateKey[i] < bestKey[i]) return -1;
    }

    return 0;
}

function chooseCourtFormats(prefills, availableCount) {
    let bestPlan = null;
    let bestKey = null;

    function backtrack(index, remainingPlayers, currentPlan, stats) {
        if (index >= prefills.length) {
            const candidateKey = [stats.usedPlayers, stats.usedCourts, stats.doubleCount];

            if (comparePlanScore(candidateKey, bestKey) > 0) {
                bestKey = candidateKey;
                bestPlan = [...currentPlan];
            }
            return;
        }

        const prefill = prefills[index];
        const possibleFormats = getPossibleFormatsForPrefill(prefill);

        for (const format of possibleFormats) {
            const needed = getNeededPlayersForFormat(prefill, format);
            if (needed > remainingPlayers) continue;

            const nextStats = {...stats};
            if (format === COURT_FORMATS.DOUBLE) {
                nextStats.doubleCount += 1;
                nextStats.usedPlayers += 4;
                nextStats.usedCourts += 1;
            } else if (format === COURT_FORMATS.SINGLE) {
                nextStats.usedPlayers += 2;
                nextStats.usedCourts += 1;
            }

            currentPlan.push(format);
            backtrack(index + 1, remainingPlayers - needed, currentPlan, nextStats);
            currentPlan.pop();
        }

        if (!possibleFormats.includes('unused') && Object.values(prefill.slots).every(value => !value)) {
            currentPlan.push('unused');
            backtrack(index + 1, remainingPlayers, currentPlan, {...stats});
            currentPlan.pop();
        }
    }

    backtrack(0, availableCount, [], {
        doubleCount: 0,
        usedPlayers: 0,
        usedCourts: 0
    });

    return bestPlan;
}

function fillCourtSlots(prefill, format, availablePlayers) {
    const slotMap = {
        A1: null,
        A2: null,
        B1: null,
        B2: null
    };

    for (const slotKey of Object.keys(slotMap)) {
        if (prefill.slots[slotKey]) {
            slotMap[slotKey] = prefill.slots[slotKey];
        }
    }

    const neededSlots = format === COURT_FORMATS.DOUBLE
        ? ['A1', 'A2', 'B1', 'B2']
        : ['A1', 'B1'];

    for (const slotKey of neededSlots) {
        if (!slotMap[slotKey]) {
            const nextPlayer = popNextEligiblePlayer(availablePlayers, format);
            if (!nextPlayer) {
                throw new Error('Ikke nok spillere til at udfylde den valgte præudfyldning.');
            }
            slotMap[slotKey] = nextPlayer;
        }
    }

    if (format === COURT_FORMATS.SINGLE) {
        slotMap.A2 = null;
        slotMap.B2 = null;
    }

    const lockedSlots = {};
    Object.keys(prefill.slots).forEach(key => {
        if (prefill.slots[key]) {
            lockedSlots[key] = prefill.slots[key];
        }
    });

    return createCourtFromSlots(format, slotMap, lockedSlots);
}

function createRandomRound(players, courtCount, prefills) {
    const prefillsForCourts = prefills.slice(0, courtCount);
    while (prefillsForCourts.length < courtCount) {
        prefillsForCourts.push({
            format: COURT_FORMATS.BOTH,
            slots: {A1: '', A2: '', B1: '', B2: ''}
        });
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
        throw new Error('Kunne ikke finde en gyldig kombination af singler/doubler ud fra de valgte låsninger.');
    }

    const courts = [];

    for (let i = 0; i < chosenPlan.length; i++) {
        const format = chosenPlan[i];
        if (format === 'unused') continue;

        const prefill = prefillsForCourts[i];
        const filledCourt = fillCourtSlots(
            {
                ...prefill,
                slots: Object.fromEntries(
                    Object.entries(prefill.slots).map(([slotKey, playerName]) => [
                        slotKey,
                        playerName ? playerMap.get(playerName) || null : null
                    ])
                )
            },
            format,
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

function getPreferenceScore(player, format) {
    const preference = normalizePlayerPreference(player.matchPreference);

    if (format === COURT_FORMATS.SINGLE && preference === PLAYER_PREFERENCES.NO_SINGLE) {
        return -100000;
    }

    if (format === COURT_FORMATS.DOUBLE && preference === PLAYER_PREFERENCES.NO_DOUBLE) {
        return -100000;
    }

    return 0;
}

function scoreRound(round, history, config) {
    let score = 0;

    const lastRound = history[history.length - 1] || null;
    const prevRound = history[history.length - 2] || null;
    const lastMaps = lastRound ? buildRelationMaps(lastRound) : null;
    const prevMaps = prevRound ? buildRelationMaps(prevRound) : null;

    for (const court of round.courts) {
        const format = court.format || inferCourtFormat(court);
        const teamAPlayers = court.teamA.players;
        const teamBPlayers = court.teamB.players;

        const sumA = court.teamA.totalLevel;
        const sumB = court.teamB.totalLevel;
        const teamDiff = Math.abs(sumA - sumB);

        score -= teamDiff * config.teamBalanceWeight;

        if (format === COURT_FORMATS.DOUBLE) {
            const partnerDiffA = Math.abs(teamAPlayers[0].level - teamAPlayers[1].level);
            const partnerDiffB = Math.abs(teamBPlayers[0].level - teamBPlayers[1].level);
            score -= (partnerDiffA + partnerDiffB) * config.partnerBalanceWeight;

            const teammatePairs = [
                pairKey(teamAPlayers[0].name, teamAPlayers[1].name),
                pairKey(teamBPlayers[0].name, teamBPlayers[1].name)
            ];

            for (const key of teammatePairs) {
                if (lastMaps?.teammatePairs.has(key)) score -= config.teammateLastPenalty;
                if (prevMaps?.teammatePairs.has(key)) score -= config.teammatePrevPenalty;
            }
        }

        for (const a of teamAPlayers) {
            for (const b of teamBPlayers) {
                const key = pairKey(a.name, b.name);
                if (lastMaps?.opponentPairs.has(key)) score -= config.opponentLastPenalty;
                if (prevMaps?.opponentPairs.has(key)) score -= config.opponentPrevPenalty;
            }
        }

        [...teamAPlayers, ...teamBPlayers].forEach(player => {
            score += getPreferenceScore(player, format);
        });

    }

    score += scoreBenchRotation(round, history, config);
    return score;
}

function findBestRound(players, courtCount, iterations, history, config, prefills) {
    let best = null;

    for (let i = 0; i < iterations; i++) {
        try {
            const round = createRandomRound(players, courtCount, prefills);
            const score = scoreRound(round, history, config);
            const candidate = {...round, score, iteration: i + 1};

            if (!best || candidate.score > best.score) {
                best = candidate;
            }
        } catch (error) {
            // spring ugyldige iterationer over
        }
    }

    return best;
}

function getPlayerStats() {
    return state.roster.filter(player => player.active).map(player => {
        let played = 0;
        let benched = 0;
        let singles = 0;
        let doubles = 0;
        let benchedLast = false;
        let benchedPrev = false;

        state.history.forEach((round, index) => {
            const onBench = round.benched.some(p => p.name === player.name);
            const courtPlayed = round.courts.find(court =>
                [...court.teamA.players, ...court.teamB.players].some(p => p.name === player.name)
            );

            if (onBench) benched += 1;
            if (courtPlayed) {
                played += 1;
                const format = courtPlayed.format || inferCourtFormat(courtPlayed);
                if (format === COURT_FORMATS.SINGLE) singles += 1;
                if (format === COURT_FORMATS.DOUBLE) doubles += 1;
            }

            if (index === state.history.length - 1) benchedLast = onBench;
            if (index === state.history.length - 2) benchedPrev = onBench;
        });

        return {
            ...player,
            played,
            benched,
            singles,
            doubles,
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
            const pref = getPreferenceShortLabel(player.matchPreference);

            return `
            <button class="player-chip" type="button" onclick="removePlayer(${index})" title="Klik for at sætte spilleren som inaktiv">
                ${escapeHtml(player.name)}
                <span class="lowered">${player.level}</span>
                ${pref ? `<span class="player-chip-pref">${escapeHtml(pref)}</span>` : ''}
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

    el.playerManagerListArea.innerHTML = players.map(player => {
        const index = state.roster.findIndex(p => p.name === player.name);

        return `
            <div class="player-row ${player.active ? 'is-active' : 'is-inactive'}">
                <div class="player-row-main compact-player-row">
                    <button class="player-row-name" onclick="${player.active ? `removePlayer(${index})` : `markArrived(${index})`}">
                        <strong>${escapeHtml(player.name)}</strong>
                    </button>

                    <div class="player-row-inline-controls">
                        <select class="level-select" data-player-level-index="${index}">
                            ${getLevelOptions(player.level)}
                        </select>

                        <select data-player-preference-index="${index}">
                            ${PLAYER_PREFERENCE_OPTIONS.map(option => `
                                <option value="${option.value}" ${option.value === player.matchPreference ? 'selected' : ''}>
                                    ${option.label}
                                </option>
                            `).join('')}
                        </select>
                    </div>
                </div>
            </div>
        `;
    }).join('');
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
                    <th class="center">Double</th>
                    <th class="center">Single</th>
                    <th class="center">Siddet over</th>
                    <th class="center">Seneste bænk</th>
                </tr>
            </thead>
            <tbody>
                ${stats.map(player => `
                    <tr>
                        <td>
                            ${escapeHtml(player.name)}
                            <div class="table-subtle">${escapeHtml(getPreferenceShortLabel(player.matchPreference))}</div>
                        </td>
                        <td class="center">${player.played}</td>
                        <td class="center">${player.doubles}</td>
                        <td class="center">${player.singles}</td>
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

function renderRound(result) {
    let html = '';

    if (result.courts.length === 0) {
        showStatusMessage('Der var ikke nok aktive spillere til at fylde en bane.');
        return;
    }

    result.courts.forEach((court, index) => {
        const format = court.format || inferCourtFormat(court);
        const formatLabel = format === COURT_FORMATS.SINGLE ? 'Single' : 'Double';

        html += `
            <div class="result-card">
                <div class="court-title">
                    <span>Bane ${index + 1}</span>
                    <div class="court-tags">
                        <span class="tag">${formatLabel}</span>
                    </div>
                </div>
                <div class="vs-grid">
                    <div class="team">
                        ${court.teamA.players.map(player => `
                            <div class="player-line">
                                <span>${escapeHtml(player.name)}</span>
                                <span class="level">${player.level}</span>
                            </div>
                        `).join('')}
                    </div>
                    <div class="flex-center"><strong>VS</strong></div>
                    <div class="team">
                        ${court.teamB.players.map(player => `
                            <div class="player-line">
                                <span>${escapeHtml(player.name)}</span>
                                <span class="level">${player.level}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        `;
    });

    if (result.benched.length > 0) {
        html += `Sidder over: ${result.benched.map(p => `${escapeHtml(p.name)}`).join(', ')}`;
    }

    el.resultArea.innerHTML = html;
}

function describeCourtForHistory(court, courtIndex) {
    const format = court.format || inferCourtFormat(court);

    if (format === COURT_FORMATS.SINGLE) {
        return `${escapeHtml(court.teamA.players[0].name)} mod ${escapeHtml(court.teamB.players[0].name)}`;
    }

    return `${escapeHtml(court.teamA.players[0].name)} og ${escapeHtml(court.teamA.players[1].name)} mod ${escapeHtml(court.teamB.players[0].name)} og ${escapeHtml(court.teamB.players[1].name)}`;
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
        matchPreference: normalizePlayerPreference(player.matchPreference)
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
    const matchPreference = normalizePlayerPreference(el.newPlayerPreference.value);

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

    state.roster.push({name, level, active: true, matchPreference});

    el.newPlayerName.value = '';
    el.newPlayerLevel.value = '2';
    el.newPlayerPreference.value = PLAYER_PREFERENCES.NONE;

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

        if (parts.length < 2 || parts.length > 3) {
            throw new Error(`Ugyldigt format: "${line}". Brug formatet navn,niveau eller navn,niveau,præference`);
        }

        const [name, levelText, preferenceText = PLAYER_PREFERENCES.NONE] = parts;
        const level = Number(levelText);
        const matchPreference = normalizePlayerPreference(preferenceText);

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
            active: false,
            matchPreference
        });
    }

    if (players.length === 0) {
        throw new Error('Spillerlisten er tom.');
    }

    return players;
}

function playersToText(players) {
    return players
        .map(player => `${player.name},${player.level},${getPreferenceLabel(normalizePlayerPreference(player.matchPreference))}`)
        .join('\n');
}

function markArrived(index) {
    const player = state.roster[index];
    if (!player) return;

    player.active = true;
    renderRoster();
    renderPlayerManagerList();
    renderPlayerStats();
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

function updatePlayerPreference(index, preference) {
    const player = state.roster[index];
    if (!player) return;

    player.matchPreference = normalizePlayerPreference(preference);
    renderRoster();
    renderPlayerManagerList();
    renderPlayerStats();
    saveState();
}

window.markArrived = markArrived;
window.removePlayer = removePlayer;

function generateRound() {
    try {
        const players = getActivePlayers();
        const courtCount = getCourtCount();
        const iterations = Math.max(1, Number(el.iterations.value) || 10000);
        const config = getConfig();
        const prefills = getPrefillStateFromUi();

        const best = findBestRound(players, courtCount, iterations, state.history, config, prefills);

        if (!best || best.courts.length === 0) {
            throw new Error('Kunne ikke finde en gyldig opstilling.');
        }

        state.lastResult = best;
        state.history.push(best);

        renderRound(best);
        renderHistory();
        renderPlayerStats();
        updatePanelVisibility();
    } catch (err) {
        showStatusMessage(err.message);
    }

    saveState();
}

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
    renderHistory();
    renderPlayerStats();
    renderRoster();
    renderPlayerManagerList();
    renderPrefillArea(createDefaultPrefills(getCourtCount()));
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
    el.menuDropdown.classList.toggle('open');
}

function closeMenu() {
    el.menuDropdown.classList.remove('open');
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

el.generateBtn.addEventListener('click', generateRound);
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
    el.iterations,
    el.weightTeamBalance,
    el.weightPartnerBalance,
    el.penaltyRepeatTeammate,
    el.penaltyRepeatOpponent,
    el.penaltyBench
].forEach(input => {
    input.addEventListener('change', () => {
        renderPrefillArea(getPrefillStateFromUi());
        saveState();
    });
});

el.prefillArea.addEventListener('change', (event) => {

    const target = event.target;
    if (!(target instanceof HTMLSelectElement)) return;

    const role = target.dataset.role;
    const courtIndex = Number(target.dataset.courtIndex);

    if (role === 'format') {
        updatePrefillSlotState();
        saveState();
        return;
    }

    if (role === 'slot') {
        const prefills = getPrefillStateFromUi();
        const selectedName = normalizeName(target.value);

        if (selectedName) {
            let duplicateFound = false;

            prefills.forEach((prefill, idx) => {
                if (idx === courtIndex) return;
                Object.values(prefill.slots).forEach(name => {
                    if (name === selectedName) {
                        duplicateFound = true;
                    }
                });
            });

            const currentCourtPrefill = prefills[courtIndex];
            const currentSlotKey = target.dataset.slot;

            Object.entries(currentCourtPrefill.slots).forEach(([slotKey, value]) => {
                if (slotKey !== currentSlotKey && value === selectedName) {
                    duplicateFound = true;
                }
            });

            if (duplicateFound) {
                target.value = '';
                showStatusMessage(`Spilleren "${selectedName}" er allerede brugt i præudfyldningen.`);
                return;
            }
        }

        saveState();
    }
});

el.playerManagerListArea.addEventListener('change', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement)) return;

    const prefIndex = Number(target.dataset.playerPreferenceIndex);
    if (Number.isInteger(prefIndex)) {
        updatePlayerPreference(prefIndex, target.value);
        return;
    }

    const levelIndex = Number(target.dataset.playerLevelIndex);
    if (Number.isInteger(levelIndex)) {
        updatePlayerLevel(levelIndex, target.value);
    }
});

el.prefillToggleBtn?.addEventListener('click', () => {
    toggleCollapsiblePanel(el.prefillPanel);
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
