const FIXED_CONFIG = {
    teamBalanceWeight: 12,
    partnerBalanceWeight: 3,
    teammateLastPenalty: 10,
    teammatePrevPenalty: 6,
    opponentLastPenalty: 5,
    opponentPrevPenalty: 2.5,
    benchLastPenalty: 500,
    benchPrevPenalty: 120,
    // Used to flag rounds that violate a hard-constraint rule. Any score
    // below HARD_REJECT_THRESHOLD signals "no feasible round" to the caller.
    hardRejectScore: -1e9,
};
const HARD_REJECT_THRESHOLD = -1e8;


// Format is an integer N meaning "NvN" (N players per team).
// COURT_FORMAT_AUTO means "any enabled format" (the algorithm chooses).
const COURT_FORMAT_AUTO = 'auto';
const MAX_TEAM_SIZE = 11;

// 5 navngivne niveauer. Tallene (1-5) bruges KUN internt af
// match-algoritmen — brugerne ser aldrig tal.
const LEVEL_NAMES = ['Nybegynder', 'Let øvet', 'Øvet', 'Rutineret', 'Elite'];

function clampLevel(raw) {
    const n = Number(raw) || 3;
    return Math.max(1, Math.min(5, Math.round(n)));
}

function levelName(level) {
    return LEVEL_NAMES[clampLevel(level) - 1];
}


const state = {
    roster: [],
    history: [],
    lastResult: null,
    teams: [], // populated when team mode is enabled
    // Whether the global "show all levels" toggle is on.
    showAllLevels: true,
    // Sort mode for player lists ('name' | 'level-asc' | 'level-desc').
    sortPlayersBy: 'name',
    // Server-auth state. user = null when not logged in.
    user: null,
    // Klubbens hold + fælles spillerbase (hentes efter login/klubskifte).
    cloudSquads: [],
    clubPlayers: [],
    // Varigt kamparkiv på denne enhed (til spillerstatistik). Runder
    // arkiveres hertil, inden historikken ryddes — statistikken overlever
    // altså "Nulstil historik" og nye spilleaftener.
    matchLog: [],
    // Kampe (rid:bane-nøgler) der endnu ikke er sendt til klubbens
    // fælles statistik. Tømmes efterhånden som sync lykkes.
    pendingSync: [],
};

const STORAGE_KEY = 'kampprogram-state-v3';
const STORAGE_KEY_V2 = 'kampprogram-state-v2';

const PRESET_LISTS_STORAGE_KEY = 'kampprogram-playerlists-v1';

let toastTimer = null;

const el = {
    mainPage: document.getElementById('mainPage'),
    fetchPlayersPanel: document.getElementById('fetchPlayersPanel'),
    allPlayersTitle: document.getElementById('allPlayersTitle'),
    playerStatsArea: document.getElementById('playerStatsArea'),
    playerManagerListArea: document.getElementById('playerManagerListArea'),
    playersPanel: document.getElementById('playersPanel'),
    arrivalPanel: document.getElementById('arrivalPanel'),
    newPlayerPanel: document.getElementById('newPlayerPanel'),
    editResultBtn: document.getElementById('editResultBtn'),
    newPlayerBtn: document.getElementById('newPlayerBtn'),
    closeNewPlayerBtn: document.getElementById('closeNewPlayerBtn'),
    newPlayerName: document.getElementById('newPlayerName'),
    newPlayerLevel: document.getElementById('newPlayerLevel'),
    addPlayerBtn: document.getElementById('addPlayerBtn'),
    courtCount: document.getElementById('courtCount'),
    generateOverlay: document.getElementById('generateOverlay'),
    shuffleBtn: document.getElementById('shuffleBtn'),
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
    playerListsBtn: document.getElementById('playerListsBtn'),
    openPlayerListsBtn: document.getElementById('openPlayerListsBtn'),
    closePlayerListsBtn: document.getElementById('closePlayerListsBtn'),
    listsTabbar: document.getElementById('listsTabbar'),
    listsTabKlub: document.getElementById('listsTabKlub'),
    listsTabPrivat: document.getElementById('listsTabPrivat'),
    listsTabImport: document.getElementById('listsTabImport'),
    listsClubHint: document.getElementById('listsClubHint'),
    tabbar: document.getElementById('tabbar'),
    tabFremmode: document.getElementById('tabFremmode'),
    tabKampe: document.getElementById('tabKampe'),
    tabAftenen: document.getElementById('tabAftenen'),
    tabAttendBadge: document.getElementById('tabAttendBadge'),
    actionbarMet: document.getElementById('actionbarMet'),
    openSetupBtn: document.getElementById('openSetupBtn'),
    headerSub: document.getElementById('headerSub'),
    prefillBadge: document.getElementById('prefillBadge'),
    roundTitle: document.getElementById('roundTitle'),
    roundSubtitle: document.getElementById('roundSubtitle'),
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
    maximizeCourtsRow: document.getElementById('maximizeCourtsRow'),
    // New rule-based settings
    partnerLevelRule: document.getElementById('partnerLevelRule'),
    opponentLevelRule: document.getElementById('opponentLevelRule'),
    newPartnerRule: document.getElementById('newPartnerRule'),
    newOpponentRule: document.getElementById('newOpponentRule'),
    newPartnerRuleRow: document.getElementById('newPartnerRuleRow'),
    newPartnerRuleHint: document.getElementById('newPartnerRuleHint'),
    disallowExactRepeat: document.getElementById('disallowExactRepeat'),
    rulesSection: document.getElementById('rulesSection'),
    // Player-list view controls
    toggleLevelsBtn: document.getElementById('toggleLevelsBtn'),
    actionsToggleBtn: document.getElementById('actionsToggleBtn'),
    actionsDropdown: document.getElementById('actionsDropdown'),
    bulkDeleteBtn: document.getElementById('bulkDeleteBtn'),
    bulkDeletePanel: document.getElementById('bulkDeletePanel'),
    bulkDeleteList: document.getElementById('bulkDeleteList'),
    bulkDeleteConfirmBtn: document.getElementById('bulkDeleteConfirmBtn'),
    bulkDeleteSelectAllBtn: document.getElementById('bulkDeleteSelectAllBtn'),
    bulkDeleteClearBtn: document.getElementById('bulkDeleteClearBtn'),
    closeBulkDeleteBtn: document.getElementById('closeBulkDeleteBtn'),
    // Auth + cloud
    accountBtn: document.getElementById('accountBtn'),
    usersBtn: document.getElementById('usersBtn'),
    adminBtn: document.getElementById('adminBtn'),
    adminPanel: document.getElementById('adminPanel'),
    closeAdminBtn: document.getElementById('closeAdminBtn'),
    adminStats: document.getElementById('adminStats'),
    adminClubsList: document.getElementById('adminClubsList'),
    newClubName: document.getElementById('newClubName'),
    createClubBtn: document.getElementById('createClubBtn'),
    adminNewUserClub: document.getElementById('adminNewUserClub'),
    adminNewUserName: document.getElementById('adminNewUserName'),
    adminNewUserEmail: document.getElementById('adminNewUserEmail'),
    adminNewUserPassword: document.getElementById('adminNewUserPassword'),
    adminNewUserRole: document.getElementById('adminNewUserRole'),
    adminCreateUserBtn: document.getElementById('adminCreateUserBtn'),
    adminNewUserError: document.getElementById('adminNewUserError'),
    adminUsersList: document.getElementById('adminUsersList'),
    adminActivityList: document.getElementById('adminActivityList'),
    loginPanel: document.getElementById('loginPanel'),
    closeLoginBtn: document.getElementById('closeLoginBtn'),
    loginForm: document.getElementById('loginForm'),
    loginEmail: document.getElementById('loginEmail'),
    loginPassword: document.getElementById('loginPassword'),
    loginSubmitBtn: document.getElementById('loginSubmitBtn'),
    loginError: document.getElementById('loginError'),
    loginPanelTitle: document.getElementById('loginPanelTitle'),
    loginIntro: document.getElementById('loginIntro'),
    noClubHint: document.getElementById('noClubHint'),
    loggedInView: document.getElementById('loggedInView'),
    loggedInName: document.getElementById('loggedInName'),
    loggedInRole: document.getElementById('loggedInRole'),
    loggedInClub: document.getElementById('loggedInClub'),
    logoutBtn: document.getElementById('logoutBtn'),
    changePasswordBtn: document.getElementById('changePasswordBtn'),
    changePasswordPanel: document.getElementById('changePasswordPanel'),
    closeChangePasswordBtn: document.getElementById('closeChangePasswordBtn'),
    changePasswordForm: document.getElementById('changePasswordForm'),
    currentPassword: document.getElementById('currentPassword'),
    newPassword: document.getElementById('newPassword'),
    changePasswordError: document.getElementById('changePasswordError'),
    usersPanel: document.getElementById('usersPanel'),
    closeUsersBtn: document.getElementById('closeUsersBtn'),
    usersList: document.getElementById('usersList'),
    invitesList: document.getElementById('invitesList'),
    inviteEmail: document.getElementById('inviteEmail'),
    inviteRole: document.getElementById('inviteRole'),
    sendInviteBtn: document.getElementById('sendInviteBtn'),
    inviteError: document.getElementById('inviteError'),
    inviteLinkBox: document.getElementById('inviteLinkBox'),
    clubSwitchRow: document.getElementById('clubSwitchRow'),
    clubSwitchSelect: document.getElementById('clubSwitchSelect'),
    loggedInClubInfo: document.getElementById('loggedInClubInfo'),
    invitePanel: document.getElementById('invitePanel'),
    closeInviteBtn: document.getElementById('closeInviteBtn'),
    inviteInfoText: document.getElementById('inviteInfoText'),
    inviteAcceptView: document.getElementById('inviteAcceptView'),
    inviteLoginView: document.getElementById('inviteLoginView'),
    inviteRegisterView: document.getElementById('inviteRegisterView'),
    acceptInviteBtn: document.getElementById('acceptInviteBtn'),
    inviteLoginForm: document.getElementById('inviteLoginForm'),
    inviteLoginPassword: document.getElementById('inviteLoginPassword'),
    inviteRegisterForm: document.getElementById('inviteRegisterForm'),
    inviteRegName: document.getElementById('inviteRegName'),
    inviteRegPassword: document.getElementById('inviteRegPassword'),
    inviteFlowError: document.getElementById('inviteFlowError'),
    adminMemberUser: document.getElementById('adminMemberUser'),
    adminMemberClub: document.getElementById('adminMemberClub'),
    adminMemberRole: document.getElementById('adminMemberRole'),
    adminAddMembershipBtn: document.getElementById('adminAddMembershipBtn'),
    clubBtn: document.getElementById('clubBtn'),
    clubPanel: document.getElementById('clubPanel'),
    closeClubBtn: document.getElementById('closeClubBtn'),
    clubPanelTitle: document.getElementById('clubPanelTitle'),
    clubPanelStats: document.getElementById('clubPanelStats'),
    clubCourtsRow: document.getElementById('clubCourtsRow'),
    clubCourtsInput: document.getElementById('clubCourtsInput'),
    saveClubCourtsBtn: document.getElementById('saveClubCourtsBtn'),
    sessionShareRow: document.getElementById('sessionShareRow'),
    saveClubSessionBtn: document.getElementById('saveClubSessionBtn'),
    clubSessionsList: document.getElementById('clubSessionsList'),
    clubDangerZone: document.getElementById('clubDangerZone'),
    deleteClubBtn: document.getElementById('deleteClubBtn'),
    quickAddClubPlayer: document.getElementById('quickAddClubPlayer'),
    photoFileInput: document.getElementById('photoFileInput'),
    statsBtn: document.getElementById('statsBtn'),
    statsPanel: document.getElementById('statsPanel'),
    closeStatsBtn: document.getElementById('closeStatsBtn'),
    statsInterval: document.getElementById('statsInterval'),
    statsSort: document.getElementById('statsSort'),
    statsListArea: document.getElementById('statsListArea'),
    clearStatsBtn: document.getElementById('clearStatsBtn'),
    exportStatsBtn: document.getElementById('exportStatsBtn'),
    importStatsBtn: document.getElementById('importStatsBtn'),
    importStatsFile: document.getElementById('importStatsFile'),
    endEveningBtn: document.getElementById('endEveningBtn'),
    clubSquadCreateRow: document.getElementById('clubSquadCreateRow'),
    clubNewSquadName: document.getElementById('clubNewSquadName'),
    clubCreateSquadBtn: document.getElementById('clubCreateSquadBtn'),
    clubSquadsList: document.getElementById('clubSquadsList'),
    cloudListsSection: document.getElementById('cloudListsSection'),
    cloudPlayerList: document.getElementById('cloudPlayerList'),
    loadCloudListBtn: document.getElementById('loadCloudListBtn'),
    newCloudListName: document.getElementById('newCloudListName'),
    saveCloudListBtn: document.getElementById('saveCloudListBtn'),
    deleteCloudList: document.getElementById('deleteCloudList'),
    deleteCloudListBtn: document.getElementById('deleteCloudListBtn'),
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
    const maximize = el.maximizeCourts?.checked ?? false;

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
    if (el.newPartnerRuleRow) {
        el.newPartnerRuleRow.classList.toggle('hidden', tm);
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
    archiveHistoryToMatchLog();
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
    archiveHistoryToMatchLog();
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
        const totalLevelHtml = '';
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
                            ${shouldShowLevels() ? `<span class="level">${escapeHtml(levelName(m.level))}</span>` : ''}
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

// Stram validering af spillerfotos (XSS-værn): kun rene base64-data-URL'er
// fra kendte billedformater accepteres — uanset om de kommer fra egen canvas,
// localStorage eller klubbens API.
const PHOTO_DATAURL_RE = /^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/;

function sanitizePhoto(raw) {
    return (typeof raw === 'string' && raw.length <= 200000 && PHOTO_DATAURL_RE.test(raw)) ? raw : null;
}

// Stabilt spiller-id: 'c<id>' for spillere fra klubbens spillerbase,
// 'l<random>' for lokalt oprettede. Identitet følger id'et — ikke navnet.
function makeLocalPid() {
    return `l${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function isClubPid(pid) {
    return typeof pid === 'string' && /^c\d+$/.test(pid);
}

function clubIdFromPid(pid) {
    return isClubPid(pid) ? Number(pid.slice(1)) : null;
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
                level: clampLevel(m.level),
                pid: (typeof m.pid === 'string' && m.pid) ? m.pid : undefined,
            })),
            id: player.id || `team-${Math.random().toString(36).slice(2, 8)}`,
        };
    }
    return {
        name: normalizeName(player.name),
        level: clampLevel(player.level),
        active: Boolean(player.active),
        // Stabilt id — statistik, fotos og klub-identitet hænger på dette.
        pid: (typeof player.pid === 'string' && player.pid) ? player.pid : makeLocalPid(),
        // Oprettelsestidspunkt (til sortering). Gamle spillere uden stempel
        // får ét første gang, de normaliseres — stabilt derefter.
        createdAt: Number(player.createdAt) || Date.now(),
        // Valgfrit lille spillerfoto (data-URL fra canvas-nedskalering).
        photo: sanitizePhoto(player.photo),
    };
}

function normalizeTeam(team) {
    if (!team || !Array.isArray(team.members)) return null;
    const members = team.members.map(m => ({
        name: normalizeName(m.name),
        level: clampLevel(m.level),
    }));
    return {
        id: team.id || `team-${Math.random().toString(36).slice(2, 8)}`,
        name: normalizeName(team.name) || 'Hold',
        members,
        level: members.reduce((s, m) => s + m.level, 0),
        active: team.active === undefined ? true : Boolean(team.active),
    };
}

function getLevelOptions(selectedLevel = 3) {
    const sel = clampLevel(selectedLevel);
    return LEVEL_NAMES
        .map((name, i) => `<option value="${i + 1}" ${sel === i + 1 ? 'selected' : ''}>${name}</option>`)
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
        const levelSuffix = shouldShowLevels() ? ` (${levelName(player.level)})` : '';
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
        matchLog: state.matchLog || [],
        pendingSync: state.pendingSync || [],
        ui: {
            courtCount: el.courtCount.value,
            partnerLevelRule: el.partnerLevelRule?.value ?? 'prefer',
            opponentLevelRule: el.opponentLevelRule?.value ?? 'prefer',
            newPartnerRule: el.newPartnerRule?.value ?? 'prefer',
            newOpponentRule: el.newOpponentRule?.value ?? 'prefer',
            disallowExactRepeat: el.disallowExactRepeat?.checked ?? false,
            showAllLevels: state.showAllLevels,
            sortPlayersBy: state.sortPlayersBy,
            statsInterval: el.statsInterval?.value ?? '0',
            statsSort: el.statsSort?.value ?? 'name',
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
            maximizeCourts: el.maximizeCourts?.checked ?? false,
            defaultCourtCount: el.defaultCourtCount?.value ?? '2',
            teamMode: el.teamMode?.checked ?? false,
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

    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
        // Typisk QuotaExceededError — sig det højt i stedet for at fejle stille.
        showStatusMessage('⚠ Kunne ikke gemme alle data lokalt (lageret er fuldt). Prøv at fjerne nogle spillerfotos.');
    }
}

// Convert v2 ui blob into v3-shaped ui object. v2 had separate
// useSkillLevels/hideSkillLevels/weightTeamBalance/weightPartnerBalance/
// penaltyRepeatTeammate flags; v3 collapses them into rule dropdowns.
function migrateV2ToV3(oldUi) {
    if (!oldUi || typeof oldUi !== 'object') return oldUi;
    const u = { ...oldUi };
    const usingLevels = u.useSkillLevels !== undefined ? Boolean(u.useSkillLevels) : true;
    u.partnerLevelRule = (usingLevels && Boolean(u.weightPartnerBalance)) ? 'prefer' : 'none';
    u.opponentLevelRule = (usingLevels && Boolean(u.weightTeamBalance)) ? 'prefer' : 'none';
    u.newPartnerRule = Boolean(u.penaltyRepeatTeammate) ? 'prefer' : 'none';
    // v2 always penalised repeating opponents (no UI). Keep that behaviour.
    u.newOpponentRule = u.newOpponentRule || 'prefer';
    u.disallowExactRepeat = Boolean(u.disallowExactRepeat);
    u.showAllLevels = u.showAllLevels !== undefined ? Boolean(u.showAllLevels) : !Boolean(u.hideSkillLevels);
    u.sortPlayersBy = u.sortPlayersBy || 'name';
    // Drop obsolete keys so they don't shadow new ones if a future read
    // accidentally falls back to defaults.
    delete u.useSkillLevels;
    delete u.hideSkillLevels;
    delete u.weightTeamBalance;
    delete u.weightPartnerBalance;
    delete u.penaltyRepeatTeammate;
    return u;
}

function restoreState() {
    try {
        // Prefer v3, fall back to v2 with migration so existing users don't
        // lose their settings on the upgrade.
        let raw = localStorage.getItem(STORAGE_KEY);
        let migratedFromV2 = false;
        if (!raw) {
            const rawV2 = localStorage.getItem(STORAGE_KEY_V2);
            if (rawV2) {
                const parsedV2 = JSON.parse(rawV2);
                if (parsedV2 && parsedV2.ui) parsedV2.ui = migrateV2ToV3(parsedV2.ui);
                raw = JSON.stringify(parsedV2);
                migratedFromV2 = true;
            }
        }
        if (!raw) return false;

        const data = JSON.parse(raw);

        state.roster = Array.isArray(data.roster) ? data.roster.map(normalizePlayer) : [];
        state.history = Array.isArray(data.history) ? data.history.map(normalizeRoundFromStorage) : [];
        // Always make lastResult point at the same object as the final history
        // entry so edits to the current round are reflected in history (and used
        // when scoring the next round).
        state.lastResult = state.history[state.history.length - 1] || null;
        state.teams = Array.isArray(data.teams) ? data.teams.map(normalizeTeam) : [];
        state.matchLog = Array.isArray(data.matchLog) ? data.matchLog.filter(isValidLogEntry) : [];
        state.pendingSync = Array.isArray(data.pendingSync)
            ? data.pendingSync.filter(k => typeof k === 'string').slice(-2000) : [];

        if (data.ui) {
            const defaultCourts = data.ui.defaultCourtCount ?? '2';
            if (el.defaultCourtCount) el.defaultCourtCount.value = defaultCourts;
            el.courtCount.value = defaultCourts;

            // Rule selects — fall back to v3 defaults if missing.
            if (el.partnerLevelRule) el.partnerLevelRule.value = data.ui.partnerLevelRule ?? 'prefer';
            if (el.opponentLevelRule) el.opponentLevelRule.value = data.ui.opponentLevelRule ?? 'prefer';
            if (el.newPartnerRule) el.newPartnerRule.value = data.ui.newPartnerRule ?? 'prefer';
            if (el.newOpponentRule) el.newOpponentRule.value = data.ui.newOpponentRule ?? 'prefer';
            if (el.disallowExactRepeat) el.disallowExactRepeat.checked = Boolean(data.ui.disallowExactRepeat);

            // Visibility/sort live in state (not on DOM elements).
            state.showAllLevels = data.ui.showAllLevels !== undefined ? Boolean(data.ui.showAllLevels) : true;
            state.sortPlayersBy = data.ui.sortPlayersBy || 'name';
            if (el.statsInterval && data.ui.statsInterval !== undefined) el.statsInterval.value = String(data.ui.statsInterval);
            if (el.statsSort && data.ui.statsSort) el.statsSort.value = String(data.ui.statsSort);
            syncSortMenuItems();
            syncLevelsMenuItem();
            updateSkillLevelSettingsUI();
            updateRulesUI();

            // Restore enabled formats (default: 1v1 and 2v2)
            const savedFormats = Array.isArray(data.ui.enabledFormats) ? data.ui.enabledFormats : [1, 2];
            for (let n = 1; n <= MAX_TEAM_SIZE; n++) {
                const cb = document.getElementById(`format-${n}v${n}`);
                if (cb) cb.checked = savedFormats.includes(n);
            }
            if (el.maximizeCourts) el.maximizeCourts.checked = data.ui.maximizeCourts ?? false;
            if (el.teamMode) {
                el.teamMode.checked = Boolean(data.ui.teamMode);
                syncTeamModeToggle();
            }

            // Persist the v3-shape immediately so the v2 key isn't needed again.
            if (migratedFromV2) saveState();
        }
        // Panels default to collapsed when no saved value exists.
        const collapsedPanels = data.ui?.collapsedPanels || {};
        const setCollapsed = (panel, key) => {
            if (!panel) return;
            const collapsed = collapsedPanels[key] ?? true;
            panel.classList.toggle('collapsed', collapsed);
        };
        setCollapsed(el.fetchPlayersPanel, 'fetchPlayersPanel');
        setCollapsed(el.prefillPanel, 'prefillPanel');

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
        rid: (typeof round.rid === 'string' && round.rid) ? round.rid : makeRoundId(),
        ts: Number(round.ts) || Date.now(),
        courts: round.courts.map(court => ({
            ...court,
            result: (court.result === 'A' || court.result === 'B' || court.result === 'D') ? court.result : null,
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
                level: clampLevel(m.level),
                pid: (typeof m.pid === 'string' && m.pid) ? m.pid : undefined,
            })),
            id: player.id || `team-${Math.random().toString(36).slice(2, 8)}`,
        };
    }
    return {
        name: normalizeName(player.name),
        level: clampLevel(player.level),
        active: true,
        pid: (typeof player.pid === 'string' && player.pid) ? player.pid : undefined,
    };
}

function clonePlayers(players) {
    return players.map(player => normalizePlayer(player));
}

// SVG-ikon fra den self-hostede sprite (custom-ikoner, samme origin —
// virker offline via service workeren). currentColor arver knappens farve.
function icon(name, cls = '') {
    return `<svg class="icon${cls ? ' ' + cls : ''}" aria-hidden="true" focusable="false"><use href="icons.svg#kp-${name}"></use></svg>`;
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
    if (el.allPlayersTitle) {
        el.allPlayersTitle.innerHTML = `Dagens spillere <span class="attendance-count">${activePlayersCount} af ${totalPlayersCount} mødt op</span>`;
    }
    if (el.actionbarMet) el.actionbarMet.textContent = `${activePlayersCount} mødt`;
    if (el.tabAttendBadge) el.tabAttendBadge.textContent = String(activePlayersCount);
}

// ── Faner: Fremmøde / Kampe / Aftenen ──
// Frie visninger, ikke en guide. Appen åbner på Fremmøde (eller Kampe hvis
// en runde allerede findes) og skifter selv til Kampe efter generering.
let activeTab = 'fremmode';

function setActiveTab(name) {
    if (!el.tabFremmode) return;
    activeTab = name;
    el.tabFremmode.classList.toggle('hidden', name !== 'fremmode');
    el.tabKampe.classList.toggle('hidden', name !== 'kampe');
    el.tabAftenen.classList.toggle('hidden', name !== 'aftenen');
    el.tabbar?.querySelectorAll('[data-tab]').forEach(btn => {
        btn.classList.toggle('is-active', btn.dataset.tab === name);
    });
}

el.tabbar?.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-tab]');
    if (btn) setActiveTab(btn.dataset.tab);
});

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
    // Kampe-fanen er altid synlig; "Lav næste runde" i handlingslinjen
    // deaktiveres blot, når der ikke kan laves kampe.
    if (el.generateBtn) el.generateBtn.disabled = !canMatch;

    el.playerStatsPanel.classList.toggle('hidden', !hasHistory);
    el.historyPanel.classList.toggle('hidden', !hasHistory);
    updateRoundHeader();
    updatePrefillBadge();

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

// Runde-overskriften på Kampe-fanen.
function updateRoundHeader() {
    if (!el.roundTitle) return;
    const hasRound = state.history.length > 0 && state.lastResult;
    if (hasRound) {
        el.roundTitle.textContent = `Runde ${state.history.length}`;
        const courts = state.lastResult.courts.length;
        el.roundSubtitle.textContent = `${courts} ${courts === 1 ? 'bane' : 'baner'} · Resultater er valgfrie`;
    } else {
        el.roundTitle.textContent = 'Ingen runde endnu';
        el.roundSubtitle.textContent = 'Markér fremmøde og tryk "Lav næste runde".';
    }
}

// Markering på "Lås pladser", når mindst én lås er sat.
function updatePrefillBadge() {
    if (!el.prefillBadge) return;
    let active = false;
    try {
        active = getPrefillStateFromUi().some(p =>
            (p.format && p.format !== COURT_FORMAT_AUTO) || Object.values(p.slots || {}).some(Boolean));
    } catch (e) { /* før første render */ }
    el.prefillBadge.classList.toggle('hidden', !active);
}

function collapseAllAndShowResult() {
    // Faner har erstattet sammenfoldningen: vis Kampe-fanen med den nye runde.
    setActiveTab('kampe');
    window.scrollTo(0, 0);
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
        active: false,
        // Fotos gemmes IKKE i lokale lister (ville duplikere dem i localStorage);
        // de gendannes automatisk fra klubbens spillerbase ved login.
        photo: null,
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
    const partnerLevelRule = el.partnerLevelRule?.value || 'none';
    const opponentLevelRule = el.opponentLevelRule?.value || 'none';
    const newPartnerRule = el.newPartnerRule?.value || 'none';
    const newOpponentRule = el.newOpponentRule?.value || 'none';
    const disallowExactRepeat = !!el.disallowExactRepeat?.checked;

    return {
        // Soft scoring weights — active for both 'prefer' and 'require' (the
        // 'require' variants additionally hard-reject in scoreRound).
        teamBalanceWeight:    (opponentLevelRule !== 'none') ? FIXED_CONFIG.teamBalanceWeight    : 0,
        partnerBalanceWeight: (partnerLevelRule  !== 'none') ? FIXED_CONFIG.partnerBalanceWeight : 0,
        teammateLastPenalty:  (newPartnerRule    !== 'none') ? FIXED_CONFIG.teammateLastPenalty  : 0,
        teammatePrevPenalty:  (newPartnerRule    !== 'none') ? FIXED_CONFIG.teammatePrevPenalty  : 0,
        opponentLastPenalty:  (newOpponentRule   !== 'none') ? FIXED_CONFIG.opponentLastPenalty  : 0,
        opponentPrevPenalty:  (newOpponentRule   !== 'none') ? FIXED_CONFIG.opponentPrevPenalty  : 0,
        // Bench rotation is unconditional baseline behaviour.
        benchLastPenalty: FIXED_CONFIG.benchLastPenalty,
        benchPrevPenalty: FIXED_CONFIG.benchPrevPenalty,
        // Hard-constraint rules (consumed by scoreRound pre-check).
        partnerLevelRule, opponentLevelRule, newPartnerRule, newOpponentRule, disallowExactRepeat,
        partnerLevelRequireMaxSpread: 1,   // teams may differ by at most this within a court
        opponentLevelRequireMaxDiff: 2,    // opposing team totals may differ by at most this
    };
}

function isUsingSkillLevels() {
    // Skill levels are "in use" if any niveau-based rule is active.
    const p = el.partnerLevelRule?.value || 'none';
    const o = el.opponentLevelRule?.value || 'none';
    return p !== 'none' || o !== 'none';
}

// Global "all levels visible" predicate, used for places where we have no
// specific player (team totals, dropdown labels). For per-row decisions
// use isLevelVisibleForPlayer().
function shouldShowLevels() {
    return isUsingSkillLevels() && state.showAllLevels;
}

// Per-player visibility: levels are either all shown or all hidden (no per-player override).
function isLevelVisibleForPlayer(_playerName) {
    return shouldShowLevels();
}

// Sort a player list according to the user's chosen sort mode. Falls back
// to alphabetical when levels aren't in use (sorting by hidden values is silly).
function sortPlayersForDisplay(players) {
    let mode = state.sortPlayersBy || 'name';
    // Niveau-sortering er meningsløs når niveauer ikke er i brug.
    if (!isUsingSkillLevels() && mode.startsWith('level')) mode = 'name';
    const byName = (a, b) => a.name.localeCompare(b.name, 'da');
    const created = (p) => Number(p.createdAt) || 0;
    if (mode === 'level-asc')    return [...players].sort((a, b) => (a.level - b.level) || byName(a, b));
    if (mode === 'level-desc')   return [...players].sort((a, b) => (b.level - a.level) || byName(a, b));
    if (mode === 'created-desc') return [...players].sort((a, b) => (created(b) - created(a)) || byName(a, b));
    if (mode === 'created-asc')  return [...players].sort((a, b) => (created(a) - created(b)) || byName(a, b));
    if (mode === 'active-first') return [...players].sort((a, b) => ((b.active ? 1 : 0) - (a.active ? 1 : 0)) || byName(a, b));
    return [...players].sort(byName);
}

function updateSkillLevelSettingsUI() {
    const using = isUsingSkillLevels();
    // Sort-by-level submenu items hide themselves when levels aren't in use.
    document.querySelectorAll('.actions-dropdown [data-sort-value^="level"]').forEach(item => {
        item.classList.toggle('hidden', !using);
    });
    syncLevelsMenuItem();
    syncSortMenuItems();
}

// Reflect state.sortPlayersBy onto the radio sub-items in the actions menu.
function syncSortMenuItems() {
    const items = document.querySelectorAll('.actions-dropdown [data-sort-value]');
    items.forEach(it => {
        const isActive = it.dataset.sortValue === state.sortPlayersBy;
        it.setAttribute('aria-checked', String(isActive));
        it.classList.toggle('menu-radio--active', isActive);
    });
}

// Reflect state.showAllLevels onto the menu item's label so the user can
// see at a glance what clicking will do next.
function syncLevelsMenuItem() {
    if (!el.toggleLevelsBtn) return;
    // Hide entirely when skill levels aren't in use — there's nothing to toggle.
    el.toggleLevelsBtn.classList.toggle('hidden', !isUsingSkillLevels());
    const eye = el.toggleLevelsBtn.querySelector('.eye-icon');
    const label = el.toggleLevelsBtn.querySelector('.menu-item-label');
    // When levels are visible, clicking will HIDE → show eyes-with-slash and "Skjul" label.
    // When levels are hidden,  clicking will SHOW → show plain eyes and "Vis" label.
    if (eye) eye.innerHTML = icon(state.showAllLevels ? 'eye' : 'eye-off');
    if (label) label.textContent = state.showAllLevels ? 'Skjul niveauer' : 'Vis niveauer';
}

// Reflect el.teamMode.checked onto the segmented toggle visual.
function syncTeamModeToggle() {
    const on = !!el.teamMode?.checked;
    const opts = el.teamModeRow?.querySelectorAll('[data-team-mode]');
    opts?.forEach(opt => {
        const isThis = (opt.dataset.teamMode === 'true') === on;
        opt.classList.toggle('mode-toggle__option--active', isThis);
        opt.setAttribute('aria-checked', String(isThis));
    });
}

// Show/hide the 1v1 hint on newPartnerRule + any other dependent UI bits.
function updateRulesUI() {
    if (!el.newPartnerRuleHint) return;
    const rule = el.newPartnerRule?.value || 'none';
    // The "new partners" rule has no meaning when every match is effectively 1v1
    // (either explicitly via formats, or implicitly because team-mode runs each
    // round as a 1v1 super-player match).
    const formats = (() => {
        const f = [];
        for (let n = 1; n <= MAX_TEAM_SIZE; n++) {
            if (document.getElementById(`format-${n}v${n}`)?.checked) f.push(n);
        }
        return f;
    })();
    const only1v1 = !!el.teamMode?.checked || (formats.length === 1 && formats[0] === 1);
    const ruleAppliesToPartners = rule !== 'none';
    el.newPartnerRuleHint.classList.toggle('hidden', !(only1v1 && ruleAppliesToPartners));
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
        const maximize = el.maximizeCourts?.checked ?? false;
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


// Canonical fingerprint of a round (insensitive to A/B swaps and court order).
function roundFingerprint(round) {
    if (!round || !Array.isArray(round.courts)) return '';
    const courtKeys = round.courts.map(court => {
        const a = (court.teamA?.players || []).map(p => p.name).slice().sort().join(',');
        const b = (court.teamB?.players || []).map(p => p.name).slice().sort().join(',');
        return [a, b].sort().join('|');
    }).slice().sort();
    const bench = (round.benched || []).map(p => p.name).slice().sort().join(',');
    return courtKeys.join(';') + '#' + bench;
}

// Build a per-player teammate Set<name>. Includes only players who actually
// played (had teammates with whom they shared a court).
function buildTeammateSets(round) {
    const out = new Map();
    for (const court of round.courts || []) {
        for (const team of [court.teamA?.players || [], court.teamB?.players || []]) {
            for (const p of team) {
                if (!out.has(p.name)) out.set(p.name, new Set());
                for (const q of team) {
                    if (q.name !== p.name) out.get(p.name).add(q.name);
                }
            }
        }
    }
    return out;
}

// Build a per-player opponent Set<name>.
function buildOpponentSets(round) {
    const out = new Map();
    for (const court of round.courts || []) {
        const A = court.teamA?.players || [];
        const B = court.teamB?.players || [];
        for (const p of A) {
            if (!out.has(p.name)) out.set(p.name, new Set());
            for (const q of B) out.get(p.name).add(q.name);
        }
        for (const p of B) {
            if (!out.has(p.name)) out.set(p.name, new Set());
            for (const q of A) out.get(p.name).add(q.name);
        }
    }
    return out;
}

function scoreRound(round, history, config) {
    let score = 0;

    const lastRound = history[history.length - 1] || null;
    const prevRound = history[history.length - 2] || null;
    const lastMaps = lastRound ? buildRelationMaps(lastRound) : null;
    const prevMaps = prevRound ? buildRelationMaps(prevRound) : null;

    // ── Hard-constraint pre-checks. Any violation returns a very negative
    //    score so this round is effectively rejected by the search. ──
    if (config.disallowExactRepeat && lastRound) {
        if (roundFingerprint(round) === roundFingerprint(lastRound)) {
            return FIXED_CONFIG.hardRejectScore;
        }
    }

    if (config.partnerLevelRule === 'require' || config.opponentLevelRule === 'require') {
        for (const court of round.courts) {
            if (config.partnerLevelRule === 'require') {
                for (const team of [court.teamA.players, court.teamB.players]) {
                    if (team.length > 1) {
                        const levels = team.map(p => p.level);
                        const spread = Math.max(...levels) - Math.min(...levels);
                        if (spread > config.partnerLevelRequireMaxSpread) {
                            return FIXED_CONFIG.hardRejectScore;
                        }
                    }
                }
            }
            if (config.opponentLevelRule === 'require') {
                const diff = Math.abs(court.teamA.totalLevel - court.teamB.totalLevel);
                if (diff > config.opponentLevelRequireMaxDiff) {
                    return FIXED_CONFIG.hardRejectScore;
                }
            }
        }
    }

    // "new partner" hard rules (oneNew / allNew). 1v1 has no teammates so
    // those players are exempt automatically (their teammate sets are empty).
    if (lastRound && (config.newPartnerRule === 'oneNew' || config.newPartnerRule === 'allNew')) {
        const thisMates = buildTeammateSets(round);
        const lastMates = buildTeammateSets(lastRound);
        for (const [name, mates] of thisMates) {
            if (mates.size === 0) continue;
            const wasMates = lastMates.get(name);
            if (!wasMates || wasMates.size === 0) continue;
            if (config.newPartnerRule === 'allNew') {
                for (const m of mates) {
                    if (wasMates.has(m)) return FIXED_CONFIG.hardRejectScore;
                }
            } else {
                const hasNew = [...mates].some(m => !wasMates.has(m));
                if (!hasNew) return FIXED_CONFIG.hardRejectScore;
            }
        }
    }

    // "new opponent" hard rules.
    if (lastRound && (config.newOpponentRule === 'oneNew' || config.newOpponentRule === 'allNew')) {
        const thisOpp = buildOpponentSets(round);
        const lastOpp = buildOpponentSets(lastRound);
        for (const [name, opps] of thisOpp) {
            if (opps.size === 0) continue;
            const wasOpp = lastOpp.get(name);
            if (!wasOpp || wasOpp.size === 0) continue;
            if (config.newOpponentRule === 'allNew') {
                for (const o of opps) {
                    if (wasOpp.has(o)) return FIXED_CONFIG.hardRejectScore;
                }
            } else {
                const hasNew = [...opps].some(o => !wasOpp.has(o));
                if (!hasNew) return FIXED_CONFIG.hardRejectScore;
            }
        }
    }

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
    // Chips-sektionen er udgået — fremmødelisten er den eneste sandhed.
    updateActivePlayersTitle();
    updatePanelVisibility();
    renderPrefillArea(getPrefillStateFromUi());
    syncQuickAddOptions();
}

// ⋮-menuens tilstand: hvilken spillers menu er åben, og hvilken spillers
// niveau er i redigeringstilstand (inline select).
let openPlayerMenuIndex = null;
let editingLevelIndex = null;

// Fem niveauprikker (altid 5, udfyldt = spillerens niveau 1-5) med
// skærmlæservenlig beskrivelse, fx "Niveau 2 af 5, Let øvet".
function levelDotsHtml(level) {
    const lv = clampLevel(level);
    const dots = Array.from({length: 5}, (_, i) =>
        `<i class="level-dot${i < lv ? ' is-filled' : ''}"></i>`).join('');
    return `<span class="level-dots" role="img" aria-label="Niveau ${lv} af 5, ${levelName(lv)}">${dots}</span>`;
}

function renderPlayerManagerList() {
    const players = sortPlayersForDisplay(state.roster);

    if (players.length === 0) {
        el.playerManagerListArea.innerHTML = '<div class="subtle">Ingen spillere endnu.</div>';
        return;
    }

    const showLevel = isUsingSkillLevels() && shouldShowLevels();

    const rows = players.map(player => {
        const index = state.roster.findIndex(p => p.name === player.name);

        // Niveau vises altid (når niveauer bruges/vises), men er kun
        // redigerbart efter "Rediger niveau" i ⋮-menuen.
        const levelCells = !showLevel ? '' : (editingLevelIndex === index ? `
                <select class="level-select attendance-level-edit" data-player-level-index="${index}">
                    ${getLevelOptions(player.level)}
                </select>` : `
                ${levelDotsHtml(player.level)}
                <span class="attendance-level" aria-hidden="true">${levelName(player.level)}</span>`);

        const photoItems = player.photo
            ? `<button class="player-menu-item" type="button" data-player-action="photo-change" data-index="${index}">${icon('camera')} Skift billede</button>
               <button class="player-menu-item" type="button" data-player-action="photo-remove" data-index="${index}">${icon('close')} Fjern billede</button>`
            : `<button class="player-menu-item" type="button" data-player-action="photo-add" data-index="${index}">${icon('camera')} Indsæt billede</button>`;

        const menuOpen = openPlayerMenuIndex === index;
        const menuHtml = menuOpen ? `
                <div class="player-menu">
                    ${showLevel ? `<button class="player-menu-item" type="button" data-player-action="edit-level" data-index="${index}">${icon('level')} Rediger niveau</button>` : ''}
                    <button class="player-menu-item" type="button" data-player-action="edit-name" data-index="${index}">${icon('edit')} Rediger navn</button>
                    ${photoItems}
                    <button class="player-menu-item" type="button" data-player-action="goto" data-index="${index}">${icon('statistics')} Gå til spiller</button>
                    <button class="player-menu-item player-menu-item--danger" type="button" data-player-action="remove" data-index="${index}">${icon('trash')} Fjern fra listen</button>
                </div>` : '';

        // Label omkring alt undtagen ⋮ — klik hvor som helst i rækken skifter
        // fremmøde via den rigtige checkbox (tastatur + skærmlæser med).
        return `
            <div class="attendance-row${player.active ? ' is-met' : ''}${menuOpen ? ' is-menu-open' : ''}">
                <label class="attendance-label">
                    <span class="attendance-check-cell">
                        <input type="checkbox" class="attendance-check" data-attend-index="${index}"
                               ${player.active ? 'checked' : ''}
                               aria-label="${escapeHtml(player.name)} mødt op">
                    </span>
                    ${playerAvatarHtml(player, 'avatar--att')}
                    <span class="attendance-name" title="${escapeHtml(player.name)}">${escapeHtml(player.name)}</span>
                    ${levelCells}
                </label>
                <span class="player-menu-anchor">
                    <button class="player-menu-toggle" type="button" data-player-menu-toggle="${index}"
                            title="Flere muligheder" aria-label="Flere muligheder for ${escapeHtml(player.name)}"
                            aria-haspopup="menu" aria-expanded="${menuOpen ? 'true' : 'false'}">${icon('more')}</button>
                    ${menuHtml}
                </span>
            </div>
        `;
    }).join('');

    el.playerManagerListArea.innerHTML = `
        <div class="attendance-table${showLevel ? '' : ' attendance-table--no-level'}">
            <div class="attendance-head" aria-hidden="true">
                <span class="attendance-head-met">Mødt</span>
                <span class="attendance-head-player">Spiller</span>
                ${showLevel ? '<span class="attendance-head-level">Niveau</span>' : ''}
            </div>
            ${rows}
        </div>`;
}

// ── Kamparkiv (grundlag for spillerstatistik) ─────────────
// Resultater er ALTID valgfrie at indtaste og påvirker på ingen måde,
// hvordan kampene genereres — de bruges udelukkende til statistik.

const MATCH_LOG_MAX = 5000;

function makeRoundId() {
    return `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function isValidLogEntry(e) {
    return Boolean(e && typeof e === 'object' && e.rid && Number.isInteger(e.ci)
        && Array.isArray(e.a) && Array.isArray(e.b));
}

// Deltagere i en runde-entry som {pid, name} — hold-superspillere foldes
// ud til deres medlemmer. pid kan mangle på ældre data.
function entrySideRefs(entry) {
    if (!entry) return [];
    if (Array.isArray(entry.members)) {
        return entry.members.map(m => ({pid: m.pid || null, name: m.name})).filter(r => r.name);
    }
    return entry.name ? [{pid: entry.pid || null, name: entry.name}] : [];
}

// Normalisér en gemt side: gamle entries er rene navne-strenge, nye er
// {pid, name}, og skyens er {id, name} (klub-spiller-id).
function logSideRefs(side) {
    if (!Array.isArray(side)) return [];
    return side.map(item => {
        if (typeof item === 'string') return {pid: null, name: item};
        if (item && typeof item === 'object') {
            const pid = (typeof item.pid === 'string' && item.pid) ? item.pid
                : (item.id ? `c${item.id}` : null);
            return {pid, name: String(item.name || '')};
        }
        return null;
    }).filter(r => r && r.name);
}

function courtToLogEntry(round, court, ci) {
    return {
        rid: round.rid,
        ci,
        ts: Number(round.ts) || Date.now(),
        a: (court.teamA?.players || []).flatMap(entrySideRefs),
        b: (court.teamB?.players || []).flatMap(entrySideRefs),
        res: (court.result === 'A' || court.result === 'B' || court.result === 'D') ? court.result : null,
    };
}

// Arkivér den nuværende historik i matchLog (upsert pr. runde+bane, så
// samme kamp aldrig tælles dobbelt). Kaldes FØR historikken ryddes/erstattes.
function archiveHistoryToMatchLog() {
    if (!Array.isArray(state.matchLog)) state.matchLog = [];
    const indexByKey = new Map(state.matchLog.map((e, i) => [`${e.rid}:${e.ci}`, i]));
    state.history.forEach(round => {
        if (!round.rid) return;
        (round.courts || []).forEach((court, ci) => {
            const entry = courtToLogEntry(round, court, ci);
            const key = `${entry.rid}:${entry.ci}`;
            if (indexByKey.has(key)) {
                state.matchLog[indexByKey.get(key)] = entry;
            } else {
                indexByKey.set(key, state.matchLog.length);
                state.matchLog.push(entry);
            }
        });
    });
    if (state.matchLog.length > MATCH_LOG_MAX) {
        state.matchLog = state.matchLog.slice(state.matchLog.length - MATCH_LOG_MAX);
    }
}

// Arkiv + aktuel historik flettet (historikken vinder ved sammenfald).
function getEffectiveMatchLog() {
    const map = new Map();
    (state.matchLog || []).forEach(e => {
        if (isValidLogEntry(e)) map.set(`${e.rid}:${e.ci}`, e);
    });
    state.history.forEach(round => {
        if (!round.rid) return;
        (round.courts || []).forEach((court, ci) => {
            const entry = courtToLogEntry(round, court, ci);
            map.set(`${entry.rid}:${entry.ci}`, entry);
        });
    });
    return [...map.values()].sort((x, y) => x.ts - y.ts);
}

// Markér/afmarkér et baneresultat: 'A' (venstre vandt), 'B' (højre vandt),
// 'D' (uafgjort). Samme tryk igen fjerner markeringen.
function markCourtResult(rid, courtIndex, code) {
    if (code !== 'A' && code !== 'B' && code !== 'D') return;
    const round = state.history.find(r => r.rid === rid);
    if (!round) return;
    const court = round.courts[courtIndex];
    if (!court) return;
    court.result = (court.result === code) ? null : code;
    markMatchesPending([`${rid}:${courtIndex}`]);
    saveState();
    if (state.lastResult && state.lastResult.rid === rid) renderRound(state.lastResult);
    renderHistory();
    if (isStatsPanelOpen()) renderStatsPanel();
}

// ── Sync af statistik og spillere til klubben ─────────────
// Klubben er den kanoniske kilde: fotos, niveauer og kampstatistik deles
// mellem alle med editor-rolle, så en anden kan logge ind og overtage
// uden duplikerede spillere eller forskellige billeder/niveauer.

let matchSyncTimer = null;
let matchSyncInFlight = false;
let cloudMatchesLoading = false;

function canEditActiveClub() {
    const u = state.user;
    if (!u || !u.club) return false;
    return u.club.role === 'owner' || u.club.role === 'editor' || Boolean(u.isAdmin);
}

function markMatchesPending(keys) {
    if (!Array.isArray(state.pendingSync)) state.pendingSync = [];
    const have = new Set(state.pendingSync);
    keys.forEach(k => {
        if (k && !have.has(k)) {
            have.add(k);
            state.pendingSync.push(k);
        }
    });
    if (state.pendingSync.length > 2000) state.pendingSync = state.pendingSync.slice(-2000);
    scheduleMatchSync();
}

function scheduleMatchSync() {
    if (!canEditActiveClub()) return;
    if (!Array.isArray(state.pendingSync) || state.pendingSync.length === 0) return;
    clearTimeout(matchSyncTimer);
    matchSyncTimer = setTimeout(() => { syncMatchesToClub(); }, 2500);
}

function refToApi(ref) {
    const id = clubIdFromPid(ref.pid);
    return id ? {id, name: ref.name} : {name: ref.name};
}

async function syncMatchesToClub() {
    if (matchSyncInFlight || !canEditActiveClub()) return;
    const clubId = activeClubId();
    if (!clubId || !Array.isArray(state.pendingSync) || state.pendingSync.length === 0) return;

    const byKey = new Map(getEffectiveMatchLog().map(e => [`${e.rid}:${e.ci}`, e]));
    const resolved = [];
    const dead = [];
    state.pendingSync.forEach(k => {
        const e = byKey.get(k);
        if (e) resolved.push(e); else dead.push(k);
    });
    if (dead.length) {
        // Fx runder fjernet med fortryd — de findes ikke længere.
        state.pendingSync = state.pendingSync.filter(k => !dead.includes(k));
        saveState();
    }
    const toSend = resolved.slice(0, 500);
    if (toSend.length === 0) return;

    matchSyncInFlight = true;
    try {
        await api('POST', `clubs/${clubId}/matches`, {
            matches: toSend.map(e => ({
                rid: e.rid,
                ci: e.ci,
                ts: e.ts,
                res: e.res,
                a: logSideRefs(e.a).map(refToApi),
                b: logSideRefs(e.b).map(refToApi),
            })),
        });
        const sent = new Set(toSend.map(e => `${e.rid}:${e.ci}`));
        state.pendingSync = (state.pendingSync || []).filter(k => !sent.has(k));
        saveState();
        if (state.pendingSync.length > 0) scheduleMatchSync();
    } catch (e) {
        console.warn('Statistik-sync fejlede (prøver igen senere):', e.message);
    } finally {
        matchSyncInFlight = false;
    }
}

// Hent klubbens fælles kampe og flet dem ind i det lokale arkiv.
async function refreshCloudMatches() {
    if (cloudMatchesLoading) return;
    const clubId = activeClubId();
    if (!clubId) return;
    cloudMatchesLoading = true;
    try {
        const days = Number(el.statsInterval?.value) || 0;
        const res = await api('GET', `clubs/${clubId}/matches${days > 0 ? `?days=${days}` : ''}`);
        mergeCloudMatches(res.matches || []);
    } catch (e) {
        console.warn('Kunne ikke hente klubstatistik:', e.message);
    } finally {
        cloudMatchesLoading = false;
    }
}

function mergeCloudMatches(matches) {
    if (!Array.isArray(matches) || matches.length === 0) return;
    if (!Array.isArray(state.matchLog)) state.matchLog = [];
    const pending = new Set(state.pendingSync || []);
    const historyRids = new Set(state.history.map(r => r.rid));
    const indexByKey = new Map(state.matchLog.map((e, i) => [`${e.rid}:${e.ci}`, i]));
    let changed = false;

    matches.forEach(m => {
        if (!m || !m.rid) return;
        const key = `${m.rid}:${m.ci}`;
        // Lokale uafsendte ændringer og den igangværende historik vinder.
        if (pending.has(key) || historyRids.has(m.rid)) return;
        const entry = {
            rid: String(m.rid),
            ci: Number(m.ci) || 0,
            ts: Number(m.ts) || Date.now(),
            a: Array.isArray(m.a) ? m.a : [],
            b: Array.isArray(m.b) ? m.b : [],
            res: (m.res === 'A' || m.res === 'B' || m.res === 'D') ? m.res : null,
        };
        const idx = indexByKey.get(key);
        if (idx === undefined) {
            indexByKey.set(key, state.matchLog.length);
            state.matchLog.push(entry);
            changed = true;
        } else if (state.matchLog[idx].res !== entry.res || state.matchLog[idx].ts !== entry.ts) {
            state.matchLog[idx] = entry;
            changed = true;
        }
    });

    if (changed) {
        if (state.matchLog.length > MATCH_LOG_MAX) state.matchLog = state.matchLog.slice(-MATCH_LOG_MAX);
        saveState();
        if (isStatsPanelOpen()) renderStatsPanel();
    }
}

// Opret en nyoprettet spiller i klubbens spillerbase (editor+).
async function pushNewPlayerToClub(player) {
    if (!canEditActiveClub() || !player || player.members) return;
    const clubId = activeClubId();
    try {
        const res = await api('POST', `clubs/${clubId}/players`, {
            name: player.name,
            level: player.level,
            photo: player.photo || null,
        });
        if (res.player) {
            player.pid = `c${res.player.id}`;
            const i = (state.clubPlayers || []).findIndex(cp => cp.id === res.player.id);
            if (i >= 0) state.clubPlayers[i] = res.player;
            else (state.clubPlayers = state.clubPlayers || []).push(res.player);
            saveState();
            syncQuickAddOptions();
        }
    } catch (e) {
        console.warn('Kunne ikke oprette spilleren i klubben:', e.message);
    }
}

// Skub niveau-/foto-ændring til klubbens spillerbase (editor+).
async function pushPlayerUpdateToClub(player, fields) {
    if (!canEditActiveClub() || !player || player.members) return;
    const clubId = activeClubId();
    const cpid = clubIdFromPid(player.pid);
    try {
        if (cpid) {
            await api('PATCH', `clubs/${clubId}/players/${cpid}`, fields);
            const cp = (state.clubPlayers || []).find(x => x.id === cpid);
            if (cp) Object.assign(cp, fields);
        } else {
            await pushNewPlayerToClub(player);
        }
    } catch (e) {
        console.warn('Kunne ikke opdatere spilleren i klubben:', e.message);
    }
}

// Afstem den lokale spillerliste med klubbens spillerbase: pid kobles på,
// og klubbens niveau/oprettelsesdato/foto adopteres (klubben er kanonisk).
function reconcileRosterWithClub() {
    const clubPlayers = state.clubPlayers || [];
    if (clubPlayers.length === 0) return;
    const byName = new Map(clubPlayers.map(cp => [cp.name.toLowerCase(), cp]));
    let changed = false;

    state.roster.forEach(p => {
        if (p.members) return;
        const cp = byName.get(p.name.toLowerCase());
        if (!cp) return;
        const pid = `c${cp.id}`;
        if (p.pid !== pid) { p.pid = pid; changed = true; }
        const clubLevel = Number(cp.level);
        if (clubLevel >= 1 && clubLevel <= 5 && p.level !== clubLevel) { p.level = clubLevel; changed = true; }
        const clubCreated = Number(cp.createdAt);
        if (clubCreated > 0 && clubCreated < p.createdAt) { p.createdAt = clubCreated; changed = true; }
        const clubPhoto = sanitizePhoto(cp.photo);
        if (clubPhoto && !p.photo) {
            p.photo = clubPhoto;
            changed = true;
        } else if (!clubPhoto && p.photo) {
            // Lokalt foto som klubben mangler → skub op.
            pushPlayerUpdateToClub(p, {photo: p.photo});
        }
    });

    if (changed) {
        saveState();
        renderRoster();
        renderPlayerManagerList();
        if (isStatsPanelOpen()) renderStatsPanel();
    }
}

// ── Spillerfotos (valgfrit) ───────────────────────────────

const PHOTO_SIZE = 96;  // px — lille avatar, holder localStorage-forbruget nede
let photoTargetName = null;

function playerInitials(name) {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    const first = parts[0][0] || '';
    const last = parts.length > 1 ? (parts[parts.length - 1][0] || '') : '';
    return (first + last).toUpperCase();
}

function playerAvatarHtml(player, extraClass = '') {
    const photo = sanitizePhoto(player && player.photo);
    if (photo) {
        return `<img class="avatar ${extraClass}" src="${escapeHtml(photo)}" alt="">`;
    }
    return `<span class="avatar avatar--initials ${extraClass}">${escapeHtml(playerInitials(player && player.name))}</span>`;
}

function openPhotoPicker(name) {
    photoTargetName = name;
    if (el.photoFileInput) {
        el.photoFileInput.value = '';
        el.photoFileInput.click();
    }
}

function setPlayerPhotoFromFile(file, name) {
    if (!file || !file.type || !file.type.startsWith('image/')) {
        showStatusMessage('Vælg en billedfil.');
        return;
    }
    const reader = new FileReader();
    reader.onload = () => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = PHOTO_SIZE;
            canvas.height = PHOTO_SIZE;
            const ctx = canvas.getContext('2d');
            // Beskær kvadratisk fra midten (cover), så ansigtet fylder cirklen.
            const side = Math.min(img.width, img.height);
            const sx = (img.width - side) / 2;
            const sy = (img.height - side) / 2;
            ctx.drawImage(img, sx, sy, side, side, 0, 0, PHOTO_SIZE, PHOTO_SIZE);
            applyPlayerPhoto(name, canvas.toDataURL('image/jpeg', 0.8));
        };
        img.onerror = () => showStatusMessage('Billedet kunne ikke læses.');
        img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
}

function applyPlayerPhoto(name, dataUrl) {
    const player = state.roster.find(p => p.name === name);
    if (!player) return;
    player.photo = dataUrl ? sanitizePhoto(dataUrl) : null;
    pushPlayerUpdateToClub(player, {photo: player.photo});
    renderPlayerManagerList();
    if (isStatsPanelOpen()) renderStatsPanel();
    saveState();
    showStatusMessage(player.photo ? `Billedet af ${name} er gemt.` : `Billedet af ${name} er fjernet.`);
}

el.photoFileInput?.addEventListener('change', () => {
    const file = el.photoFileInput.files && el.photoFileInput.files[0];
    const name = photoTargetName;
    photoTargetName = null;
    if (file && name) setPlayerPhotoFromFile(file, name);
});

// ── Spillerstatistik-panel (📊 i menuen) ──────────────────
// Al statistik bygger på kamparkivet + den aktuelle historik og påvirker
// aldrig genereringen af kampe.

let statsExpandedName = null;

function isStatsPanelOpen() {
    return Boolean(el.statsPanel && el.statsPanel.style.display === 'block');
}

function localDayKey(ts) {
    const d = new Date(ts);
    return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

function daysSince(ts) {
    return Math.max(0, Math.floor((Date.now() - (Number(ts) || Date.now())) / 86400000));
}

function formatCreatedAgo(createdAt) {
    if (!createdAt) return '';
    const days = daysSince(createdAt);
    if (days === 0) return 'Oprettet i dag';
    if (days === 1) return 'Oprettet i går';
    return `Oprettet for ${days} dage siden`;
}

function computePlayerStatistics() {
    const intervalDays = Number(el.statsInterval?.value) || 0;   // 0 = altid
    const cutoff = intervalDays > 0 ? Date.now() - intervalDays * 86400000 : 0;
    const log = getEffectiveMatchLog().filter(e => e.ts >= cutoff);

    // Identitet: pid når det kendes; ellers slås navnet op mod nuværende
    // spillere (så gamle navnebaserede entries stadig tæller med).
    const rosterPlayers = state.roster.filter(player => !player.members);
    const rosterPids = new Set(rosterPlayers.map(p => p.pid));
    const nameToPid = new Map(rosterPlayers.map(p => [p.name.toLowerCase(), p.pid]));
    const keyForRef = (ref) => {
        if (ref.pid && rosterPids.has(ref.pid)) return ref.pid;
        const byName = nameToPid.get(ref.name.toLowerCase());
        if (byName) return byName;
        return ref.pid || `n:${ref.name.toLowerCase()}`;
    };

    const byKey = new Map();
    const statFor = (key) => {
        if (!byKey.has(key)) {
            byKey.set(key, {matches: 0, won: 0, lost: 0, draw: 0, days: new Set(), seq: []});
        }
        return byKey.get(key);
    };

    log.forEach(e => {
        const add = (side, ownSide) => {
            logSideRefs(side).forEach(ref => {
                const st = statFor(keyForRef(ref));
                st.matches += 1;
                st.days.add(localDayKey(e.ts));
                if (e.res === 'D') { st.draw += 1; st.seq.push('D'); }
                else if (e.res === ownSide) { st.won += 1; st.seq.push('W'); }
                else if (e.res) { st.lost += 1; st.seq.push('L'); }
            });
        };
        add(e.a, 'A');
        add(e.b, 'B');
    });

    return rosterPlayers
        .map(player => {
            const st = byKey.get(player.pid) || {matches: 0, won: 0, lost: 0, draw: 0, days: new Set(), seq: []};
            return {
                name: player.name,
                photo: player.photo || null,
                createdAt: player.createdAt,
                matches: st.matches,
                won: st.won,
                lost: st.lost,
                draw: st.draw,
                playDays: st.days.size,
                seq: st.seq.slice(-10),
                ...computeLevelHint(st),
            };
        });
}

// Diskret niveau-hint: kræver mindst 8 AFGJORTE kampe i perioden.
// ≥70 % sejre → overvej højere niveau; ≤30 % → overvej lavere.
function computeLevelHint(st) {
    const decided = st.won + st.lost;
    const winPct = decided > 0 ? st.won / decided : 0;
    let hint = null;
    if (decided >= 8) {
        if (winPct >= 0.7) hint = 'up';
        else if (winPct <= 0.3) hint = 'down';
    }
    return {decided, winPct, hint};
}

function sortStatsRows(rows) {
    const mode = el.statsSort?.value || 'name';
    const byName = (a, b) => a.name.localeCompare(b.name, 'da');
    const sorted = [...rows];
    if (mode === 'won')     return sorted.sort((a, b) => (b.won - a.won) || byName(a, b));
    if (mode === 'lost')    return sorted.sort((a, b) => (b.lost - a.lost) || byName(a, b));
    if (mode === 'matches') return sorted.sort((a, b) => (b.matches - a.matches) || byName(a, b));
    if (mode === 'days')    return sorted.sort((a, b) => (b.playDays - a.playDays) || byName(a, b));
    return sorted.sort(byName);
}

function renderStatsPanel() {
    if (!el.statsListArea) return;
    const rows = sortStatsRows(computePlayerStatistics());

    if (rows.length === 0) {
        el.statsListArea.innerHTML = '<div class="subtle">Ingen spillere endnu. Tilføj spillere under "Spillere" på forsiden.</div>';
        return;
    }

    el.statsListArea.innerHTML = rows.map(row => {
        const expanded = statsExpandedName === row.name;
        const createdText = formatCreatedAgo(row.createdAt);
        const marked = row.won + row.lost + row.draw;

        const dots = row.seq.length
            ? `<span class="result-dots" title="Seneste ${row.seq.length} markerede kampe (ældste til venstre)">${row.seq.map(r =>
                `<span class="dot ${r === 'W' ? 'dot--win' : (r === 'L' ? 'dot--loss' : 'dot--draw')}"></span>`).join('')}</span>`
            : '';
        const wldHtml = marked > 0
            ? `<span class="wld"><span class="wld-win">${row.won} V</span> · <span class="wld-loss">${row.lost} T</span> · <span class="wld-draw">${row.draw} U</span></span>`
            : '<span class="subtle-inline">Ingen markerede resultater</span>';

        const detail = expanded ? `
            <div class="stats-detail">
                <div class="stats-detail-grid">
                    <div><strong>${row.matches}</strong><span>kampe</span></div>
                    <div><strong>${row.playDays}</strong><span>spilledage</span></div>
                    <div><strong>${row.won}</strong><span>vundet</span></div>
                    <div><strong>${row.lost}</strong><span>tabt</span></div>
                    <div><strong>${row.draw}</strong><span>uafgjort</span></div>
                </div>
                <div class="stats-photo-actions">
                    <button type="button" class="secondary" data-stats-photo="${escapeHtml(row.name)}">${icon('camera')} ${row.photo ? 'Skift billede' : 'Tilføj billede'}</button>
                    ${row.photo ? `<button type="button" class="secondary" data-stats-photo-remove="${escapeHtml(row.name)}">${icon('close')} Fjern billede</button>` : ''}
                </div>
            </div>` : '';

        const hintHtml = row.hint
            ? `<div class="stats-row-meta"><span class="level-hint level-hint--${row.hint}">${row.hint === 'up'
                ? `${icon('level-up', 'icon--sm')} Har vundet ${Math.round(row.winPct * 100)} % af ${row.decided} afgjorte kampe — overvej højere niveau`
                : `${icon('level-down', 'icon--sm')} Har tabt ${Math.round((1 - row.winPct) * 100)} % af ${row.decided} afgjorte kampe — overvej lavere niveau`}</span></div>`
            : '';

        return `
            <div class="stats-row ${expanded ? 'is-expanded' : ''}" data-stats-name="${escapeHtml(row.name)}">
                <div class="stats-row-header" data-stats-toggle>
                    ${playerAvatarHtml({name: row.name, photo: row.photo}, 'avatar--md')}
                    <div class="stats-row-text">
                        <div class="stats-row-name">${escapeHtml(row.name)}</div>
                        <div class="stats-row-meta">${createdText}${createdText ? ' · ' : ''}${row.playDays} spilledage · ${row.matches} kampe</div>
                        <div class="stats-row-meta">${wldHtml}${dots ? ' ' : ''}${dots}</div>
                        ${hintHtml}
                    </div>
                    <span class="squad-chevron">${icon(expanded ? 'chevron-down' : 'chevron-right')}</span>
                </div>
                ${detail}
            </div>`;
    }).join('');
}

el.statsBtn?.addEventListener('click', () => {
    closeMenu();
    renderStatsPanel();
    showStandAlone(el.statsPanel);
    // Hent klubbens fælles statistik i baggrunden (re-render ved fletning).
    refreshCloudMatches();
    syncMatchesToClub();
});
el.closeStatsBtn?.addEventListener('click', () => closeStandAlone());
el.statsInterval?.addEventListener('change', () => {
    saveState();
    renderStatsPanel();
    refreshCloudMatches();
});
el.statsSort?.addEventListener('change', () => {
    saveState();
    renderStatsPanel();
});

el.statsListArea?.addEventListener('click', (event) => {
    const photoBtn = event.target.closest('[data-stats-photo]');
    if (photoBtn) { openPhotoPicker(photoBtn.dataset.statsPhoto); return; }
    const removeBtn = event.target.closest('[data-stats-photo-remove]');
    if (removeBtn) { applyPlayerPhoto(removeBtn.dataset.statsPhotoRemove, null); return; }
    // Kun klik på selve række-headeren folder ud/ind — ikke detaljeområdet.
    const header = event.target.closest('[data-stats-toggle]');
    if (!header) return;
    const row = header.closest('[data-stats-name]');
    if (!row) return;
    const name = row.dataset.statsName;
    statsExpandedName = (statsExpandedName === name) ? null : name;
    renderStatsPanel();
});

// ── Statistik-backup (eksport/import som fil) ──
el.exportStatsBtn?.addEventListener('click', () => {
    const entries = getEffectiveMatchLog();
    if (entries.length === 0) { showStatusMessage('Der er ingen kampe at eksportere.'); return; }
    const data = {app: 'kampprogram-statistik', v: 1, exportedAt: Date.now(), matchLog: entries};
    const blob = new Blob([JSON.stringify(data)], {type: 'application/json'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `kampprogram-statistik-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    showStatusMessage(`${entries.length} kampe eksporteret som fil.`);
});

el.importStatsBtn?.addEventListener('click', () => {
    if (el.importStatsFile) { el.importStatsFile.value = ''; el.importStatsFile.click(); }
});

el.importStatsFile?.addEventListener('change', () => {
    const file = el.importStatsFile.files && el.importStatsFile.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
        try {
            const data = JSON.parse(String(reader.result));
            const entries = Array.isArray(data.matchLog) ? data.matchLog.filter(isValidLogEntry) : [];
            if (entries.length === 0) { showStatusMessage('Filen indeholder ingen kampe.'); return; }
            const existing = new Set(getEffectiveMatchLog().map(e => `${e.rid}:${e.ci}`));
            const addedKeys = [];
            entries.forEach(e => {
                const key = `${e.rid}:${e.ci}`;
                if (existing.has(key)) return;
                existing.add(key);
                state.matchLog.push({
                    rid: String(e.rid),
                    ci: Number(e.ci) || 0,
                    ts: Number(e.ts) || Date.now(),
                    a: e.a,
                    b: e.b,
                    res: (e.res === 'A' || e.res === 'B' || e.res === 'D') ? e.res : null,
                });
                addedKeys.push(key);
            });
            if (state.matchLog.length > MATCH_LOG_MAX) state.matchLog = state.matchLog.slice(-MATCH_LOG_MAX);
            markMatchesPending(addedKeys);
            saveState();
            renderStatsPanel();
            showStatusMessage(addedKeys.length > 0
                ? `${addedKeys.length} kampe importeret.`
                : 'Alle kampe i filen fandtes allerede.');
        } catch (err) {
            showStatusMessage('Kunne ikke læse filen — er det en statistik-eksport fra Kampprogram?');
        }
    };
    reader.readAsText(file);
});

el.clearStatsBtn?.addEventListener('click', () => {
    const ok = window.confirm('Vil du slette AL spillerstatistik på denne enhed? Markerede resultater i den aktuelle historik fjernes også. Dette kan ikke fortrydes.');
    if (!ok) return;
    state.matchLog = [];
    state.history.forEach(round => (round.courts || []).forEach(court => { court.result = null; }));
    saveState();
    renderStatsPanel();
    if (state.lastResult) renderRound(state.lastResult);
    renderHistory();
    showStatusMessage('Spillerstatistikken er ryddet.');
});

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
        el.editResultBtn.innerHTML = editingResult
            ? `${icon('check')} Færdig`
            : `${icon('edit')} Rediger opstilling`;
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
            : `${p.name}${shouldShowLevels() ? ` (${levelName(p.level)})` : ''}`;
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
                ${shouldShowLevels() ? `<span class="level">${escapeHtml(levelName(m.level))}</span>` : ''}
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
        ${shouldShowLevels() && !entry.members ? `<span class="level">${escapeHtml(levelName(entry.level))}</span>` : ''}
    </div>`;
}

// Valgfri resultat-knapper under hvert banekort. Venstre knap = venstre
// side vandt ('A'), højre = højre side vandt ('B'), midt = uafgjort ('D').
function renderResultMarkRow(round, court, courtIndex) {
    const res = court.result || null;
    const rid = round.rid || '';
    if (!rid) return '';
    const btn = (code, label, cls) =>
        `<button type="button" class="result-mark ${cls}" data-rid="${rid}" data-court-index="${courtIndex}" data-result-mark="${code}">${label}</button>`;
    return `
        <div class="result-mark-row" title="Valgfrit: markér resultatet — bruges kun til statistik">
            ${btn('A', 'Venstre vandt', res === 'A' ? 'is-win' : '')}
            ${btn('D', 'Uafgjort', res === 'D' ? 'is-draw' : '')}
            ${btn('B', 'Højre vandt', res === 'B' ? 'is-win' : '')}
        </div>`;
}

// Kompakte 1/X/2-knapper i historikken (tipskupon-notation).
function renderHistoryResultMarks(round, court, courtIndex) {
    const res = court.result || null;
    const rid = round.rid || '';
    if (!rid) return '';
    const mini = (code, label, activeCls, title) =>
        `<button type="button" class="result-mark result-mark--mini ${res === code ? activeCls : ''}" data-rid="${rid}" data-court-index="${courtIndex}" data-result-mark="${code}" title="${title}">${label}</button>`;
    return `<span class="history-result-marks">${mini('A', '1', 'is-win', 'Første hold vandt')}${mini('D', 'X', 'is-draw', 'Uafgjort')}${mini('B', '2', 'is-win', 'Andet hold vandt')}</span>`;
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

        const sideHtml = (sidePlayers, side) => sidePlayers
            .map((entry, i) => renderResultSlot(result, entry, index, side, i, editing, maxTeamMembers))
            .join('');

        html += `
            <div class="result-card">
                <div class="court-title">
                    <span>Bane ${index + 1}</span>
                    <span class="court-format">${isTeamMatchup ? 'Hold-kamp' : fmtLabel}</span>
                </div>
                <div class="vs-grid">
                    <div class="team">${sideHtml(court.teamA.players, 'A')}</div>
                    <div class="flex-center"><strong>VS</strong></div>
                    <div class="team">${sideHtml(court.teamB.players, 'B')}</div>
                </div>
                ${editing ? '' : renderResultMarkRow(result, court, index)}
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
    updateRoundHeader();
}

function describeCourtForHistory(court, courtIndex) {
    const aNames = court.teamA.players.map(p => escapeHtml(p.name)).join(' og ');
    const bNames = court.teamB.players.map(p => escapeHtml(p.name)).join(' og ');
    return `${aNames} mod ${bNames}`;
}

let historyShowAll = false;

function renderHistory() {
    updatePanelVisibility();

    if (state.history.length === 0) {
        el.historyArea.innerHTML = '<div class="subtle">Ingen kamprunde endnu.</div>';
        return;
    }

    const recent = (historyShowAll ? [...state.history] : state.history.slice(-6)).reverse();
    el.historyArea.innerHTML = recent.map((round, idx) => {
        const roundNo = state.history.length - idx;
        return `
            <div class="result-card">
                <div class="court-title">
                    <span>Kamprunde ${roundNo}</span>
                    <button type="button" class="history-delete-btn" data-round-delete="${round.rid}" title="Slet runden">${icon('trash', 'icon--sm')}</button>
                </div>
                <ul class="history-list">
                    ${round.courts.map((court, i) => `<li class="history-court-line"><span>${describeCourtForHistory(court, i)}</span><span class="history-line-actions">${renderHistoryResultMarks(round, court, i)}<button type="button" class="history-delete-btn history-delete-btn--match" data-match-delete data-rid="${round.rid}" data-ci="${i}" title="Slet denne kamp">${icon('close', 'icon--sm')}</button></span></li>`).join('')}
                    ${round.benched.length ? `<li>Sidder over: ${round.benched.map(p => `${escapeHtml(p.name)}`).join(', ')}</li>` : ''}
                </ul>
            </div>
        `;
    }).join('');

    if (state.history.length > 6) {
        el.historyArea.innerHTML += `<button class="ghost history-showall" type="button" data-history-showall>${
            historyShowAll ? 'Vis kun de seneste 6 runder' : `Vis alle ${state.history.length} runder`}</button>`;
    }
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

    // [navnIdx, niveau, aktiv, createdAt, pid] — ældre dekodere læser kun de 3 første.
    const r = state.roster.map(p => [intern(p.name), p.level, p.active ? 1 : 0, Number(p.createdAt) || 0, p.pid || '']);

    const t = (state.teams || []).map(team => [
        intern(team.name),
        (team.members || []).map(m => intern(m.name)),
        team.active === false ? 0 : 1,
    ]);

    // Runde: [courts, benched, ts, rid] — court: [aIdxs, bIdxs, resultKode].
    // Ekstra positioner ignoreres af ældre dekodere (bagudkompatibelt).
    const h = state.history.map(round => [
        (round.courts || []).map(court => [
            (court.teamA?.players || []).map(p => intern(p.name)),
            (court.teamB?.players || []).map(p => intern(p.name)),
            ({A: 1, B: 2, D: 3})[court.result] || 0,
        ]),
        (round.benched || []).map(p => intern(p.name)),
        Number(round.ts) || 0,
        round.rid || '',
    ]);

    let formatsMask = 0;
    for (let i = 1; i <= MAX_TEAM_SIZE; i++) {
        if (document.getElementById(`format-${i}v${i}`)?.checked) {
            formatsMask |= (1 << (i - 1));
        }
    }

    // UI: positional, fixed order. Decoder relies on this order.
    // Rule encoding: 'none'|'prefer'|'require'        -> 0|1|2
    //                'none'|'prefer'|'oneNew'|'allNew' -> 0|1|2|3
    const encLevelRule = (v) => ({none:0, prefer:1, require:2})[v] ?? 1;
    const encNewRule   = (v) => ({none:0, prefer:1, oneNew:2, allNew:3})[v] ?? 1;
    const encSort      = (v) => ({name:0, 'level-asc':1, 'level-desc':2, 'created-desc':3, 'created-asc':4, 'active-first':5})[v] ?? 0;

    const u = [
        Number(el.courtCount.value) || 2,
        encLevelRule(el.partnerLevelRule?.value),
        encLevelRule(el.opponentLevelRule?.value),
        encNewRule(el.newPartnerRule?.value),
        encNewRule(el.newOpponentRule?.value),
        el.disallowExactRepeat?.checked ? 1 : 0,
        formatsMask,
        (el.maximizeCourts?.checked ?? false) ? 1 : 0,
        Number(el.defaultCourtCount?.value) || 2,
        el.teamMode?.checked ? 1 : 0,
        state.showAllLevels ? 1 : 0,
        encSort(state.sortPlayersBy),
    ];

    const p = getPrefillStateFromUi().map(prefill => {
        const fmt = prefill.format === COURT_FORMAT_AUTO ? 0 : (Number(prefill.format) || 0);
        const slots = Object.entries(prefill.slots || {})
            .filter(([, name]) => Boolean(name))
            .map(([slotKey, name]) => [slotKey, intern(name)]);
        return [fmt, slots];
    });

    return {v: 3, n: names, r, t, h, u, p};
}

// Expand a compact (v:2) payload back into the verbose shape that
// applySessionPayload expects.
function expandSessionPayload(data) {
    if (!data || typeof data !== 'object' || (data.v !== 2 && data.v !== 3)) {
        throw new Error('Session-koden har et ugyldigt format.');
    }
    const isV3 = data.v === 3;

    const names = Array.isArray(data.n) ? data.n : [];
    const lookupName = (idx) => (Number.isInteger(idx) && idx >= 0 && idx < names.length) ? names[idx] : '';

    const roster = (data.r || []).map(triple => {
        const [nIdx, level, active, createdAt, pid] = Array.isArray(triple) ? triple : [];
        return {
            name: lookupName(nIdx),
            level: Number(level) || 1,
            active: Boolean(active),
            createdAt: Number(createdAt) || undefined,
            pid: (typeof pid === 'string' && pid) ? pid : undefined,
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
        const [courtsRaw, benchedRaw, tsRaw, ridRaw] = Array.isArray(roundRaw) ? roundRaw : [[], []];
        const courts = (courtsRaw || []).map(courtRaw => {
            const [aIdxs, bIdxs, resRaw] = Array.isArray(courtRaw) ? courtRaw : [[], []];
            const teamA = (aIdxs || []).map(buildEntity);
            const teamB = (bIdxs || []).map(buildEntity);
            const teamSize = Math.max(teamA.length, teamB.length, 1);
            return {
                format: teamSize,
                teamA: {players: teamA, totalLevel: teamA.reduce((s, p) => s + (p.level || 0), 0)},
                teamB: {players: teamB, totalLevel: teamB.reduce((s, p) => s + (p.level || 0), 0)},
                lockedSlots: null,
                result: ({1: 'A', 2: 'B', 3: 'D'})[Number(resRaw)] || null,
            };
        });
        const benched = (benchedRaw || []).map(buildEntity);
        return {
            courts,
            benched,
            ts: Number(tsRaw) || Date.now(),
            rid: (typeof ridRaw === 'string' && ridRaw) ? ridRaw : makeRoundId(),
        };
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

    // Decoders for v3-shape values
    const decLevelRule = (n) => ['none','prefer','require'][Number(n) || 0] || 'none';
    const decNewRule   = (n) => ['none','prefer','oneNew','allNew'][Number(n) || 0] || 'none';
    const decSort      = (n) => ['name','level-asc','level-desc','created-desc','created-asc','active-first'][Number(n) || 0] || 'name';

    let ui;
    if (isV3) {
        ui = {
            courtCount: String(u[0] ?? 2),
            partnerLevelRule: decLevelRule(u[1]),
            opponentLevelRule: decLevelRule(u[2]),
            newPartnerRule: decNewRule(u[3]),
            newOpponentRule: decNewRule(u[4]),
            disallowExactRepeat: Boolean(u[5]),
            enabledFormats,
            maximizeCourts: Boolean(u[7]),
            defaultCourtCount: String(u[8] ?? 2),
            teamMode: Boolean(u[9]),
            showAllLevels: u[10] !== undefined ? Boolean(u[10]) : true,
            sortPlayersBy: decSort(u[11]),
            prefills,
        };
    } else {
        // v:2 layout — map through migrateV2ToV3 so we end up with the new shape.
        const v2ui = {
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
        };
        ui = migrateV2ToV3(v2ui);
    }

    return {
        version: 3,
        roster,
        teams,
        history,
        lastResult: history[history.length - 1] || null,
        ui,
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
    // Gem de hidtidige kampe i arkivet, inden historikken erstattes.
    archiveHistoryToMatchLog();
    state.roster = Array.isArray(data.roster) ? data.roster.map(normalizePlayer) : [];
    state.history = Array.isArray(data.history) ? data.history.map(normalizeRoundFromStorage) : [];
    state.history.forEach(round => {
        markMatchesPending((round.courts || []).map((c, i) => `${round.rid}:${i}`));
    });
    state.lastResult = state.history[state.history.length - 1] || null;
    state.teams = Array.isArray(data.teams) ? data.teams.map(normalizeTeam) : [];

    if (data.ui) {
        const defaultCourts = data.ui.defaultCourtCount ?? '2';
        if (el.defaultCourtCount) el.defaultCourtCount.value = defaultCourts;
        el.courtCount.value = data.ui.courtCount ?? defaultCourts;

        if (el.partnerLevelRule)    el.partnerLevelRule.value    = data.ui.partnerLevelRule    ?? 'prefer';
        if (el.opponentLevelRule)   el.opponentLevelRule.value   = data.ui.opponentLevelRule   ?? 'prefer';
        if (el.newPartnerRule)      el.newPartnerRule.value      = data.ui.newPartnerRule      ?? 'prefer';
        if (el.newOpponentRule)     el.newOpponentRule.value     = data.ui.newOpponentRule     ?? 'prefer';
        if (el.disallowExactRepeat) el.disallowExactRepeat.checked = Boolean(data.ui.disallowExactRepeat);

        state.showAllLevels = data.ui.showAllLevels !== undefined ? Boolean(data.ui.showAllLevels) : true;
        state.sortPlayersBy = data.ui.sortPlayersBy || 'name';
        syncSortMenuItems();
        syncLevelsMenuItem();
        updateRulesUI();

        const savedFormats = Array.isArray(data.ui.enabledFormats) ? data.ui.enabledFormats : [1, 2];
        for (let n = 1; n <= MAX_TEAM_SIZE; n++) {
            const cb = document.getElementById(`format-${n}v${n}`);
            if (cb) cb.checked = savedFormats.includes(n);
        }
        if (el.maximizeCourts) el.maximizeCourts.checked = data.ui.maximizeCourts ?? false;
        if (el.teamMode) {
            el.teamMode.checked = Boolean(data.ui.teamMode);
            syncTeamModeToggle();
        }

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
    archiveHistoryToMatchLog();
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

    if (!Number.isInteger(level) || level < 1 || level > 5) {
        showStatusMessage('Vælg et niveau.');
        return;
    }

    if (state.roster.some(player => player.name.toLowerCase() === name.toLowerCase())) {
        showStatusMessage(`Spilleren ${name} findes allerede.`);
        return;
    }

    const newPlayer = {name, level, active: true, createdAt: Date.now(), pid: makeLocalPid(), photo: null};
    state.roster.push(newPlayer);
    // Editor i en klub: opret også spilleren i klubbens fælles spillerbase.
    pushNewPlayerToClub(newPlayer);

    el.newPlayerName.value = '';
    el.newPlayerLevel.value = '3';

    renderRoster();
    renderPlayerManagerList();
    renderPlayerStats();

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
            throw new Error(`Ugyldigt niveau for "${name}". Brug et tal fra 1 til 5 (1=Nybegynder, 5=Elite).`);
        }

        const lowerName = name.toLowerCase();
        if (seenNames.has(lowerName)) {
            throw new Error(`Spilleren "${name}" står mere end én gang.`);
        }

        seenNames.add(lowerName);
        players.push({
            name,
            level: clampLevel(level),
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

// Permanently delete a player from the roster (and any team membership). Past
// rounds in history are left untouched so old stats remain valid.
function deletePlayer(index) {
    const player = state.roster[index];
    if (!player) return;
    const confirmed = window.confirm(
        `Slet spilleren "${player.name}"?\n\n` +
        `Spilleren fjernes fra spillerlisten og fra eventuelle hold. ` +
        `Tidligere kampe i historikken påvirkes ikke.`
    );
    if (!confirmed) return;

    state.roster.splice(index, 1);

    if (Array.isArray(state.teams)) {
        state.teams.forEach(team => {
            if (Array.isArray(team.members)) {
                team.members = team.members.filter(m => m.name !== player.name);
                team.level = team.members.reduce((s, m) => s + (m.level || 0), 0);
            }
        });
        state.teams = state.teams.filter(t => Array.isArray(t.members) && t.members.length > 0);
    }

    renderRoster();
    renderPlayerManagerList();
    renderPlayerStats();
    renderTeams();
    updateTeamModeUi();
    updatePanelVisibility();
    saveState();
    showStatusMessage(`Slettede "${player.name}".`);
}

function updatePlayerLevel(index, level) {
    const player = state.roster[index];
    if (!player) return;

    const parsed = Number(level);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 9) return;

    player.level = parsed;
    editingLevelIndex = null;
    pushPlayerUpdateToClub(player, {level: parsed});
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
        lastUsedPrefills = tm ? null : prefills;
        const best = await findBestRoundAsync(players, courtCount, state.history, config, prefills, 1000);

        if (!best || best.courts.length === 0) {
            throw new Error('Kunne ikke finde en gyldig opstilling.');
        }
        if (best.score !== undefined && best.score <= HARD_REJECT_THRESHOLD) {
            throw new Error('Kunne ikke finde en runde der opfylder alle "Kræv"-regler. Prøv at lempe en regel under Indstillinger → Regler.');
        }

        best.rid = makeRoundId();
        best.ts = Date.now();
        state.lastResult = best;
        state.history.push(best);
        markMatchesPending(best.courts.map((c, i) => `${best.rid}:${i}`));

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

// Låsene fra seneste generering, så "Prøv igen" kan genbruge dem.
let lastUsedPrefills = null;

function retryRound() {
    if (state.history.length === 0) return;
    const last = state.history[state.history.length - 1];
    // Resultater må aldrig følge med over på en ny opstilling — advar først.
    if ((last.courts || []).some(c => c.result)) {
        const ok = window.confirm('Runden har registrerede resultater. "Prøv igen" erstatter opstillingen, og resultaterne slettes. Fortsæt?');
        if (!ok) return;
    }
    // Forkast runden, så den ikke tæller som spillede kampe/makkere/oversidning.
    state.history.pop();
    state.lastResult = state.history[state.history.length - 1] || null;
    // Gendan låste pladser fra før rundens dannelse.
    if (lastUsedPrefills && !isTeamMode()) renderPrefillArea(lastUsedPrefills);
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

    archiveHistoryToMatchLog();
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
    const confirmed = window.confirm('Dette nulstiller alt pånær dine gemte spillerlister og spillerstatistikken. Er du sikker?');
    if (!confirmed) return;

    archiveHistoryToMatchLog();
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

// "Afslut aften": arkivér kampene til statistikken, sync til klubben,
// (valgfrit) gem sessionen hos klubben, og gør appen klar til næste gang.
async function endEvening() {
    if (state.history.length === 0) {
        showStatusMessage('Der er ingen kamprunder at afslutte.');
        return;
    }
    const ok = window.confirm(
        'Afslut aftenen?\n\n' +
        '• Kampene arkiveres til spillerstatistikken\n' +
        '• Historikken nulstilles\n' +
        '• Alle spillere sættes som "taget hjem"'
    );
    if (!ok) return;

    if (canEditActiveClub()) {
        const alsoSave = window.confirm('Vil du også gemme aftenens session hos klubben, inden den nulstilles?');
        if (alsoSave) await saveSessionToClub();
    }

    archiveHistoryToMatchLog();
    state.history = [];
    state.lastResult = null;
    state.roster.forEach(p => { p.active = false; });
    setEditResultMode(false);
    historyShowAll = false;

    renderHistory();
    renderPlayerStats();
    renderRoster();
    renderPlayerManagerList();
    updatePanelVisibility();
    el.resultArea.innerHTML = 'Ingen kamprunde genereret endnu.';

    scheduleMatchSync();
    saveState();
    showStatusMessage('Aftenen er afsluttet — statistikken er gemt. Tak for i dag! 🏸');
}

function undoLastRound() {
    if (state.history.length === 0) return;

    const confirmed = window.confirm('Er du sikker på, at du vil fjerne seneste kamprunde fra historikken?');
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
        el.resultArea.innerHTML = 'Ingen kamprunde genereret endnu.';
    }

    showStatusMessage('Seneste kamprunde er fjernet fra historikken.');
    saveState();
}

function toggleMenu() {
    el.actionsDropdown?.classList.remove('open');
    const isOpen = el.menuDropdown.classList.toggle('open');
    el.menuBackdrop?.classList.toggle('open', isOpen);
}

function toggleActionsMenu() {
    el.menuDropdown?.classList.remove('open');
    const isOpen = el.actionsDropdown?.classList.toggle('open');
    el.menuBackdrop?.classList.toggle('open', !!isOpen);
}

function closeMenu() {
    el.menuDropdown.classList.remove('open');
    el.actionsDropdown?.classList.remove('open');
    el.menuBackdrop?.classList.remove('open');
}

function showStandAlone(panel) {
    // Ryd inline-styles på alle paneler, så CSS-basereglen (.standalone
    // { display: none }) gælder — og vis så kun det ønskede panel.
    for (let element of document.getElementsByClassName("standalone")) {
        element.style.display = '';
    }
    el.mainPage.style.display = "none";
    panel.style.display = "block";
    closeMenu();
    // Standalone-paneler kan være lange; start altid fra toppen.
    window.scrollTo(0, 0);
}


function closeStandAlone() {
    for (let element of document.getElementsByClassName("standalone")) {
        element.style.display = '';
    }
    el.mainPage.style.display = "";
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
el.endEveningBtn?.addEventListener('click', endEvening);
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

// Spillerlister-sidens underfaner: Klub / Privat / Import.
function setListsTab(name) {
    if (!el.listsTabKlub) return;
    el.listsTabKlub.classList.toggle('hidden', name !== 'klub');
    el.listsTabPrivat.classList.toggle('hidden', name !== 'privat');
    el.listsTabImport.classList.toggle('hidden', name !== 'import');
    el.listsTabbar?.querySelectorAll('[data-lists-tab]').forEach(btn => {
        btn.classList.toggle('is-active', btn.dataset.listsTab === name);
    });
}

el.listsTabbar?.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-lists-tab]');
    if (btn) setListsTab(btn.dataset.listsTab);
});

function openPlayerListsPage() {
    closeMenu();
    if (el.playerImportText) el.playerImportText.value = playersToText(state.roster);
    // Klub-fanen er standard for klubmedlemmer, ellers Privat.
    setListsTab(state.user && state.user.club ? 'klub' : 'privat');
    showStandAlone(el.playerListsPanel);
}
el.playerListsBtn?.addEventListener('click', openPlayerListsPage);
el.openPlayerListsBtn?.addEventListener('click', openPlayerListsPage);
el.closePlayerListsBtn?.addEventListener('click', () => closeStandAlone());
el.openSetupBtn?.addEventListener('click', () => {
    showStandAlone(el.settingsPanel);
});

[
    el.courtCount,
    el.partnerLevelRule,
    el.opponentLevelRule,
    el.newPartnerRule,
    el.newOpponentRule,
    el.disallowExactRepeat,
    el.maximizeCourts,
].forEach(input => {
    input?.addEventListener('change', () => {
        renderPrefillArea(getPrefillStateFromUi());
        updateRulesUI();
        updateSkillLevelSettingsUI();
        renderRoster();
        renderPlayerManagerList();
        if (state.lastResult) renderRound(state.lastResult);
        saveState();
    });
});

// Format size checkboxes (1v1 through 11v11)
for (let n = 1; n <= MAX_TEAM_SIZE; n++) {
    document.getElementById(`format-${n}v${n}`)?.addEventListener('change', () => {
        renderPrefillArea(getPrefillStateFromUi());
        updateRulesUI();
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

el.teamMode?.addEventListener('change', () => {
    // When toggling team mode off, keep generated teams in state but stop using them.
    updateTeamModeUi();
    renderPrefillArea(getPrefillStateFromUi());
    if (state.lastResult) renderRound(state.lastResult);
    saveState();
});

el.generateTeamsBtn?.addEventListener('click', generateTeams);
el.clearTeamsBtn?.addEventListener('click', clearTeams);

el.prefillArea.addEventListener('change', () => updatePrefillBadge());
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


// ═══ Bulk delete panel ═══

function openBulkDeletePanel() {
    if (!el.bulkDeletePanel) return;
    renderBulkDeleteList();
    showStandAlone(el.bulkDeletePanel);
}

function renderBulkDeleteList() {
    if (!el.bulkDeleteList) return;
    const players = sortPlayersForDisplay(state.roster);
    if (players.length === 0) {
        el.bulkDeleteList.innerHTML = '<div class="subtle">Ingen spillere at slette.</div>';
        updateBulkDeleteCount();
        return;
    }
    const showLevels = shouldShowLevels();
    el.bulkDeleteList.innerHTML = players.map(p => {
        const safeName = escapeHtml(p.name);
        const level = showLevels ? `<span class="bulk-delete-level">${escapeHtml(levelName(p.level))}</span>` : '';
        return `
            <label class="bulk-delete-row">
                <input type="checkbox" data-bulk-name="${safeName}"/>
                <span class="bulk-delete-name">${safeName}</span>
                ${level}
            </label>
        `;
    }).join('');
    updateBulkDeleteCount();
}

function setBulkDeleteSelection(checked) {
    if (!el.bulkDeleteList) return;
    el.bulkDeleteList.querySelectorAll('input[type="checkbox"][data-bulk-name]')
        .forEach(cb => { cb.checked = checked; });
    updateBulkDeleteCount();
}

function getBulkDeleteSelected() {
    if (!el.bulkDeleteList) return [];
    return Array.from(el.bulkDeleteList.querySelectorAll('input[type="checkbox"][data-bulk-name]:checked'))
        .map(cb => cb.dataset.bulkName)
        .filter(Boolean);
}

function updateBulkDeleteCount() {
    if (!el.bulkDeleteConfirmBtn) return;
    const n = getBulkDeleteSelected().length;
    el.bulkDeleteConfirmBtn.disabled = n === 0;
    el.bulkDeleteConfirmBtn.textContent = `Slet valgte (${n})`;
}

function confirmBulkDelete() {
    const names = getBulkDeleteSelected();
    if (names.length === 0) return;
    const confirmed = window.confirm(
        names.length === 1
            ? `Slet 1 spiller (${names[0]})?`
            : `Slet ${names.length} spillere?\n\n` +
              `Spillerne fjernes fra spillerlisten og fra eventuelle hold. ` +
              `Tidligere kampe i historikken påvirkes ikke.`
    );
    if (!confirmed) return;

    const namesSet = new Set(names);
    // Remove from roster
    state.roster = state.roster.filter(p => !namesSet.has(p.name));
    // Remove from teams
    if (Array.isArray(state.teams)) {
        state.teams.forEach(team => {
            if (Array.isArray(team.members)) {
                team.members = team.members.filter(m => !namesSet.has(m.name));
                team.level = team.members.reduce((s, m) => s + (m.level || 0), 0);
            }
        });
        state.teams = state.teams.filter(t => Array.isArray(t.members) && t.members.length > 0);
    }

    renderRoster();
    renderPlayerManagerList();
    renderPlayerStats();
    renderTeams();
    updateTeamModeUi();
    updatePanelVisibility();
    saveState();
    showStatusMessage(`Slettede ${names.length} spiller${names.length === 1 ? '' : 'e'}.`);
    // Refresh the bulk-delete view in case the user wants to delete more.
    renderBulkDeleteList();
}

// ── Per-player level reveal (event delegation on the player containers) ──
function handlePlayerAreaClick(event) {
    // Punkt i ⋮-menuen.
    const actionBtn = event.target.closest('[data-player-action]');
    if (actionBtn) {
        handlePlayerMenuAction(actionBtn.dataset.playerAction, Number(actionBtn.dataset.index));
        return;
    }
    // ⋮-knappen åbner/lukker menuen.
    const toggle = event.target.closest('[data-player-menu-toggle]');
    if (toggle) {
        const idx = Number(toggle.dataset.playerMenuToggle);
        openPlayerMenuIndex = (openPlayerMenuIndex === idx) ? null : idx;
        editingLevelIndex = null;
        renderPlayerManagerList();
        return;
    }
    // Roster-chip click → toggle player active.
    const chip = event.target.closest('[data-action="remove-player"]');
    if (chip) {
        const idx = Number(chip.dataset.playerIndex);
        if (Number.isInteger(idx)) removePlayer(idx);
    }
}

function handlePlayerMenuAction(action, index) {
    const player = state.roster[index];
    openPlayerMenuIndex = null;
    if (!player) { renderPlayerManagerList(); return; }
    if (action === 'edit-level') {
        editingLevelIndex = index;
        renderPlayerManagerList();
        return;
    }
    renderPlayerManagerList();
    if (action === 'edit-name')    { renamePlayer(index); return; }
    if (action === 'photo-add' || action === 'photo-change') { openPhotoPicker(player.name); return; }
    if (action === 'photo-remove') {
        const ok = window.confirm(`Vil du fjerne billedet af ${player.name}?`);
        if (ok) applyPlayerPhoto(player.name, null);
        return;
    }
    if (action === 'goto')         { openStatsForPlayer(player.name); return; }
    if (action === 'remove')       { removePlayerFromList(index); return; }
}

// Fjern en spiller helt fra dagens liste (og evt. hold). Statistikken i
// kamparkivet bevares — spilleren kan tilføjes igen senere.
function removePlayerFromList(index) {
    const player = state.roster[index];
    if (!player) return;
    const ok = window.confirm(`Fjern ${player.name} fra dagens spillere?\n\nSpilleren slettes fra listen (og eventuelle hold). Tidligere kampe og statistik bevares.`);
    if (!ok) return;
    state.roster.splice(index, 1);
    if (Array.isArray(state.teams)) {
        state.teams.forEach(team => {
            if (Array.isArray(team.members)) {
                team.members = team.members.filter(m => m.name !== player.name);
                team.level = team.members.reduce((sum, m) => sum + (m.level || 0), 0);
            }
        });
        state.teams = state.teams.filter(t => Array.isArray(t.members) && t.members.length > 0);
    }
    renderRoster();
    renderPlayerManagerList();
    renderPlayerStats();
    renderTeams();
    updateTeamModeUi();
    updatePanelVisibility();
    saveState();
    showStatusMessage(`${player.name} er fjernet fra listen.`);
}

// Luk ⋮-menu / inline niveau-redigering ved klik udenfor.
document.addEventListener('click', (event) => {
    let changed = false;
    if (openPlayerMenuIndex !== null
        && !event.target.closest('[data-player-menu-toggle]')
        && !event.target.closest('.player-menu')) {
        openPlayerMenuIndex = null;
        changed = true;
    }
    if (editingLevelIndex !== null
        && !event.target.closest('.level-select')
        && !event.target.closest('[data-player-action]')) {
        editingLevelIndex = null;
        changed = true;
    }
    if (changed) renderPlayerManagerList();
});

// Omdøb en spiller. Klubben spørges først (kan afvise ved navnesammenfald),
// og derefter opdateres navnet i roster, historik, hold og kamparkiv, så
// statistik og "nye makkere"-regler følger med. Identiteten bæres af pid.
async function renamePlayer(index) {
    const player = state.roster[index];
    if (!player || player.members) return;
    const oldName = player.name;
    const input = window.prompt('Nyt navn til spilleren:', oldName);
    if (input === null) return;
    const newName = normalizeName(input);
    if (!newName) { showStatusMessage('Navnet må ikke være tomt.'); return; }
    if (newName === oldName) return;
    if (state.roster.some((p, i) => i !== index && !p.members && p.name.toLowerCase() === newName.toLowerCase())) {
        showStatusMessage(`Der findes allerede en spiller ved navn ${newName}.`);
        return;
    }

    const cpid = clubIdFromPid(player.pid);
    if (cpid && canEditActiveClub()) {
        try {
            await api('PATCH', `clubs/${activeClubId()}/players/${cpid}`, {name: newName});
            const cp = (state.clubPlayers || []).find(x => x.id === cpid);
            if (cp) cp.name = newName;
        } catch (e) {
            showStatusMessage(`Kunne ikke omdøbe i klubben: ${e.message}`);
            return;
        }
    }

    applyPlayerRename(player, oldName, newName);
    showStatusMessage(`${oldName} hedder nu ${newName}.`);
}

function applyPlayerRename(player, oldName, newName) {
    player.name = newName;
    const cpid = clubIdFromPid(player.pid);

    const fixEntry = (entry) => {
        if (!entry) return;
        if (Array.isArray(entry.members)) { entry.members.forEach(fixEntry); return; }
        if ((player.pid && entry.pid === player.pid) || entry.name === oldName) entry.name = newName;
    };
    state.history.forEach(round => {
        (round.courts || []).forEach(court => {
            (court.teamA?.players || []).forEach(fixEntry);
            (court.teamB?.players || []).forEach(fixEntry);
        });
        (round.benched || []).forEach(fixEntry);
    });
    (state.teams || []).forEach(team => (team.members || []).forEach(fixEntry));

    (state.matchLog || []).forEach(e => {
        const fixSide = (arr) => {
            if (!Array.isArray(arr)) return;
            arr.forEach((item, i) => {
                if (typeof item === 'string') {
                    if (item === oldName) arr[i] = newName;
                } else if (item && typeof item === 'object') {
                    if ((player.pid && item.pid === player.pid)
                        || (cpid && item.id === cpid)
                        || item.name === oldName) {
                        item.name = newName;
                    }
                }
            });
        };
        fixSide(e.a);
        fixSide(e.b);
    });

    if (statsExpandedName === oldName) statsExpandedName = newName;

    renderRoster();
    renderPlayerManagerList();
    renderPlayerStats();
    renderHistory();
    if (state.lastResult) renderRound(state.lastResult);
    if (isStatsPanelOpen()) renderStatsPanel();
    saveState();
}

// "Gå til spiller": åbn statistikpanelet med spillerens række udfoldet.
// "✕ Luk" i panelet fører tilbage til hovedsiden.
function openStatsForPlayer(name) {
    statsExpandedName = name;
    renderStatsPanel();
    showStandAlone(el.statsPanel);
    refreshCloudMatches();
    requestAnimationFrame(() => {
        const rows = el.statsListArea ? el.statsListArea.querySelectorAll('[data-stats-name]') : [];
        for (const row of rows) {
            if (row.dataset.statsName === name) {
                row.scrollIntoView({block: 'center'});
                break;
            }
        }
    });
}
el.playerManagerListArea?.addEventListener('click', handlePlayerAreaClick);

// Fremmøde-checkbox: ét change-event pr. skift (label sørger for klikfladen).
el.playerManagerListArea?.addEventListener('change', (event) => {
    const box = event.target.closest('input[data-attend-index]');
    if (!box) return;
    const idx = Number(box.dataset.attendIndex);
    if (!Number.isInteger(idx)) return;
    if (box.checked) markArrived(idx); else removePlayer(idx);
});

// Escape lukker ⋮-menuen og giver fokus tilbage til menuknappen.
document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || openPlayerMenuIndex === null) return;
    const idx = openPlayerMenuIndex;
    openPlayerMenuIndex = null;
    renderPlayerManagerList();
    el.playerManagerListArea?.querySelector(`[data-player-menu-toggle="${idx}"]`)?.focus();
});

// ── Resultat-knapper (rundekort + historik) ──
function handleResultMarkClick(event) {
    const btn = event.target.closest('[data-result-mark]');
    if (!btn) return;
    event.preventDefault();
    markCourtResult(btn.dataset.rid, Number(btn.dataset.courtIndex), btn.dataset.resultMark);
}
el.resultArea?.addEventListener('click', handleResultMarkClick);
el.historyArea?.addEventListener('click', handleResultMarkClick);
el.historyArea?.addEventListener('click', (event) => {
    const showAll = event.target.closest('[data-history-showall]');
    if (showAll) {
        historyShowAll = !historyShowAll;
        renderHistory();
        return;
    }
    const roundDel = event.target.closest('[data-round-delete]');
    if (roundDel) {
        deleteRoundFromHistory(roundDel.dataset.roundDelete);
        return;
    }
    const matchDel = event.target.closest('[data-match-delete]');
    if (matchDel) {
        deleteMatchFromHistory(matchDel.dataset.rid, Number(matchDel.dataset.ci));
    }
});

// ── Slet kamp/runde fra historikken (uden dobbelttælling) ──
// Lokale arkiventries og cloud-rækker for runden fjernes; resterende kampe i
// runden gen-nummereres og sendes op igen. Ændrer aldrig senere opstillinger.

function purgeRidLocally(rid) {
    state.matchLog = (state.matchLog || []).filter(e => e.rid !== rid);
    state.pendingSync = (state.pendingSync || []).filter(k => !k.startsWith(`${rid}:`));
}

async function deleteRidFromClub(rid) {
    if (!canEditActiveClub()) return;
    try {
        await api('DELETE', `clubs/${activeClubId()}/matches/${encodeURIComponent(rid)}`);
    } catch (e) {
        console.warn('Kunne ikke slette kampen hos klubben:', e.message);
    }
}

function afterHistoryEdit(rid) {
    deleteRidFromClub(rid);
    scheduleMatchSync();
    saveState();
    if (state.lastResult) {
        renderRound(state.lastResult);
    } else {
        el.resultArea.innerHTML = 'Ingen kamprunde genereret endnu.';
    }
    renderHistory();
    renderPlayerStats();
    updatePanelVisibility();
    if (isStatsPanelOpen()) renderStatsPanel();
}

function deleteRoundFromHistory(rid) {
    const i = state.history.findIndex(r => r.rid === rid);
    if (i < 0) return;
    const ok = window.confirm('Slet hele runden? Kampene fjernes også fra statistikken.');
    if (!ok) return;
    state.history.splice(i, 1);
    purgeRidLocally(rid);
    state.lastResult = state.history[state.history.length - 1] || null;
    setEditResultMode(false);
    afterHistoryEdit(rid);
    showStatusMessage('Runden er slettet.');
}

function deleteMatchFromHistory(rid, ci) {
    const round = state.history.find(r => r.rid === rid);
    if (!round || !round.courts[ci]) return;
    const ok = window.confirm('Slet denne ene kamp? Den fjernes også fra statistikken — resten af runden bevares.');
    if (!ok) return;
    round.courts.splice(ci, 1);
    purgeRidLocally(rid);
    if (round.courts.length === 0) {
        const i = state.history.indexOf(round);
        state.history.splice(i, 1);
        state.lastResult = state.history[state.history.length - 1] || null;
        setEditResultMode(false);
    } else {
        // Gen-nummererede kampe sendes op igen.
        markMatchesPending(round.courts.map((c, i2) => `${rid}:${i2}`));
    }
    afterHistoryEdit(rid);
    showStatusMessage('Kampen er slettet.');
}
// ── Global "vis/skjul niveauer" menu item ──
el.toggleLevelsBtn?.addEventListener('click', () => {
    state.showAllLevels = !state.showAllLevels;
    syncLevelsMenuItem();
    closeMenu();
    renderRoster();
    renderPlayerManagerList();
    renderTeams();
    if (state.lastResult) renderRound(state.lastResult);
    saveState();
});

// ── Sort radio sub-items inside the actions menu ──
el.actionsDropdown?.addEventListener('click', (event) => {
    const sortBtn = event.target.closest('[data-sort-value]');
    if (!sortBtn) return;
    state.sortPlayersBy = sortBtn.dataset.sortValue || 'name';
    syncSortMenuItems();
    renderRoster();
    renderPlayerManagerList();
    saveState();
    closeMenu();
});

// ── Gear button opens/closes the actions menu ──
el.actionsToggleBtn?.addEventListener('click', (event) => {
    event.stopPropagation();
    toggleActionsMenu();
});

// ── "Slet spillere…" opens the bulk-delete standalone panel ──
el.bulkDeleteBtn?.addEventListener('click', () => {
    closeMenu();
    openBulkDeletePanel();
});
el.closeBulkDeleteBtn?.addEventListener('click', () => closeStandAlone());
el.bulkDeleteSelectAllBtn?.addEventListener('click', () => setBulkDeleteSelection(true));
el.bulkDeleteClearBtn?.addEventListener('click', () => setBulkDeleteSelection(false));
el.bulkDeleteList?.addEventListener('change', (event) => {
    if (event.target.matches('input[type="checkbox"][data-bulk-name]')) {
        updateBulkDeleteCount();
    }
});
el.bulkDeleteConfirmBtn?.addEventListener('click', () => confirmBulkDelete());

// ── Segmented team-mode toggle ──
el.teamModeRow?.addEventListener('click', (event) => {
    const opt = event.target.closest('[data-team-mode]');
    if (!opt) return;
    const newValue = opt.dataset.teamMode === 'true';
    if (!!el.teamMode.checked === newValue) return;
    el.teamMode.checked = newValue;
    syncTeamModeToggle();
    el.teamMode.dispatchEvent(new Event('change', { bubbles: true }));
});

// ═══════════════════════════════════════════════════════════
//  Backend API (multi-tenant: clubs, users, cloud player lists)
// ═══════════════════════════════════════════════════════════

const API_BASE = 'api';

async function api(method, path, body) {
    const opts = {
        method,
        credentials: 'same-origin',
        headers: { 'Accept': 'application/json' },
    };
    if (body !== undefined) {
        opts.headers['Content-Type'] = 'application/json';
        opts.body = JSON.stringify(body);
    }
    let response;
    try {
        response = await fetch(`${API_BASE}/${path.replace(/^\//, '')}`, opts);
    } catch (e) {
        throw new Error('Kunne ikke kontakte serveren.');
    }
    let data = null;
    try { data = await response.json(); } catch (_) { /* ignore */ }
    if (!response.ok) {
        const msg = (data && data.error) || `Serverfejl (HTTP ${response.status}).`;
        const err = new Error(msg);
        err.status = response.status;
        throw err;
    }
    return data;
}

// Probes /api/me at startup. If the API isn't reachable (e.g. running as
// pure static), we silently degrade and keep the UI in "guest mode".
async function bootstrapAuth() {
    try {
        const res = await api('GET', 'me');
        applyAuthState(res.user || null);
    } catch (e) {
        applyAuthState(null);
    }
    // Invitationslink? (?invite=TOKEN) → åbn invitationsflowet.
    try {
        const params = new URLSearchParams(window.location.search);
        const token = params.get('invite');
        if (token) await openInviteFlow(token);
    } catch (e) { /* ignorér */ }
}

// ── Invitationsflow (landing fra mail-link) ──

const inviteFlow = { token: null, info: null };

function showInviteError(msg) {
    if (!el.inviteFlowError) return;
    el.inviteFlowError.textContent = msg;
    el.inviteFlowError.classList.remove('hidden');
}

async function openInviteFlow(token) {
    inviteFlow.token = token;
    try {
        const res = await api('GET', `invites/info?token=${encodeURIComponent(token)}`);
        inviteFlow.info = res.invite;
    } catch (e) {
        showStatusMessage(e.message || 'Invitationen er ugyldig eller udløbet.');
        clearInviteParam();
        return;
    }
    const info = inviteFlow.info;
    const roleLabels = { owner: 'ejer', editor: 'redaktør', viewer: 'læser' };
    if (el.inviteInfoText) {
        el.inviteInfoText.innerHTML =
            `Du er inviteret til klubben <strong>${escapeHtml(info.clubName)}</strong> ` +
            `som <strong>${roleLabels[info.role] || info.role}</strong> ` +
            `(sendt til <strong>${escapeHtml(info.email)}</strong>).`;
    }
    el.inviteFlowError?.classList.add('hidden');
    // Vis den rigtige undervisning:
    //  1) logget ind med korrekt e-mail → acceptér-knap
    //  2) konto findes → login-form
    //  3) ingen konto → registrerings-form
    el.inviteAcceptView?.classList.toggle('hidden', !info.canAcceptNow);
    el.inviteLoginView?.classList.toggle('hidden', info.canAcceptNow || !info.accountExists);
    el.inviteRegisterView?.classList.toggle('hidden', info.canAcceptNow || info.accountExists);
    showStandAlone(el.invitePanel);
}

function clearInviteParam() {
    try {
        const url = new URL(window.location.href);
        url.searchParams.delete('invite');
        window.history.replaceState({}, '', url.toString());
    } catch (e) { /* ignorér */ }
}

async function finishInviteAccept(user) {
    applyAuthState(user);
    clearInviteParam();
    closeStandAlone();
    showStatusMessage(`Velkommen til ${user.club ? user.club.name : 'klubben'}!`);
}

el.closeInviteBtn?.addEventListener('click', () => {
    clearInviteParam();
    closeStandAlone();
});

el.acceptInviteBtn?.addEventListener('click', async () => {
    try {
        const res = await api('POST', 'invites/accept', { token: inviteFlow.token });
        await finishInviteAccept(res.user);
    } catch (e) {
        showInviteError(e.message);
    }
});

el.inviteLoginForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const password = el.inviteLoginPassword?.value || '';
    if (!password) return;
    try {
        await api('POST', 'auth/login', { email: inviteFlow.info.email, password });
        const res = await api('POST', 'invites/accept', { token: inviteFlow.token });
        await finishInviteAccept(res.user);
    } catch (e) {
        showInviteError(e.message);
    }
});

el.inviteRegisterForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = (el.inviteRegName?.value || '').trim();
    const password = el.inviteRegPassword?.value || '';
    if (!name || !password) { showInviteError('Udfyld både navn og adgangskode.'); return; }
    try {
        const res = await api('POST', 'invites/register', {
            token: inviteFlow.token, name, password,
        });
        await finishInviteAccept(res.user);
    } catch (e) {
        showInviteError(e.message);
    }
});

function applyAuthState(user) {
    state.user = user;
    syncAccountUI();
    if (user) {
        refreshCloudLists();
        // Klubbens standard-antal baner bliver forvalget.
        const cc = user.club && user.club.defaultCourtCount;
        if (cc) {
            if (el.defaultCourtCount) el.defaultCourtCount.value = String(cc);
            if (el.courtCount) el.courtCount.value = String(cc);
            renderPrefillArea(getPrefillStateFromUi());
        }
    } else {
        state.cloudSquads = [];
        state.clubPlayers = [];
        renderCloudLists();
    }
}

function syncAccountUI() {
    const u = state.user;
    const activeRole = u && u.club ? u.club.role : null;
    if (el.accountBtn) {
        const clubSuffix = u && u.club ? ` (${u.club.name})` : '';
        el.accountBtn.innerHTML = u ? `${icon('account')} ${escapeHtml(u.name)}${escapeHtml(clubSuffix)}` : `${icon('account')} Log ind`;
    }
    if (el.usersBtn) {
        // Owner i aktiv klub — eller site-admin med en aktiv klub.
        const canManageMembers = !!(u && u.club && (activeRole === 'owner' || u.isAdmin));
        el.usersBtn.classList.toggle('hidden', !canManageMembers);
    }
    if (el.adminBtn) {
        el.adminBtn.classList.toggle('hidden', !(u && u.isAdmin));
    }
    if (el.clubBtn) {
        el.clubBtn.classList.toggle('hidden', !(u && u.club));
        if (u && u.club) el.clubBtn.innerHTML = `${icon('club')} ${escapeHtml(u.club.name)}`;
        if (el.headerSub) {
            el.headerSub.textContent = (u && u.club) ? `${u.club.name} · Dagens spil` : 'På denne enhed';
        }
    }
    if (el.cloudListsSection) {
        // Cloud-sektionen kræver både login og medlemskab af mindst én klub.
        el.cloudListsSection.classList.toggle('hidden', !(u && u.club));
        if (el.listsClubHint) el.listsClubHint.classList.toggle('hidden', !!(u && u.club));
    }
    const isEditor = activeRole === 'owner' || activeRole === 'editor' || !!(u && u.isAdmin && u.club);
    document.querySelectorAll('.cloud-editor-only').forEach(node => {
        node.classList.toggle('hidden', !isEditor);
    });
    if (el.sessionShareRow) el.sessionShareRow.classList.toggle('hidden', !isEditor);
    if (el.loggedInView)  el.loggedInView.classList.toggle('hidden', !u);
    if (el.loginForm)     el.loginForm.classList.toggle('hidden', !!u);
    // Panelet skifter karakter efter login: titel + intro følger tilstanden.
    if (el.loginPanelTitle) el.loginPanelTitle.textContent = u ? 'Min konto' : 'Log ind';
    if (el.loginIntro) el.loginIntro.classList.toggle('hidden', !!u);
    if (u) {
        if (el.loggedInName) el.loggedInName.textContent = u.name;
        if (el.loggedInClubInfo) el.loggedInClubInfo.classList.toggle('hidden', !u.club);
        if (el.noClubHint) {
            const showHint = !u.club;
            el.noClubHint.classList.toggle('hidden', !showHint);
            if (showHint) {
                el.noClubHint.textContent = u.isAdmin
                    ? 'Du er ikke medlem af nogen klub endnu. Tilføj dig selv via Admin → "Tilføj medlemskab".'
                    : 'Du er ikke medlem af nogen klub endnu. Bed en klub-ejer om at invitere dig pr. e-mail.';
            }
        }
        if (u.club) {
            if (el.loggedInRole) el.loggedInRole.textContent = u.club.role;
            if (el.loggedInClub) el.loggedInClub.textContent = u.club.name;
        }
        // Klubskifter: vis kun ved 2+ medlemskaber.
        const clubs = u.clubs || [];
        if (el.clubSwitchRow) el.clubSwitchRow.classList.toggle('hidden', clubs.length < 2);
        if (el.clubSwitchSelect && clubs.length >= 2) {
            el.clubSwitchSelect.innerHTML = clubs.map(c =>
                `<option value="${c.id}"${u.club && c.id === u.club.id ? ' selected' : ''}>${escapeHtml(c.name)} (${c.role})</option>`
            ).join('');
        }
    }
}

// ── Cloud player lists ──────────────────────────────────────

function activeClubId() {
    return state.user && state.user.club ? state.user.club.id : null;
}

async function refreshCloudLists() {
    const clubId = activeClubId();
    if (!clubId) { state.cloudSquads = []; state.clubPlayers = []; renderCloudLists(); return; }
    try {
        const [squadsRes, playersRes] = await Promise.all([
            api('GET', `clubs/${clubId}/squads`),
            api('GET', `clubs/${clubId}/players`),
        ]);
        state.cloudSquads = squadsRes.squads || [];
        state.clubPlayers = playersRes.players || [];
        renderCloudLists();
        // Klubben er kanonisk: afstem lokale spillere og skub ventende statistik.
        reconcileRosterWithClub();
        scheduleMatchSync();
    } catch (e) {
        showStatusMessage(`Kunne ikke hente klubbens hold: ${e.message}`);
    }
}

function renderCloudLists() {
    const fill = (selectEl) => {
        if (!selectEl) return;
        const placeholder = '<option value="">Vælg hold</option>';
        const opts = state.cloudSquads
            .map(s => `<option value="${s.id}">${escapeHtml(s.name)} (${s.memberCount})</option>`)
            .join('');
        selectEl.innerHTML = placeholder + opts;
    };
    fill(el.cloudPlayerList);
    fill(el.deleteCloudList);
    syncQuickAddOptions();
}

// Quick-add: tilføj en spiller fra klubbens spillerbase til aftenens liste
// (fx en spiller fra et andet hold, der møder op til træning).
function syncQuickAddOptions() {
    if (!el.quickAddClubPlayer) return;
    const clubId = activeClubId();
    const rosterNames = new Set(state.roster.map(p => p.name.toLowerCase()));
    const candidates = (state.clubPlayers || [])
        .filter(p => !rosterNames.has(p.name.toLowerCase()));
    const show = !!clubId && candidates.length > 0;
    el.quickAddClubPlayer.classList.toggle('hidden', !show);
    if (!show) return;
    el.quickAddClubPlayer.innerHTML =
        '<option value="">＋ Fra klubben…</option>' +
        candidates.map(p =>
            `<option value="${p.id}">${escapeHtml(p.name)}${shouldShowLevels() ? ` (${levelName(p.level)})` : ''}</option>`
        ).join('');
}

async function loadCloudList() {
    const id = el.cloudPlayerList?.value;
    if (!id) { showStatusMessage('Vælg først et hold.'); return; }
    const clubId = activeClubId();
    if (!clubId) return;
    try {
        const res = await api('GET', `clubs/${clubId}/squads/${id}`);
        const squad = res.squad;
        replaceRoster(squad.members.map(p => ({
            name: p.name,
            level: p.level,
            active: false,
            pid: `c${p.id}`,
            photo: sanitizePhoto(p.photo),
        })));
        showStatusMessage(`Hentede holdet "${squad.name}" (${squad.members.length} spillere).`);
    } catch (e) {
        showStatusMessage(`Kunne ikke hente holdet: ${e.message}`);
    }
}

async function saveCloudList() {
    if (!state.user) { showStatusMessage('Du skal være logget ind.'); return; }
    const clubId = activeClubId();
    if (!clubId) { showStatusMessage('Du er ikke medlem af nogen klub.'); return; }
    const name = (el.newCloudListName?.value || '').trim();
    if (!name) { showStatusMessage('Skriv et navn til holdet.'); return; }
    if (state.roster.length === 0) { showStatusMessage('Der er ingen spillere at gemme.'); return; }

    const players = state.roster
        .filter(p => !p.members)   // hold-superspillere (team-mode) gemmes ikke
        .map(p => ({ name: p.name, level: p.level, photo: p.photo || null }));

    const existing = state.cloudSquads.find(s => s.name.toLowerCase() === name.toLowerCase());
    try {
        if (existing) {
            const ok = window.confirm(`Holdet "${existing.name}" findes allerede. Vil du overskrive medlemslisten?`);
            if (!ok) return;
            await api('PUT', `clubs/${clubId}/squads/${existing.id}`, { players });
        } else {
            await api('POST', `clubs/${clubId}/squads`, { name, players });
        }
        if (el.newCloudListName) el.newCloudListName.value = '';
        await refreshCloudLists();
        showStatusMessage(`Holdet "${name}" er gemt (${players.length} spillere).`);
    } catch (e) {
        showStatusMessage(`Kunne ikke gemme holdet: ${e.message}`);
    }
}

async function deleteCloudList() {
    const id = el.deleteCloudList?.value;
    if (!id) { showStatusMessage('Vælg først et hold.'); return; }
    const clubId = activeClubId();
    if (!clubId) return;
    const squad = state.cloudSquads.find(s => String(s.id) === String(id));
    if (!squad) return;
    const ok = window.confirm(`Slet holdet "${squad.name}"?\n\nSpillerne bliver i klubbens spillerbase — kun holdet forsvinder.`);
    if (!ok) return;
    try {
        await api('DELETE', `clubs/${clubId}/squads/${id}`);
        await refreshCloudLists();
        showStatusMessage(`Holdet "${squad.name}" er slettet.`);
    } catch (e) {
        showStatusMessage(`Kunne ikke slette: ${e.message}`);
    }
}

el.quickAddClubPlayer?.addEventListener('change', () => {
    const pid = Number(el.quickAddClubPlayer.value);
    if (!pid) return;
    const p = (state.clubPlayers || []).find(x => x.id === pid);
    el.quickAddClubPlayer.value = '';
    if (!p) return;
    if (state.roster.some(r => r.name.toLowerCase() === p.name.toLowerCase())) return;
    state.roster.push({
        name: p.name,
        level: p.level,
        active: true,
        pid: `c${p.id}`,
        createdAt: Number(p.createdAt) || Date.now(),
        photo: sanitizePhoto(p.photo),
    });
    renderRoster();
    renderPlayerManagerList();
    updatePanelVisibility();
    saveState();
    showStatusMessage(`${p.name} er tilføjet til aftenens liste.`);
});

// ── Login / logout flow ─────────────────────────────────────

function openAccountPanel() {
    closeMenu();
    showStandAlone(el.loginPanel);
    syncAccountUI();
    if (el.loginError) el.loginError.classList.add('hidden');
}

async function submitLogin(event) {
    event.preventDefault();
    const email = el.loginEmail?.value.trim();
    const password = el.loginPassword?.value;
    if (!email || !password) return;
    if (el.loginError) el.loginError.classList.add('hidden');
    if (el.loginSubmitBtn) el.loginSubmitBtn.disabled = true;
    try {
        const res = await api('POST', 'auth/login', { email, password });
        applyAuthState(res.user);
        if (el.loginPassword) el.loginPassword.value = '';
        showStatusMessage(`Velkommen, ${res.user.name}.`);
        closeStandAlone();
    } catch (e) {
        if (el.loginError) {
            el.loginError.textContent = e.message;
            el.loginError.classList.remove('hidden');
        }
    } finally {
        if (el.loginSubmitBtn) el.loginSubmitBtn.disabled = false;
    }
}

async function doLogout() {
    try {
        await api('POST', 'auth/logout');
    } catch (e) { /* ignore */ }
    applyAuthState(null);
    closeStandAlone();
    showStatusMessage('Du er logget ud.');
}

async function submitChangePassword(event) {
    event.preventDefault();
    const cur = el.currentPassword?.value;
    const next = el.newPassword?.value;
    if (!cur || !next) return;
    if (el.changePasswordError) el.changePasswordError.classList.add('hidden');
    try {
        await api('POST', 'auth/change-password', { currentPassword: cur, newPassword: next });
        if (el.currentPassword) el.currentPassword.value = '';
        if (el.newPassword) el.newPassword.value = '';
        showStatusMessage('Adgangskoden er ændret.');
        closeStandAlone();
    } catch (e) {
        if (el.changePasswordError) {
            el.changePasswordError.textContent = e.message;
            el.changePasswordError.classList.remove('hidden');
        }
    }
}

// ── User management (owner only) ────────────────────────────

async function openUsersPanel() {
    const clubRole = state.user && state.user.club ? state.user.club.role : null;
    if (!state.user || (clubRole !== 'owner' && !state.user.isAdmin)) return;
    closeMenu();
    showStandAlone(el.usersPanel);
    await refreshUsersList();
}

async function refreshUsersList() {
    if (!el.usersList) return;
    try {
        const [membersRes, invitesRes] = await Promise.all([
            api('GET', 'users'),
            api('GET', 'invites'),
        ]);
        renderUsersList(membersRes.users || []);
        renderInvitesList(invitesRes.invites || []);
    } catch (e) {
        el.usersList.innerHTML = `<div class="login-error">${escapeHtml(e.message)}</div>`;
    }
}

function renderUsersList(users) {
    if (!el.usersList) return;
    if (users.length === 0) {
        el.usersList.innerHTML = '<div class="subtle">Ingen medlemmer endnu.</div>';
        return;
    }
    el.usersList.innerHTML = users.map(u => {
        const isSelf = state.user && state.user.id === u.id;
        const roleOpts = ['owner','editor','viewer'].map(r =>
            `<option value="${r}"${r === u.role ? ' selected' : ''}>${r}</option>`
        ).join('');
        return `
            <div class="user-row" data-user-id="${u.id}">
                <div class="user-row-main">
                    <div class="user-row-name">${escapeHtml(u.name)}${isSelf ? ' <em>(dig)</em>' : ''}</div>
                    <div class="user-row-email">${escapeHtml(u.email)}</div>
                </div>
                <select class="user-role-select" data-user-id="${u.id}">${roleOpts}</select>
                <button class="danger user-row-delete" data-user-id="${u.id}" ${isSelf ? 'disabled' : ''} title="Fjern fra klubben">${icon('close', 'icon--sm')}</button>
            </div>
        `;
    }).join('');
}

function renderInvitesList(invites) {
    if (!el.invitesList) return;
    if (invites.length === 0) {
        el.invitesList.innerHTML = '<div class="subtle">Ingen afventende invitationer.</div>';
        return;
    }
    el.invitesList.innerHTML = invites.map(i => `
        <div class="user-row">
            <div class="user-row-main">
                <div class="user-row-name">${escapeHtml(i.email)}</div>
                <div class="user-row-email">rolle: ${i.role} · udløber ${formatDateTime(i.expiresAt)}</div>
            </div>
            <button class="ghost user-row-pw" data-invite-copy="${escapeHtml(i.link)}" title="Kopiér invitationslink">${icon('link')}</button>
            <button class="danger user-row-delete" data-invite-revoke="${i.id}" title="Tilbagekald">${icon('close', 'icon--sm')}</button>
        </div>
    `).join('');
}

async function sendInvite() {
    const email = (el.inviteEmail?.value || '').trim();
    const role = el.inviteRole?.value || 'editor';
    if (el.inviteError) el.inviteError.classList.add('hidden');
    if (el.inviteLinkBox) el.inviteLinkBox.classList.add('hidden');
    if (!email) { showStatusMessage('Skriv en e-mail.'); return; }
    try {
        const res = await api('POST', 'invites', { email, role });
        if (el.inviteEmail) el.inviteEmail.value = '';
        if (res.mailSent) {
            showStatusMessage(`Invitation sendt til ${email}.`);
        } else {
            showStatusMessage('Invitationen er oprettet, men mailen kunne ikke sendes — del linket manuelt.');
        }
        // Vis altid linket, så det kan deles manuelt (fx via SMS).
        if (el.inviteLinkBox) {
            el.inviteLinkBox.innerHTML = `Invitationslink: <a href="${escapeHtml(res.link)}" target="_blank" rel="noopener">${escapeHtml(res.link)}</a>`;
            el.inviteLinkBox.classList.remove('hidden');
        }
        await refreshUsersList();
    } catch (e) {
        if (el.inviteError) {
            el.inviteError.textContent = e.message;
            el.inviteError.classList.remove('hidden');
        }
    }
}

async function updateUserRole(id, role) {
    try {
        await api('PATCH', `users/${id}`, { role });
        await refreshUsersList();
        showStatusMessage('Rolle opdateret.');
    } catch (e) {
        showStatusMessage(`Kunne ikke ændre rolle: ${e.message}`);
        await refreshUsersList();
    }
}

async function removeMember(id) {
    const target = (await api('GET', 'users')).users.find(u => u.id === id);
    if (!target) return;
    const ok = window.confirm(`Fjern "${target.name}" (${target.email}) fra klubben?\n\nDeres konto slettes ikke — de mister kun adgangen til denne klub.`);
    if (!ok) return;
    try {
        await api('DELETE', `users/${id}`);
        await refreshUsersList();
        showStatusMessage('Medlemmet er fjernet fra klubben.');
    } catch (e) {
        showStatusMessage(`Kunne ikke fjerne: ${e.message}`);
    }
}

// ── Wire DOM events ─────────────────────────────────────────

el.accountBtn?.addEventListener('click', openAccountPanel);
el.closeLoginBtn?.addEventListener('click', () => closeStandAlone());
el.loginForm?.addEventListener('submit', submitLogin);
el.logoutBtn?.addEventListener('click', doLogout);
el.changePasswordBtn?.addEventListener('click', () => {
    showStandAlone(el.changePasswordPanel);
});
el.closeChangePasswordBtn?.addEventListener('click', () => closeStandAlone());
el.changePasswordForm?.addEventListener('submit', submitChangePassword);

el.usersBtn?.addEventListener('click', openUsersPanel);
el.closeUsersBtn?.addEventListener('click', () => closeStandAlone());
el.sendInviteBtn?.addEventListener('click', sendInvite);

el.usersList?.addEventListener('change', (event) => {
    const sel = event.target.closest('.user-role-select');
    if (!sel) return;
    updateUserRole(Number(sel.dataset.userId), sel.value);
});
el.usersList?.addEventListener('click', (event) => {
    const del = event.target.closest('.user-row-delete');
    if (del && !del.disabled) removeMember(Number(del.dataset.userId));
});
el.invitesList?.addEventListener('click', async (event) => {
    const copy = event.target.closest('[data-invite-copy]');
    if (copy) {
        try {
            await navigator.clipboard.writeText(copy.dataset.inviteCopy);
            showStatusMessage('Invitationslink kopieret.');
        } catch (_) {
            window.prompt('Kopiér linket:', copy.dataset.inviteCopy);
        }
        return;
    }
    const revoke = event.target.closest('[data-invite-revoke]');
    if (revoke) {
        if (!window.confirm('Tilbagekald invitationen?')) return;
        try {
            await api('DELETE', `invites/${Number(revoke.dataset.inviteRevoke)}`);
            await refreshUsersList();
            showStatusMessage('Invitationen er tilbagekaldt.');
        } catch (e) {
            showStatusMessage(`Kunne ikke tilbagekalde: ${e.message}`);
        }
    }
});

// ── Klubskifter ──
el.clubSwitchSelect?.addEventListener('change', async () => {
    const clubId = Number(el.clubSwitchSelect.value);
    try {
        const res = await api('POST', 'auth/switch-club', { clubId });
        applyAuthState(res.user);
        showStatusMessage(`Aktiv klub: ${res.user.club.name}.`);
    } catch (e) {
        showStatusMessage(`Kunne ikke skifte klub: ${e.message}`);
    }
});

el.loadCloudListBtn?.addEventListener('click', loadCloudList);
el.saveCloudListBtn?.addEventListener('click', saveCloudList);
el.deleteCloudListBtn?.addEventListener('click', deleteCloudList);

// ── Klubside (info, indstillinger, delte sessioner, sletning) ──

const clubPage = { id: null, club: null };

async function openClubPage(clubId) {
    try {
        const res = await api('GET', `clubs/${clubId}`);
        clubPage.id = clubId;
        clubPage.club = res.club;
        renderClubPage();
        showStandAlone(el.clubPanel);
        await Promise.all([refreshClubSessions(), refreshClubSquadsAdmin()]);
    } catch (e) {
        showStatusMessage(`Kunne ikke åbne klubben: ${e.message}`);
    }
}

function renderClubPage() {
    const c = clubPage.club;
    if (!c) return;
    if (el.clubPanelTitle) el.clubPanelTitle.textContent = c.name;
    if (el.clubPanelStats) {
        el.clubPanelStats.textContent =
            `${c.memberCount} medlem${c.memberCount === 1 ? '' : 'mer'} · ` +
            `${c.listCount} spillerliste${c.listCount === 1 ? '' : 'r'} · ` +
            `${c.sessionCount} session${c.sessionCount === 1 ? '' : 'er'}` +
            ` · din rolle: ${c.yourRole}`;
    }
    if (el.clubCourtsRow) el.clubCourtsRow.classList.toggle('hidden', !c.canManage);
    if (el.clubCourtsInput) el.clubCourtsInput.value = c.defaultCourtCount ?? '';
    if (el.clubSquadCreateRow) el.clubSquadCreateRow.classList.toggle('hidden', !c.canEdit);
    if (el.clubDangerZone) el.clubDangerZone.classList.toggle('hidden', !c.canManage);
}

// ── Hold-administration på klubsiden ──

const squadAdmin = { squads: [], players: [], expandedId: null, expandedMembers: [] };

async function refreshClubSquadsAdmin() {
    if (!clubPage.id || !el.clubSquadsList) return;
    try {
        const [squadsRes, playersRes] = await Promise.all([
            api('GET', `clubs/${clubPage.id}/squads`),
            api('GET', `clubs/${clubPage.id}/players`),
        ]);
        squadAdmin.squads = squadsRes.squads || [];
        squadAdmin.players = playersRes.players || [];
        if (squadAdmin.expandedId !== null) {
            const stillThere = squadAdmin.squads.some(s => s.id === squadAdmin.expandedId);
            if (!stillThere) squadAdmin.expandedId = null;
        }
        if (squadAdmin.expandedId !== null) {
            const res = await api('GET', `clubs/${clubPage.id}/squads/${squadAdmin.expandedId}`);
            squadAdmin.expandedMembers = res.squad.members || [];
        }
        renderClubSquadsAdmin();
    } catch (e) {
        el.clubSquadsList.innerHTML = `<div class="login-error">${escapeHtml(e.message)}</div>`;
    }
}

function renderClubSquadsAdmin() {
    if (!el.clubSquadsList) return;
    const canEdit = clubPage.club && clubPage.club.canEdit;
    if (squadAdmin.squads.length === 0) {
        el.clubSquadsList.innerHTML = '<div class="subtle">Ingen hold endnu. Opret et hold ovenfor — eller gem aftenens spillere som hold i "Spillerlister"-panelet.</div>';
        return;
    }
    el.clubSquadsList.innerHTML = squadAdmin.squads.map(s => {
        const isOpen = squadAdmin.expandedId === s.id;
        let detail = '';
        if (isOpen) {
            const memberIds = new Set(squadAdmin.expandedMembers.map(m => m.id));
            const chips = squadAdmin.expandedMembers.map(m => `
                <span class="membership-chip">
                    ${escapeHtml(m.name)}${shouldShowLevels() ? ` <em>(${levelName(m.level)})</em>` : ''}
                    ${canEdit ? `<button class="membership-chip-remove" type="button"
                        data-squad-member-remove="${m.id}" title="Fjern fra holdet">${icon('close', 'icon--sm')}</button>` : ''}
                </span>
            `).join('');
            const addable = squadAdmin.players.filter(p => !memberIds.has(p.id));
            const editRows = canEdit ? `
                ${addable.length > 0 ? `
                <div class="squad-add-row">
                    <select id="squadAddSelect">
                        <option value="">Vælg spiller fra klubben…</option>
                        ${addable.map(p => `<option value="${p.id}">${escapeHtml(p.name)}${shouldShowLevels() ? ` (${levelName(p.level)})` : ''}</option>`).join('')}
                    </select>
                    <button class="primary" type="button" data-squad-member-add>+ Tilføj</button>
                </div>` : ''}
                <div class="squad-add-row">
                    <input id="squadNewPlayerName" type="text" placeholder="Ny spillers navn"/>
                    <select id="squadNewPlayerLevel">${getLevelOptions(3)}</select>
                    <button class="primary" type="button" data-squad-create-player>${icon('add')} Opret &amp; tilføj</button>
                </div>
                <div class="squad-help">Vælg en eksisterende spiller fra klubben — eller opret en helt ny spiller direkte på holdet.</div>
            ` : '';
            detail = `
                <div class="squad-detail">
                    <div class="user-row-memberships">${chips || '<span class="subtle">Ingen spillere på holdet endnu.</span>'}</div>
                    ${editRows}
                </div>
            `;
        }
        return `
            <div class="user-row squad-row user-row--clickable${isOpen ? ' squad-row--open' : ''}" data-squad-expand="${s.id}" role="button" tabindex="0" title="${isOpen ? 'Klik for at lukke' : 'Klik for at administrere holdet'}">
                <div class="user-row-main">
                    <div class="squad-row-header">
                        <span class="squad-chevron" aria-hidden="true">${icon(isOpen ? 'chevron-down' : 'chevron-right')}</span>
                        <div>
                            <div class="user-row-name">${escapeHtml(s.name)}</div>
                            <div class="user-row-email">${s.memberCount} spiller${s.memberCount === 1 ? '' : 'e'}${isOpen ? '' : ' · klik for at se og redigere'}</div>
                        </div>
                    </div>
                    ${detail}
                </div>
                ${canEdit ? `<button class="danger user-row-delete" type="button" data-squad-delete="${s.id}" title="Slet holdet">${icon('trash', 'icon--sm')}</button>` : ''}
            </div>
        `;
    }).join('');
}

async function toggleSquadExpand(sid) {
    if (squadAdmin.expandedId === sid) {
        squadAdmin.expandedId = null;
        squadAdmin.expandedMembers = [];
        renderClubSquadsAdmin();
        return;
    }
    try {
        const res = await api('GET', `clubs/${clubPage.id}/squads/${sid}`);
        squadAdmin.expandedId = sid;
        squadAdmin.expandedMembers = res.squad.members || [];
        renderClubSquadsAdmin();
    } catch (e) {
        showStatusMessage(`Kunne ikke hente holdet: ${e.message}`);
    }
}

el.clubCreateSquadBtn?.addEventListener('click', async () => {
    const name = (el.clubNewSquadName?.value || '').trim();
    if (!name) { showStatusMessage('Skriv et holdnavn.'); return; }
    try {
        await api('POST', `clubs/${clubPage.id}/squads`, { name, players: [] });
        if (el.clubNewSquadName) el.clubNewSquadName.value = '';
        showStatusMessage(`Holdet "${name}" er oprettet.`);
        await refreshClubSquadsAdmin();
        await refreshCloudLists();
    } catch (e) {
        showStatusMessage(`Kunne ikke oprette holdet: ${e.message}`);
    }
});

el.clubSquadsList?.addEventListener('click', async (event) => {
    const del = event.target.closest('[data-squad-delete]');
    if (del) {
        const sid = Number(del.dataset.squadDelete);
        const squad = squadAdmin.squads.find(s => s.id === sid);
        if (!squad) return;
        if (!window.confirm(`Slet holdet "${squad.name}"?\n\nSpillerne bliver i klubbens spillerbase.`)) return;
        try {
            await api('DELETE', `clubs/${clubPage.id}/squads/${sid}`);
            showStatusMessage(`Holdet "${squad.name}" er slettet.`);
            await refreshClubSquadsAdmin();
            await refreshCloudLists();
        } catch (e) {
            showStatusMessage(`Kunne ikke slette: ${e.message}`);
        }
        return;
    }

    const removeMember = event.target.closest('[data-squad-member-remove]');
    if (removeMember && squadAdmin.expandedId !== null) {
        const pid = Number(removeMember.dataset.squadMemberRemove);
        try {
            await api('DELETE', `clubs/${clubPage.id}/squads/${squadAdmin.expandedId}/members/${pid}`);
            await refreshClubSquadsAdmin();
            await refreshCloudLists();
        } catch (e) {
            showStatusMessage(`Kunne ikke fjerne spilleren: ${e.message}`);
        }
        return;
    }

    const addMember = event.target.closest('[data-squad-member-add]');
    if (addMember && squadAdmin.expandedId !== null) {
        const sel = document.getElementById('squadAddSelect');
        const pid = Number(sel?.value);
        if (!pid) { showStatusMessage('Vælg en spiller.'); return; }
        try {
            await api('POST', `clubs/${clubPage.id}/squads/${squadAdmin.expandedId}/members`, { playerId: pid });
            await refreshClubSquadsAdmin();
            await refreshCloudLists();
        } catch (e) {
            showStatusMessage(`Kunne ikke tilføje spilleren: ${e.message}`);
        }
        return;
    }

    const createPlayer = event.target.closest('[data-squad-create-player]');
    if (createPlayer && squadAdmin.expandedId !== null) {
        const nameInput = document.getElementById('squadNewPlayerName');
        const levelSel = document.getElementById('squadNewPlayerLevel');
        const name = (nameInput?.value || '').trim();
        if (!name) { showStatusMessage('Skriv spillerens navn.'); return; }
        try {
            await api('POST', `clubs/${clubPage.id}/squads/${squadAdmin.expandedId}/members`, {
                name, level: Number(levelSel?.value) || 3,
            });
            showStatusMessage(`${name} er oprettet og tilføjet holdet.`);
            await refreshClubSquadsAdmin();
            await refreshCloudLists();
        } catch (e) {
            showStatusMessage(`Kunne ikke oprette spilleren: ${e.message}`);
        }
        return;
    }

    // Klik inde i den udfoldede detail-boks (fx i select/input) skal ikke folde sammen.
    if (event.target.closest('.squad-detail')) return;

    const expand = event.target.closest('[data-squad-expand]');
    if (expand) toggleSquadExpand(Number(expand.dataset.squadExpand));
});

async function refreshClubSessions() {
    if (!el.clubSessionsList || !clubPage.id) return;
    try {
        const res = await api('GET', `clubs/${clubPage.id}/sessions`);
        renderClubSessions(res.sessions || []);
    } catch (e) {
        el.clubSessionsList.innerHTML = `<div class="login-error">${escapeHtml(e.message)}</div>`;
    }
}

function renderClubSessions(sessions) {
    if (!el.clubSessionsList) return;
    if (sessions.length === 0) {
        el.clubSessionsList.innerHTML = '<div class="subtle">Ingen gemte sessioner.</div>';
        return;
    }
    const canEdit = clubPage.club && clubPage.club.canEdit;
    el.clubSessionsList.innerHTML = sessions.map(s => `
        <div class="user-row">
            <div class="user-row-main">
                <div class="user-row-name">${escapeHtml(s.name)}</div>
                <div class="user-row-email">Opdateret ${formatDateTime(s.updatedAt)}${s.updatedBy ? ` af ${escapeHtml(s.updatedBy)}` : ''}</div>
            </div>
            <button class="primary" data-load-session="${s.id}" title="Hent og fortsæt sessionen">↓ Overtag</button>
            ${canEdit ? `<button class="danger user-row-delete" data-delete-session="${s.id}" title="Slet">${icon('trash', 'icon--sm')}</button>` : ''}
        </div>
    `).join('');
}

async function saveSessionToClub() {
    const clubId = activeClubId();
    if (!clubId) { showStatusMessage('Du skal være logget ind og medlem af en klub.'); return; }
    const defaultName = new Date().toLocaleDateString('da-DK', {
        weekday: 'long', day: 'numeric', month: 'numeric',
    });
    const name = window.prompt(
        'Navn på sessionen (gemmes hos klubben — samme navn overskriver):',
        defaultName
    );
    if (name === null) return;
    const trimmed = name.trim();
    if (!trimmed) { showStatusMessage('Giv sessionen et navn.'); return; }
    try {
        const payload = buildSessionPayload();
        await api('POST', `clubs/${clubId}/sessions`, { name: trimmed, payload });
        showStatusMessage(`Sessionen "${trimmed}" er gemt — andre medlemmer kan nu overtage den fra klubsiden.`);
    } catch (e) {
        showStatusMessage(`Kunne ikke gemme sessionen: ${e.message}`);
    }
}

async function loadClubSession(sid) {
    if (!clubPage.id) return;
    const ok = window.confirm(
        'Hent sessionen og overtag den?\n\n' +
        'Din nuværende lokale opsætning (spillere, historik, indstillinger) erstattes.'
    );
    if (!ok) return;
    try {
        const res = await api('GET', `clubs/${clubPage.id}/sessions/${sid}`);
        const expanded = expandSessionPayload(res.session.payload);
        applySessionPayload(expanded);
        closeStandAlone();
        showStatusMessage(`Sessionen "${res.session.name}" er hentet — du kan fortsætte med næste runde.`);
    } catch (e) {
        showStatusMessage(`Kunne ikke hente sessionen: ${e.message}`);
    }
}

async function deleteClubSession(sid) {
    if (!clubPage.id) return;
    if (!window.confirm('Slet den gemte session?')) return;
    try {
        await api('DELETE', `clubs/${clubPage.id}/sessions/${sid}`);
        await refreshClubSessions();
        showStatusMessage('Sessionen er slettet.');
    } catch (e) {
        showStatusMessage(`Kunne ikke slette: ${e.message}`);
    }
}

async function saveClubCourts() {
    if (!clubPage.id) return;
    const raw = el.clubCourtsInput?.value ?? '';
    const value = raw === '' ? null : Math.max(1, Math.min(50, parseInt(raw, 10) || 1));
    try {
        await api('PATCH', `clubs/${clubPage.id}`, { defaultCourtCount: value });
        showStatusMessage(value === null
            ? 'Klubbens standard-baner er nulstillet.'
            : `Klubbens standard er nu ${value} baner.`);
        // Genindlæs me så aktiv-klub-info (og forvalget) opdateres.
        const res = await api('GET', 'me');
        applyAuthState(res.user || null);
    } catch (e) {
        showStatusMessage(`Kunne ikke gemme: ${e.message}`);
    }
}

async function deleteClubFromPage() {
    const c = clubPage.club;
    if (!c) return;
    const phrase = window.prompt(
        `ADVARSEL: Dette sletter klubben "${c.name}" permanent, inkl. ` +
        `${c.memberCount} medlemskab(er), ${c.listCount} spillerliste(r) og ` +
        `${c.sessionCount} session(er).\n\nSkriv klubbens navn for at bekræfte:`
    );
    if (phrase === null) return;
    if (phrase.trim().toLowerCase() !== c.name.toLowerCase()) {
        showStatusMessage('Navnet matchede ikke — klubben er IKKE slettet.');
        return;
    }
    try {
        await api('DELETE', `clubs/${clubPage.id}`);
        closeStandAlone();
        showStatusMessage(`Klubben "${c.name}" er slettet.`);
        const res = await api('GET', 'me');
        applyAuthState(res.user || null);
    } catch (e) {
        showStatusMessage(`Kunne ikke slette klubben: ${e.message}`);
    }
}

el.clubBtn?.addEventListener('click', () => {
    closeMenu();
    if (state.user && state.user.club) openClubPage(state.user.club.id);
});
el.closeClubBtn?.addEventListener('click', () => closeStandAlone());
el.saveClubCourtsBtn?.addEventListener('click', saveClubCourts);
el.saveClubSessionBtn?.addEventListener('click', saveSessionToClub);
el.deleteClubBtn?.addEventListener('click', deleteClubFromPage);
el.clubSessionsList?.addEventListener('click', (event) => {
    const load = event.target.closest('[data-load-session]');
    if (load) { loadClubSession(Number(load.dataset.loadSession)); return; }
    const del = event.target.closest('[data-delete-session]');
    if (del) deleteClubSession(Number(del.dataset.deleteSession));
});

// ── Site-admin panel (kræver isAdmin) ───────────────────────

let adminCache = { clubs: [], users: [] };

function formatDateTime(iso) {
    if (!iso) return '—';
    try {
        const d = new Date(iso.replace(' ', 'T') + (iso.includes('Z') ? '' : 'Z'));
        return d.toLocaleString('da-DK', { dateStyle: 'short', timeStyle: 'short' });
    } catch (_) { return iso; }
}

async function openAdminPanel() {
    if (!state.user || !state.user.isAdmin) return;
    closeMenu();
    showStandAlone(el.adminPanel);
    await refreshAdminData();
}

async function refreshAdminData() {
    try {
        const [overview, users, activity] = await Promise.all([
            api('GET', 'admin/overview'),
            api('GET', 'admin/users'),
            api('GET', 'admin/activity?limit=100'),
        ]);
        adminCache.clubs = overview.clubs || [];
        adminCache.users = users.users || [];
        renderAdminStats(overview.stats || {});
        renderAdminClubs();
        renderAdminUsers();
        renderAdminActivity(activity.activity || []);
        renderAdminClubSelect();
        renderAdminMembershipSelects();
    } catch (e) {
        showStatusMessage(`Kunne ikke hente admin-data: ${e.message}`);
    }
}

function renderAdminStats(s) {
    if (!el.adminStats) return;
    const card = (label, value) => `
        <div class="admin-stat-card">
            <div class="admin-stat-value">${value}</div>
            <div class="admin-stat-label">${label}</div>
        </div>`;
    el.adminStats.innerHTML =
        card('Klubber', s.totalClubs ?? 0) +
        card('Brugere', s.totalUsers ?? 0) +
        card('Spillerlister', s.totalLists ?? 0) +
        card('Aktive brugere (30 dage)', s.activeUsers30d ?? 0) +
        card('Handlinger (7 dage)', s.actions7d ?? 0) +
        card('Handlinger (30 dage)', s.actions30d ?? 0);
}

function renderAdminClubs() {
    if (!el.adminClubsList) return;
    if (adminCache.clubs.length === 0) {
        el.adminClubsList.innerHTML = '<div class="subtle">Ingen klubber.</div>';
        return;
    }
    const isOwnClub = (c) => state.user && state.user.club && state.user.club.id === c.id;
    el.adminClubsList.innerHTML = adminCache.clubs.map(c => `
        <div class="user-row user-row--clickable" data-open-club="${c.id}" role="button" tabindex="0" title="Åbn klubbens side">
            <div class="user-row-main">
                <div class="user-row-name">${escapeHtml(c.name)}${isOwnClub(c) ? ' <em>(din klub)</em>' : ''}</div>
                <div class="user-row-email">${c.userCount} bruger${c.userCount === 1 ? '' : 'e'} · ${c.listCount} liste${c.listCount === 1 ? '' : 'r'} · sidst aktiv: ${formatDateTime(c.lastActivity)}</div>
            </div>
            <span class="user-row-open" aria-hidden="true">${icon('chevron-right')}</span>
        </div>
    `).join('');
}

function renderAdminClubSelect() {
    if (!el.adminNewUserClub) return;
    el.adminNewUserClub.innerHTML = '<option value="">(ingen klub)</option>' + adminCache.clubs
        .map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`)
        .join('');
}

function renderAdminUsers() {
    if (!el.adminUsersList) return;
    if (adminCache.users.length === 0) {
        el.adminUsersList.innerHTML = '<div class="subtle">Ingen brugere.</div>';
        return;
    }
    el.adminUsersList.innerHTML = adminCache.users.map(u => {
        const isSelf = state.user && state.user.id === u.id;
        const chips = (u.memberships || []).map(m => `
            <span class="membership-chip">
                ${escapeHtml(m.clubName)} <em>(${m.role})</em>
                <button class="membership-chip-remove" type="button"
                        data-remove-membership="${u.id}:${m.clubId}"
                        title="Fjern fra ${escapeHtml(m.clubName)}">${icon('close', 'icon--sm')}</button>
            </span>
        `).join('');
        return `
            <div class="user-row">
                <div class="user-row-main">
                    <div class="user-row-name">${escapeHtml(u.name)}${u.isAdmin ? ` ${icon('admin', 'icon--sm')}` : ''}${isSelf ? ' <em>(dig)</em>' : ''}</div>
                    <div class="user-row-email">${escapeHtml(u.email)}</div>
                    <div class="user-row-usage">Login: ${u.loginCount} gange · Sidst: ${formatDateTime(u.lastLoginAt)}</div>
                    <div class="user-row-memberships">${chips || '<span class="subtle">Ingen klubber</span>'}</div>
                </div>
                <button class="ghost user-row-pw" data-admin-user-pw="${u.id}" title="Sæt ny adgangskode">${icon('password')}</button>
                <button class="danger user-row-delete" data-admin-user-delete="${u.id}" ${isSelf ? 'disabled' : ''} title="Slet kontoen">${icon('trash', 'icon--sm')}</button>
            </div>
        `;
    }).join('');
}

function renderAdminMembershipSelects() {
    if (el.adminMemberUser) {
        el.adminMemberUser.innerHTML = adminCache.users
            .map(u => `<option value="${u.id}">${escapeHtml(u.name)} (${escapeHtml(u.email)})</option>`)
            .join('');
    }
    if (el.adminMemberClub) {
        el.adminMemberClub.innerHTML = adminCache.clubs
            .map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`)
            .join('');
    }
}

function renderAdminActivity(items) {
    if (!el.adminActivityList) return;
    if (items.length === 0) {
        el.adminActivityList.innerHTML = '<div class="subtle">Ingen aktivitet endnu.</div>';
        return;
    }
    const actionLabels = {
        login: 'loggede ind',
        logout: 'loggede ud',
        password_change: 'skiftede adgangskode',
        list_create: 'oprettede listen',
        list_update: 'opdaterede listen',
        list_delete: 'slettede listen',
        user_create: 'oprettede brugeren',
        user_update: 'opdaterede brugeren',
        user_delete: 'slettede en bruger',
        club_create: 'oprettede klubben',
        club_delete: 'slettede klubben',
    };
    el.adminActivityList.innerHTML = items.map(a => `
        <div class="admin-activity-row">
            <span class="admin-activity-time">${formatDateTime(a.createdAt)}</span>
            <span class="admin-activity-text">
                <strong>${escapeHtml(a.userName || 'Ukendt')}</strong>
                (${escapeHtml(a.clubName || '—')})
                ${actionLabels[a.action] || escapeHtml(a.action)}
                ${a.detail ? `<em>${escapeHtml(a.detail)}</em>` : ''}
            </span>
        </div>
    `).join('');
}

async function adminCreateClub() {
    const name = (el.newClubName?.value || '').trim();
    if (!name) { showStatusMessage('Skriv et klubnavn.'); return; }
    try {
        await api('POST', 'admin/clubs', { name });
        if (el.newClubName) el.newClubName.value = '';
        showStatusMessage(`Klubben "${name}" er oprettet.`);
        await refreshAdminData();
    } catch (e) {
        showStatusMessage(`Kunne ikke oprette klub: ${e.message}`);
    }
}


async function adminCreateUser() {
    const clubIdRaw = el.adminNewUserClub?.value || '';
    const name = (el.adminNewUserName?.value || '').trim();
    const email = (el.adminNewUserEmail?.value || '').trim();
    const password = el.adminNewUserPassword?.value || '';
    const role = el.adminNewUserRole?.value || 'editor';
    if (el.adminNewUserError) el.adminNewUserError.classList.add('hidden');
    try {
        const payload = { name, email, password, role };
        if (clubIdRaw !== '') payload.clubId = Number(clubIdRaw);
        await api('POST', 'admin/users', payload);
        if (el.adminNewUserName) el.adminNewUserName.value = '';
        if (el.adminNewUserEmail) el.adminNewUserEmail.value = '';
        if (el.adminNewUserPassword) el.adminNewUserPassword.value = '';
        showStatusMessage(`Brugeren "${name}" er oprettet.`);
        await refreshAdminData();
    } catch (e) {
        if (el.adminNewUserError) {
            el.adminNewUserError.textContent = e.message;
            el.adminNewUserError.classList.remove('hidden');
        }
    }
}

el.adminBtn?.addEventListener('click', openAdminPanel);
el.closeAdminBtn?.addEventListener('click', () => closeStandAlone());
el.createClubBtn?.addEventListener('click', adminCreateClub);
el.adminCreateUserBtn?.addEventListener('click', adminCreateUser);

el.adminClubsList?.addEventListener('click', (event) => {
    const row = event.target.closest('[data-open-club]');
    if (row) openClubPage(Number(row.dataset.openClub));
});

// Genindlæs egen profil (menu, klubskifter, cloud-hold osv.) efter
// medlemskabsændringer — fx når admin tilføjer sig selv til en klub.
async function reloadOwnProfile() {
    try {
        const res = await api('GET', 'me');
        applyAuthState(res.user || null);
    } catch (e) { /* ignorér */ }
}

el.adminAddMembershipBtn?.addEventListener('click', async () => {
    const userId = Number(el.adminMemberUser?.value);
    const clubId = Number(el.adminMemberClub?.value);
    const role = el.adminMemberRole?.value || 'editor';
    if (!userId || !clubId) { showStatusMessage('Vælg både bruger og klub.'); return; }
    try {
        await api('POST', 'admin/memberships', { userId, clubId, role });
        showStatusMessage('Medlemskab tilføjet.');
        await refreshAdminData();
        await reloadOwnProfile();
    } catch (e) {
        showStatusMessage(`Kunne ikke tilføje medlemskab: ${e.message}`);
    }
});

el.adminUsersList?.addEventListener('click', async (event) => {
    const chipRemove = event.target.closest('[data-remove-membership]');
    if (chipRemove) {
        const [userId, clubId] = chipRemove.dataset.removeMembership.split(':').map(Number);
        if (!window.confirm('Fjern medlemskabet?')) return;
        try {
            await api('DELETE', `admin/memberships?userId=${userId}&clubId=${clubId}`);
            showStatusMessage('Medlemskab fjernet.');
            await refreshAdminData();
            await reloadOwnProfile();
        } catch (e) {
            showStatusMessage(`Kunne ikke fjerne: ${e.message}`);
        }
        return;
    }
    const del = event.target.closest('[data-admin-user-delete]');
    if (del && !del.disabled) {
        const id = Number(del.dataset.adminUserDelete);
        const target = adminCache.users.find(u => u.id === id);
        if (!target) return;
        if (!window.confirm(`Slet brugeren "${target.name}" (${target.email})?`)) return;
        try {
            await api('DELETE', `admin/users/${id}`);
            showStatusMessage('Brugeren er slettet.');
            await refreshAdminData();
        } catch (e) {
            showStatusMessage(`Kunne ikke slette: ${e.message}`);
        }
        return;
    }
    const pw = event.target.closest('[data-admin-user-pw]');
    if (pw) {
        const id = Number(pw.dataset.adminUserPw);
        const next = window.prompt('Indtast ny adgangskode (mindst 6 tegn):');
        if (next === null) return;
        if (next.length < 6) { showStatusMessage('Adgangskode skal være mindst 6 tegn.'); return; }
        try {
            await api('PATCH', `admin/users/${id}`, { password: next });
            showStatusMessage('Adgangskoden er opdateret.');
        } catch (e) {
            showStatusMessage(`Kunne ikke ændre adgangskode: ${e.message}`);
        }
    }
});

bootstrapAuth();

loadDefaults();

// Åbn på Kampe, hvis en runde allerede er i gang — ellers Fremmøde.
setActiveTab(state.lastResult ? 'kampe' : 'fremmode');

// ── Service worker: offline-sikkerhed i hallen ──────────────
// Network-first med cache-fallback (se sw.js). API-kald caches aldrig.
if ('serviceWorker' in navigator
    && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').catch(() => { /* valgfrit */ });
    });
}
