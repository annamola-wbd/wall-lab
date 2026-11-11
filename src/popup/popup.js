import {
  ACTIVE_KEY,
  BASELINE_KEY,
  ENV_FIELDS,
  GATES,
  GEO_TO_REGION,
  INHERIT,
  LOCATIONS,
  REGION_FLAG_GROUPS,
  STATES
} from './fields.js';
import { PRESETS } from './presets.js';

const SAVED_KEY = 'wallLab:saved';
const REGION_FLAGS_KEY = 'DYNAMIC_CONFIG.paywall_regional_flags';
const LOCAL_HOST_PATTERNS = [
  /^localhost$/,
  /\.localhost$/,
  /^127\.0\.0\.1$/,
  /^localhost\.cnn\.com$/,
  /\.local\.cnn\.com$/
];
const ALL_FLAG_FIELDS = REGION_FLAG_GROUPS.flatMap((group) => group.fields);

const $ = (selector) => document.querySelector(selector);

let tab = null;
let pageState = { active: null, env: {}, countryCode: '', stateCode: '' };
let savedSetups = [];
let loadedName = '';
let edited = false;

/* Functions below run inside the page, so they must be self-contained. */

function readPageState(activeKey, regionFlagsKey, envKeys) {
  const env = window.__wallLabOriginalEnv || window.env || {};
  const picked = {};
  [...envKeys, regionFlagsKey, 'ALL_ACCESS_ENABLED_REGIONS'].forEach((key) => {
    if (key in env) {
      picked[key] = env[key];
    }
  });
  const nestedFlags = env.DYNAMIC_CONFIG && env.DYNAMIC_CONFIG.paywall_regional_flags;
  if (nestedFlags && !picked[regionFlagsKey]) {
    picked[regionFlagsKey] = nestedFlags;
  }
  const readCookieValue = (name) => {
    const entry = document.cookie.split('; ').find((item) => item.startsWith(`${name}=`));
    if (!entry) {
      return '';
    }
    const value = entry.slice(name.length + 1);
    try {
      return decodeURIComponent(value);
    } catch (error) {
      return value;
    }
  };
  const geoFields = readCookieValue('geoData').split('|');
  const geoState = geoFields.length > 8 && geoFields[1] && geoFields[1] !== '?' ? geoFields[1] : '';
  return {
    active: window.localStorage.getItem(activeKey),
    env: picked,
    countryCode: readCookieValue('countryCode'),
    stateCode: geoState || readCookieValue('stateCode')
  };
}

function writeActiveSetup(activeKey, serializedSetup) {
  if (serializedSetup) {
    window.localStorage.setItem(activeKey, serializedSetup);
  } else {
    window.localStorage.removeItem(activeKey);
  }
}

function rememberBaseline(activeKey, baselineKey) {
  if (window.localStorage.getItem(baselineKey) || window.localStorage.getItem(activeKey)) {
    return;
  }
  const read = (name) => {
    const entry = document.cookie.split('; ').find((item) => item.startsWith(`${name}=`));
    if (!entry) {
      return null;
    }
    const value = entry.slice(name.length + 1);
    try {
      return decodeURIComponent(value);
    } catch (error) {
      return value;
    }
  };
  window.localStorage.setItem(
    baselineKey,
    JSON.stringify({
      countryCode: read('countryCode'),
      stateCode: read('stateCode'),
      geoData: read('geoData')
    })
  );
}

function clearOverrides(activeKey, baselineKey) {
  let baseline = null;
  try {
    const raw = window.localStorage.getItem(baselineKey);
    baseline = raw ? JSON.parse(raw) : null;
  } catch (error) {
    baseline = null;
  }

  const expire = (name, extra = '') => {
    document.cookie = `${name}=; path=/; max-age=0${extra}`;
  };
  const restore = (name, value) => {
    const host = location.hostname;
    const domains = [''];
    if (host.includes('.')) {
      const parent = host.split('.').slice(-2).join('.');
      domains.push(`; domain=${host}`, `; domain=.${parent}`);
    }
    domains.forEach((domain) => {
      expire(name, domain);
      expire(name, `${domain}; Secure`);
    });
    if (!value) {
      return;
    }
    const secure = location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `${name}=${value}; path=/; max-age=31536000; SameSite=Lax${secure}`;
  };

  ['countryCode', 'stateCode', 'geoData'].forEach((name) => {
    restore(name, baseline ? baseline[name] : null);
  });
  window.localStorage.removeItem(activeKey);
  window.localStorage.removeItem(baselineKey);
}

function readActiveRaw(activeKey) {
  try {
    return window.localStorage.getItem(activeKey);
  } catch (error) {
    return null;
  }
}

function clearMeters() {
  const keys = [window.env?.PAYWALL_STORAGE_KEY, window.env?.REGWALL_STORAGE_KEY].filter(Boolean);
  keys.forEach((key) => window.localStorage.removeItem(key));
  return keys;
}

const runInPage = async (func, args = []) => {
  const [injection] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    world: 'MAIN',
    func,
    args
  });
  return injection?.result;
};

/* Form building */

const setStatus = (message) => {
  $('#status').textContent = message;
};

const formatValue = (value) => {
  if (value === undefined) {
    return 'not set';
  }
  if (value === '') {
    return '(none)';
  }
  return Array.isArray(value) ? value.join(',') : String(value);
};

const createSelect = (name, options) => {
  const select = document.createElement('select');
  select.name = name;
  options.forEach(({ value, label }) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    select.appendChild(option);
  });
  return select;
};

const boolOptions = [
  { value: INHERIT, label: 'inherit' },
  { value: 'true', label: 'true' },
  { value: 'false', label: 'false' }
];

const createField = ({ name, label, control }) => {
  const row = document.createElement('div');
  row.className = 'field';
  row.dataset.name = name;
  const labelEl = document.createElement('label');
  labelEl.textContent = label;
  const hint = document.createElement('small');
  hint.className = 'hint';
  labelEl.appendChild(hint);
  row.append(labelEl, control);
  return row;
};

const createFlagControl = (field, name) => {
  if (field.type === 'bool') {
    return createSelect(name, boolOptions);
  }
  const input = document.createElement('input');
  input.type = field.type === 'number' ? 'number' : 'text';
  input.name = name;
  input.placeholder = 'inherit';
  input.autocomplete = 'off';
  if (field.type === 'number') {
    input.min = '0';
  }
  return input;
};

const buildForm = () => {
  const locations = $('#locations');
  [{ value: '', label: 'Inherit' }, ...LOCATIONS].forEach(({ value, label }) => {
    const chip = document.createElement('label');
    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = 'location';
    radio.value = value;
    chip.append(radio, label);
    locations.appendChild(chip);
  });

  const states = $('#states');
  [{ value: '', label: 'Inherit' }, ...STATES].forEach(({ value, label }) => {
    const chip = document.createElement('label');
    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = 'state';
    radio.value = value;
    chip.append(radio, label);
    states.appendChild(chip);
  });

  GATES.forEach(({ key, label }) => {
    const control = createSelect(`gate:${key}`, boolOptions);
    $('#gates').appendChild(createField({ name: `gate:${key}`, label, control }));
  });

  REGION_FLAG_GROUPS.forEach(({ title, fields }) => {
    const heading = document.createElement('h3');
    heading.textContent = title;
    $('#region-flags').appendChild(heading);
    fields.forEach((field) => {
      const name = `flag:${field.key}`;
      $('#region-flags').appendChild(
        createField({
          name,
          label: field.label,
          control: createFlagControl(field, name)
        })
      );
    });
  });

  ENV_FIELDS.forEach(({ key, label }) => {
    const name = `env:${key}`;
    $('#env-flags').appendChild(
      createField({ name, label, control: createSelect(name, boolOptions) })
    );
  });
};

/* Form <-> setup */

const selectedLocation = () => $('input[name="location"]:checked')?.value ?? '';

const selectedState = () => $('input[name="state"]:checked')?.value ?? '';

const currentRegion = () => GEO_TO_REGION[selectedLocation() || pageState.countryCode || 'US'];

const parseFlagValue = (field, raw) => {
  if (field.type === 'bool') {
    return raw === 'true';
  }
  return field.type === 'number' ? Number(raw) : raw;
};

const isSet = (raw) => raw !== INHERIT && raw !== '';

const readForm = () => {
  const form = $('#form');
  const read = (name) => form.elements[name].value;
  const setup = {
    location: selectedLocation(),
    state: selectedState(),
    gates: {},
    regionFlags: {},
    env: {}
  };

  GATES.forEach(({ key }) => {
    const raw = read(`gate:${key}`);
    if (raw === 'true' || raw === 'false') {
      setup.gates[key] = raw;
    }
  });
  ALL_FLAG_FIELDS.forEach((field) => {
    const raw = read(`flag:${field.key}`);
    if (isSet(raw)) {
      setup.regionFlags[field.key] = parseFlagValue(field, raw);
    }
  });
  ENV_FIELDS.forEach(({ key }) => {
    const raw = read(`env:${key}`);
    if (raw !== INHERIT) {
      setup.env[key] = raw === 'true';
    }
  });
  return setup;
};

const fillForm = (setup = {}) => {
  const form = $('#form');
  const set = (name, value) => {
    form.elements[name].value = value;
  };
  const location = setup.location || '';
  form.querySelectorAll('input[name="location"]').forEach((radio) => {
    radio.checked = radio.value === location;
  });
  const state = setup.state || '';
  form.querySelectorAll('input[name="state"]').forEach((radio) => {
    radio.checked = radio.value === state;
  });
  GATES.forEach(({ key }) => set(`gate:${key}`, normalizeBool(setup.gates?.[key])));
  ALL_FLAG_FIELDS.forEach((field) => {
    const value = setup.regionFlags?.[field.key];
    if (value === undefined) {
      set(`flag:${field.key}`, field.type === 'bool' ? INHERIT : '');
    } else {
      set(`flag:${field.key}`, String(value));
    }
  });
  ENV_FIELDS.forEach(({ key }) => {
    const value = setup.env?.[key];
    set(`env:${key}`, value === undefined ? INHERIT : String(value));
  });
  refreshHints();
};

const normalizeBool = (value) => {
  if (value === true || value === 'true' || value === 'on') {
    return 'true';
  }
  if (value === false || value === 'false' || value === 'off') {
    return 'false';
  }
  return INHERIT;
};

const sameAsPage = (raw, pageValue) => pageValue !== undefined && String(pageValue) === raw;

const refreshHints = () => {
  const region = currentRegion();
  const regionEntry = region ? pageState.env[REGION_FLAGS_KEY]?.[region] : undefined;
  $('#region-label').textContent = region ? `→ ${region}` : '→ none (non-enabled market)';
  $('#region-hint').textContent =
    `Cookie now: countryCode=${pageState.countryCode || 'unset'} · state=${pageState.stateCode || 'unset'}`;

  document.querySelectorAll('.field').forEach((row) => {
    const { name } = row.dataset;
    const [kind, key] = name.split(/:(.+)/);
    const control = $('#form').elements[name];
    const set = isSet(control.value);
    row.classList.toggle('overridden', set);

    let pageValue;
    let hint = '';
    if (kind === 'flag') {
      if (region) {
        pageValue = regionEntry?.[key];
        hint = `page: ${formatValue(pageValue)}`;
      } else {
        hint = 'ignored outside US/UK/CA';
      }
    } else if (kind === 'env') {
      pageValue = key in pageState.env ? pageState.env[key] : undefined;
      hint = `page: ${formatValue(pageValue)}`;
    }
    const hintEl = row.querySelector('.hint');
    hintEl.textContent = hint;
    hintEl.classList.toggle('replaced', set && hint.startsWith('page:') && !sameAsPage(control.value, pageValue));
  });
};

/* Saved setups */

const loadSaved = async () => {
  const stored = await chrome.storage.local.get(SAVED_KEY);
  savedSetups = stored[SAVED_KEY] || [];
};

const persistSaved = () => chrome.storage.local.set({ [SAVED_KEY]: savedSetups });

const activeName = () => {
  if (!pageState.active) {
    return '';
  }
  try {
    return JSON.parse(pageState.active).name || '';
  } catch {
    return '';
  }
};

const renderSaved = () => {
  const list = $('#saved');
  list.replaceChildren();
  const current = activeName();
  const entries = [
    ...PRESETS.map((setup) => ({ setup, preset: true })),
    ...savedSetups.map((setup) => ({ setup, preset: false }))
  ];

  entries.forEach(({ setup, preset }) => {
    const item = document.createElement('li');
    item.classList.toggle('active', setup.name === current);
    const name = document.createElement('button');
    name.type = 'button';
    name.className = 'name';
    name.textContent = setup.name;
    name.title = 'Load into the form (does not apply yet)';
    name.addEventListener('click', () => {
      loadedName = setup.name;
      edited = false;
      $('#setup-name').value = preset ? '' : setup.name;
      fillForm(setup);
      setStatus(`Loaded "${setup.name}". Apply and reload to use it.`);
    });
    item.appendChild(name);

    if (preset) {
      const tag = document.createElement('span');
      tag.className = 'tag';
      tag.textContent = 'preset';
      item.appendChild(tag);
    } else {
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = 'Delete';
      remove.addEventListener('click', async () => {
        savedSetups = savedSetups.filter((entry) => entry.id !== setup.id);
        await persistSaved();
        renderSaved();
        setStatus(`Deleted "${setup.name}".`);
      });
      item.appendChild(remove);
    }
    list.appendChild(item);
  });
};

const saveCurrent = async () => {
  const name = $('#setup-name').value.trim();
  if (!name) {
    setStatus('Name the setup before saving.');
    $('#setup-name').focus();
    return;
  }
  const setup = { id: `user-${Date.now()}`, name, ...readForm() };
  const existing = savedSetups.findIndex((entry) => entry.name === name);
  if (existing === -1) {
    savedSetups.push(setup);
  } else {
    savedSetups[existing] = { ...setup, id: savedSetups[existing].id };
  }
  await persistSaved();
  loadedName = name;
  edited = false;
  renderSaved();
  setStatus(`Saved "${name}".`);
};

/* Page actions */

const applyAndReload = async () => {
  if (!tab?.id) {
    setStatus('No tab to apply to. Open a local CNN page and try again.');
    return;
  }
  const name = loadedName ? `${loadedName}${edited ? ' (edited)' : ''}` : 'custom';
  const setup = { name, ...readForm() };
  const serialized = JSON.stringify(setup);
  await runInPage(rememberBaseline, [ACTIVE_KEY, BASELINE_KEY]);
  await runInPage(writeActiveSetup, [ACTIVE_KEY, serialized]);
  const written = await runInPage(readActiveRaw, [ACTIVE_KEY]);
  if (written !== serialized) {
    setStatus('Apply could not store the setup on this page. Reload the extension, then try again.');
    return;
  }
  setStatus(`Applied "${name}". Reloading. A purple “Wall lab” badge means it took.`);
  pageState.active = serialized;
  renderSaved();
  await chrome.tabs.reload(tab.id);
};

const clearAndReload = async () => {
  if (!tab?.id) {
    setStatus('No tab to clear. Open a local CNN page and try again.');
    return;
  }
  await runInPage(clearOverrides, [ACTIVE_KEY, BASELINE_KEY]);
  pageState.active = null;
  renderSaved();
  setStatus('Overrides cleared. Reloading to the local stack.');
  await chrome.tabs.reload(tab.id);
};

const resetMeters = async () => {
  const cleared = await runInPage(clearMeters);
  setStatus(
    cleared?.length
      ? `Cleared ${cleared.join(' and ')}. Reload to count from zero.`
      : 'No meter storage keys found in window.env.'
  );
};

/* Init */

const isLocalTab = (url) => {
  try {
    const { hostname } = new URL(url);
    return LOCAL_HOST_PATTERNS.some((pattern) => pattern.test(hostname));
  } catch {
    return false;
  }
};

const showNotice = (message) => {
  $('#notice').textContent = message;
  $('#notice').hidden = false;
};

const init = async () => {
  buildForm();
  await loadSaved();

  [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const local = tab?.url && isLocalTab(tab.url);
  $('#host').textContent = local ? new URL(tab.url).host : '';

  if (local) {
    try {
      pageState =
        (await runInPage(readPageState, [
          ACTIVE_KEY,
          REGION_FLAGS_KEY,
          ENV_FIELDS.map(({ key }) => key)
        ])) || pageState;
    } catch (error) {
      showNotice(`Wall Lab could not read this page: ${error.message}`);
    }
  } else {
    showNotice(
      'Open a local CNN page (localhost, *.localhost, or localhost.cnn.com) to apply. Saved setups can still be edited.'
    );
    ['#apply', '#reset-meters', '#clear'].forEach((selector) => {
      $(selector).disabled = true;
    });
  }

  let active = null;
  if (pageState.active) {
    try {
      active = JSON.parse(pageState.active);
    } catch {
      showNotice('The active setup on this page is unreadable. Apply or clear to replace it.');
    }
  }
  loadedName = active?.name?.replace(/ \(edited\)$/, '') || '';
  fillForm(active || {});
  renderSaved();
  if (active) {
    setStatus(`Active on this page: "${active.name}".`);
  }

  $('#form').addEventListener('input', () => {
    edited = true;
    refreshHints();
  });
  $('#save').addEventListener('click', () => {
    saveCurrent().catch((error) => setStatus(`Save failed: ${error.message}`));
  });
  $('#apply').addEventListener('click', () => {
    applyAndReload().catch((error) => setStatus(`Apply failed: ${error.message}`));
  });
  $('#clear').addEventListener('click', () => {
    clearAndReload().catch((error) => setStatus(`Clear failed: ${error.message}`));
  });
  $('#reset-meters').addEventListener('click', () => {
    resetMeters().catch((error) => setStatus(`Reset failed: ${error.message}`));
  });
};

init().catch((error) => {
  showNotice(`Wall Lab could not read this page: ${error.message}`);
  throw error;
});
