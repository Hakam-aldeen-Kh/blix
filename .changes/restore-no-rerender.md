---
type: Fixed
---
**Opening the saved log no longer restarts your app's render.** Blix restores
(or, with "Preserve log" off, clears) its saved log as the panel mounts,
usually while the app is still hydrating, and its "loading" and "ready" each
re-rendered the panel at once. The panel shares your React root, so React
threw your page's render in progress away and started it again: from a few
dozen components' work to nearly a whole pass, depending on when the restore
ended. That status now reaches the panel once the page is idle; your own
clicks and drags on the panel still show at once.
