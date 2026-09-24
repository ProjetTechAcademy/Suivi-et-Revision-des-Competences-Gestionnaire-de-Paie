/**
 * Campus PAÏA — Synchronisation Projet 20 -> Vercel -> Qdrant
 * Version V003 — 24/09/2026
 *
 * Principes :
 * - aucun compteur de ressources figé ;
 * - mode "nouveaux uniquement" pour les lignes non encore indexées ;
 * - mode "enrichissement complet" pour réindexer tout le catalogue ;
 * - les fichiers Drive restent privés ;
 * - le jeton Google temporaire sert uniquement au serveur pour lire le fichier
 *   pendant la requête et n'est ni écrit dans le Sheet ni journalisé.
 */

const CAMPUS_PAIA = Object.freeze({
  API_BASE: 'https://corpuscampuspaia-ten.vercel.app',
  CATALOGUE_SHEET: '07_CATALOGUE_CORPUS',
  COMMANDS_SHEET: '04_COMMANDES',
  LOG_SHEET: '05_JOURNAL_EXECUTION',
  HEADER_ROW: 3,
  FIRST_DATA_ROW: 4,
  BATCH_SIZE: 8,
  CONTINUATION_DELAY_MS: 60 * 1000,
  REQUEST_PAUSE_MS: 250,
  STATUS_COLUMN_HEADER: 'Statut indexation',
  PROP_SECRET: 'CAMPUS_SYNC_SECRET',
  PROP_ACTIVE: 'CAMPUS_SYNC_ACTIVE',
  PROP_MODE: 'CAMPUS_SYNC_MODE',
  PROP_NEXT_ROW: 'CAMPUS_SYNC_NEXT_ROW',
  PROP_OK: 'CAMPUS_SYNC_OK',
  PROP_TEXT: 'CAMPUS_SYNC_TEXT',
  PROP_METADATA: 'CAMPUS_SYNC_METADATA',
  PROP_ERROR: 'CAMPUS_SYNC_ERROR',
  PROP_SKIPPED: 'CAMPUS_SYNC_SKIPPED'
});

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Campus PAÏA')
    .addItem('0 — Enregistrer le secret Vercel', 'campusEnregistrerSecret')
    .addSeparator()
    .addItem('1 — Tester Drive + catalogue', 'campusTesterDrive')
    .addItem('2 — Tester Vercel + Qdrant', 'campusTesterConnexion')
    .addSeparator()
    .addItem('3 — Synchroniser les nouveaux', 'campusLancerNouveaux')
    .addItem('4 — Enrichissement complet', 'campusLancerEnrichissementComplet')
    .addItem('Continuer un lot maintenant', 'campusSynchroniserLot')
    .addItem('Afficher le statut', 'campusAfficherStatut')
    .addItem('Arrêter la synchronisation', 'campusArreterSync')
    .addToUi();
}

function campusEnregistrerSecret() {
  const ui = SpreadsheetApp.getUi();
  const response = ui.prompt(
    'Campus PAÏA — Secret Vercel',
    'Colle la valeur EXISTANTE de CAMPUS_SYNC_SECRET configurée dans Vercel.',
    ui.ButtonSet.OK_CANCEL
  );
  if (response.getSelectedButton() !== ui.Button.OK) return;

  const secret = String(response.getResponseText() || '').trim();
  if (secret.length < 16) {
    ui.alert('Secret refusé', 'La valeur paraît trop courte. Rien n’a été enregistré.', ui.ButtonSet.OK);
    return;
  }

  PropertiesService.getScriptProperties().setProperty(CAMPUS_PAIA.PROP_SECRET, secret);
  _log_('CONFIG', 'SECRET', 'Vercel', 'OK', 'Secret enregistré dans les propriétés privées du script.');
  ui.alert('OK', 'Le secret est enregistré dans les propriétés privées du script.', ui.ButtonSet.OK);
}

function campusTesterDrive() {
  const ui = SpreadsheetApp.getUi();
  try {
    const ctx = _catalogueContext_();
    const count = _countRealResources_(ctx);
    const withDrive = _countDriveSources_(ctx);
    const detail = count + ' ressources réelles dans le catalogue — ' + withDrive + ' avec une source Drive exploitable.';
    _setCommandStatus_('TEST_DRIVE', 'OK', detail);
    _log_('TEST', 'TEST_DRIVE', CAMPUS_PAIA.CATALOGUE_SHEET, 'OK', detail);
    ui.alert('TEST_DRIVE — OK', detail, ui.ButtonSet.OK);
  } catch (error) {
    const message = _errorMessage_(error);
    _setCommandStatus_('TEST_DRIVE', 'ERREUR', message);
    _log_('TEST', 'TEST_DRIVE', CAMPUS_PAIA.CATALOGUE_SHEET, 'ERREUR', message);
    ui.alert('TEST_DRIVE — ERREUR', message, ui.ButtonSet.OK);
  }
}

function campusTesterConnexion() {
  const ui = SpreadsheetApp.getUi();
  try {
    _requireSecret_();
    const setup = _apiJson_('/api/controller/setup-search', 'post', {});
    if (!setup.ready) throw new Error('Qdrant n’est pas prêt.');

    const ping = _apiJson_('/api/controller/ping', 'get');
    const qdrantOk = Boolean(ping && ping.state && ping.state.qdrant);
    const groqOk = Boolean(ping && ping.state && ping.state.groq);
    if (!qdrantOk || !groqOk) {
      throw new Error('État incomplet — Qdrant: ' + qdrantOk + ' | Groq: ' + groqOk);
    }

    const detail = 'Qdrant OK — Groq OK — ' + Number(ping.corpusItems || 0) + ' point(s) actuellement indexé(s).';
    _setCommandStatus_('TEST_STATUS', 'OK', detail);
    _log_('TEST', 'TEST_STATUS', 'Vercel + Qdrant + Groq', 'OK', detail);
    ui.alert('TEST_STATUS — OK', detail, ui.ButtonSet.OK);
  } catch (error) {
    const message = _errorMessage_(error);
    _setCommandStatus_('TEST_STATUS', 'ERREUR', message);
    _log_('TEST', 'TEST_STATUS', 'Vercel + Qdrant + Groq', 'ERREUR', message);
    ui.alert('TEST_STATUS — ERREUR', message, ui.ButtonSet.OK);
  }
}

function campusLancerNouveaux() {
  _startSync_('NEW');
}

function campusLancerEnrichissementComplet() {
  _startSync_('FULL');
}

function _startSync_(mode) {
  const ui = SpreadsheetApp.getUi();
  try {
    _requireSecret_();
    const ctx = _catalogueContext_();
    const count = _countRealResources_(ctx);

    const props = PropertiesService.getScriptProperties();
    props.setProperties({
      [CAMPUS_PAIA.PROP_ACTIVE]: '1',
      [CAMPUS_PAIA.PROP_MODE]: mode,
      [CAMPUS_PAIA.PROP_NEXT_ROW]: String(CAMPUS_PAIA.FIRST_DATA_ROW),
      [CAMPUS_PAIA.PROP_OK]: '0',
      [CAMPUS_PAIA.PROP_TEXT]: '0',
      [CAMPUS_PAIA.PROP_METADATA]: '0',
      [CAMPUS_PAIA.PROP_ERROR]: '0',
      [CAMPUS_PAIA.PROP_SKIPPED]: '0'
    }, false);

    _removeContinuationTriggers_();
    const label = mode === 'FULL' ? 'ENRICHISSEMENT COMPLET' : 'NOUVEAUX UNIQUEMENT';
    _setCommandStatus_('SYNC_FULL', 'EN COURS', label + ' — ' + count + ' ressources réelles dans le catalogue.');
    _log_('SYNC', 'SYNC_FULL', CAMPUS_PAIA.CATALOGUE_SHEET, 'DÉMARRÉ', label + ' — catalogue: ' + count + '.');

    campusSynchroniserLot();

    ui.alert(
      'Synchronisation démarrée',
      'Le premier lot a été traité. La suite continuera automatiquement par lots.',
      ui.ButtonSet.OK
    );
  } catch (error) {
    const message = _errorMessage_(error);
    _setCommandStatus_('SYNC_FULL', 'ERREUR', message);
    _log_('SYNC', 'SYNC_FULL', CAMPUS_PAIA.CATALOGUE_SHEET, 'ERREUR', message);
    ui.alert('SYNC — ERREUR', message, ui.ButtonSet.OK);
  }
}

function campusSynchroniserLot() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return;

  try {
    const props = PropertiesService.getScriptProperties();
    if (props.getProperty(CAMPUS_PAIA.PROP_ACTIVE) !== '1') return;

    _requireSecret_();
    const ctx = _catalogueContext_();
    const mode = props.getProperty(CAMPUS_PAIA.PROP_MODE) || 'NEW';
    const accessToken = ScriptApp.getOAuthToken();

    let rowNumber = Number(props.getProperty(CAMPUS_PAIA.PROP_NEXT_ROW) || CAMPUS_PAIA.FIRST_DATA_ROW);
    if (!Number.isFinite(rowNumber) || rowNumber < CAMPUS_PAIA.FIRST_DATA_ROW) rowNumber = CAMPUS_PAIA.FIRST_DATA_ROW;

    let processed = 0;
    let okBatch = 0;
    let textBatch = 0;
    let metadataBatch = 0;
    let errorBatch = 0;
    let skippedBatch = 0;

    while (rowNumber <= ctx.lastRow && processed < CAMPUS_PAIA.BATCH_SIZE) {
      const row = ctx.sheet.getRange(rowNumber, 1, 1, ctx.lastColumn).getValues()[0];

      if (!_isRealResource_(row, ctx.headers)) {
        skippedBatch++;
        rowNumber++;
        continue;
      }

      const status = _normalize_(_value_(row, ctx.headers, CAMPUS_PAIA.STATUS_COLUMN_HEADER));
      const candidate = mode === 'FULL' || _needsInitialSync_(status);

      if (!candidate) {
        skippedBatch++;
        rowNumber++;
        continue;
      }

      processed++;
      const code = _text_(_value_(row, ctx.headers, 'Code original')) || ('ligne ' + rowNumber);

      try {
        const result = _syncResource_(row, ctx.headers, accessToken);
        const hasText = Boolean(result && result.sourceText);
        _setIndexStatus_(ctx.sheet, rowNumber, ctx.headers, hasText ? 'INDEXÉ TEXTE' : 'INDEXÉ MÉTADONNÉES');
        okBatch++;
        if (hasText) textBatch++; else metadataBatch++;
      } catch (error) {
        errorBatch++;
        const message = _errorMessage_(error);
        _setIndexStatus_(ctx.sheet, rowNumber, ctx.headers, 'ERREUR');
        _log_('INDEX', 'SYNC_FULL', code, 'ERREUR', message);
      }

      rowNumber++;
      Utilities.sleep(CAMPUS_PAIA.REQUEST_PAUSE_MS);
    }

    const okTotal = Number(props.getProperty(CAMPUS_PAIA.PROP_OK) || 0) + okBatch;
    const textTotal = Number(props.getProperty(CAMPUS_PAIA.PROP_TEXT) || 0) + textBatch;
    const metadataTotal = Number(props.getProperty(CAMPUS_PAIA.PROP_METADATA) || 0) + metadataBatch;
    const errorTotal = Number(props.getProperty(CAMPUS_PAIA.PROP_ERROR) || 0) + errorBatch;
    const skippedTotal = Number(props.getProperty(CAMPUS_PAIA.PROP_SKIPPED) || 0) + skippedBatch;

    props.setProperties({
      [CAMPUS_PAIA.PROP_NEXT_ROW]: String(rowNumber),
      [CAMPUS_PAIA.PROP_OK]: String(okTotal),
      [CAMPUS_PAIA.PROP_TEXT]: String(textTotal),
      [CAMPUS_PAIA.PROP_METADATA]: String(metadataTotal),
      [CAMPUS_PAIA.PROP_ERROR]: String(errorTotal),
      [CAMPUS_PAIA.PROP_SKIPPED]: String(skippedTotal)
    }, false);

    SpreadsheetApp.flush();

    const detail =
      'Mode ' + mode +
      ' — prochain rang: ' + rowNumber +
      ' — lot: ' + okBatch + ' OK (' + textBatch + ' texte / ' + metadataBatch + ' métadonnées)' +
      ' — erreurs: ' + errorBatch +
      ' — total: ' + okTotal + ' OK (' + textTotal + ' texte / ' + metadataTotal + ' métadonnées).';

    _setCommandStatus_('SYNC_FULL', 'EN COURS', detail);
    _log_('SYNC', 'SYNC_FULL', 'jusqu’à la ligne ' + (rowNumber - 1), 'OK', detail);

    if (rowNumber > ctx.lastRow) {
      _finishSync_();
    } else {
      _scheduleContinuation_();
    }
  } finally {
    lock.releaseLock();
  }
}

function campusAfficherStatut() {
  const ui = SpreadsheetApp.getUi();
  const props = PropertiesService.getScriptProperties();

  let remote = 'non lu';
  try {
    const stats = _apiJson_('/api/controller/corpus-stats', 'get');
    remote = Number(stats.total || 0) + ' point(s) Qdrant';
  } catch (error) {
    remote = 'indisponible : ' + _errorMessage_(error);
  }

  ui.alert(
    'Campus PAÏA — Statut',
    'Actif : ' + (props.getProperty(CAMPUS_PAIA.PROP_ACTIVE) === '1' ? 'OUI' : 'NON') +
    '\nMode : ' + (props.getProperty(CAMPUS_PAIA.PROP_MODE) || '-') +
    '\nProchaine ligne : ' + (props.getProperty(CAMPUS_PAIA.PROP_NEXT_ROW) || '-') +
    '\nOK : ' + (props.getProperty(CAMPUS_PAIA.PROP_OK) || '0') +
    '\nAvec texte : ' + (props.getProperty(CAMPUS_PAIA.PROP_TEXT) || '0') +
    '\nMétadonnées seules : ' + (props.getProperty(CAMPUS_PAIA.PROP_METADATA) || '0') +
    '\nErreurs : ' + (props.getProperty(CAMPUS_PAIA.PROP_ERROR) || '0') +
    '\nQdrant : ' + remote,
    ui.ButtonSet.OK
  );
}

function campusArreterSync() {
  const props = PropertiesService.getScriptProperties();
  props.setProperty(CAMPUS_PAIA.PROP_ACTIVE, '0');
  _removeContinuationTriggers_();
  _setCommandStatus_('SYNC_FULL', 'ARRÊTÉ', 'Arrêt manuel. La prochaine ligne est conservée.');
  _log_('SYNC', 'SYNC_FULL', CAMPUS_PAIA.CATALOGUE_SHEET, 'ARRÊTÉ', 'Arrêt manuel.');
  SpreadsheetApp.getUi().alert('Synchronisation arrêtée', 'Aucun nouveau lot automatique ne sera lancé.', SpreadsheetApp.getUi().ButtonSet.OK);
}

function _finishSync_() {
  const props = PropertiesService.getScriptProperties();
  props.setProperty(CAMPUS_PAIA.PROP_ACTIVE, '0');
  _removeContinuationTriggers_();

  const ok = Number(props.getProperty(CAMPUS_PAIA.PROP_OK) || 0);
  const textCount = Number(props.getProperty(CAMPUS_PAIA.PROP_TEXT) || 0);
  const metadataCount = Number(props.getProperty(CAMPUS_PAIA.PROP_METADATA) || 0);
  const errors = Number(props.getProperty(CAMPUS_PAIA.PROP_ERROR) || 0);
  const mode = props.getProperty(CAMPUS_PAIA.PROP_MODE) || '-';

  let remote = '';
  try {
    const stats = _apiJson_('/api/controller/corpus-stats', 'get');
    remote = ' | Qdrant: ' + Number(stats.total || 0) + ' point(s)';
  } catch (error) {
    remote = ' | stats Qdrant indisponibles';
  }

  const result =
    'Mode ' + mode +
    ' — OK: ' + ok +
    ' | texte: ' + textCount +
    ' | métadonnées: ' + metadataCount +
    ' | erreurs: ' + errors +
    remote;

  _setCommandStatus_('SYNC_FULL', errors ? 'TERMINÉ AVEC ERREURS' : 'TERMINÉ', result);
  if (!errors) _setCommandStatus_('SEARCH_SOURCES', 'PRÊT', 'Synchronisation terminée : recherche Campus disponible.');
  _log_('SYNC', 'SYNC_FULL', CAMPUS_PAIA.CATALOGUE_SHEET, errors ? 'TERMINÉ AVEC ERREURS' : 'TERMINÉ', result);
}

function _syncResource_(row, headers, accessToken) {
  const payload = _resourcePayload_(row, headers, accessToken);
  return _apiJson_('/api/admin/index-document', 'post', payload);
}

function _resourcePayload_(row, headers, accessToken) {
  const regulatoryRaw = _normalize_(_value_(row, headers, 'Réglementaire / temporel ?'));
  const project = _text_(_value_(row, headers, 'Projet'));
  const driveUrl = _text_(_value_(row, headers, 'Lien Drive principal'));
  const technicalId = _text_(_value_(row, headers, 'ID technique source'));
  const driveFileId = _driveFileId_(driveUrl) || (/^[A-Za-z0-9_-]{20,}$/.test(technicalId) ? technicalId : '');

  if (driveFileId) {
    // Cette lecture force Apps Script à demander l’autorisation Drive nécessaire.
    DriveApp.getFileById(driveFileId).getName();
  }

  return {
    resourceCode: _text_(_value_(row, headers, 'Code original')),
    project: project,
    formation: _corpusName_(project),
    blockCode: _text_(_value_(row, headers, 'Bloc')),
    blockTitle: _publicText_(_value_(row, headers, 'Titre du bloc')),
    moduleCode: _text_(_value_(row, headers, 'Module')),
    moduleTitle: _publicText_(_value_(row, headers, 'Titre du module')),
    resourceType: _publicText_(_value_(row, headers, 'Type ressource')),
    title: _publicText_(_value_(row, headers, 'Titre ressource')),
    pulse: _text_(_value_(row, headers, 'Domaine PAÏA auto')),
    subdomain: _text_(_value_(row, headers, 'Sous-domaine auto')),
    keywords: _publicText_(_value_(row, headers, 'Mots-clés V1')),
    regulatory: regulatoryRaw === 'OUI' || regulatoryRaw.indexOf('REGLEMENTAIRE') >= 0,
    updatedAt:
      _text_(_value_(row, headers, 'Année MAJ')) ||
      _text_(_value_(row, headers, 'Dernière modification')),
    reserved: false,
    hasTranscript: false,
    privateDocumentUrl: driveUrl,
    driveFileId: driveFileId,
    googleAccessToken: driveFileId ? accessToken : ''
  };
}

function _corpusName_(project) {
  const map = {
    '14': 'Digital',
    '15': 'Formateur',
    '16': 'Python',
    '17': 'RH',
    '18': 'Paie',
    '19': 'Divers'
  };
  return map[String(project || '').trim()] || 'Corpus';
}

function _publicText_(value) {
  return _text_(value)
    .replace(/\b(studi|mba|bachelor|graduate)\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([:;,])/g, '$1')
    .trim();
}

function _driveFileId_(url) {
  const value = String(url || '').trim();
  if (!value) return '';
  const direct = value.match(/\/d\/([A-Za-z0-9_-]{10,})/);
  if (direct) return direct[1];
  const query = value.match(/[?&]id=([A-Za-z0-9_-]{10,})/);
  if (query) return query[1];
  return '';
}

function _needsInitialSync_(status) {
  if (!status) return true;
  if (status.indexOf('INDEXE') === 0) return false;
  if (status.indexOf('IGNORE') === 0) return false;
  return true;
}

function _catalogueContext_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CAMPUS_PAIA.CATALOGUE_SHEET);
  if (!sheet) throw new Error('Onglet introuvable : ' + CAMPUS_PAIA.CATALOGUE_SHEET);

  const lastRow = sheet.getLastRow();
  const lastColumn = sheet.getLastColumn();
  if (lastRow < CAMPUS_PAIA.FIRST_DATA_ROW) throw new Error('Le catalogue ne contient aucune donnée.');

  const headerValues = sheet.getRange(CAMPUS_PAIA.HEADER_ROW, 1, 1, lastColumn).getValues()[0];
  const headers = {};
  headerValues.forEach(function(value, index) {
    const key = _text_(value);
    if (key) headers[key] = index;
  });

  [
    'Projet', 'Code original', 'Bloc', 'Titre du bloc', 'Module', 'Titre du module',
    'Type ressource', 'Titre ressource', 'Lien Drive principal',
    'Domaine PAÏA auto', 'Sous-domaine auto', 'Mots-clés V1',
    'Réglementaire / temporel ?', 'Statut indexation'
  ].forEach(function(required) {
    if (headers[required] === undefined) throw new Error('Colonne obligatoire introuvable : ' + required);
  });

  return { ss: ss, sheet: sheet, headers: headers, lastRow: lastRow, lastColumn: lastColumn };
}

function _countRealResources_(ctx) {
  const rows = ctx.sheet.getRange(
    CAMPUS_PAIA.FIRST_DATA_ROW, 1,
    ctx.lastRow - CAMPUS_PAIA.FIRST_DATA_ROW + 1,
    ctx.lastColumn
  ).getValues();

  return rows.reduce(function(total, row) {
    return total + (_isRealResource_(row, ctx.headers) ? 1 : 0);
  }, 0);
}

function _countDriveSources_(ctx) {
  const rows = ctx.sheet.getRange(
    CAMPUS_PAIA.FIRST_DATA_ROW, 1,
    ctx.lastRow - CAMPUS_PAIA.FIRST_DATA_ROW + 1,
    ctx.lastColumn
  ).getValues();

  return rows.reduce(function(total, row) {
    if (!_isRealResource_(row, ctx.headers)) return total;
    return total + (_driveFileId_(_value_(row, ctx.headers, 'Lien Drive principal')) ? 1 : 0);
  }, 0);
}

function _isRealResource_(row, headers) {
  const code = _text_(_value_(row, headers, 'Code original'));
  const title = _text_(_value_(row, headers, 'Titre ressource'));
  const type = _normalize_(_value_(row, headers, 'Type ressource'));
  if (!code || !title) return false;
  return type !== 'EMPTY';
}

function _setIndexStatus_(sheet, rowNumber, headers, value) {
  const index = headers[CAMPUS_PAIA.STATUS_COLUMN_HEADER];
  if (index === undefined) return;
  sheet.getRange(rowNumber, index + 1).setValue(value);
}

function _apiJson_(path, method, payload) {
  const secret = _requireSecret_();
  const options = {
    method: method || 'get',
    muteHttpExceptions: true,
    headers: {
      'x-campus-sync-secret': secret,
      'Accept': 'application/json'
    }
  };

  if (payload !== undefined && payload !== null && String(method || 'get').toLowerCase() !== 'get') {
    options.contentType = 'application/json';
    options.payload = JSON.stringify(payload);
  }

  const response = UrlFetchApp.fetch(CAMPUS_PAIA.API_BASE + path, options);
  const status = response.getResponseCode();
  const body = response.getContentText() || '';

  let data = {};
  try {
    data = body ? JSON.parse(body) : {};
  } catch (error) {
    data = { raw: body };
  }

  if (status < 200 || status >= 300) {
    const serverMessage = data && data.error ? String(data.error) : body;
    throw new Error('HTTP ' + status + ' — ' + String(serverMessage || 'Réponse serveur vide').slice(0, 500));
  }

  return data;
}

function _requireSecret_() {
  const props = PropertiesService.getScriptProperties();
  const secret =
    props.getProperty(CAMPUS_PAIA.PROP_SECRET) ||
    props.getProperty('CAMPUS_CONTROLLER_TOKEN') ||
    props.getProperty('CONTROLLER_TOKEN') ||
    '';

  if (!secret) {
    throw new Error('Secret absent. Utilise le menu Campus PAÏA > 0 — Enregistrer le secret Vercel.');
  }
  return secret;
}

function _scheduleContinuation_() {
  _removeContinuationTriggers_();
  ScriptApp.newTrigger('campusSynchroniserLot')
    .timeBased()
    .after(CAMPUS_PAIA.CONTINUATION_DELAY_MS)
    .create();
}

function _removeContinuationTriggers_() {
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (trigger.getHandlerFunction() === 'campusSynchroniserLot') {
      ScriptApp.deleteTrigger(trigger);
    }
  });
}

function _setCommandStatus_(command, status, result) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CAMPUS_PAIA.COMMANDS_SHEET);
  if (!sheet) return;

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  const values = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (let i = 0; i < values.length; i++) {
    if (_text_(values[i][0]) === command) {
      sheet.getRange(i + 2, 4, 1, 3).setValues([[status, result || '', new Date()]]);
      return;
    }
  }
}

function _log_(level, command, target, result, detail) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CAMPUS_PAIA.LOG_SHEET);
  if (!sheet) return;
  sheet.appendRow([new Date(), level, command, target, result, detail || '']);
}

function _value_(row, headers, header) {
  const index = headers[header];
  return index === undefined ? '' : row[index];
}

function _text_(value) {
  if (value === null || value === undefined) return '';
  if (Object.prototype.toString.call(value) === '[object Date]') {
    return Utilities.formatDate(value, Session.getScriptTimeZone() || 'Europe/Paris', 'yyyy-MM-dd HH:mm:ss');
  }
  return String(value).trim();
}

function _normalize_(value) {
  return _text_(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
}

function _errorMessage_(error) {
  return error && error.message ? String(error.message) : String(error);
}
