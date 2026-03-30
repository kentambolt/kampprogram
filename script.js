const FIXED_CONFIG = {
    teamBalanceWeight: 12,
    partnerBalanceWeight: 3,
    teammateLastPenalty: 10,
    teammatePrevPenalty: 6,
    opponentLastPenalty: 5,
    opponentPrevPenalty: 2.5,
    benchLastPenalty: 500,
    benchPrevPenalty: 120
};

const state = {
    roster: [],
    history: [],
    lastResult: null
};

const STORAGE_KEY = 'kampprogram-state-v1';

let toastTimer = null;

const el = {
    activePlayersTitle: document.getElementById('activePlayersTitle'),
    playerRosterArea: document.getElementById('playerRosterArea'),
    playerStatsArea: document.getElementById('playerStatsArea'),
    arrivalListArea: document.getElementById('arrivalListArea'),
    playersPanel: document.getElementById('playersPanel'),
    arrivalPanel: document.getElementById('arrivalPanel'),
    arrivalBtn: document.getElementById('arrivalBtn'),
    closeArrivalBtn: document.getElementById('closeArrivalBtn'),
    newPlayerPanel: document.getElementById('newPlayerPanel'),
    resultPanel: document.getElementById('resultPanel'),
    newPlayerBtn: document.getElementById('newPlayerBtn'),
    closeNewPlayerBtn: document.getElementById('closeNewPlayerBtn'),
    newPlayerName: document.getElementById('newPlayerName'),
    newPlayerLevel: document.getElementById('newPlayerLevel'),
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
};

function saveState() {
    const data = {
        roster: state.roster,
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
        }
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function restoreState() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return false;

        const data = JSON.parse(raw);

        state.roster = Array.isArray(data.roster) ? data.roster : [];
        state.history = Array.isArray(data.history) ? data.history : [];
        state.lastResult = data.lastResult || null;

        if (data.ui) {
            el.courtCount.value = data.ui.courtCount ?? '2';
            el.iterations.value = data.ui.iterations ?? '10000';
            el.weightTeamBalance.checked = Boolean(data.ui.weightTeamBalance);
            el.weightPartnerBalance.checked = Boolean(data.ui.weightPartnerBalance);
            el.penaltyRepeatTeammate.checked = Boolean(data.ui.penaltyRepeatTeammate);
            el.penaltyRepeatOpponent.checked = Boolean(data.ui.penaltyRepeatOpponent);
            el.penaltyBench.checked = Boolean(data.ui.penaltyBench);
        }

        return state.roster.length > 0;
    } catch (error) {
        console.error('Kunne ikke gendanne state:', error);
        return false;
    }
}

function clonePlayers(players) {
    return players.map(player => ({...player, active: Boolean(player.active)}));
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

function getInactivePlayers() {
    return state.roster.filter(player => player.active !== true);
}

function getActivePlayersLabel(activeCount, totalCount) {
    const spillereStr = totalCount === 1 ? "spiller" : "spillere";
    return `${activeCount} / ${totalCount} ${spillereStr} aktive`;
}

function updateActivePlayersTitle() {
    const activePlayersCount = getActivePlayers().length;
    const totalPlayersCount = getPlayers().length;
    el.activePlayersTitle.textContent = getActivePlayersLabel(activePlayersCount, totalPlayersCount);
}

function updatePanelVisibility() {
    const activePlayersCount = getActivePlayers().length;
    const totalPlayersCount = getPlayers().length;
    const hasHistory = state.history.length > 0;

    el.matchPanel.classList.toggle('hidden', activePlayersCount < 1);
    el.playerStatsPanel.classList.toggle('hidden', !hasHistory);
    el.historyPanel.classList.toggle('hidden', !hasHistory);
    el.playerRosterArea.classList.toggle('hidden', !activePlayersCount);
    el.resultPanel.classList.toggle('hidden', !hasHistory);
    el.arrivalBtn.classList.toggle('hidden', totalPlayersCount === 0);
    el.arrivalPanel.classList.toggle('hidden', totalPlayersCount === 0);
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

function loadDefaults() {
    restoreState();
    renderRoster();
    renderArrivalList();
    renderPlayerStats();
    renderHistory();
    updatePanelVisibility();
    if (state.lastResult && el.resultArea) {
        renderRound(state.lastResult);
    }
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
        benchPrevPenalty: el.penaltyBench.checked ? FIXED_CONFIG.benchPrevPenalty : 0
    };
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
        const [a1, a2] = court.teamA.players;
        const [b1, b2] = court.teamB.players;

        teammatePairs.add(pairKey(a1.name, a2.name));
        teammatePairs.add(pairKey(b1.name, b2.name));

        const opponents = [
            [a1.name, b1.name], [a1.name, b2.name],
            [a2.name, b1.name], [a2.name, b2.name]
        ];

        for (const [x, y] of opponents) {
            opponentPairs.add(pairKey(x, y));
        }
    }

    return {
        teammatePairs,
        opponentPairs,
        benched: new Set(round.benched.map(player => player.name))
    };
}

function createRandomRound(players, courtCount) {
    const shuffled = shuffle(players);

    const maxSlots = Math.min(courtCount * 4, shuffled.length);
    const usablePlayers = Math.floor(maxSlots / 4) * 4;

    const selected = shuffled.slice(0, usablePlayers);
    const benched = shuffled.slice(usablePlayers);
    const courts = [];

    for (let i = 0; i < selected.length; i += 4) {
        const group = selected.slice(i, i + 4);

        const arrangements = [
            {teamA: [group[0], group[1]], teamB: [group[2], group[3]]},
            {teamA: [group[0], group[2]], teamB: [group[1], group[3]]},
            {teamA: [group[0], group[3]], teamB: [group[1], group[2]]}
        ];

        const chosen = arrangements[Math.floor(Math.random() * arrangements.length)];

        courts.push({
            teamA: {
                players: chosen.teamA,
                totalLevel: chosen.teamA.reduce((sum, p) => sum + p.level, 0)
            },
            teamB: {
                players: chosen.teamB,
                totalLevel: chosen.teamB.reduce((sum, p) => sum + p.level, 0)
            }
        });
    }

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
        const sumA = court.teamA.totalLevel;
        const sumB = court.teamB.totalLevel;
        const teamDiff = Math.abs(sumA - sumB);

        const partnerDiffA = Math.abs(court.teamA.players[0].level - court.teamA.players[1].level);
        const partnerDiffB = Math.abs(court.teamB.players[0].level - court.teamB.players[1].level);

        score -= teamDiff * config.teamBalanceWeight;
        score -= (partnerDiffA + partnerDiffB) * config.partnerBalanceWeight;

        const teammatePairs = [
            pairKey(court.teamA.players[0].name, court.teamA.players[1].name),
            pairKey(court.teamB.players[0].name, court.teamB.players[1].name)
        ];

        for (const key of teammatePairs) {
            if (lastMaps?.teammatePairs.has(key)) score -= config.teammateLastPenalty;
            if (prevMaps?.teammatePairs.has(key)) score -= config.teammatePrevPenalty;
        }

        const opponents = [
            [court.teamA.players[0].name, court.teamB.players[0].name],
            [court.teamA.players[0].name, court.teamB.players[1].name],
            [court.teamA.players[1].name, court.teamB.players[0].name],
            [court.teamA.players[1].name, court.teamB.players[1].name]
        ];

        for (const [x, y] of opponents) {
            const key = pairKey(x, y);
            if (lastMaps?.opponentPairs.has(key)) score -= config.opponentLastPenalty;
            if (prevMaps?.opponentPairs.has(key)) score -= config.opponentPrevPenalty;
        }
    }

    score += scoreBenchRotation(round, history, config);
    return score;
}

function findBestRound(players, courtCount, iterations, history, config) {
    let best = null;

    for (let i = 0; i < iterations; i++) {
        const round = createRandomRound(players, courtCount);
        const score = scoreRound(round, history, config);
        const candidate = {...round, score, iteration: i + 1};

        if (!best || candidate.score > best.score) {
            best = candidate;
        }
    }

    return best;
}

function getPlayerStats() {
    return state.roster.filter(player => player.active).map(player => {
        let played = 0;
        let benched = 0;
        let benchedLast = false;
        let benchedPrev = false;

        state.history.forEach((round, index) => {
            const onBench = round.benched.some(p => p.name === player.name);
            const onCourt = round.courts.some(court =>
                [...court.teamA.players, ...court.teamB.players].some(p => p.name === player.name)
            );

            if (onBench) benched += 1;
            if (onCourt) played += 1;

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

    el.playerRosterArea.innerHTML = activePlayers.map(player => {
        const index = state.roster.findIndex(p => p.name === player.name);
        return `
                <button class="player-chip" type="button" onclick="removePlayer(${index})">
                    ${escapeHtml(player.name)}<span class="lowered">${player.level}</span>
                </button>
            `;
    }).join('');
}

function renderArrivalList() {
    const inactivePlayers = getInactivePlayers();

    if (inactivePlayers.length === 0) {
        el.arrivalListArea.innerHTML = '<span class="muted">Ingen inaktive</span>';
        return;
    }

    el.arrivalListArea.innerHTML = inactivePlayers.map(player => {
        const index = state.roster.findIndex(p => p.name === player.name);
        return `
            <button class="arrival-chip" type="button" onclick="markArrived(${index})">
                ${escapeHtml(player.name)}<span class="lowered">${player.level}</span>
            </button>
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
                        <th class="center">Siddet over</th>
                        <th class="center">Seneste bænk</th>
                    </tr>
                </thead>
                <tbody>
                    ${stats.map(player => `
                        <tr>
                            <td>${escapeHtml(player.name)}</td>
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

function renderRound(result) {
    let html = '';

    if (result.courts.length === 0) {
        showStatusMessage('Der var ikke nok aktive spillere til at fylde en bane.');
        return;
    }

    result.courts.forEach((court, index) => {
        html += `
                <div class="result-card">
                    <div class="court-title">
                        <span>Bane ${index + 1}</span>
                        <span class="tag">Samlet niveau: ${court.teamA.totalLevel} vs ${court.teamB.totalLevel}</span>
                    </div>
                    <div class="vs-grid">
                        <div class="team">
                            ${court.teamA.players.map(player => `
                                <div class="player-line">
                                    <span>${escapeHtml(player.name)}</span>
                                </div>
                            `).join('')}
                        </div>
                        <div><strong>VS</strong></div>
                        <div class="team">
                            ${court.teamB.players.map(player => `
                                <div class="player-line">
                                    <span>${escapeHtml(player.name)}</span>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </div>
            `;
    });

    if (result.benched.length > 0) {
        html += `
                <div class="result-card">
                    <h3>Sidder over</h3>
                    <ul class="bench-list">
                        ${result.benched.map(p => `<li>${escapeHtml(p.name)}</li>`).join('')}
                    </ul>
                </div>
            `;
    }

    el.resultArea.innerHTML = html;
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
                        ${round.courts.map((court, i) => `
                            <li>
                                Bane ${i + 1}: ${escapeHtml(court.teamA.players[0].name)} og ${escapeHtml(court.teamA.players[1].name)}
                                mod
                                ${escapeHtml(court.teamB.players[0].name)} og ${escapeHtml(court.teamB.players[1].name)}
                            </li>
                        `).join('')}
                        ${round.benched.length ? `<li>Sidder over: ${round.benched.map(p => `${escapeHtml(p.name)} <span class="level">${p.level}</span>`).join(', ')}</li>` : ''}
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
        closeOverlayPanels();
    } catch (error) {
        showStatusMessage(error.message || 'Kunne ikke importere spillerlisten.');
    }
}

async function loadPlayersFromFile(filename) {
    if (!filename) {
        showStatusMessage('Vælg først en spillerliste.');
        return;
    }

    try {
        const response = await fetch(filename, { cache: 'no-store' });

        if (!response.ok) {
            throw new Error(`Kunne ikke hente filen: ${filename}`);
        }

        const text = await response.text();
        const players = parsePlayersFromText(text);
        replaceRoster(players);
    } catch (error) {
        showStatusMessage(error.message || 'Der opstod en fejl ved hentning af spillerlisten.');
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
        active: false
    }));
    state.history = [];
    state.lastResult = null;

    renderRoster();
    renderArrivalList();
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

    if (!Number.isInteger(level) || level < 0) {
        showStatusMessage('Niveau skal være et heltal større end eller lig med 0.');
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
    renderArrivalList();
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

        if (!Number.isInteger(level) || level < 0) {
            throw new Error(`Ugyldigt niveau for "${name}". Niveau skal være et heltal større end eller lig med 0.`);
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
    renderArrivalList();
    renderPlayerStats();
    updatePanelVisibility();

    saveState();
}

function removePlayer(index) {
    const player = state.roster[index];
    if (!player) return;

    player.active = false;
    renderRoster();
    renderArrivalList();
    renderPlayerStats();
    updatePanelVisibility();

    saveState();
}

window.markArrived = markArrived;
window.removePlayer = removePlayer;

function generateRound() {
    try {
        const players = getActivePlayers();
        const courtCount = Math.max(1, Number(el.courtCount.value) || 1);
        const iterations = Math.max(1, Number(el.iterations.value) || 1000);
        const config = getConfig();

        if (players.length < 4) {
            throw new Error('Der skal være mindst 4 aktive spillere for at lave en kamp. Markér flere spillere som aktive først.');
        }

        const best = findBestRound(players, courtCount, iterations, state.history, config);

        if (!best) {
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

function closeOverlayPanels() {
    el.settingsPanel.classList.remove('open');
    el.arrivalPanel.classList.remove('open');
    el.newPlayerPanel.classList.remove('open');
    el.importExportPanel.classList.remove('open');
    setSettingsMode(false);
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
    const confirmed = window.confirm('Er du sikker på, at du vil nulstille alt, inkl spillere og matchhistorik?');
    if (!confirmed) return;

    state.history = [];
    state.roster = [];
    state.lastResult = null;
    renderHistory();
    renderPlayerStats();
    renderRoster();
    renderArrivalList();
    renderPlayerStats();
    renderHistory();
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

    if (state.history.length === 0) {
        showStatusMessage('Seneste kamp er fjernet fra historikken.');
    } else {
        showStatusMessage('Seneste kamp er fjernet fra historikken.');
    }

    saveState();
}

function setSettingsMode(enabled) {
    const panelsToHide = [
        el.playersPanel,
        el.arrivalPanel,
        el.newPlayerPanel,
        el.matchPanel,
        el.resultPanel,
        el.importExportPanel,
        el.playerStatsPanel,
        el.historyPanel
    ];

    panelsToHide.forEach(panel => {
        if (!panel) return;
        panel.classList.toggle('hidden', enabled);
    });

    if (enabled) {
        el.settingsPanel.classList.add('open');
        el.settingsPanel.classList.remove('hidden');
    } else {
        el.settingsPanel.classList.remove('open');
        updatePanelVisibility();
    }
}

function toggleMenu() {
    el.menuDropdown.classList.toggle('open');
}

function closeMenu() {
    el.menuDropdown.classList.remove('open');
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

el.loadPresetPlayersBtn.addEventListener('click', async () => {
    await loadPlayersFromFile(el.presetPlayerList.value);
});

el.importPlayersBtn.addEventListener('click', importPlayersFromTextarea);
el.copyPlayersBtn.addEventListener('click', copyCurrentPlayersToClipboard);

el.arrivalBtn.addEventListener('click', () => {
    const shouldOpen = !el.arrivalPanel.classList.contains('open');
    closeOverlayPanels();
    if (shouldOpen) {
        el.arrivalPanel.classList.add('open');
    }
});

el.closeArrivalBtn.addEventListener('click', () => {
    el.arrivalPanel.classList.remove('open');
});

el.newPlayerBtn.addEventListener('click', () => {
    const shouldOpen = !el.newPlayerPanel.classList.contains('open');
    closeOverlayPanels();
    if (shouldOpen) {
        el.newPlayerPanel.classList.add('open');
    }
});

el.closeNewPlayerBtn.addEventListener('click', () => {
    el.newPlayerPanel.classList.remove('open');
});

el.settingsBtn.addEventListener('click', () => {
    const shouldOpen = !el.settingsPanel.classList.contains('open');
    closeOverlayPanels();

    if (shouldOpen) {
        setSettingsMode(true);
    }

    closeMenu();
});

el.closeSettingsBtn.addEventListener('click', () => {
    setSettingsMode(false);
});

el.importExportBtn.addEventListener('click', () => {
    const shouldOpen = !el.importExportPanel.classList.contains('open');
    closeOverlayPanels();

    if (shouldOpen) {
        el.playerImportText.value = playersToText(state.roster);
        el.importExportPanel.classList.add('open');
    }

    closeMenu();
});

el.closeImportExportBtn.addEventListener('click', () => {
    el.importExportPanel.classList.remove('open');
});

[
    el.courtCount,
    el.iterations,
    el.weightTeamBalance,
    el.weightPartnerBalance,
    el.penaltyRepeatTeammate,
    el.penaltyRepeatOpponent,
    el.penaltyBench,
].forEach(input => {
    input.addEventListener('change', saveState);
});

document.addEventListener('click', (event) => {
    const clickedInsideMenu = event.target.closest('.header-menu');
    if (!clickedInsideMenu) {
        closeMenu();
    }
});

loadDefaults();
