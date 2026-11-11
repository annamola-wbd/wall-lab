const HOOK_ID = "wall-lab-hook";

const registerHook = async () => {
  const declared = chrome.runtime.getManifest().content_scripts?.[0];
  if (!declared) {
    return;
  }
  await chrome.scripting.unregisterContentScripts({ ids: [HOOK_ID] }).catch(() => {});
  await chrome.scripting.registerContentScripts([
    {
      id: HOOK_ID,
      js: declared.js,
      matches: declared.matches,
      runAt: "document_start",
      world: "MAIN",
      allFrames: true,
      persistAcrossSessions: true,
    },
  ]);
};

registerHook().catch((error) => {
  console.error("[wall-lab] Could not register the page hook", error);
});
