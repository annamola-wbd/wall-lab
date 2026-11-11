/**
 * Runs in the page's main world at document_start, before the inline
 * `window.env = {...}` script that content-hub injects into <head>.
 *
 * Reads the active setup the popup stored in this origin's localStorage and:
 *  - sets the countryCode cookie and forces UserConsent.getGeoCountry()
 *  - merges overrides into window.env as it is assigned
 *  - rewrites the server-baked wall gate attributes as the page parses
 *  - shows a badge so an overridden page is never mistaken for a clean one
 */
(() => {
  const ACTIVE_KEY = "wallLab:active";
  const REGION_FLAGS_KEY = "DYNAMIC_CONFIG.paywall_regional_flags";
  const GEO_TO_REGION = { US: "US", GB: "UK", CA: "CA" };
  const GATE_ATTRIBUTES = {
    showPaywall: "data-show-paywall",
    showRegwall: "data-show-regwall",
    subscriptionOnly: "data-subscription-only",
  };

  const readActiveSetup = () => {
    let raw;
    try {
      raw = window.localStorage.getItem(ACTIVE_KEY);
    } catch (error) {
      console.warn("[wall-lab] Cannot read the active setup", error);
      return null;
    }
    if (!raw) {
      return null;
    }
    try {
      return JSON.parse(raw);
    } catch (error) {
      console.warn("[wall-lab] Removing unreadable active setup", error);
      try {
        window.localStorage.removeItem(ACTIVE_KEY);
      } catch (ignored) {
        /* storage may be blocked */
      }
      return null;
    }
  };

  const readCookie = (name) =>
    document.cookie
      .split("; ")
      .find((cookie) => cookie.startsWith(`${name}=`))
      ?.slice(name.length + 1);

  const toList = (value) => {
    if (Array.isArray(value)) {
      return value;
    }
    return typeof value === "string" && value ? value.split(",") : [];
  };

  const asRegionMap = (value) => {
    if (!value) {
      return {};
    }
    if (typeof value === "string") {
      try {
        return asRegionMap(JSON.parse(value));
      } catch (error) {
        return {};
      }
    }
    return typeof value === "object" && !Array.isArray(value) ? value : {};
  };

  if (window.__wallLabInstalled) {
    return;
  }

  const setup = readActiveSetup();
  if (!setup) {
    return;
  }
  window.__wallLabInstalled = true;

  try {
    const envOverrides = setup.env || {};
    const regionFlags = setup.regionFlags || {};
    const gates = setup.gates || {};

    const setCookie = (name, value) => {
      const clear = (extra = "") => {
        document.cookie = `${name}=; path=/; max-age=0${extra}`;
      };
      clear();
      clear("; Secure");
      const host = location.hostname;
      if (host.includes(".")) {
        const parent = host.split(".").slice(-2).join(".");
        [host, `.${parent}`].forEach((domain) => {
          clear(`; domain=${domain}`);
          clear(`; domain=${domain}; Secure`);
        });
      }
      const secure = location.protocol === "https:" ? "; Secure" : "";
      document.cookie = `${name}=${value}; path=/; max-age=31536000; SameSite=Lax${secure}`;
    };

    if (setup.location) {
      setCookie("countryCode", setup.location);
    }

    if (setup.state) {
      setCookie("stateCode", setup.state);
      let raw = readCookie("geoData") || "";
      try {
        raw = decodeURIComponent(raw);
      } catch (error) {
        /* keep the raw cookie */
      }
      const fields = raw.split("|");
      const geoFields =
        fields.length > 8
          ? fields
          : ["", setup.state, "", setup.location || "US", "NA", "-500", "?", "0", "0", "0"];
      geoFields[1] = setup.state;
      if (setup.location) {
        geoFields[3] = setup.location;
      }
      setCookie("geoData", geoFields.join("|"));
    }

    const geo = setup.location || readCookie("countryCode") || "US";
    const region = GEO_TO_REGION[geo];

    // Checkout reads Fastly geoData first, then UserConsent.getGeoCountry/getGeoState.
    // The consent object is created later by the async consent script.
    if (setup.location || setup.state) {
      const geoMarker = `${setup.location || ""}|${setup.state || ""}`;
      const wrapConsent = (consent) => {
        if (!consent || typeof consent !== "object" || consent.__wallLabGeo === geoMarker) {
          return consent;
        }
        const defineMethod = (method, value) => {
          if (!value) {
            return;
          }
          try {
            Object.defineProperty(consent, method, {
              configurable: true,
              enumerable: true,
              get: () => () => value,
              set: () => {},
            });
          } catch (error) {
            try {
              consent[method] = () => value;
            } catch (ignored) {
              /* frozen consent object */
            }
          }
        };
        defineMethod("getGeoCountry", setup.location);
        defineMethod("getGeoState", setup.state);
        try {
          consent.__wallLabGeo = geoMarker;
        } catch (ignored) {
          /* frozen consent object */
        }
        return consent;
      };

      const watchUserConsent = (holder) => {
        if (!holder || typeof holder !== "object" || holder.__wallLabWatching) {
          return;
        }
        let current = wrapConsent(holder.UserConsent);
        try {
          Object.defineProperty(holder, "UserConsent", {
            configurable: true,
            enumerable: true,
            get: () => current,
            set: (value) => {
              current = wrapConsent(value);
            },
          });
          holder.__wallLabWatching = true;
        } catch (error) {
          wrapConsent(holder.UserConsent);
        }
      };

      let currentWm = window.WM;
      const wmDescriptor = Object.getOwnPropertyDescriptor(window, "WM");
      if (!wmDescriptor || wmDescriptor.configurable) {
        Object.defineProperty(window, "WM", {
          configurable: true,
          enumerable: true,
          get: () => currentWm,
          set: (value) => {
            currentWm = value;
            watchUserConsent(value);
          },
        });
      }
      watchUserConsent(currentWm);
    }

    const writeRegionMap = (pageEnv, map) => {
      try {
        pageEnv[REGION_FLAGS_KEY] = map;
      } catch (error) {
        /* env object may be frozen */
      }
      try {
        const dynamic = pageEnv.DYNAMIC_CONFIG;
        if (dynamic && typeof dynamic === "object" && !Array.isArray(dynamic)) {
          dynamic.paywall_regional_flags = map;
        } else {
          pageEnv.DYNAMIC_CONFIG = { paywall_regional_flags: map };
        }
      } catch (error) {
        /* flat key is what EnvVars.get falls back to */
      }
    };

    const applyOverrides = (pageEnv) => {
      if (!pageEnv || typeof pageEnv !== "object") {
        return pageEnv;
      }
      if (!window.__wallLabOriginalEnv) {
        try {
          window.__wallLabOriginalEnv = JSON.parse(JSON.stringify(pageEnv));
        } catch (error) {
          window.__wallLabOriginalEnv = { ...pageEnv };
        }
      }

      Object.assign(pageEnv, envOverrides);

      if (!region) {
        return pageEnv;
      }

      const enabledRegions = toList(pageEnv.ALL_ACCESS_ENABLED_REGIONS);
      if (
        setup.location &&
        !("ALL_ACCESS_ENABLED_REGIONS" in envOverrides) &&
        !enabledRegions.includes(region)
      ) {
        pageEnv.ALL_ACCESS_ENABLED_REGIONS = [...enabledRegions, region];
      }

      if (Object.keys(regionFlags).length) {
        const current = {
          ...asRegionMap(pageEnv[REGION_FLAGS_KEY]),
          ...asRegionMap(pageEnv.DYNAMIC_CONFIG && pageEnv.DYNAMIC_CONFIG.paywall_regional_flags),
        };
        current[region] = { ...asRegionMap(current[region]), ...regionFlags };
        writeRegionMap(pageEnv, current);
      }

      return pageEnv;
    };

    let currentEnv;
    try {
      currentEnv = applyOverrides(window.env);
    } catch (error) {
      console.warn("[wall-lab] Could not read window.env", error);
      currentEnv = window.env;
    }

    try {
      Object.defineProperty(window, "env", {
        configurable: true,
        enumerable: true,
        get: () => currentEnv,
        set: (value) => {
          try {
            currentEnv = applyOverrides(value);
          } catch (error) {
            console.warn("[wall-lab] Could not apply env overrides", error);
            currentEnv = value;
          }
        },
      });
    } catch (error) {
      console.warn("[wall-lab] Could not intercept window.env", error);
    }

    const gateEntries = Object.entries(gates).filter(
      ([, value]) => value === "true" || value === "false" || value === "on" || value === "off",
    );
    const gateSelector = gateEntries
      .map(([key]) => (GATE_ATTRIBUTES[key] ? `[${GATE_ATTRIBUTES[key]}]` : ""))
      .filter(Boolean)
      .join(",");

    const applyGates = (root) => {
      if (!gateSelector || !root) {
        return;
      }
      const targets = root.matches?.(gateSelector) ? [root] : [];
      targets.push(...(root.querySelectorAll?.(gateSelector) || []));
      targets.forEach((el) => {
        gateEntries.forEach(([key, value]) => {
          const attribute = GATE_ATTRIBUTES[key];
          if (attribute && el.hasAttribute(attribute)) {
            el.setAttribute(attribute, value === "true" || value === "on" ? "true" : "false");
          }
        });
      });
    };

    if (gateSelector && !window.__wallLabGates) {
      window.__wallLabGates = true;
      const observer = new MutationObserver((mutations) => {
        mutations.forEach(({ addedNodes }) => {
          addedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              applyGates(node);
            }
          });
        });
      });
      observer.observe(document, { childList: true, subtree: true });
      if (document.documentElement) {
        applyGates(document.documentElement);
      }
      document.addEventListener("DOMContentLoaded", () => {
        applyGates(document);
        observer.disconnect();
      });
    }

    const showBadge = () => {
      if (!document.body || document.getElementById("wall-lab-badge")) {
        return;
      }
      const host = document.createElement("div");
      host.id = "wall-lab-badge";
      host.style.cssText = "position:fixed;left:12px;bottom:12px;z-index:2147483647;";
      const shadow = host.attachShadow({ mode: "open" });
      const badge = document.createElement("button");
      badge.type = "button";
      badge.title = "Wall Lab overrides are active. Click to hide this badge.";
      badge.textContent = `Wall lab · ${setup.name || "custom"} · ${region || geo}`;
      badge.style.cssText =
        "font:600 12px/1.2 -apple-system,system-ui,sans-serif;color:#fff;background:#6b21a8;" +
        "border:0;border-radius:999px;padding:6px 10px;box-shadow:0 2px 8px rgba(0,0,0,.3);cursor:pointer;";
      badge.addEventListener("click", () => host.remove());
      shadow.appendChild(badge);
      document.body.appendChild(host);
    };

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", showBadge);
    } else {
      showBadge();
    }
  } catch (error) {
    window.__wallLabInstalled = false;
    console.warn("[wall-lab] Hook failed", error);
  }
})();
